import fs from 'fs'
import type { DistillProgress, DistillStartInput, LlmConfig } from '../../shared/types'
import { logInfo, logError } from './logger'
import { chatCompletion, getLlmRuntimeConfig } from './llm'
import { parseSrt, cuesToText } from './transcript'
import {
  getVideoTranscript,
  insertDistilledArticle,
  updateDistilledArticle,
  getDistilledArticleRaw,
} from './db'

// ────────── AI 提纯整理：转录稿 → 分享式提纯版原文 ──────────
// 长任务在主进程串行执行（一次一个），每块完成即写库（chunks_json 为断点续跑真源），
// 进度经 event:distill-progress 推送，可取消；失败/取消后可 retry 从缺失块续跑。

/** 目标块长（字符）；全文 ≤ SINGLE_CHUNK_MAX 时不分块 */
const CHUNK_TARGET = 6000
const CHUNK_HARD_MAX = 8000
const SINGLE_CHUNK_MAX = 7000
/** 每块 LLM 调用超时（提纯输出与输入等量级，需要比默认 90s 宽） */
const CHUNK_TIMEOUT_MS = 240_000

let activeArticleId: string | null = null
let activeController: AbortController | null = null

export function isDistilling(): boolean {
  return activeArticleId !== null
}

export function cancelDistill(articleId: string): boolean {
  if (activeArticleId !== articleId || !activeController) return false
  activeController.abort()
  return true
}

// ────────── 原文获取与分块 ──────────

/** djb2 哈希（断点续跑时校验原文未变，无需加密强度） */
function textHash(text: string): string {
  let h = 5381
  for (let i = 0; i < text.length; i++) {
    h = ((h << 5) + h + text.charCodeAt(i)) >>> 0
  }
  return h.toString(16)
}

/** 按来源取清洗后的原文纯文本 */
function loadSourceText(input: DistillStartInput): string {
  if (input.sourceType === 'subscription') {
    if (!input.videoId || !input.channelId) throw new Error('缺少 videoId/channelId')
    const row = getVideoTranscript(input.videoId, input.channelId)
    if (!row) throw new Error('未找到该视频的文案记录，请先提取文案')
    // 优先用原始 srt 重新清洗（cuesToText 已处理滚动字幕去重）
    if (row.srt) return cuesToText(parseSrt(row.srt))
    return row.text
  }
  // whisper-srt / subtitle-srt：读磁盘 srt
  if (!input.srtPath) throw new Error('缺少字幕文件路径')
  if (!fs.existsSync(input.srtPath)) throw new Error(`字幕文件不存在：${input.srtPath}`)
  const srt = fs.readFileSync(input.srtPath, 'utf-8')
  const text = cuesToText(parseSrt(srt))
  if (!text.trim()) throw new Error('字幕内容为空，无法提纯')
  return text
}

/**
 * 确定性分块：先按段落（\n\n）聚合，段落过长按句末标点回退切分，绝不在句中断开。
 * 同一文本永远切出同一组块（断点续跑的前提）。
 */
export function splitIntoChunks(text: string): string[] {
  const clean = text.trim()
  if (clean.length <= SINGLE_CHUNK_MAX) return [clean]

  // 切成"不可再分的片段"：段落优先，超长段落按句子切
  const fragments: string[] = []
  for (const para of clean.split(/\n{2,}/)) {
    const p = para.trim()
    if (!p) continue
    if (p.length <= CHUNK_HARD_MAX) {
      fragments.push(p)
      continue
    }
    // 段落超长 → 按句末标点切
    let buf = ''
    for (const sentence of p.split(/(?<=[。！？；.!?])/)) {
      if (buf.length + sentence.length > CHUNK_HARD_MAX && buf) {
        fragments.push(buf)
        buf = ''
      }
      buf += sentence
    }
    if (buf.trim()) fragments.push(buf.trim())
  }

  // 片段聚合成目标块
  const chunks: string[] = []
  let current = ''
  for (const frag of fragments) {
    if (current && current.length + frag.length + 2 > CHUNK_TARGET) {
      chunks.push(current)
      current = frag
    } else {
      current = current ? `${current}\n\n${frag}` : frag
    }
  }
  if (current.trim()) chunks.push(current.trim())
  return chunks
}

// ────────── Prompt ──────────

