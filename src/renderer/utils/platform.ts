export function detectPlatform(url: string): string {
  const u = url.toLowerCase()
  if (u.includes('youtube.com') || u.includes('youtu.be')) return 'YouTube'
  if (u.includes('tiktok.com')) return 'TikTok'
  if (u.includes('bilibili.com') || u.includes('b23.tv')) return 'Bilibili'
  if (u.includes('instagram.com')) return 'Instagram'
  if (u.includes('douyin.com') || u.includes('iesdouyin.com')) return '抖音'
  if (u.includes('xiaohongshu.com') || u.includes('xhslink.com')) return '小红书'
  if (u.includes('twitter.com') || u.includes('x.com')) return 'Twitter/X'
  if (u.includes('facebook.com') || u.includes('fb.watch')) return 'Facebook'
  return '其他'
}

export const PLATFORM_OPTIONS = [
  'YouTube', 'TikTok', 'Bilibili', 'Instagram',
  '抖音', '小红书', 'Twitter/X', 'Facebook', '其他',
] as const
