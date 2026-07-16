import React, { useEffect } from 'react'
import TitleBar from './components/TitleBar'
import Sidebar from './components/Sidebar'
import { pageComponents } from './pages'
import { useDownloadStore } from './store/downloadStore'
import { useSettingsStore } from './store/settingsStore'
import { useNavStore } from './store/navStore'
import { BG_LAYOUT } from './theme/tokens'

const App: React.FC = () => {
  const currentPage = useNavStore((s) => s.currentPage)
  const setPage = useNavStore((s) => s.setPage)
  const loadFromDb = useDownloadStore((s) => s.loadFromDb)
  const dbLoaded = useDownloadStore((s) => s.dbLoaded)

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

  // 启动时把全量设置推送到主进程 settingsHub（此后每次 updateSettings 自动重新推送）
  useEffect(() => {
    window.api.settingsSync(useSettingsStore.getState().appSettings).catch(() => {})
  }, [])

  const PageComponent = pageComponents[currentPage]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <TitleBar />
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <Sidebar selectedKey={currentPage} onSelect={setPage} />
        <main
          style={{
            flex: 1,
            background: BG_LAYOUT,
            overflow: 'auto',
          }}
        >
          <PageComponent />
        </main>
      </div>
    </div>
  )
}

export default App
