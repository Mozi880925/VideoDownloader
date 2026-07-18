import { net } from 'electron'
import type { FeishuConfig } from '../../shared/types'
import { logInfo, logError } from './logger'
import { getDistilledArticle, updateDistilledArticle } from './db'

// ────────── 飞书文档交付 ──────────
// 提纯稿 → 飞书云文档。走「导入 .md」路线而非自写 markdown→blocks 映射器：
// 上传素材 → 建导入任务 → 轮询 → 拿 token/url → 开「任何人可读」链接。
// tenant_access_token（2h 有效）模块级缓存，提前 5 分钟刷新，避免每次交付都换新 token。

const API_BASE = 'https://open.feishu.cn/open-apis'

let runtimeConfig: FeishuConfig | null = null

export function setFeishuRuntimeConfig(cfg: FeishuConfig | null): void {
  runtimeConfig = cfg && cfg.appId?.trim() && cfg.appSecret?.trim() ? cfg : null
  logInfo(`[feishu] runtime config ${runtimeConfig ? 'set' : 'cleared'}`)
}

function validateConfig(cfg: FeishuConfig | undefined | null): string | null {
  if (!cfg?.appId?.trim()) return '未配置飞书 App ID，请到「设置 → AI 与数据源」填写'
  if (!cfg?.appSecret?.trim()) return '未配置飞书 App Secret，请到「设置 → AI 与数据源」填写'
  return null
}

let cachedToken: { token: string; expireAt: number; appId: string } | null = null

async function fetchJson(
  path: string,
  init: RequestInit,
  timeoutMs = 20_000,
): Promise<Record<string, unknown>> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const resp = await net.fetch(`${API_BASE}${path}`, { ...init, signal: controller.signal })
    const json = (await resp.json().catch(() => ({}))) as Record<string, unknown>
    const code = Number(json.code ?? -1)
    if (!resp.ok || code !== 0) {
      const msg = String(json.msg ?? resp.statusText)
      if (code === 99991663 || code === 99991664 || /invalid.*app|app.*secret/i.test(msg)) {
        throw new Error('飞书 App ID / App Secret 错误，或应用已被停用')
      }
      throw new Error(`飞书 API 返回错误（code ${code}）：${msg}`)
    }
    return json
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') throw new Error(`飞书 API 请求超时（${Math.round(timeoutMs / 1000)}s）`)
    throw err
  } finally {
    clearTimeout(timer)
  }
}

/** 获取 tenant_access_token；缓存有效期内直接复用，提前 5 分钟刷新 */
async function getTenantAccessToken(cfg: FeishuConfig): Promise<string> {
  const now = Date.now()
  if (cachedToken && cachedToken.appId === cfg.appId && cachedToken.expireAt > now) {
    return cachedToken.token
  }
  const json = await fetchJson('/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: cfg.appId.trim(), app_secret: cfg.appSecret.trim() }),
  })
  const token = String(json.tenant_access_token ?? '')
  const expiresIn = Number(json.expire ?? 7200)
  if (!token) throw new Error('飞书 API 未返回 tenant_access_token')
  cachedToken = { token, expireAt: now + (expiresIn - 300) * 1000, appId: cfg.appId }
  logInfo('[feishu] tenant_access_token refreshed')
  return token
}

