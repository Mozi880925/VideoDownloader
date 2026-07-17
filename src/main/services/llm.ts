import { net } from 'electron'
import type {
  ChannelAnalysis,
  ChannelAnalysisInput,
  ChannelAnalysisResult,
  LlmConfig,
  TitleAnalysis,
  TitleAnalysisInput,
  TitleAnalysisResult,
} from '../../shared/types'
import { logInfo, logError } from './logger'

// ────────── 运行时配置（渲染端启动/改设置时推送，主进程自动拆解爆款时用） ──────────

let runtimeConfig: LlmConfig | null = null

export function setLlmRuntimeConfig(cfg: LlmConfig | null): void {
  runtimeConfig = cfg && cfg.baseUrl?.trim() && cfg.apiKey?.trim() && cfg.model?.trim() ? cfg : null
  logInfo(`[llm] runtime config ${runtimeConfig ? 'set, model=' + runtimeConfig.model : 'cleared'}`)
}

export function getLlmRuntimeConfig(): LlmConfig | null {
  return runtimeConfig
}

// ────────── OpenAI 兼容 Chat Completions 调用 ──────────
// 使用 electron net.fetch：走 Chromium 网络栈，自动复用 defaultSession 的代理设置

function validateConfig(cfg: LlmConfig | undefined): string | null {
  if (!cfg?.baseUrl?.trim()) return '未配置 API Base URL，请到「设置 → AI 分析」填写'
  if (!cfg.apiKey?.trim()) return '未配置 API Key，请到「设置 → AI 分析」填写'
  if (!cfg.model?.trim()) return '未配置模型名称，请到「设置 → AI 分析」填写'
  return null
}

function buildEndpoint(baseUrl: string): string {
  // 兼容用户填 https://api.xxx.com 或 https://api.xxx.com/v1 或带尾斜杠
  let base = baseUrl.trim().replace(/\/+$/, '')
  if (!/\/v\d+$/.test(base)) base += '/v1'
  return base + '/chat/completions'
}

export async function chatCompletion(
  cfg: LlmConfig,
  messages: { role: 'system' | 'user'; content: string }[],
  timeoutMs = 90_000,
  signal?: AbortSignal,
): Promise<string> {
  const endpoint = buildEndpoint(cfg.baseUrl)
  logInfo(`[llm] POST ${endpoint} model=${cfg.model}`)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  // 外部取消信号（提纯任务取消时中止当前请求）
  const onAbort = () => controller.abort()
  signal?.addEventListener('abort', onAbort, { once: true })
  try {
    const resp = await net.fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey.trim()}`,
      },
      body: JSON.stringify({
        model: cfg.model.trim(),
        messages,
        temperature: 0.4,
      }),
      signal: controller.signal,
    })

    if (!resp.ok) {
      const text = (await resp.text().catch(() => '')).slice(0, 300)
      throw new Error(`API 返回 ${resp.status}：${text || resp.statusText}`)
    }

    const json = (await resp.json()) as {
      choices?: { message?: { content?: string } }[]
    }
    const content = json.choices?.[0]?.message?.content
    if (!content) throw new Error('API 返回内容为空')
    return content
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      if (signal?.aborted) throw new Error('[CANCELLED]')
      throw new Error(`请求超时（${Math.round(timeoutMs / 1000)}s）`)
    }
    throw err
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
  }
}

/** 宽松解析 LLM 输出的 JSON：剥掉 ```json 围栏，截取首尾大括号 */
function parseLenientJson<T>(raw: string): T | undefined {
  let text = raw.trim()
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) text = fence[1].trim()
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return undefined
  try {
    return JSON.parse(text.slice(start, end + 1)) as T
  } catch {
    return undefined
  }
}

// ────────── Public API ──────────

/** 测试连接：发一个最小请求确认配置可用 */
export async function testLlm(cfg: LlmConfig): Promise<{ ok: boolean; message: string }> {
  const invalid = validateConfig(cfg)
  if (invalid) return { ok: false, message: invalid }
  try {
    const reply = await chatCompletion(cfg, [{ role: 'user', content: '回复"OK"两个字母即可。' }], 30_000)
    return { ok: true, message: `连接成功，模型回复：${reply.trim().slice(0, 50)}` }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    logError('[llm] test failed', err instanceof Error ? err : new Error(msg))
    return { ok: false, message: msg }
  }
}

function buildTitleSystemPrompt(hasOpening: boolean): string {
  const openingField = hasOpening
    ? `,
  "opening": "拆解视频开头（前 90 秒文案）的钩子设计：它如何留住观众？用了什么结构（悬念/冲突/承诺/反差等）？哪几句是关键句？"`
    : ''
  return `你是一位短视频与 YouTube 内容策略专家，擅长拆解爆款视频的标题结构和受众心理。
用户是一名内容创作者，正在研究同领域对标账号的视频，希望从中提炼可复用的方法论。
你必须只输出一个 JSON 对象，不要输出任何其他文字，结构如下：
{
  "structure": "用一两句话拆解这个标题的结构组成（如：数字承诺 + 反常识转折 + 目标人群）",
  "hooks": ["该标题使用的钩子或技巧，每条一短句"],
  "emotion": "该标题触发的核心情绪（如好奇、焦虑、惊讶、获得感）及原因",
  "templates": ["把该标题抽象成可直接套用的标题模板，用【】标注可替换槽位，给 2-3 条"],
  "suggestions": ["结合该标题的套路，给用户 2-3 个具体的同领域选题建议，每条是一个完整的候选标题"]${openingField}
}
所有内容用中文。`
}

