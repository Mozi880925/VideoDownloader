import type { FolderOrganize } from '../../shared/types'
import { detectPlatform } from './platform'

/**
 * 根据设置构建 yt-dlp 的输出路径模板。
 * folderOrganize 控制是否在平台目录下再加「频道」或「年月」子目录。
 */
export function buildOutputPath(
  url: string,
  baseDir: string,
  namingRule: string,
  folderOrganize: FolderOrganize = 'none',
): string {
  const platform = detectPlatform(url)
  const platformFolder = platform === '其他' ? '%(extractor_key)s' : platform
  const rule = namingRule || '%(title)s.%(ext)s'

  let subdirs: string
  switch (folderOrganize) {
    case 'by-date':
      subdirs = `${platformFolder}\\%(upload_date>%Y-%m)s`
      break
    case 'by-channel':
      subdirs = `${platformFolder}\\%(uploader,creator,channel)s`
      break
    case 'by-channel-date':
      subdirs = `${platformFolder}\\%(uploader,creator,channel)s\\%(upload_date>%Y-%m)s`
      break
    default:
      subdirs = platformFolder
  }

  const template = `${subdirs}\\${rule}`
  if (!baseDir) return template
  return `${baseDir.replace(/\\$/, '')}\\${template}`
}
