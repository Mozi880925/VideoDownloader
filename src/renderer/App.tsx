import React, { useState, useEffect } from 'react'
import TitleBar from './components/TitleBar'
import Sidebar, { PageKey } from './components/Sidebar'
import VideoDownload from './pages/VideoDownload'
import BatchDownload from './pages/BatchDownload'
import DownloadList from './pages/DownloadList'
import Settings from './pages/Settings'
import About from './pages/About'
import { useDownloadStore } from './store/downloadStore'

const pageMap: Record<PageKey, React.ReactNode> = {
  'video-download': <VideoDownload />,
  'batch-download': <BatchDownload />,
  'download-list': <DownloadList />,
  'settings': <Settings />,
  'about': <About />,
}

const App: React.FC = () => {
  const [currentPage, setCurrentPage] = useState<PageKey>('video-download')
  const loadFromDb = useDownloadStore((s) => s.loadFromDb)
  const dbLoaded = useDownloadStore((s) => s.dbLoaded)
  const retryUrl = useDownloadStore((s) => s.retryUrl)
  const pendingBatchUrls = useDownloadStore((s) => s.pendingBatchUrls)

  // 启动时从数据库加载已完成记录
  useEffect(() => {
    if (!dbLoaded) loadFromDb()
  }, [dbLoaded, loadFromDb])

  // 启动时将已保存的 cookies 路径同步到主进程
  useEffect(() => {
    const cookiesPath = useDownloadStore.getState().appSettings.cookiesPath || ''
    window.api.setCookiesPath(cookiesPath).catch(() => {})
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
