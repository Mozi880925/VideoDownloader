import React from 'react'
import { Menu } from 'antd'
import {
  DownloadOutlined,
  UnorderedListOutlined,
  SettingOutlined,
  InfoCircleOutlined,
  VideoCameraOutlined,
  BellOutlined,
} from '@ant-design/icons'
import type { MenuProps } from 'antd'

export type PageKey =
  | 'video-download'
  | 'batch-download'
  | 'download-list'
  | 'subscriptions'
  | 'settings'
  | 'about'

interface SidebarProps {
  selectedKey: PageKey
  onSelect: (key: PageKey) => void
}

const menuItems: MenuProps['items'] = [
  {
    key: 'downloader',
    icon: <DownloadOutlined />,
    label: '下载器',
    children: [
      {
        key: 'video-download',
        icon: <VideoCameraOutlined />,
        label: '视频下载',
      },
      {
        key: 'batch-download',
        icon: <UnorderedListOutlined />,
        label: '批量下载',
      },
      {
        key: 'download-list',
        icon: <UnorderedListOutlined />,
        label: '下载列表',
      },
    ],
  },
  {
    key: 'subscriptions',
    icon: <BellOutlined />,
    label: '频道订阅',
  },
  {
    key: 'settings',
    icon: <SettingOutlined />,
    label: '设置',
  },
  {
    key: 'about',
    icon: <InfoCircleOutlined />,
    label: '关于',
  },
]

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
            background: 'linear-gradient(90deg, #1677ff, #4096ff)',
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
