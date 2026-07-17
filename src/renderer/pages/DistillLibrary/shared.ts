import type { DistillSourceType } from '@shared/types'

export const SOURCE_TYPE_LABEL: Record<DistillSourceType, string> = {
  'whisper-srt': 'Whisper 转录',
  'subtitle-srt': '字幕提取',
  'subscription': '订阅文案',
}

/** 文件名去掉 Windows 非法字符 */
function sanitizeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_').slice(0, 80) || 'article'
}

/** 另存为对话框导出提纯稿 Markdown；返回保存路径（取消返回 null） */
export async function exportArticleMarkdown(articleId: string, title: string): Promise<string | null> {
  const article = await window.api.distillGet(articleId)
  if (!article?.markdown) return null
  const savePath = await window.api.selectSavePath(
    `${sanitizeFileName(title)}.md`,
    [{ name: 'Markdown', extensions: ['md'] }],
  )
  if (!savePath) return null
  await window.api.writeTextFile(savePath, `# ${article.title}\n\n${article.markdown}\n`)
  return savePath
}
