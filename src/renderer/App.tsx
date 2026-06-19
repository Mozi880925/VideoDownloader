import React, { useState, useEffect } from 'react'
import TitleBar from './components/TitleBar'
import Sidebar, { PageKey } from './components/Sidebar'
import VideoDownload from './pages/VideoDownload'
import BatchDownload from './pages/BatchDownload'
import DownloadList from './pages/DownloadList'
import Subscriptions from './pages/Subscriptions'
import TopicIdeas from './pages/TopicIdeas'
import Transcription from './pages/Transcription'
import SubtitleExtract from './pages/SubtitleExtract'
import WhisperConfig from './pages/WhisperConfig'
import Settings from './pages/Settings'
import Network from './pages/Network'
import About from './pages/About'
import { useDownloadStore, useSettingsStore } from './store/downloadStore'

const pageMap: Record<PageKey, React.ReactNode> = {
  'video-download': <VideoDownload />,
  'batch-download': <BatchDownload />,
  'download-list': <DownloadList />,
  'subscriptions': <Subscriptions />,
  'topic-ideas': <TopicIdeas />,
  'transcription': <Transcription />,
  'subtitle-extract': <SubtitleExtract />,
  'whisper-config': <WhisperConfig />,
  'settings': <Settings />,
  'network': <Network />,
  'about': <About />,
}

const App: React.FC = () => {
  const [currentPage, setCurrentPage] = useState<PageKey>('video-download')
  const loadFromDb = useDownloadStore((s) => s.loadFromDb)
  const dbLoaded = useDownloadStore((s) => s.dbLoaded)
  const retryUrl = useSettingsStore((s) => s.retryUrl)
  const pendingBatchUrls = useDownloadStore((s) => s.pendingBatchUrls)

  // 全局进度监听（常驻，不随页面切换销毁）
  useEffect(() => {
    const remove = window.api.onDownloadProgress((p) => {
      const store = useDownloadStore.getState()
      // 更新 activeTasks（单视频下载）
      store.updateProgress(p.taskId, p.progress, p.speed, p.eta, p.filesize)
      // 更新 batchTasks
      store.setBatchTasks((prev) =>
        prev.map((t) =>
          t.downloadTaskId === p.taskId
            ? { ...t, progress: p.progress, speed: p.speed, eta: p.eta, downloadStatus: 'downloading' as const }
            : t,
        ),
      )
    })
    return () => remove()
  }, [])

  // 启动时从数据库加载已完成记录
  useEffect(() => {
    if (!dbLoaded) loadFromDb()
  }, [dbLoaded, loadFromDb])

  // 启动时将已保存的 cookies 路径同步到主进程
  useEffect(() => {
    const { cookiesPath, douyinCookiesBrowser } = useSettingsStore.getState().appSettings
    window.api.setCookiesPath(cookiesPath || '').catch(() => {})
    window.api.setDouyinBrowser(douyinCookiesBrowser || 'chrome').catch(() => {})
  }, [])

  // 启动时把订阅检查间隔推送到主进程
  useEffect(() => {
    const interval = useSettingsStore.getState().appSettings.subscriptionCheckInterval || '6h'
    window.api.subSetInterval(interval).catch(() => {})
  }, [])

  // 启动时把 LLM 配置和爆款自动拆解开关推送到主进程（定时检查的自动拆解在主进程跑）
  useEffect(() => {
    const { llm, autoAnalyzeHot } = useSettingsStore.getState().appSettings
    window.api.llmSetConfig(llm ?? null, !!autoAnalyzeHot).catch(() => {})
  }, [])

  // 启动时把 YouTube Data API Key 推送到主进程（订阅检查走官方 API 拿精确播放量）
  useEffect(() => {
    const { youtubeApiKey } = useSettingsStore.getState().appSettings
    window.api.ytApiSetKey(youtubeApiKey?.trim() || null).catch(() => {})
  }, [])

  // 启动时同步代理设置到主进程
  useEffect(() => {
    const { proxyType, proxyHost, proxyPort, proxyUsername, proxyPassword } = useSettingsStore.getState().appSettings
    if (proxyType && proxyType !== 'none') {
      window.api.setProxy(proxyType, proxyHost, proxyPort, proxyUsername, proxyPassword).catch(() => {})
    }
  }, [])

  // 监听重新下载请求 → 自动切到单视频下载页
  useEffect(() => {
    if (retryUrl) {
      setCurrentPage('video-download')
    }
  }, [retryUrl])

  // 监听批量下载切页请求
  useEffect(() => {
    if (pendingBatchUrls.length > 0) {
      setCurrentPage('batch-download')
    }
  }, [pendingBatchUrls])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <TitleBar />
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <Sidebar selectedKey={currentPage} onSelect={setCurrentPage} />
        <main
          style={{
            flex: 1,
            background: '#f5f5f5',
            overflow: 'auto',
          }}
        >
          {pageMap[currentPage]}
        </main>
      </div>
    </div>
  )
}

export default App
