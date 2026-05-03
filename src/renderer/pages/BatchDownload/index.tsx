import React, { useState, useCallback, useRef, useEffect } from 'react'
import {
  Input,
  Button,
  Card,
  Table,
  Tag,
  Space,
  message,
  Popconfirm,
  Progress,
  Empty,
  Upload,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  PlusOutlined,
  DeleteOutlined,
  PlayCircleOutlined,
  ClearOutlined,
  LinkOutlined,
  LoadingOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
  PauseCircleOutlined,
  VideoCameraOutlined,
  DownloadOutlined,
  ThunderboltOutlined,
  UploadOutlined,
} from '@ant-design/icons'
import {
  useDownloadStore,
  detectPlatform,
} from '../../store/downloadStore'
import { friendlyError } from '../../../shared/errorTranslator'
import { buildOutputPath } from '../../utils/buildOutputPath'


// ---- 类型 ----

type ParseStatus = 'waiting' | 'parsing' | 'parsed' | 'parse_failed'
type DownloadStatus = 'idle' | 'queued' | 'downloading' | 'downloaded' | 'download_failed' | 'cancelled'

interface BatchTask {
  id: string
  url: string
  parseStatus: ParseStatus
  downloadStatus: DownloadStatus
  // 解析结果
  title?: string
  thumbnail?: string
  author?: string
  duration?: number
  formatCount?: number
  parseError?: string
  // 下载状态
  downloadTaskId?: string
  progress?: number
  speed?: string
  eta?: string
  filepath?: string
  downloadError?: string
}

// ---- 工具函数 ----