async function authedFetch(
  path: string,
  token: string,
  init: RequestInit,
  timeoutMs = 20_000,
): Promise<Record<string, unknown>> {
  return fetchJson(path, {
    ...init,
    headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` },
  }, timeoutMs)
}

/** 上传 Markdown 文本作为待导入素材，返回 file_token */
async function uploadMarkdown(token: string, title: string, markdown: string): Promise<string> {
  const fileName = `${title || '提纯稿'}.md`
  const blob = new Blob([markdown], { type: 'text/markdown' })
  const form = new FormData()
  form.append('file_name', fileName)
  form.append('parent_type', 'ccm_import_open')
  form.append('size', String(blob.size))
  form.append('extra', JSON.stringify({ obj_type: 'docx', file_extension: 'md' }))
  form.append('file', blob, fileName)

  const json = await authedFetch('/drive/v1/medias/upload_all', token, {
    method: 'POST',
    body: form,
  }, 30_000)
  const data = json.data as Record<string, unknown> | undefined
  const fileToken = String(data?.file_token ?? '')
  if (!fileToken) throw new Error('飞书素材上传未返回 file_token')
  return fileToken
}

/** 建导入任务，返回 ticket */
async function createImportTask(token: string, fileToken: string): Promise<string> {
  const json = await authedFetch('/drive/v1/import_tasks', token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      file_extension: 'md',
      file_token: fileToken,
      type: 'docx',
      point: { mount_type: 1, mount_key: '' },
    }),
  })
  const data = json.data as Record<string, unknown> | undefined
  const ticket = String(data?.ticket ?? '')
  if (!ticket) throw new Error('飞书导入任务未返回 ticket')
  return ticket
}

/** 轮询导入任务结果，成功返回 {docToken, url} */
async function pollImportTask(token: string, ticket: string): Promise<{ docToken: string; url: string }> {
  const maxAttempts = 40
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((resolve) => setTimeout(resolve, 1500))
    const json = await authedFetch(`/drive/v1/import_tasks/${ticket}`, token, { method: 'GET' })
    const data = json.data as Record<string, unknown> | undefined
    const result = (data?.result ?? {}) as Record<string, unknown>
    const jobStatus = Number(result.job_status ?? -1)
    if (jobStatus === 0) {
      const docToken = String(result.token ?? '')
      const url = String(result.url ?? '')
      if (!docToken || !url) throw new Error('飞书导入完成但未返回文档链接')
      return { docToken, url }
    }
    if (jobStatus !== 1 && jobStatus !== 2) {
      // 1/2 = 初始化中/处理中，其余为终态失败
      const errMsg = String(result.job_error_msg ?? '未知错误')
      throw new Error(`飞书导入失败：${errMsg}`)
    }
  }
  throw new Error('飞书导入超时，请稍后在飞书云文档中确认是否已生成')
}

/** 开「任何人可读」链接权限；失败不阻断整体流程，仅记日志 */
async function openPublicAccess(token: string, docToken: string): Promise<void> {
  try {
    await authedFetch(`/drive/v2/permissions/${docToken}/public?type=docx`, token, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ external_access_entity: 'open', link_share_entity: 'anyone_readable' }),
    })
  } catch (err) {
    logError('[feishu] open public access failed (non-fatal)', err)
  }
}

/** 测试连接：仅验证能否换取 tenant_access_token */
export async function testFeishu(cfg: FeishuConfig): Promise<{ ok: boolean; message: string }> {
  const invalid = validateConfig(cfg)
  if (invalid) return { ok: false, message: invalid }
  try {
    await getTenantAccessToken(cfg)
    return { ok: true, message: '连接成功' }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    logError('[feishu] test failed', err instanceof Error ? err : new Error(msg))
    return { ok: false, message: msg }
  }
}

/** 把一篇已完成的提纯稿交付为飞书文档，返回文档链接；成功时回写 feishu_url */
export async function createFeishuDoc(articleId: string): Promise<string> {
  const invalid = validateConfig(runtimeConfig)
  if (invalid) throw new Error(invalid)
  const cfg = runtimeConfig!

  const article = getDistilledArticle(articleId)
  if (!article) throw new Error('提纯稿不存在')
  if (article.status !== 'done') throw new Error('提纯稿尚未完成，无法交付')
  if (!article.markdown.trim()) throw new Error('提纯稿内容为空')

  logInfo(`[feishu] creating doc for article ${articleId}`)
  const token = await getTenantAccessToken(cfg)
  const fileToken = await uploadMarkdown(token, article.title, article.markdown)
  const ticket = await createImportTask(token, fileToken)
  const { docToken, url } = await pollImportTask(token, ticket)
  await openPublicAccess(token, docToken)

  updateDistilledArticle(articleId, { feishuUrl: url })
  logInfo(`[feishu] doc created for article ${articleId}: ${url}`)
  return url
}
