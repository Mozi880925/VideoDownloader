import React, { useState, useCallback } from 'react'
import {
  Button, Input, Table, Tag, Tooltip, Empty, message, Segmented, Progress,
} from 'antd'
import {
  AudioOutlined,
  DeleteOutlined,
  FileTextOutlined,
  FileOutlined,
  PlusOutlined,
  ClearOutlined,
  CloseOutlined,
  ThunderboltOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import { useSettingsStore } from '../../store/settingsStore'
import {
  useTranscribeStore,
  runTranscribeQueue,
  type TranscribeTask,
} from '../../store/transcribeStore'
import { genTaskId } from '../../utils/id'
import { formatDuration } from '../../utils/format'

// ────────── 类型 ──────────
// 任务类型与执行循环在 store/transcribeStore.ts（模块级，切页不中断转录）

/** 从 whisper 输出行提取时间戳片段，如 "[00:12:34.000 --> 00:12:38.400] 文字" → "00:12:34" */
function extractWhisperTimestamp(line: string): string | null {
  const m = line.match(/(\d{2}:\d{2}:\d{2})\.\d{3}\s*-->/)
  return m ? m[1] : null
}

function shortPath(p: string): string {
  if (!p) return '-'
  const parts = p.replace(/\\/g, '/').split('/')
  return parts[parts.length - 1]
}

// ────────── 状态标签 ──────────

const StatusTag: React.FC<{ task: TranscribeTask }> = ({ task }) => {
  if (task.status === 'pending') return <Tag>等待中</Tag>
  if (task.status === 'processing') {
    const ts = task.lastLine ? extractWhisperTimestamp(task.lastLine) : null
    return (
      <div style={{ minWidth: 160 }}>
        <div style={{ fontSize: 12, color: '#1677ff', marginBottom: 2 }}>
          {task.stage === 'downloading'
            ? `下载音频中...${task.speed ? `  ${task.speed}` : ''}`
            : `转录中...${ts ? `  已处理到 ${ts}` : ''}`}
        </div>
        <Progress percent={Math.round(task.progress)} size="small" strokeColor="#1677ff" />
      </div>
    )
  }
  if (task.status === 'completed') return <Tag color="success">已完成</Tag>
  if (task.status === 'failed') return (
    <Tooltip title={task.errorMessage}>
      <Tag color="error">失败</Tag>
    </Tooltip>
  )
  return null
}

// ────────── 主组件 ──────────

type TabMode = 'url' | 'file'
type FilterStatus = 'all' | 'processing' | 'completed' | 'failed'

const Transcription: React.FC = () => {
  const appSettings = useSettingsStore(s => s.appSettings)

  const [tab, setTab] = useState<TabMode>('url')
  const [urlText, setUrlText] = useState('')
  const [filter, setFilter] = useState<FilterStatus>('all')

  // 任务队列在模块级 store（切页/切 Tab 不中断转录，localStorage 持久化在 store 内）
  const tasks = useTranscribeStore(s => s.tasks)
  const addTasks = useTranscribeStore(s => s.addTasks)
  const removeTask = useTranscribeStore(s => s.removeTask)
  const clearAllTasks = useTranscribeStore(s => s.clearAll)
  const retryTask = useTranscribeStore(s => s.retryTask)

  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([])

  // ── 文件选择 / 拖拽 ──
  const [pendingFiles, setPendingFiles] = useState<string[]>([])
  const [dragOver, setDragOver] = useState(false)

  const SUPPORTED_EXT = ['mp4', 'mkv', 'mov', 'avi', 'webm', 'flv', 'mp3', 'm4a', 'wav', 'aac', 'ogg', 'opus']

  const isSupportedFile = (path: string): boolean => {
    const ext = path.toLowerCase().split('.').pop() || ''
    return SUPPORTED_EXT.includes(ext)
  }

  const addPendingFile = (path: string) => {
    if (!isSupportedFile(path)) {
      message.warning(`不支持的文件格式：${shortPath(path)}`)
      return
    }
    setPendingFiles(prev => prev.includes(path) ? prev : [...prev, path])
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
    const files = Array.from(e.dataTransfer.files)
    if (!files.length) return
    for (const f of files) {
      try {
        const path = window.api.getPathForFile(f)
        if (path) addPendingFile(path)
      } catch (err) {
        console.error('[transcription] getPathForFile failed:', err)
      }
    }
  }

  const removePendingFile = (path: string) => {
    setPendingFiles(prev => prev.filter(p => p !== path))
  }

  // ── 添加任务 ──

  const handleAddUrl = () => {
    const lines = urlText.trim().split('\n').map(l => l.trim()).filter(Boolean)
    if (!lines.length) { message.warning('请输入至少一个 URL'); return }
    const newTasks: TranscribeTask[] = lines.map(url => ({
      id: genTaskId(),
      title: url.length > 60 ? url.slice(0, 60) + '…' : url,
      sourceType: 'url',
      sourcePath: url,
      addedAt: Date.now(),
      status: 'pending',
      progress: 0,
    }))
    addTasks(newTasks)
    setUrlText('')
    message.success(`已添加 ${newTasks.length} 个任务`)
  }

  const handleSelectFiles = async () => {
    const filePath = await window.api.selectFile([
      { name: '视频/音频文件', extensions: SUPPORTED_EXT },
      { name: '所有文件', extensions: ['*'] },
    ])
    if (filePath) addPendingFile(filePath)
  }

  // 把待提交的文件加入任务队列
  const handleSubmitFiles = () => {
    if (!pendingFiles.length) { message.warning('请先选择或拖入文件'); return }
    const newTasks: TranscribeTask[] = pendingFiles.map(filePath => ({
      id: genTaskId(),
      title: shortPath(filePath),
      sourceType: 'file',
      sourcePath: filePath,
      addedAt: Date.now(),
      status: 'pending',
      progress: 0,
    }))
    addTasks(newTasks)
    setPendingFiles([])
    message.success(`已添加 ${newTasks.length} 个任务到队列`)
  }

  // ── 开始转录 ──

  const handleStart = useCallback(() => {
    // 自动把待提交的文件 / URL 转换为任务（省掉手动「添加到队列」步骤）
    const autoFromFiles: TranscribeTask[] = pendingFiles.map(filePath => ({
      id: genTaskId(),
      title: shortPath(filePath),
      sourceType: 'file',
      sourcePath: filePath,
      addedAt: Date.now(),
      status: 'pending',
      progress: 0,
    }))
    let autoFromUrls: TranscribeTask[] = []
    if (tab === 'url' && urlText.trim()) {
      const lines = urlText.trim().split('\n').map(l => l.trim()).filter(Boolean)
      autoFromUrls = lines.map(url => ({
        id: genTaskId(),
        title: url.length > 60 ? url.slice(0, 60) + '…' : url,
        sourceType: 'url',
        sourcePath: url,
        addedAt: Date.now(),
        status: 'pending',
        progress: 0,
      }))
    }
    if (autoFromFiles.length || autoFromUrls.length) {
      addTasks([...autoFromFiles, ...autoFromUrls])
      setPendingFiles([])
      setUrlText('')
    }

    // 执行循环在模块级（store/transcribeStore.ts）：切页/切 Tab 不中断
    const r = runTranscribeQueue()
    if (!r.started) {
      message.warning(r.reason)
    } else {
      message.success('已开始转录（切换页面不会中断）')
    }
  }, [pendingFiles, urlText, tab, addTasks])

  // ── 操作 ──

  const handleRemove = (id: string) => {
    removeTask(id)
    setSelectedRowKeys(prev => prev.filter(k => k !== id))
  }

  const handleClear = () => {
    clearAllTasks()
    setSelectedRowKeys([])
    setUrlText('')
  }

  // 失败任务一键重试：来源（URL/文件路径）还在任务里，无需重新输入
  const handleRetry = (id: string) => {
    retryTask(id)
    const r = runTranscribeQueue()
    if (!r.started) message.warning(r.reason)
  }

  const handleOpenOutput = async (path?: string) => {
    if (!path) return
    await window.api.showItemInFolder(path)
  }

  // ── 过滤 ──

  const filteredTasks = tasks.filter(t => {
    if (filter === 'all') return true
    if (filter === 'processing') return t.status === 'pending' || t.status === 'processing'
    return t.status === filter
  })

  const filterCounts = {
    all: tasks.length,
    processing: tasks.filter(t => t.status === 'pending' || t.status === 'processing').length,
    completed: tasks.filter(t => t.status === 'completed').length,
    failed: tasks.filter(t => t.status === 'failed').length,
  }

  // ── 表格列 ──

  const columns = [
    {
      title: '标题',
      dataIndex: 'title',
      ellipsis: true,
      render: (title: string, task: TranscribeTask) => (
        <div>
          <div style={{ fontWeight: 500, fontSize: 13 }}>{title}</div>
          <div style={{ fontSize: 11, color: '#bbb', marginTop: 2 }}>
            {task.sourceType === 'url' ? '🔗 URL' : '📁 本地文件'}
          </div>
        </div>
      ),
    },
    {
      title: '添加时间',
      dataIndex: 'addedAt',
      width: 150,
      render: (ts: number) => new Date(ts).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }),
    },
    {
      title: '时长',
      dataIndex: 'duration',
      width: 80,
      render: (d?: number) => formatDuration(d),
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 160,
      render: (_: unknown, task: TranscribeTask) => <StatusTag task={task} />,
    },
    {
      title: '操作',
      width: 170,
      render: (_: unknown, task: TranscribeTask) => (
        <div style={{ display: 'flex', gap: 6 }}>
          {task.status === 'failed' && (
            <Tooltip title="重新转录（保留原链接/文件，已下载的音频会秒过）">
              <Button size="small" icon={<ReloadOutlined />} onClick={() => handleRetry(task.id)}>重试</Button>
            </Tooltip>
          )}
          {task.status === 'completed' && task.outputPath && (
            <>
              <Tooltip title="打开字幕文件">
                <Button size="small" icon={<FileTextOutlined />} onClick={() => handleOpenOutput(task.outputPath)}>字幕</Button>
              </Tooltip>
              <Tooltip title="用 AI 整理成分享式提纯版原文，完成后在「提纯稿库」查看">
                <Button
                  size="small"
                  type="primary"
                  icon={<ThunderboltOutlined />}
                  onClick={async () => {
                    const r = await window.api.distillStart({
                      sourceType: 'whisper-srt',
                      srtPath: task.outputPath!,
                      title: task.title,
                    })
                    if (r.status === 'success') {
                      message.success('已开始 AI 提纯，可到「提纯稿库」查看进度', 5)
                    } else {
                      message.error(r.errorMessage || '提纯启动失败')
                    }
                  }}
                >
                  提纯
                </Button>
              </Tooltip>
            </>
          )}
          <Tooltip title="删除">
            <Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleRemove(task.id)} />
          </Tooltip>
        </div>
      ),
    },
  ]

  const hasPending = tasks.some(t => t.status === 'pending')
  const canTranscribe = hasPending || pendingFiles.length > 0 || (tab === 'url' && urlText.trim().length > 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* ── 输入区 ── */}
      <div style={{ background: '#fff', borderRadius: 12, padding: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', marginBottom: 16 }}>
        {/* Tab 切换 */}
        <div style={{ display: 'flex', borderBottom: '1px solid #f0f0f0', marginBottom: 16 }}>
          {(['url', 'file'] as TabMode[]).map(t => (
            <div
              key={t}
              onClick={() => setTab(t)}
              style={{
                flex: 1,
                textAlign: 'center',
                padding: '10px 0',
                cursor: 'pointer',
                fontWeight: 500,
                fontSize: 14,
                borderBottom: tab === t ? '2px solid #7c3aed' : '2px solid transparent',
                color: tab === t ? '#7c3aed' : '#666',
                background: tab === t ? '#faf5ff' : 'transparent',
                borderRadius: tab === t ? '8px 8px 0 0' : undefined,
                transition: 'all 0.2s',
                userSelect: 'none',
              }}
            >
              {t === 'url' ? 'URL 输入' : '文件选择'}
            </div>
          ))}
        </div>

        {tab === 'url' ? (
          <Input.TextArea
            value={urlText}
            onChange={e => setUrlText(e.target.value)}
            placeholder="请输入视频/音频 URL，每行一个"
            autoSize={{ minRows: 4, maxRows: 8 }}
            style={{ marginBottom: 12 }}
          />
        ) : (
          <>
            <div
              onClick={handleSelectFiles}
              onDragOver={handleDragOver}
              onDragEnter={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              style={{
                border: `2px dashed ${dragOver ? '#7c3aed' : '#d9d9d9'}`,
                borderRadius: 10,
                padding: '40px 20px',
                textAlign: 'center',
                marginBottom: 12,
                cursor: 'pointer',
                color: dragOver ? '#7c3aed' : '#888',
                background: dragOver ? '#faf5ff' : '#fafafa',
                transition: 'all 0.2s',
                userSelect: 'none',
              }}
            >
              <FileOutlined style={{ fontSize: 40, marginBottom: 12, display: 'block', margin: '0 auto 12px', color: dragOver ? '#7c3aed' : '#bbb' }} />
              <div style={{ fontWeight: 500, fontSize: 14, marginBottom: 4 }}>
                {dragOver ? '松开以添加文件' : '拖拽音视频文件到此处，或点击选择'}
              </div>
              <div style={{ fontSize: 12, color: '#aaa' }}>
                支持 MP4, MKV, MP3, WAV, M4A 等格式
              </div>
            </div>

            {/* 已选文件列表 */}
            {pendingFiles.length > 0 && (
              <div style={{
                background: '#faf5ff',
                border: '1px solid #e9d5ff',
                borderRadius: 8,
                padding: '8px 12px',
                marginBottom: 12,
                maxHeight: 160,
                overflowY: 'auto',
              }}>
                <div style={{ fontSize: 12, color: '#7c3aed', fontWeight: 500, marginBottom: 6 }}>
                  已选 {pendingFiles.length} 个文件：
                </div>
                {pendingFiles.map(p => (
                  <div key={p} style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '4px 0',
                    fontSize: 12,
                  }}>
                    <span style={{ color: '#555', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      📁 {shortPath(p)}
                    </span>
                    <Button
                      type="text"
                      size="small"
                      icon={<CloseOutlined />}
                      onClick={(e) => { e.stopPropagation(); removePendingFile(p) }}
                      style={{ color: '#999', padding: 2 }}
                    />
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* Whisper 未配置提示 */}
        {!appSettings.whisper?.executablePath && (
          <div style={{ color: '#cf1322', fontSize: 12, marginBottom: 8 }}>
            ⚠️ 未配置 Whisper 可执行文件，请先到「设置 → 字幕设置」完成配置
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button icon={<ClearOutlined />} onClick={handleClear}>清空</Button>
          {tab === 'url' && (
            <Button icon={<PlusOutlined />} onClick={handleAddUrl}>添加到队列</Button>
          )}
          {tab === 'file' && pendingFiles.length > 0 && (
            <Button icon={<PlusOutlined />} onClick={handleSubmitFiles}>添加到队列</Button>
          )}
          <Button
            type="primary"
            icon={<AudioOutlined />}
            disabled={!canTranscribe}
            onClick={handleStart}
            style={{ background: '#7c3aed', borderColor: '#7c3aed' }}
          >
            转录
          </Button>
        </div>
      </div>

      {/* ── 任务列表 ── */}
      <div style={{ background: '#fff', borderRadius: 12, padding: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', flex: 1 }}>
        {/* 状态筛选 */}
        <div style={{ marginBottom: 16 }}>
          <Segmented
            value={filter}
            onChange={v => setFilter(v as FilterStatus)}
            options={[
              { label: `全部 ${filterCounts.all}`, value: 'all' },
              { label: `进行中 ${filterCounts.processing}`, value: 'processing' },
              { label: `已完成 ${filterCounts.completed}`, value: 'completed' },
              { label: `失败 ${filterCounts.failed}`, value: 'failed' },
            ]}
            style={{ '--ant-segmented-item-selected-bg': '#7c3aed', '--ant-segmented-item-selected-color': '#fff' } as React.CSSProperties}
          />
        </div>

        <Table
          dataSource={filteredTasks}
          columns={columns}
          rowKey="id"
          rowSelection={{
            selectedRowKeys,
            onChange: setSelectedRowKeys,
          }}
          pagination={false}
          size="middle"
          locale={{
            emptyText: (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={
                  <span style={{ color: '#bbb' }}>
                    暂无数据<br />
                    <span style={{ fontSize: 12 }}>当前没有转录任务，快去添加一些视频或音频链接开始转录吧！</span>
                  </span>
                }
              />
            ),
          }}
        />
      </div>
    </div>
  )
}

export default Transcription