const SYSTEM_PROMPT = `你是一名资深编辑，负责把口语转录稿整理成可以直接分享给他人阅读的「提纯版原文」。这不是摘要，而是保留完整信息量的可读化整理。

必须遵守的规则：
1. 删除：时间戳、说话人标签、寒暄客套、口水话、语气词、重复表述、残句、设备噪音等 ASR 噪音。
2. 修正：ASR 识别错误的词，尤其是人名、公司名、产品名、技术术语——按上下文推断正确写法。
3. 忠实保留：原意、语气、关键判断、案例、数字、类比、完整的论证链条和重要原话。宁多勿删。
4. 禁止：新增原文没有的事实；做外推和过度解释；替讲者下结论。
5. 禁止写成摘要体：不要"核心要点""一句话总结""启发""结论"这类形式，输出的是连贯可读的整理稿正文。
6. 结构：用少量大主题（## 二级标题）和小主题（### 三级标题）组织，标题必须来自真实内容，具体明确；禁止"其他有效观点""补充说明"这类垃圾桶标题。
7. 重要判断、金句、有传播价值的原话用 **加粗** 标出，适度使用。
8. 输出格式：只输出 Markdown 正文。不要文章总标题（#），不要任何前言、解释或收尾说明，不要代码围栏。`

/** 从已产出的 Markdown 里提取标题大纲（传给后续块保持结构统一） */
function extractOutline(markdown: string): string[] {
  return markdown
    .split('\n')
    .filter((l) => /^#{2,3}\s+\S/.test(l.trim()))
    .map((l) => l.trim())
}

function buildChunkUserPrompt(
  chunk: string,
  chunkIndex: number,
  chunkTotal: number,
  outline: string[],
  prevTail: string,
): string {
  const lines: string[] = []
  if (chunkTotal === 1) {
    lines.push('以下是一份完整的转录稿原文，请整理为提纯版：')
  } else if (chunkIndex === 0) {
    lines.push(`以下是转录稿的第 1/${chunkTotal} 部分，请建立清晰的主题结构并整理：`)
  } else {
    lines.push(`以下是转录稿的第 ${chunkIndex + 1}/${chunkTotal} 部分（接续前文）。`)
    if (outline.length > 0) {
      lines.push('')
      lines.push('【前文已有的标题结构】（同一主题请延续到已有标题下继续写，不要重开含义相近的新标题；出现真正的新主题才新开标题）')
      lines.push(outline.join('\n'))
    }
    if (prevTail) {
      lines.push('')
      lines.push('【前一部分整理稿的结尾】（衔接自然，不要重复这段内容）')
      lines.push(prevTail)
    }
    lines.push('')
    lines.push('请继续整理本部分：')
  }
  lines.push('')
  lines.push('【本部分原文】')
  lines.push(chunk)
  return lines.join('\n')
}

// ────────── 合并 ──────────

/** 按序拼接各块产出；相邻块出现完全相同的标题行时去掉后者的重复标题 */
function mergeChunkOutputs(outputs: string[]): string {
  const seen = new Set<string>()
  const parts: string[] = []
  for (const out of outputs) {
    const lines = out.trim().split('\n')
    const kept: string[] = []
    for (const line of lines) {
      const t = line.trim()
      if (/^#{2,3}\s+\S/.test(t)) {
        if (seen.has(t)) continue   // 与前文完全相同的标题 → 去掉标题保留正文
        seen.add(t)
      }
      kept.push(line)
    }
    parts.push(kept.join('\n').trim())
  }
  return parts.filter(Boolean).join('\n\n')
}

// ────────── 任务执行 ──────────

interface RunContext {
  articleId: string
  chunks: string[]
  doneOutputs: string[]   // 已完成块的产出（retry 时预填）
  cfg: LlmConfig
  onProgress: (p: DistillProgress) => void
}

async function runDistill(ctx: RunContext): Promise<void> {
  const { articleId, chunks, doneOutputs, cfg, onProgress } = ctx
  const controller = new AbortController()
  activeArticleId = articleId
  activeController = controller
  const startAt = Date.now()

  const progress = (stage: DistillProgress['stage'], chunkIndex: number, message?: string) => {
    onProgress({ articleId, stage, chunkIndex, chunkTotal: chunks.length, message })
  }

  try {
    for (let i = doneOutputs.length; i < chunks.length; i++) {
      if (controller.signal.aborted) throw new Error('[CANCELLED]')
      progress('distilling', i + 1)
      logInfo(`[distill] ${articleId} chunk ${i + 1}/${chunks.length} (${chunks[i].length} chars)`)

      const outline = extractOutline(doneOutputs.join('\n'))
      const prevTail = doneOutputs.length > 0
        ? doneOutputs[doneOutputs.length - 1].trim().slice(-300)
        : ''
      const messages: { role: 'system' | 'user'; content: string }[] = [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildChunkUserPrompt(chunks[i], i, chunks.length, outline, prevTail) },
      ]

      // 块失败自动重试 1 次
      let output: string
      try {
        output = await chatCompletion(cfg, messages, CHUNK_TIMEOUT_MS, controller.signal)
      } catch (err) {
        if (err instanceof Error && err.message === '[CANCELLED]') throw err
        logError(`[distill] chunk ${i + 1} failed, retrying once`, err)
        await new Promise((r) => setTimeout(r, 2000))
        output = await chatCompletion(cfg, messages, CHUNK_TIMEOUT_MS, controller.signal)
      }

      doneOutputs.push(output.trim())
      // 每块完成即落库（断点续跑真源）
      updateDistilledArticle(articleId, {
        chunksJson: JSON.stringify(doneOutputs),
        chunkDone: doneOutputs.length,
      })
    }

    const markdown = mergeChunkOutputs(doneOutputs)
    updateDistilledArticle(articleId, {
      markdown,
      status: 'done',
      durationMs: Date.now() - startAt,
      errorMessage: '',
    })
    logInfo(`[distill] ${articleId} done: ${chunks.length} chunks, ${markdown.length} chars, ${Date.now() - startAt}ms`)
    progress('done', chunks.length)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const cancelled = msg === '[CANCELLED]'
    updateDistilledArticle(articleId, {
      status: cancelled ? 'cancelled' : 'failed',
      durationMs: Date.now() - startAt,
      errorMessage: cancelled ? '已手动取消，可重试续跑' : msg,
    })
    if (!cancelled) logError(`[distill] ${articleId} failed`, err)
    progress(cancelled ? 'cancelled' : 'failed', doneOutputs.length, cancelled ? '已取消' : msg)
  } finally {
    activeArticleId = null
    activeController = null
  }
}

