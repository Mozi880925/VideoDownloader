/**
 * yt-dlp 错误信息翻译器
 * 将常见的英文错误信息转换为用户友好的中文提示
 */

interface ErrorRule {
  pattern: RegExp
  message: string
}

const ERROR_RULES: ErrorRule[] = [
  // ---- HTTP 错误 ----
  { pattern: /HTTP Error 403/i,                          message: '访问被拒绝（403），可能需要代理或登录' },
  { pattern: /HTTP Error 404/i,                          message: '视频不存在或已被删除（404）' },
  { pattern: /HTTP Error 429/i,                          message: '请求过于频繁（429），请稍后再试' },
  { pattern: /HTTP Error 5\d{2}/i,                       message: '服务器错误，请稍后重试' },
  { pattern: /HTTP Error 401/i,                          message: '需要登录才能访问此内容' },


  // ---- 网络错误 ----
  { pattern: /network\s*(is\s+)?unreachable/i,           message: '网络不可达，请检查网络连接 (建议全局开启代理)' },
  { pattern: /connection\s*(was\s+)?reset/i,             message: '连接被重置，请检查代理设置 (建议全局开启代理)' },
  { pattern: /connection\s+refused/i,                    message: '连接被拒绝，请检查代理是否正常 (建议全局开启代理)' },
  { pattern: /connection\s+timed?\s*out/i,               message: '连接超时，请检查网络或代理 (建议全局开启代理)' },
  { pattern: /name\s+or\s+service\s+not\s+known/i,       message: 'DNS 解析失败，请检查网络连接 (建议全局开启代理)' },
  { pattern: /getaddrinfo\s+failed/i,                    message: 'DNS 解析失败，请检查网络连接 (建议全局开启代理)' },
  { pattern: /SSL.*?certificate/i,                       message: 'SSL 证书错误，请检查代理或系统时间' },
  { pattern: /unable\s+to\s+download\s+webpage/i,        message: '无法下载网页，请检查网络或代理 (建议全局开启代理)' },
  { pattern: /urlopen\s+error/i,                         message: '网络请求失败，请检查代理设置 (建议全局开启代理)' },
  { pattern: /proxy/i,                                   message: '代理连接异常，请检查代理配置' },

  // ---- 视频访问限制 ----
  { pattern: /private\s+video/i,                         message: '视频为私密内容，需要登录' },
  { pattern: /sign\s+in/i,                               message: '需要登录才能观看此视频' },
  { pattern: /login\s+required/i,                        message: '需要登录才能访问' },
  { pattern: /members[\s-]*only/i,                       message: '仅限会员观看的内容' },
  { pattern: /premium\s+(content|only)/i,                message: '仅限付费会员观看' },
  { pattern: /geo[\s-]*(restricted|blocked|gating)/i,    message: '该视频有地区限制，请使用对应地区的代理' },
  { pattern: /age[\s-]*restrict/i,                       message: '该视频有年龄限制，需要登录验证' },
  { pattern: /copyright/i,                               message: '该视频因版权原因不可用' },
  { pattern: /video\s+(is\s+)?(unavailable|not\s+available)/i, message: '视频不可用或已下架' },
  { pattern: /removed\s+by/i,                            message: '视频已被发布者或平台移除' },
  { pattern: /This video has been removed/i,             message: '视频已被移除' },
  { pattern: /account.*?(terminated|suspended)/i,        message: '视频发布者的账号已被停用' },

  // ---- Cookie 读取错误 ----
  { pattern: /Could not copy.*?cookie database/i,         message: 'Chrome 运行时 yt-dlp 无法读取 Cookie 数据库。解决办法：1) 关闭 Chrome 后重试；或 2) 在设置中配置独立的「国内平台 Cookies 文件」（推荐）' },

  // ---- yt-dlp 内部错误 ----
  { pattern: /Unsupported\s+URL/i,                       message: '不支持的链接格式或平台' },
  { pattern: /no\s+video\s+formats/i,                    message: '未找到可用的视频格式' },
  { pattern: /requested\s+format.*?not\s+available/i,    message: '所选格式不可用，请尝试其他格式' },
  { pattern: /no\s+suitable.*?format/i,                  message: '没有合适的格式可供下载' },
  { pattern: /Incomplete\s+data/i,                       message: '数据不完整，下载中断' },
  { pattern: /unable\s+to\s+extract/i,                   message: '解析失败，可能是 yt-dlp 需要更新' },
  { pattern: /yt-dlp\s+needs?\s+to\s+be\s+updated/i,    message: '请更新 yt-dlp 到最新版本' },

  // ---- ffmpeg 相关 ----
  { pattern: /ffmpeg.*?not\s+found/i,                    message: 'ffmpeg 未找到，无法合并视频和音频' },
  { pattern: /merge.*?fail/i,                            message: '视频合并失败，请检查 ffmpeg 是否可用' },
  { pattern: /muxing/i,                                  message: '音视频合并出错' },

  // ---- 文件系统 ----
  { pattern: /Permission\s+denied/i,                     message: '文件写入权限不足，请检查下载目录权限' },
  { pattern: /No\s+space\s+left/i,                       message: '磁盘空间不足' },
  { pattern: /disk\s+(is\s+)?full/i,                     message: '磁盘空间不足' },
  { pattern: /file\s+name\s+too\s+long/i,                message: '文件名过长，请尝试更短的输出路径' },

  // ---- 通用降级 ----
  { pattern: /退出码\s+(\d+)/,                            message: 'yt-dlp 异常退出，请检查网络或更新 yt-dlp' },
  { pattern: /解析超时/,                                   message: '解析超时，请检查网络连接或使用代理' },
  { pattern: /启动\s*yt-dlp\s*失败/,                       message: '启动 yt-dlp 失败，请检查是否已安装' },
  { pattern: /未找到最终文件/,                              message: '下载似乎完成但文件丢失，请检查输出目录' },
]

/**
 * 将 yt-dlp 原始错误信息翻译为用户友好的中文提示
 * 保留原始信息作为二级说明
 */
export function translateError(rawMessage: string): { friendly: string; raw: string } {
  const trimmed = rawMessage.trim()

  for (const rule of ERROR_RULES) {
    if (rule.pattern.test(trimmed)) {
      return { friendly: rule.message, raw: trimmed }
    }
  }

  // 未匹配到已知模式：截取最后 80 字符作为简化展示
  const short = trimmed.length > 80 ? '…' + trimmed.slice(-80) : trimmed
  return { friendly: short, raw: trimmed }
}

/**
 * 获取简化后的错误信息（直接用于 UI 展示）
 */
export function friendlyError(rawMessage: string): string {
  return translateError(rawMessage).friendly
}
