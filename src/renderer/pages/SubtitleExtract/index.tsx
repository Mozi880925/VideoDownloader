import React, { useState, useRef, useEffect } from 'react'
import { Button, Input, Table, Tag, Tooltip, Empty, message, Segmented } from 'antd'
import {
  DeleteOutlined,
  ClearOutlined,
  DownloadOutlined,
  FolderOpenOutlined,
} from '@ant-design/icons'
import { detectPlatform } from '../../utils/platform'
import { useSettingsStore } from '../../store/settingsStore'
import { formatDuration } from '../../utils/format'

// ────────── 类型 ──────────

// 注意：ExtractStatus 与 shared/types.ts 的 TaskStatus 语义不同，特意区分命名
type ExtractStatus = 'pending' | 'processing' | 'completed' | 'failed'

interface ExtractTask {
  id: string
  url: string
  title: string
  duration?: number
  addedAt: number
  status: ExtractStatus
  srtPaths?: string[]
  errorMessage?: string
}

// ────────── 状态标签 ──────────

const StatusTag: React.FC<{ task: ExtractTask }> = ({ task }) => {
  if (task.status === 'pending') return <Tag>等待中</Tag>
  if (task.status === 'processing') return <Tag color="processing">提取中...</Tag>
  if (task.status === 'completed') return <Tag color="success">已完成（{task.srtPaths?.length || 0} 个字幕）</Tag>
  if (task.status === 'failed') return (
    <Tooltip title={task.errorMessage}>
      <Tag color="error">失败</Tag>
    </Tooltip>
  )
  return null
}

// ────────── 主组件 ──────────

type FilterStatus = 'all' | 'processing' | 'completed' | 'failed'

