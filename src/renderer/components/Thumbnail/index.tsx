import React from 'react'
import { VideoCameraOutlined } from '@ant-design/icons'

interface ThumbnailProps {
  src?: string
  width: number
  height: number
  /** 圆角，默认 4 */
  radius?: number
  /** 占位图标字号，默认 24 */
  iconSize?: number
  /** 占位图标颜色，默认 #bbb */
  iconColor?: string
  style?: React.CSSProperties
}

/** 视频缩略图：有图显示（加载失败自动隐藏），无图显示摄像机占位图标 */
const Thumbnail: React.FC<ThumbnailProps> = ({ src, width, height, radius = 4, iconSize = 24, iconColor = '#bbb', style }) => (
  <div
    style={{
      width,
      height,
      borderRadius: radius,
      overflow: 'hidden',
      background: '#f0f0f0',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
      ...style,
    }}
  >
    {src ? (
      <img
        src={src}
        alt="thumbnail"
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
      />
    ) : (
      <VideoCameraOutlined style={{ fontSize: iconSize, color: iconColor }} />
    )}
  </div>
)

export default Thumbnail
