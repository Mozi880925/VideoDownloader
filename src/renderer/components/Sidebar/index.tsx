import React from 'react'
import { Menu } from 'antd'
import { menuItems, type PageKey } from '../../pages'
import { PRIMARY_GRADIENT } from '../../theme/tokens'

// PageKey 的定义已收敛到 src/renderer/pages.tsx，此处重导出兼容既有引用
export type { PageKey }

interface SidebarProps {
  selectedKey: PageKey
  onSelect: (key: PageKey) => void
}

const Sidebar: React.FC<SidebarProps> = ({ selectedKey, onSelect }) => {
  return (
    <div
      style={{
        width: 220,
        flexShrink: 0,
        background: '#ffffff',
        display: 'flex',
        flexDirection: 'column',
        borderRight: '1px solid #f0f0f0',
        overflow: 'hidden',
      }}
    >
      {/* 应用名 */}
      <div
        style={{
          height: 56,
          display: 'flex',
          alignItems: 'center',
          paddingLeft: 20,
          borderBottom: '1px solid #f0f0f0',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontSize: 16,
            fontWeight: 700,
            background: PRIMARY_GRADIENT,
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            letterSpacing: 0.5,
          }}
        >
          VideoDownloader
        </span>
      </div>

      {/* 导航菜单 */}
      <Menu
        mode="inline"
        selectedKeys={[selectedKey]}
        defaultOpenKeys={['downloader']}
        items={menuItems}
        onClick={({ key }) => onSelect(key as PageKey)}
        style={{
          flex: 1,
          border: 'none',
          paddingTop: 8,
        }}
      />
    </div>
  )
}

export default Sidebar
