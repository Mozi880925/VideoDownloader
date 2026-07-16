import React from 'react'
import { PRIMARY_GRADIENT, TEXT_TERTIARY } from '../../theme/tokens'

interface PageTitleProps {
  title: React.ReactNode
  /** 副标题（标题下方灰色小字），不传则不渲染 */
  subtitle?: React.ReactNode
  /** 标题字号，默认 26 */
  size?: number
  /** 渐变（默认主蓝；转录类页面传 PURPLE_GRADIENT） */
  gradient?: string
  /** 标题额外样式（margin 等，用于对齐各页面既有间距） */
  style?: React.CSSProperties
  /** 副标题额外样式 */
  subtitleStyle?: React.CSSProperties
}

/** 页面标题：渐变大字（收编各页面重复的 inline 渐变样式） */
const PageTitle: React.FC<PageTitleProps> = ({ title, subtitle, size = 26, gradient = PRIMARY_GRADIENT, style, subtitleStyle }) => (
  <>
    <h2
      style={{
        fontSize: size,
        fontWeight: 700,
        background: gradient,
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        marginBottom: 4,
        ...style,
      }}
    >
      {title}
    </h2>
    {subtitle != null && (
      <p style={{ color: TEXT_TERTIARY, marginBottom: 20, fontSize: 13, ...subtitleStyle }}>{subtitle}</p>
    )}
  </>
)

export default PageTitle