function generateId(): string {
  return `batch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function parseUrls(text: string): string[] {
  const urlRegex = /https?:\/\/[^\s"<>]+/gi
  const matches = text.match(urlRegex) || []

  const validDomains = [
    'youtube.com', 'youtu.be',
    'tiktok.com',
    'bilibili.com', 'b23.tv',
    'douyin.com', 'iesdouyin.com',
    'xiaohongshu.com',
  ]

  const validUrls = matches
    .map((url) => url.replace(/[)\]}'",.:;?!]+$/, '')) // 剔除末尾可能误捕获的中文或英文标点
    .filter((url) => {
      try {
        const parsed = new URL(url)
        return validDomains.some((domain) => parsed.hostname === domain || parsed.hostname.endsWith(`.${domain}`))
      } catch {
        return false
      }
    })

  return Array.from(new Set(validUrls))
}

function formatDuration(seconds?: number): string {
  if (!seconds || seconds <= 0) return '--'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

// ---- 状态标签 ----

const PARSE_STATUS_CFG: Record<ParseStatus, { color: string; icon: React.ReactNode; label: string }> = {
  waiting:      { color: 'default',    icon: <ClockCircleOutlined />,  label: '等待解析' },
  parsing:      { color: 'processing', icon: <LoadingOutlined />,      label: '解析中' },
  parsed:       { color: 'success',    icon: <CheckCircleOutlined />,  label: '解析成功' },
  parse_failed: { color: 'error',      icon: <CloseCircleOutlined />,  label: '解析失败' },
}

const DL_STATUS_CFG: Record<DownloadStatus, { color: string; icon: React.ReactNode; label: string }> = {
  idle:             { color: 'default',    icon: <ClockCircleOutlined />,   label: '--' },
  queued:           { color: 'warning',    icon: <ClockCircleOutlined />,   label: '排队中' },
  downloading:      { color: 'processing', icon: <LoadingOutlined />,       label: '下载中' },
  downloaded:       { color: 'success',    icon: <CheckCircleOutlined />,   label: '下载完成' },
  download_failed:  { color: 'error',      icon: <CloseCircleOutlined />,   label: '下载失败' },
  cancelled:        { color: 'default',    icon: <PauseCircleOutlined />,   label: '已取消' },
}

// ---- 缩略图 ----

const MiniThumbnail: React.FC<{ src?: string }> = ({ src }) => (
  <div
    style={{
      width: 64,
      height: 36,
      borderRadius: 3,
      overflow: 'hidden',
      background: '#f0f0f0',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    }}
  >
    {src ? (
      <img
        src={src}
        alt="thumb"
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
      />
    ) : (
      <VideoCameraOutlined style={{ fontSize: 14, color: '#ccc' }} />
    )}
  </div>
)

// ---- 主组件 ----

const BatchDownload: React.FC = () => {
  const [inputText, setInputText] = useState('')
  const [tasks, setTasks] = useState<BatchTask[]>([])
  const [isParsing, setIsParsing] = useState(false)
  const [isDownloading, setIsDownloading] = useState(false)
  const consumeBatchUrls = useDownloadStore((s) => s.consumeBatchUrls)
  const parseAbortRef = useRef(false)
  const downloadAbortRef = useRef(false)
  const activeDownloadTaskIdRef = useRef<string | null>(null)
  const isStartingRef = useRef(false)
  const tasksRef = useRef<BatchTask[]>(tasks)
  tasksRef.current = tasks  // 始终同步最新值
  const [messageApi, contextHolder] = message.useMessage()

  // 监听跨页面的缓冲排队链接
  useEffect(() => {
    const freshUrls = consumeBatchUrls()
    if (freshUrls.length > 0) {
      const existingUrls = new Set(tasks.map((t) => t.url))
      const newUrls = freshUrls.filter(u => !existingUrls.has(u))
      if (newUrls.length > 0) {
        const newTasks: BatchTask[] = newUrls.map((url) => ({
          id: generateId(),
          url,
          parseStatus: 'waiting' as const,
          downloadStatus: 'idle' as const,
        }))
        setTasks(prev => [...prev, ...newTasks])
      }
    }
  }, [tasks, consumeBatchUrls])

  // ---- 进度监听：批量下载时监听所有进度事件 ----

  useEffect(() => {
    if (!isDownloading) return

    const removeListener = window.api.onDownloadProgress((p) => {
      setTasks((prev) =>
        prev.map((t) => {
          if (t.downloadTaskId !== p.taskId) return t
          // 同步到 downloadStore
          useDownloadStore.getState().updateProgress(
            p.taskId, p.progress, p.speed, p.eta, p.filesize,
          )
          return {
            ...t,
            progress: p.progress,
            speed: p.speed,
            eta: p.eta,
            downloadStatus: 'downloading' as const,
          }
        }),
      )
    })

    return () => removeListener()
  }, [isDownloading])

  // ---- 添加 URL ----

  const handleAddUrls = useCallback(() => {
    const urls = parseUrls(inputText)
    if (urls.length === 0) {
      messageApi.warning('请输入至少一个有效的 URL')
      return
    }

    const existingUrls = new Set(tasks.map((t) => t.url))
    const newUrls = urls.filter((u) => !existingUrls.has(u))
    if (newUrls.length === 0) {
      messageApi.info('所有 URL 已在列表中')
      return
    }

    const newTasks: BatchTask[] = newUrls.map((url) => ({
      id: generateId(),
      url,
      parseStatus: 'waiting' as const,
      downloadStatus: 'idle' as const,
    }))

    setTasks((prev) => [...prev, ...newTasks])
    setInputText('')
    messageApi.success(`已添加 ${newTasks.length} 个链接`)
  }, [inputText, tasks, messageApi])

  // ---- 逐条解析 ----

  const handleStartParse = useCallback(async () => {
    parseAbortRef.current = false
    setIsParsing(true)

    const snapshot = tasks.filter((t) => t.parseStatus === 'waiting')
    if (snapshot.length === 0) {
      messageApi.info('没有等待解析的任务')
      setIsParsing(false)
      return
    }

    messageApi.info(`开始逐条解析 ${snapshot.length} 个链接…`)

    for (const task of snapshot) {
      if (parseAbortRef.current) {
        messageApi.warning('解析已中止')
        break
      }

      setTasks((prev) =>
        prev.map((t) => t.id === task.id ? { ...t, parseStatus: 'parsing' as const } : t),
      )

      const result = await window.api.parseVideo(task.url)

      if (result.status === 'success' && result.data) {
        const info = result.data
        setTasks((prev) =>
          prev.map((t) => {
            if (t.id !== task.id) return t
            return {
              ...t,
              parseStatus: 'parsed' as const,
              title: info.title || '未知标题',
              thumbnail: info.thumbnail || undefined,
              author: info.author || undefined,
              duration: info.duration || undefined,
              formatCount: info.formats?.length || 0,
            }
          }),
        )
      } else if (result.status === 'cancelled') {
        setTasks((prev) =>
          prev.map((t) => t.id === task.id ? { ...t, parseStatus: 'waiting' as const } : t),
        )
        break
      } else {
        setTasks((prev) =>
          prev.map((t) => {
            if (t.id !== task.id) return t
            return {
              ...t,
              parseStatus: 'parse_failed' as const,
              parseError: result.status === 'cookie_error'
                ? (result.errorMessage || 'Cookie读取失败')
                : friendlyError(result.errorMessage || ''),
            }
          }),
        )
      }
    }

    setIsParsing(false)
    if (!parseAbortRef.current) messageApi.success('批量解析完成')
  }, [tasks, messageApi])

  // ---- 并发下载队列 ----

  const handleStartDownload = useCallback(async () => {
    if (isStartingRef.current) return
    isStartingRef.current = true
    downloadAbortRef.current = false
    setIsDownloading(true)

    // 筛出已解析成功且未下载的任务
    const downloadable = tasks.filter(
      (t) => t.parseStatus === 'parsed' && (t.downloadStatus === 'idle' || t.downloadStatus === 'download_failed'),
    )
    if (downloadable.length === 0) {
      messageApi.info('没有可下载的任务')
      setIsDownloading(false)
      return
    }

    // 标记为排队
    setTasks((prev) =>
      prev.map((t) => {
        if (downloadable.some((d) => d.id === t.id)) {
          return { ...t, downloadStatus: 'queued' as const, downloadError: undefined, progress: undefined }
        }
        return t
      }),
    )

    // 获取下载目录
    let downloadsPath = ''
    try {
      downloadsPath = await window.api.getDownloadsPath()
    } catch {
      messageApi.error('获取下载目录失败')
      // 回滚已标记为排队的任务，避免卡在 queued 状态无法重试
      setTasks((prev) =>
        prev.map((t) =>
          downloadable.some((d) => d.id === t.id)
            ? { ...t, downloadStatus: t.downloadError ? 'download_failed' as const : 'idle' as const }
            : t,
        ),
      )
      setIsDownloading(false)
      return
    }

    const queue = downloadable.map((t) => t.id)

    // 在启动 worker 前读取一次设置（决定并发数 + 路径模板）
    const appSettings = useDownloadStore.getState().appSettings

    // Worker: 从队列中取任务并下载
    const worker = async () => {
      while (queue.length > 0) {
        if (downloadAbortRef.current) break

        const taskId = queue.shift()!

        // 获取最新任务信息（通过 ref 避免闭包 stale state）
        const task = tasksRef.current.find((t) => t.id === taskId)
        if (!task) continue

        // 加入时间戳确保每次下载尝试（包括重试）都有唯一 ID，
        // 防止同一批次任务重复下载时 store 里出现两条相同 taskId 的记录
        const downloadTaskId = `dl-${taskId}-${Date.now()}`
        const videoUrl = task.url

        // 标记为下载中
        setTasks((prev) =>
          prev.map((t) =>
            t.id === taskId
              ? { ...t, downloadStatus: 'downloading' as const, downloadTaskId, progress: 0 }
              : t,
          ),
        )

        // 加入 downloadStore
        useDownloadStore.getState().addTask({
          taskId: downloadTaskId,
          url: videoUrl,
          title: task.title || '未知标题',
          thumbnail: task.thumbnail || '',
          platform: detectPlatform(videoUrl),
        })

        const baseDir = appSettings.downloadPath || downloadsPath
        const outputPath = buildOutputPath(
          videoUrl, baseDir,
          appSettings.namingRule || '',
          appSettings.folderOrganize ?? 'none',
        )

        activeDownloadTaskIdRef.current = downloadTaskId
        const subs = appSettings.subtitles
        const effectiveSubtitles = subs?.enabled && subs.languages.length > 0 ? subs : undefined
        const result = await window.api.downloadVideo({
          url: videoUrl,
          formatId: (!appSettings.defaultFormat || appSettings.defaultFormat === 'best') ? '' : appSettings.defaultFormat,
          outputPath,
          taskId: downloadTaskId,
          subtitles: effectiveSubtitles,
        })
        activeDownloadTaskIdRef.current = null

        if (result.status === 'success') {
          setTasks((prev) =>
            prev.map((t) =>
              t.id === taskId
                ? { ...t, downloadStatus: 'downloaded' as const, filepath: result.data, progress: 100 }
                : t,
            ),
          )
          useDownloadStore.getState().completeTask(downloadTaskId, result.data || '')
          if (appSettings.enableNotification) {
            window.api.showNotification('批量下载 - 任务完成', task.title || '某任务下载成功').catch(() => {})
          }
        } else if (result.status === 'cancelled') {
          setTasks((prev) =>
            prev.map((t) =>
              t.id === taskId ? { ...t, downloadStatus: 'cancelled' as const } : t,
            ),
          )
          useDownloadStore.getState().cancelTask(downloadTaskId)
        } else {
          // failed / timeout / cookie_error — cookie_error 保留原始信息不经 friendlyError 翻译
          const displayError = result.status === 'cookie_error'
            ? (result.errorMessage || 'Cookie读取失败')
            : friendlyError(result.errorMessage || '')
          setTasks((prev) =>
            prev.map((t) =>
              t.id === taskId
                ? { ...t, downloadStatus: 'download_failed' as const, downloadError: displayError }
                : t,
            ),
          )
          useDownloadStore.getState().failTask(downloadTaskId, result.errorMessage || '')
        }
      }
    }

    // 启动 N 个 worker 并发执行（并发数从设置读取，上限 5）
    const maxConcurrent = Math.min(
      Math.max(1, appSettings.maxConcurrentDownloads ?? 3),
      5,
      downloadable.length,
    )
    const workers = Array.from({ length: maxConcurrent }, () => worker())
    try {
      await Promise.all(workers)
      if (!downloadAbortRef.current) messageApi.success('批量下载完成')
    } finally {
      setIsDownloading(false)
      isStartingRef.current = false
    }
  }, [tasks, messageApi])

  // ---- 中止 ----

  const handleAbortParse = useCallback(() => { parseAbortRef.current = true }, [])
  const handleAbortDownload = useCallback(() => {
    downloadAbortRef.current = true
    const inflight = activeDownloadTaskIdRef.current
    if (inflight) window.api.cancelDownload(inflight).catch(() => {})
  }, [])

  // ---- 重试 ----

  const handleRetryParseFailed = useCallback(() => {
    setTasks((prev) =>
      prev.map((t) => t.parseStatus === 'parse_failed'
        ? { ...t, parseStatus: 'waiting' as const, parseError: undefined }
        : t),
    )
  }, [])

  const handleRetryDownloadFailed = useCallback(() => {
    setTasks((prev) =>
      prev.map((t) => t.downloadStatus === 'download_failed'
        ? { ...t, downloadStatus: 'idle' as const, downloadError: undefined, progress: undefined }
        : t),
    )
  }, [])

  // ---- 删除 / 清空 ----

  const handleRemoveTask = useCallback((id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const handleClearAll = useCallback(() => { setTasks([]) }, [])

  // ---- 统计 ----

  const stats = {
    total: tasks.length,
    parseWaiting: tasks.filter((t) => t.parseStatus === 'waiting').length,
    parsing: tasks.filter((t) => t.parseStatus === 'parsing').length,
    parsed: tasks.filter((t) => t.parseStatus === 'parsed').length,
    parseFailed: tasks.filter((t) => t.parseStatus === 'parse_failed').length,
    downloadable: tasks.filter((t) => t.parseStatus === 'parsed' && (t.downloadStatus === 'idle' || t.downloadStatus === 'download_failed')).length,
    downloading: tasks.filter((t) => t.downloadStatus === 'downloading').length,
    downloaded: tasks.filter((t) => t.downloadStatus === 'downloaded').length,
    downloadFailed: tasks.filter((t) => t.downloadStatus === 'download_failed').length,
  }

  const isBusy = isParsing || isDownloading

  // ---- 表格列 ----

  const columns: ColumnsType<BatchTask> = [
    {
      title: '#',
      key: 'index',
      width: 40,
      align: 'center',
      render: (_v, _r, index) => <span style={{ color: '#999', fontSize: 12 }}>{index + 1}</span>,
    },
    {
      title: '',
      key: 'thumbnail',
      width: 72,
      render: (_v, record) => <MiniThumbnail src={record.thumbnail} />,
    },
    {
      title: '信息',
      key: 'info',
      ellipsis: true,
      render: (_v, record) => (
        <div style={{ minWidth: 0 }}>
          {record.title ? (
            <>
              <div
                style={{
                  fontWeight: 600, fontSize: 13, color: '#1a1a1a',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}
                title={record.title}
              >
                {record.title}
              </div>
              <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>
                {record.author && <span>{record.author}</span>}
                {record.duration ? <span style={{ marginLeft: 8 }}>{formatDuration(record.duration)}</span> : null}
                {record.formatCount ? <span style={{ marginLeft: 8 }}>{record.formatCount} 格式</span> : null}
              </div>
            </>
          ) : (
            <span style={{ fontSize: 13, color: '#666' }}>
              <LinkOutlined style={{ marginRight: 6, color: '#bbb' }} />
              {record.url}
            </span>
          )}
        </div>
      ),
    },
    {
      title: '解析',
      key: 'parseStatus',
      width: 100,
      align: 'center',
      render: (_v, record) => {
        const cfg = PARSE_STATUS_CFG[record.parseStatus]
        return <Tag color={cfg.color} icon={cfg.icon} style={{ fontSize: 11 }}>{cfg.label}</Tag>
      },
    },
    {
      title: '下载',
      key: 'download',
      width: 180,
      render: (_v, record) => {
        if (record.downloadStatus === 'idle') {
          return <span style={{ color: '#ccc', fontSize: 12 }}>--</span>
        }
        if (record.downloadStatus === 'downloading' && record.progress != null) {
          return (
            <div style={{ minWidth: 120 }}>
              <Progress
                percent={Math.round(record.progress)}
                size="small"
                strokeColor={{ from: '#1677ff', to: '#4096ff' }}
                style={{ marginBottom: 0 }}
              />
              {record.speed && (
                <div style={{ fontSize: 10, color: '#888', marginTop: -2 }}>
                  {record.speed} · {record.eta}
                </div>
              )}
            </div>
          )
        }
        const cfg = DL_STATUS_CFG[record.downloadStatus]
        return <Tag color={cfg.color} icon={cfg.icon} style={{ fontSize: 11 }}>{cfg.label}</Tag>
      },
    },
    {
      title: '错误',
      key: 'error',
      width: 140,
      ellipsis: true,
      render: (_v, record) => {
        const err = record.parseError || record.downloadError
        return err
          ? <span style={{ color: '#ff4d4f', fontSize: 12 }} title={err}>{err}</span>
          : <span style={{ color: '#ccc', fontSize: 12 }}>--</span>
      },
    },
    {
      title: '',
      key: 'action',
      width: 40,
      align: 'center',
      render: (_v, record) => (
        <Button
          type="text"
          danger
          icon={<DeleteOutlined />}
          size="small"
          onClick={() => handleRemoveTask(record.id)}
          disabled={record.parseStatus === 'parsing' || record.downloadStatus === 'downloading'}
        />
      ),
    },
  ]

  return (
    <div style={{ padding: 24 }}>
      {contextHolder}

      {/* 标题 */}
      <h2
        style={{
          fontSize: 26, fontWeight: 700,
          background: 'linear-gradient(90deg, #1677ff, #4096ff)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          marginBottom: 4,
        }}
      >
        批量下载
      </h2>
      <p style={{ color: '#999', marginBottom: 20, fontSize: 13 }}>
        批量粘贴视频链接，一键解析并下载
      </p>

      {/* 输入区域 */}
      <Card style={{ marginBottom: 16, borderRadius: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
          <Upload
            accept=".txt,.csv,.md"
            showUploadList={false}
            beforeUpload={(file) => {
              const reader = new FileReader()
              reader.onload = (e) => {
                const content = e.target?.result as string
                if (content) {
                  let importedUrls = parseUrls(content)
                  if (importedUrls.length === 0) {
                    messageApi.warning('未检测到有效视频链接')
                    return
                  }

                  const originalCount = importedUrls.length
                  if (importedUrls.length > 200) {
                    importedUrls = importedUrls.slice(0, 200)
                    messageApi.warning(`最多只允许单次导入 200 条，已截断剩余内容`)
                  }
                  
                  // 填入输入框，去重追加
                  setInputText(prev => {
                    const prevLines = prev.split('\n').map(l => l.trim()).filter(Boolean)
                    const merged = Array.from(new Set([...prevLines, ...importedUrls]))
                    return merged.join('\n')
                  })
                  
                  // 同步更新页面进度任务列表，过滤已存在的 url
                  setTasks(prev => {
                    const existingUrlSet = new Set(prev.map(t => t.url))
                    const newUrls = importedUrls.filter(u => !existingUrlSet.has(u))
                    
                    setTimeout(() => {
                      messageApi.success(`共识别 ${originalCount} 条链接，去重后新添加 ${newUrls.length} 条`)
                    }, 0)

                    if (newUrls.length > 0) {
                      const newTasks = newUrls.map(url => ({
                        id: generateId(),
                        url,
                        parseStatus: 'waiting' as const,
                        downloadStatus: 'idle' as const,
                      }))
                      return [...prev, ...newTasks]
                    }
                    return prev
                  })
                } else {
                  messageApi.error('文件读取失败')
                }
              }
              reader.onerror = () => messageApi.error('文件读取失败')
              reader.readAsText(file)
              return false // 阻止默认上传行为
            }}
            disabled={isBusy}
          >
            <Button icon={<UploadOutlined />} size="small" disabled={isBusy}>
              导入文件
            </Button>
          </Upload>
        </div>
        <Input.TextArea
          rows={4}
          placeholder={'粘贴视频链接，每行一个 URL，例如：\nhttps://www.youtube.com/watch?v=xxxxx\nhttps://www.bilibili.com/video/BVxxxxx'}
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          disabled={isBusy}
          style={{
            borderRadius: 6, marginBottom: 12,
            fontFamily: 'Consolas, Monaco, monospace', fontSize: 13, lineHeight: '1.6',
          }}
        />
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <Button icon={<ClearOutlined />} onClick={() => setInputText('')} disabled={isBusy} style={{ borderRadius: 6 }}>
            清空输入
          </Button>
          <Button icon={<PlusOutlined />} onClick={handleAddUrls} disabled={isBusy} style={{ borderRadius: 6 }}>
            添加到列表
          </Button>

          {/* 解析按钮 */}
          {isParsing ? (
            <Button danger icon={<PauseCircleOutlined />} onClick={handleAbortParse} style={{ borderRadius: 6 }}>
              中止解析
            </Button>
          ) : (
            <Button
              icon={<PlayCircleOutlined />}
              onClick={handleStartParse}
              disabled={stats.parseWaiting === 0 || isDownloading}
              style={{ borderRadius: 6 }}
            >
              开始解析 {stats.parseWaiting > 0 ? `(${stats.parseWaiting})` : ''}
            </Button>
          )}

          {/* 下载按钮 */}
          {isDownloading ? (
            <Button danger icon={<PauseCircleOutlined />} onClick={handleAbortDownload} style={{ borderRadius: 6 }}>
              中止下载
            </Button>
          ) : (
            <Button
              type="primary"
              icon={<DownloadOutlined />}
              onClick={handleStartDownload}
              disabled={stats.downloadable === 0 || isParsing}
              style={{ borderRadius: 6 }}
            >
              开始下载 {stats.downloadable > 0 ? `(${stats.downloadable})` : ''}
            </Button>
          )}
        </div>
      </Card>

      {/* 统计 + 操作栏 */}
      {tasks.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, padding: '8px 0', flexWrap: 'wrap' }}>
          <Space size={8} wrap>
            <span style={{ fontSize: 13, color: '#666' }}>共 <b>{stats.total}</b> 条</span>
            {stats.parseWaiting > 0 && <Tag>{stats.parseWaiting} 待解析</Tag>}
            {stats.parsing > 0 && <Tag color="processing">{stats.parsing} 解析中</Tag>}
            {stats.parsed > 0 && <Tag color="cyan">{stats.parsed} 已解析</Tag>}
            {stats.parseFailed > 0 && <Tag color="orange">{stats.parseFailed} 解析失败</Tag>}
            {stats.downloading > 0 && <Tag color="processing" icon={<ThunderboltOutlined />}>{stats.downloading} 下载中</Tag>}
            {stats.downloaded > 0 && <Tag color="success">{stats.downloaded} 已下载</Tag>}
            {stats.downloadFailed > 0 && <Tag color="error">{stats.downloadFailed} 下载失败</Tag>}
          </Space>

          <div style={{ flex: 1 }} />

          <Space size={8}>
            {stats.parseFailed > 0 && !isBusy && (
              <Button size="small" onClick={handleRetryParseFailed}>重试解析失败</Button>
            )}
            {stats.downloadFailed > 0 && !isBusy && (
              <Button size="small" onClick={handleRetryDownloadFailed}>重试下载失败</Button>
            )}
            <Popconfirm
              title="确定清空所有任务？"
              onConfirm={handleClearAll}
              okText="清空"
              cancelText="取消"
              okButtonProps={{ danger: true }}
            >
              <Button size="small" danger icon={<ClearOutlined />} disabled={isBusy}>
                清空列表
              </Button>
            </Popconfirm>
          </Space>
        </div>
      )}

      {/* 任务表格或空状态 */}
      {tasks.length > 0 ? (
        <Card style={{ borderRadius: 8 }} styles={{ body: { padding: 0 } }}>
          <Table
            dataSource={tasks}
            columns={columns}
            rowKey="id"
            size="small"
            pagination={tasks.length > 50 ? { pageSize: 50 } : false}
            rowClassName={(record) => {
              if (record.downloadStatus === 'downloaded') return 'batch-row-success'
              if (record.downloadStatus === 'download_failed') return 'batch-row-failed'
              if (record.downloadStatus === 'downloading') return 'batch-row-downloading'
              if (record.parseStatus === 'parse_failed') return 'batch-row-parse-failed'
              return ''
            }}
          />
        </Card>
      ) : (
        <Card style={{ borderRadius: 8 }}>
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              <span style={{ color: '#999' }}>
                暂无任务，请在上方输入链接并点击“添加到列表”
              </span>
            }
          />
        </Card>
      )}

      <style>{`
        .batch-row-success td { background: #f6ffed !important; }
        .batch-row-failed td { background: #fff2f0 !important; }
        .batch-row-downloading td { background: #e6f4ff !important; }
        .batch-row-parse-failed td { background: #fffbe6 !important; }
      `}</style>
    </div>
  )
}

export default BatchDownload