const SubtitleExtract: React.FC = () => {
  const appSettings = useSettingsStore(s => s.appSettings)
  const [urlText, setUrlText] = useState('')
  const [filter, setFilter] = useState<FilterStatus>('all')
  // 任务列表持久化
  const STORAGE_KEY = 'vd_subtitle_extract_tasks'
  const [tasks, setTasks] = useState<ExtractTask[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return []
      const parsed = JSON.parse(raw) as ExtractTask[]
      return parsed.map(t => t.status === 'processing'
        ? { ...t, status: 'failed' as ExtractStatus, errorMessage: '页面切换导致中断，请重新提取' }
        : t)
    } catch { return [] }
  })
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks)) } catch {}
  }, [tasks])

  const processingRef = useRef(false)

  // ── 今日提取计数（持久化在 localStorage） ──
  const [todayCount, setTodayCount] = useState(0)
  const [totalCount, setTotalCount] = useState(0)

  useEffect(() => {
    try {
      const today = new Date().toISOString().slice(0, 10)
      const raw = localStorage.getItem('vd_subtitle_extract_stats')
      if (raw) {
        const stats = JSON.parse(raw) as { date: string; today: number; total: number }
        if (stats.date === today) {
          setTodayCount(stats.today)
          setTotalCount(stats.total)
        } else {
          // 跨天，今日清零保留累计
          setTodayCount(0)
          setTotalCount(stats.total ?? 0)
        }
      }
    } catch {}
  }, [])

  const incrementCount = (n: number) => {
    setTodayCount(prev => {
      setTotalCount(t => {
        const today = new Date().toISOString().slice(0, 10)
        const newTotal = t + n
        const newToday = prev + n
        try {
          localStorage.setItem('vd_subtitle_extract_stats', JSON.stringify({
            date: today, today: newToday, total: newTotal,
          }))
        } catch {}
        return newTotal
      })
      return prev + n
    })
  }

  // ── 添加 + 立即开始提取 ──

  const handleExtract = async () => {
    const lines = urlText.trim().split('\n').map(l => l.trim()).filter(Boolean)
    if (!lines.length) { message.warning('请输入至少一个 URL'); return }
    if (processingRef.current) { message.info('正在提取中，请稍候'); return }

    const newTasks: ExtractTask[] = lines.map(url => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      url,
      title: url.length > 60 ? url.slice(0, 60) + '…' : url,
      addedAt: Date.now(),
      status: 'pending',
    }))
    setTasks(prev => [...prev, ...newTasks])
    setUrlText('')

    // 输出目录：用户设置的下载目录下的 subtitles 子目录（路径拼接交由主进程处理）
    const downloadPath = appSettings.downloadPath || await window.api.getDownloadsPath()
    const sep = downloadPath.includes('/') ? '/' : '\\'
    const outputDir = `${downloadPath}${sep}subtitles`

    processingRef.current = true
    for (const task of newTasks) {
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: 'processing' } : t))
      try {
        const result = await window.api.extractSubtitles(task.url, outputDir)
        if (result.status === 'success') {
          setTasks(prev => prev.map(t => t.id === task.id
            ? { ...t, status: 'completed', title: result.title || t.title, duration: result.duration, srtPaths: result.srtPaths }
            : t
          ))
          incrementCount(result.srtPaths?.length ?? 1)
        } else {
          setTasks(prev => prev.map(t => t.id === task.id
            ? { ...t, status: 'failed', title: result.title || t.title, errorMessage: result.errorMessage || '提取失败' }
            : t
          ))
        }
      } catch (err: unknown) {
        setTasks(prev => prev.map(t => t.id === task.id
          ? { ...t, status: 'failed', errorMessage: String(err) }
          : t
        ))
      }
    }
    processingRef.current = false
    message.success('字幕提取任务已完成')
  }

  // ── 操作 ──

  const handleClear = () => { setUrlText('') }

  const handleRemove = (id: string) => {
    setTasks(prev => prev.filter(t => t.id !== id))
  }

  const handleOpenSrt = async (path?: string) => {
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
      render: (title: string, task: ExtractTask) => (
        <div>
          <div style={{ fontWeight: 500, fontSize: 13 }}>{title}</div>
          <div style={{ fontSize: 11, color: '#bbb', marginTop: 2 }}>
            <Tag color="purple" style={{ fontSize: 10, padding: '0 4px', lineHeight: '14px', marginRight: 4 }}>
              {detectPlatform(task.url)}
            </Tag>
            {task.url.length > 80 ? task.url.slice(0, 80) + '…' : task.url}
          </div>
        </div>
      ),
    },
    {
      title: '添加时间',
      dataIndex: 'addedAt',
      width: 130,
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
      width: 180,
      render: (_: unknown, task: ExtractTask) => <StatusTag task={task} />,
    },
    {
      title: '操作',
      width: 130,
      render: (_: unknown, task: ExtractTask) => (
        <div style={{ display: 'flex', gap: 6 }}>
          {task.status === 'completed' && task.srtPaths && task.srtPaths.length > 0 && (
            <Tooltip title="打开字幕所在文件夹">
              <Button size="small" icon={<FolderOpenOutlined />} onClick={() => handleOpenSrt(task.srtPaths![0])}>
                查看
              </Button>
            </Tooltip>
          )}
          <Tooltip title="删除">
            <Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleRemove(task.id)} />
          </Tooltip>
        </div>
      ),
    },
  ]

  const canExtract = urlText.trim().length > 0 && !processingRef.current

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* ── 输入区 ── */}
      <div style={{ background: '#fff', borderRadius: 12, padding: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', marginBottom: 16 }}>
        <Input.TextArea
          value={urlText}
          onChange={e => setUrlText(e.target.value)}
          placeholder="请输入视频/音频 URL，每行一个"
          autoSize={{ minRows: 5, maxRows: 10 }}
          style={{ marginBottom: 12 }}
        />

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ color: '#888', fontSize: 13 }}>
            支持 YouTube、BiliBili、TikTok 等 yt-dlp 兼容平台 ·
            <span style={{ color: '#7c3aed', fontWeight: 500, marginLeft: 6 }}>
              今日已提取 {todayCount} 个
            </span>
            {totalCount > todayCount && (
              <span style={{ color: '#bbb', marginLeft: 6 }}>累计 {totalCount}</span>
            )}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button icon={<ClearOutlined />} onClick={handleClear}>清空</Button>
            <Button
              type="primary"
              icon={<DownloadOutlined />}
              disabled={!canExtract}
              onClick={handleExtract}
              loading={processingRef.current}
              style={{ background: '#7c3aed', borderColor: '#7c3aed' }}
            >
              提取
            </Button>
          </div>
        </div>
      </div>

      {/* ── 任务列表 ── */}
      <div style={{ background: '#fff', borderRadius: 12, padding: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', flex: 1 }}>
        <div style={{ marginBottom: 16 }}>
          <Segmented
            value={filter}
            onChange={v => setFilter(v as FilterStatus)}
            options={[
              { label: `全部 ${filterCounts.all}`, value: 'all' },
              { label: `提取中 ${filterCounts.processing}`, value: 'processing' },
              { label: `已完成 ${filterCounts.completed}`, value: 'completed' },
              { label: `失败 ${filterCounts.failed}`, value: 'failed' },
            ]}
          />
        </div>

        <Table
          dataSource={filteredTasks}
          columns={columns}
          rowKey="id"
          pagination={false}
          size="middle"
          locale={{
            emptyText: (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={
                  <span style={{ color: '#bbb' }}>
                    暂无数据<br />
                    <span style={{ fontSize: 12 }}>当前没有提取任务，快去添加一些视频或音频链接开始提取吧！</span>
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

export default SubtitleExtract
