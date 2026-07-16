import type { ThemeConfig } from 'antd'

// ────────── 设计 token 唯一来源（CLAUDE.md 界面规范的代码化）──────────
// 新代码禁止硬编码 #1677ff / 渐变字符串 / 圆角数值，一律从这里取。

/** 主色 */
export const PRIMARY = '#1677ff'
/** 页面标题 / 品牌字渐变（蓝） */
export const PRIMARY_GRADIENT = 'linear-gradient(90deg, #1677ff, #4096ff)'
/** 字幕/转录模块的紫色渐变 */
export const PURPLE_GRADIENT = 'linear-gradient(90deg, #7c3aed, #a855f7)'

/** 卡片圆角 */
export const RADIUS_CARD = 8
/** 按钮 / 输入框圆角 */
export const RADIUS_CONTROL = 6

/** 内容区背景 */
export const BG_LAYOUT = '#f5f5f5'
/** 次要文字 */
export const TEXT_SECONDARY = '#666'
/** 弱化文字（说明、占位） */
export const TEXT_TERTIARY = '#999'

/** AntD ConfigProvider 主题（取现值，视觉零变化） */
export const antdTheme: ThemeConfig = {
  token: {
    colorPrimary: PRIMARY,
    borderRadius: RADIUS_CONTROL,
  },
}