function buildTitleUserPrompt(input: TitleAnalysisInput): string {
  const lines: string[] = []
  lines.push(`【目标视频标题】${input.title}`)
  if (input.viewCount) lines.push(`【播放量】${input.viewCount.toLocaleString()}`)
  if (input.channelName) lines.push(`【所属频道】${input.channelName}`)
  if (input.siblings.length > 0) {
    lines.push('')
    lines.push('【同频道近期视频（标题 | 播放量），供对比该频道的常规水平】')
    for (const s of input.siblings.slice(0, 20)) {
      lines.push(`- ${s.title} | ${s.viewCount ? s.viewCount.toLocaleString() : '未知'}`)
    }
  }
  if (input.openingText) {
    lines.push('')
    lines.push('【视频开头文案（前 90 秒字幕）】')
    lines.push(input.openingText.slice(0, 2000))
  }
  lines.push('')
  lines.push(input.openingText ? '请拆解目标视频的标题和开头钩子。' : '请拆解目标视频的标题。')
  return lines.join('\n')
}

/** 拆解单个视频标题（带同频道对照数据） */
export async function analyzeTitle(cfg: LlmConfig, input: TitleAnalysisInput): Promise<TitleAnalysisResult> {
  const invalid = validateConfig(cfg)
  if (invalid) throw new Error(invalid)
  if (!input?.title?.trim()) throw new Error('视频标题为空')

  const raw = await chatCompletion(cfg, [
    { role: 'system', content: buildTitleSystemPrompt(!!input.openingText) },
    { role: 'user', content: buildTitleUserPrompt(input) },
  ])

  const parsed = parseLenientJson<TitleAnalysis>(raw)
  if (parsed) {
    // 字段兜底，防止 LLM 漏字段导致渲染端炸
    parsed.structure = typeof parsed.structure === 'string' ? parsed.structure : ''
    parsed.emotion = typeof parsed.emotion === 'string' ? parsed.emotion : ''
    parsed.hooks = Array.isArray(parsed.hooks) ? parsed.hooks.map(String) : []
    parsed.templates = Array.isArray(parsed.templates) ? parsed.templates.map(String) : []
    parsed.suggestions = Array.isArray(parsed.suggestions) ? parsed.suggestions.map(String) : []
    parsed.opening = typeof parsed.opening === 'string' && parsed.opening ? parsed.opening : undefined
  } else {
    logInfo('[llm] analyzeTitle: JSON parse failed, returning raw text')
  }
  return { raw, parsed }
}

// ────────── 频道级标题规律分析 ──────────

const CHANNEL_SYSTEM_PROMPT = `你是一位短视频与 YouTube 内容策略专家，擅长从一个频道的批量数据中归纳标题方法论。
用户是一名内容创作者，会给你一个对标频道的近期视频列表（标题 + 播放量）。
请对比高播放和低播放视频，归纳这个频道的标题规律。
你必须只输出一个 JSON 对象，不要输出任何其他文字，结构如下：
{
  "formula": "用一两句话总结这个频道效果最好的标题公式",
  "patterns": ["高播放标题的共性规律，每条一短句，3-5 条"],
  "weaknesses": "低播放标题的常见问题，一两句话",
  "templates": ["从高播放标题中抽象出的可套用模板，用【】标注可替换槽位，给 3 条"],
  "suggestions": ["按这个频道验证有效的套路，给用户 3 个具体的选题建议，每条是一个完整的候选标题"]
}
所有内容用中文。`

function buildChannelUserPrompt(input: ChannelAnalysisInput): string {
  const lines: string[] = [`【频道】${input.channelName}`, '', '【近期视频（标题 | 播放量 | 发布日期）】']
  for (const v of input.videos.slice(0, 30)) {
    lines.push(`- ${v.title} | ${v.viewCount ? v.viewCount.toLocaleString() : '未知'} | ${v.uploadDate || '未知'}`)
  }
  lines.push('')
  lines.push('请归纳这个频道的标题规律。')
  return lines.join('\n')
}

/** 频道级标题规律报告：整个频道的标题+播放量喂给 LLM，归纳公式 */
export async function analyzeChannel(cfg: LlmConfig, input: ChannelAnalysisInput): Promise<ChannelAnalysisResult> {
  const invalid = validateConfig(cfg)
  if (invalid) throw new Error(invalid)
  const videos = (input?.videos ?? []).filter((v) => v.title?.trim())
  if (videos.length < 5) throw new Error('该频道缓存的视频太少（不足 5 条），先点「检查」拉取后再分析')

  const raw = await chatCompletion(cfg, [
    { role: 'system', content: CHANNEL_SYSTEM_PROMPT },
    { role: 'user', content: buildChannelUserPrompt({ ...input, videos }) },
  ])

  const parsed = parseLenientJson<ChannelAnalysis>(raw)
  if (parsed) {
    parsed.formula = typeof parsed.formula === 'string' ? parsed.formula : ''
    parsed.weaknesses = typeof parsed.weaknesses === 'string' ? parsed.weaknesses : ''
    parsed.patterns = Array.isArray(parsed.patterns) ? parsed.patterns.map(String) : []
    parsed.templates = Array.isArray(parsed.templates) ? parsed.templates.map(String) : []
    parsed.suggestions = Array.isArray(parsed.suggestions) ? parsed.suggestions.map(String) : []
  } else {
    logInfo('[llm] analyzeChannel: JSON parse failed, returning raw text')
  }
  return { raw, parsed }
}
