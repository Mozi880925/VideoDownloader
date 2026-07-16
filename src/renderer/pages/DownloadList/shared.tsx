import React from 'react'
import { Card, Empty } from 'antd'
import SharedThumbnail from '../../components/Thumbnail'
import type { ActiveTask } from '../../store/activeTasksStore'

// ---- 本模块内多个卡片共用的小件 ----

/** 缩略图（16:9，公共 Thumbnail 的本页封装） */
export const Thumbnail: React.FC<{ src?: string; size?: number }> = ({ src, size = 80 }) => (
  <SharedThumbnail src={src} width={(size * 16) / 9} height={size} />
)

export function formatTime(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function statusLabel(status: ActiveTask['status']): string {
  switch (status) {
    case 'preparing': return '正在准备…'
    case 'downloading': return '正在下载'
    case 'merging': return '正在合并'
    default: return '下载中'
  }
}

/** 空状态 */
export const EmptyState: React.FC<{ description: string; hasFilter: boolean }> = ({ description, hasFilter }) => (
  <Card style={{ borderRadius: 8 }}>
    <Empty
      description={hasFilter ? '没有匹配的记录' : description}
      image={Empty.PRESENTED_IMAGE_SIMPLE}
    />
  </Card>
)