/** 发起提纯（fire-and-forget，进度经回调推送）；返回 articleId */
export function startDistill(
  input: DistillStartInput,
  onProgress: (p: DistillProgress) => void,
): string {
  if (activeArticleId) throw new Error('已有提纯任务进行中，请等待完成或先取消')
  const cfg = getLlmRuntimeConfig()
  if (!cfg) throw new Error('未配置 LLM API，请到「设置 → AI 与数据源」填写')

  const text = loadSourceText(input)
  const chunks = splitIntoChunks(text)
  const articleId = `distill-${Date.now()}`
  const sourceRef = input.sourceType === 'subscription'
    ? `${input.videoId}|${input.channelId}`
    : (input.srtPath ?? '')

  insertDistilledArticle({
    id: articleId,
    title: input.title || '未命名转录稿',
    sourceType: input.sourceType,
    sourceRef,
    sourceCharCount: text.length,
    sourceTextHash: textHash(text),
    chunkTotal: chunks.length,
    model: cfg.model,
  })
  logInfo(`[distill] ${articleId} start: ${text.length} chars → ${chunks.length} chunk(s)`)

  onProgress({ articleId, stage: 'preparing', chunkIndex: 0, chunkTotal: chunks.length })
  void runDistill({ articleId, chunks, doneOutputs: [], cfg, onProgress })
  return articleId
}

/** 重试：校验原文未变后从缺失块续跑；原文已变则从头重跑 */
export function retryDistill(
  articleId: string,
  onProgress: (p: DistillProgress) => void,
): string {
  if (activeArticleId) throw new Error('已有提纯任务进行中，请等待完成或先取消')
  const cfg = getLlmRuntimeConfig()
  if (!cfg) throw new Error('未配置 LLM API，请到「设置 → AI 与数据源」填写')

  const existing = getDistilledArticleRaw(articleId)
  if (!existing) throw new Error('提纯记录不存在')
  if (existing.meta.status === 'running') throw new Error('该任务正在进行中')
  if (existing.meta.status === 'done') throw new Error('该任务已完成，无需重试')

  // 重新取原文
  const input: DistillStartInput = existing.meta.sourceType === 'subscription'
    ? {
        sourceType: 'subscription',
        title: existing.meta.title,
        videoId: existing.meta.sourceRef.split('|')[0],
        channelId: existing.meta.sourceRef.split('|')[1] ?? '',
      }
    : { sourceType: existing.meta.sourceType, title: existing.meta.title, srtPath: existing.meta.sourceRef }
  const text = loadSourceText(input)
  const chunks = splitIntoChunks(text)

  // 原文未变 → 从已完成块续跑；已变 → 从头重跑
  const hashMatch = textHash(text) === existing.sourceTextHash
  const doneOutputs = hashMatch ? existing.chunks.slice(0, chunks.length) : []
  logInfo(`[distill] ${articleId} retry: hash ${hashMatch ? 'match, resume from' : 'mismatch, restart at'} chunk ${doneOutputs.length + 1}/${chunks.length}`)

  updateDistilledArticle(articleId, {
    status: 'running',
    chunkDone: doneOutputs.length,
    chunksJson: JSON.stringify(doneOutputs),
    errorMessage: '',
  })
  onProgress({ articleId, stage: 'preparing', chunkIndex: doneOutputs.length, chunkTotal: chunks.length })
  void runDistill({ articleId, chunks, doneOutputs, cfg, onProgress })
  return articleId
}
