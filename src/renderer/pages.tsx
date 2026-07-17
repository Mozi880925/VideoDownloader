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
  FileTextOutlined,
  SoundOutlined,
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
import Transcription from './pages/Transcription'
import SubtitleExtract from './pages/SubtitleExtract'
import DistillLibrary from './pages/DistillLibrary'
import WhisperConfig from './pages/WhisperConfig'
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
  'transcription': Transcription,
  'subtitle-extract': SubtitleExtract,
  'distill-library': DistillLibrary,
  'whisper-config': WhisperConfig,
  'settings': Settings,
  'network': Network,
  'about': About,
} satisfies Record<string, React.ComponentType>

export type PageKey = keyof typeof pageComponents

/** 侧边栏菜单（分组 key 不是 PageKey，Menu 点击时只会命中叶子项） */
export const menuItems: MenuProps['items'] = [
  {
    key: 'downloader',
    icon: <DownloadOutlined />,
    label: '下载器',
    children: [
      { key: 'video-download', icon: <VideoCameraOutlined />, label: '视频下载' },
      { key: 'batch-download', icon: <UnorderedListOutlined />, label: '批量下载' },
      { key: 'download-list', icon: <UnorderedListOutlined />, label: '下载列表' },
    ],
  },
  { key: 'subscriptions', icon: <BellOutlined />, label: '频道订阅' },
  { key: 'radar', icon: <RadarChartOutlined />, label: '蓝海雷达' },
  { key: 'topic-ideas', icon: <BulbOutlined />, label: '选题灵感库' },
  {
    key: 'subtitle-group',
    icon: <AudioOutlined />,
    label: '字幕和转录',
    children: [
      { key: 'transcription', icon: <SoundOutlined />, label: 'AI 识别字幕' },
      { key: 'subtitle-extract', icon: <FileTextOutlined />, label: '字幕提取' },
      { key: 'distill-library', icon: <FileTextOutlined />, label: '提纯稿库' },
      { key: 'whisper-config', icon: <SettingOutlined />, label: 'Whisper 配置' },
    ],
  },
  { key: 'network', icon: <GlobalOutlined />, label: '网络' },
  { key: 'settings', icon: <SettingOutlined />, label: '设置' },
  { key: 'about', icon: <InfoCircleOutlined />, label: '关于' },
]
