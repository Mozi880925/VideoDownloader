/**
 * 从文本中提取 URL（支持抖音/小红书等平台的分享口令格式）
 *
 * 示例输入：
 *   "8.79 l@p.QK 04/11 :7pm KwF:/ 【星际女侠】 师父十二年前... https://v.douyin.com/UmZUr7lOTFo/ 复制此链接..."
 * 输出：
 *   ["https://v.douyin.com/UmZUr7lOTFo/"]
 *
 * 同时支持：
 * - 纯 URL（原样返回）
 * - 多个 URL 混在一行
 * - 末尾带中文标点（自动剥离）
 */

// 匹配 http/https URL，遇到空白或中文字符即停止
const URL_REGEX = /https?:\/\/[^\s一-鿿，。！？、；：""''（）【】《》「」『』]+/g

// URL 末尾常见的"垃圾字符"，需要剥离
const TRAILING_GARBAGE = /[，。！？、；：""''）】》」』.,;:!?)\]}>\s]+$/

export function extractUrls(text: string): string[] {
  if (!text) return []
  const matches = text.match(URL_REGEX)
  if (!matches) return []

  const cleaned = matches.map(u => {
    // 反复剥离末尾标点直到稳定
    let url = u
    while (true) {
      const next = url.replace(TRAILING_GARBAGE, '')
      if (next === url) break
      url = next
    }
    return url
  }).filter(u => u.length >= 10)  // 过滤掉太短的疑似误匹配

  // 去重
  return Array.from(new Set(cleaned))
}

/**
 * 从单行/单段文本中提取第一个 URL（用于单视频输入场景）
 * 如果没匹配到任何 URL，返回 trim 后的原文（向后兼容直接粘贴 URL 的场景）
 */
export function extractFirstUrl(text: string): string {
  const urls = extractUrls(text)
  return urls[0] || text.trim()
}

/**
 * 从多行文本中提取所有 URL（用于批量场景）
 * 每行可以是：
 *   - 纯 URL
 *   - 含 URL 的分享口令
 *   - 多个 URL 用空格/标点分隔
 */
export function extractAllUrls(multilineText: string): string[] {
  if (!multilineText) return []
  // 整体一次提取，比按行分割更稳（一行内可能有多个 URL）
  return extractUrls(multilineText)
}
