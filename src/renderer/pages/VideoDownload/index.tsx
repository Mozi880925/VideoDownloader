import React, { useState, useEffect } from 'react'
import { Segmented } from 'antd'
import SingleDownload from './SingleDownload'
import SearchDownload from './SearchDownload'

type TabKey = 'single' | 'profile' | 'search' | 'playlist' | 'sniff'

const TAB_OPTIONS: { label: string; value: TabKey }[] = [
  { label: '单视频下载', value: 'single' },
  { label: '搜索下载', value: 'search' },
  { label: '用户主页下载', value: 'profile' },
  { label: '播放列表下载', value: 'playlist' },
  { label: '资源嗅探', value: 'sniff' },
]

const Placeholder: React.FC<{ name: string }> = ({ name }) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: 300,
      color: '#bbb',
      fontSize: 15,
    }}
  >
    「{name}」功能开发中...
  </div>
)

import { useDownloadStore } from '../../store/downloadStore'

const VideoDownload: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabKey>('single')
  const retryUrl = useDownloadStore((s) => s.retryUrl)

  // 如果监听到有重新下载的请求，切回“单视频下载”Tab，以便内层的 SingleDownload 接管它
  useEffect(() => {
    if (retryUrl) {
      setActiveTab('single')
    }
  }, [retryUrl])

  return (
    <div style={{ padding: 24 }}>
      {/* 页面标题 */}
      <h2
        style={{
          fontSize: 26,
          fontWeight: 700,
          background: 'linear-gradient(90deg, #1677ff, #4096ff)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          marginBottom: 4,
        }}
      >
        视频下载
      </h2>
      <p style={{ color: '#999', marginBottom: 20, fontSize: 13 }}>
        支持 YouTube、TikTok、Bilibili、小红书、抖音等主流平台
      </p>

      {/* Tab 切换 */}
      <div style={{ marginBottom: 20 }}>
        <Segmented
          options={TAB_OPTIONS}
          value={activeTab}
          onChange={(v) => setActiveTab(v as TabKey)}
          style={{ borderRadius: 8 }}
          size="middle"
        />
      </div>

      {/* Tab 内容 */}
      {activeTab === 'single' && <SingleDownload />}
      {activeTab === 'profile' && <Placeholder name="用户主页下载" />}
      {activeTab === 'search' && <SearchDownload />}
      {activeTab === 'playlist' && <Placeholder name="播放列表下载" />}
      {activeTab === 'sniff' && <Placeholder name="资源嗅探" />}
    </div>
  )
}

export default VideoDownload
