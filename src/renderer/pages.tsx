import React from 'react'
import {
  DownloadOutlined,
  UnorderedListOutlined,
  SettingOutlined,
  InfoCircleOutlined,
  VideoCameraOutlined,
  BellOutlined,
  GlobalOutlined,
  AudioOutlined,
  BulbOutlined,
  RadarChartOutlined,
} from '@ant-design/icons'
import type { MenuProps } from 'antd'
import VideoDownload from './pages/VideoDownload'
import BatchDownload from './pages/BatchDownload'
import DownloadList from './pages/DownloadList'
import Subscriptions from './pages/Subscriptions'
import Radar from './pages/Radar'
import TopicIdeas from './pages/TopicIdeas'
import TranscriptHub from './pages/TranscriptHub'
import Settings from './pages/Settings'
import Network from './pages/Network'
import About from './pages/About'

// ────────── 页面注册唯一来源：PageKey / 组件映射 / 侧边栏菜单全部由此派生 ──────────
// 新增页面只改这一个文件：pageComponents 加一行 + menuItems 加一项。

export const pageComponents = {
  'video-download': VideoDownload,
  'batch-download': BatchDownload,
  'download-list': DownloadList,
  'subscriptions': Subscriptions,
  'radar': Radar,
  'topic-ideas': TopicIdeas,
  'transcript-hub': TranscriptHub,
  'settings': Settings,
  'network': Network,
  'about': About,
} satisfies Record<string, React.ComponentType>

export type PageKey = keyof typeof pageComponents

/** 侧边栏菜单（分组 key 不是 PageKey，Menu 点击时只会命中叶子项） */
export const menuItems: MenuProps['items'] = [
  { key: 'radar', icon: <RadarChartOutlined />, label: '蓝海雷达' },
  { key: 'subscriptions', icon: <BellOutlined />, label: '频道订阅' },
  { key: 'transcript-hub', icon: <AudioOutlined />, label: '字幕和转录' },
  { key: 'topic-ideas', icon: <BulbOutlined />, label: '选题灵感库' },
  { type: 'divider' },
  {
    key: 'downloader',
    icon: <DownloadOutlined />,
    label: '下载工具',
    children: [
      { key: 'video-download', icon: <VideoCameraOutlined />, label: '视频下载' },
      { key: 'batch-download', icon: <UnorderedListOutlined />, label: '批量下载' },
      { key: 'download-list', icon: <UnorderedListOutlined />, label: '下载列表' },
    ],
  },
  { key: 'network', icon: <GlobalOutlined />, label: '网络' },
  { key: 'settings', icon: <SettingOutlined />, label: '设置' },
  { key: 'about', icon: <InfoCircleOutlined />, label: '关于' },
]
