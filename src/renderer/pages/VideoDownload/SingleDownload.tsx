import React, { useState, useEffect, useRef } from 'react'
import {
  Input,
  Button,
  Card,
  Select,
  Progress,
  message,
  Row,
  Col,
  Tag,
  Space,
  Avatar,
  Skeleton,
} from 'antd'
import {
  SearchOutlined,
  DownloadOutlined,
  UserOutlined,
  ClockCircleOutlined,
  VideoCameraOutlined,
  FolderOpenOutlined,
  ReloadOutlined,
  PlusOutlined,
} from '@ant-design/icons'
import { useDownloadStore, detectPlatform } from '../../store/downloadStore'
import { friendlyError } from '../../../shared/errorTranslator'

// ---- 工具函数 ----

function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return '--'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

function formatFilesize(bytes: number | null): string {
  if (!bytes) return ''
  if (bytes >= 1024 * 1024 * 1024) return `~${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`
  if (bytes >= 1024 * 1024) return `~${(bytes / 1024 / 1024).toFixed(0)} MB`
  return `~${(bytes / 1024).toFixed(0)} KB`
}

function buildFormatLabel(f: VideoFormat): string {
  const parts: string[] = []
  const res = f.resolution && f.resolution !== 'none' ? f.resolution : f.note
  if (res) parts.push(res)
  if (f.ext) parts.push(f.ext.toUpperCase())
  if (f.filesize) parts.push(formatFilesize(f.filesize))
  if (f.acodec === 'none') parts.push('(仅视频流)')
  return parts.join('  ')
}

function generateTaskId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

// ---- 热门网站数据 ----

const HOT_SITES = [
  { name: 'YouTube', abbr: 'YT', color: '#FF0000', bg: '#fff0f0' },
  { name: 'TikTok', abbr: 'TT', color: '#010101', bg: '#f5f5f5' },
  { name: 'Bilibili', abbr: 'B', color: '#00AEEC', bg: '#e6f7ff' },
  { name: 'Instagram', abbr: 'IG', color: '#C13584', bg: '#fff0f6' },
  { name: '抖音', abbr: '抖', color: '#FE2C55', bg: '#fff0f3' },
  { name: '小红书', abbr: '红', color: '#FF2442', bg: '#fff1f0' },
  { name: 'Twitter/X', abbr: 'X', color: '#000000', bg: '#f5f5f5' },
  { name: 'Facebook', abbr: 'FB', color: '#1877F2', bg: '#f0f5ff' },
]

// ---- 主组件 ----

const SingleDownload: React.FC = () => {
  const [url, setUrl] = useState('')
  const [parsing, setParsing] = useState(false)
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null)
  const [selectedFormatId, setSelectedFormatId] = useState<string | undefined>(undefined)
  const [downloading, setDownloading] = useState(false)
  const [progress, setProgress] = useState<DownloadProgress | null>(null)
  const [downloadDone, setDownloadDone] = useState(false)
  const [finalFilepath, setFinalFilepath] = useState<string | undefined>(undefined)
  const [downloadsPath, setDownloadsPath] = useState('')
  const [statusText, setStatusText] = useState('')
  const [isInstantSkip, setIsInstantSkip] = useState(false)
  const currentTaskId = useRef<string>('')
  const [messageApi, contextHolder] = message.useMessage()

  // 启动时获取系统下载目录
  useEffect(() => {
    window.api.getDownloadsPath().then(setDownloadsPath).catch(() => setDownloadsPath(''))
  }, [])

  // ---- 重置页面状态 ----
  const resetPage = () => {
    setUrl('')
    setVideoInfo(null)
    setSelectedFormatId(undefined)
    setProgress(null)
    setDownloadDone(false)
    setFinalFilepath(undefined)
    setStatusText('')
    setIsInstantSkip(false)
  }

  // ---- 监听"重新下载"请求 ----
  const retryUrl = useDownloadStore((s) => s.retryUrl)
  const clearRetryUrl = useDownloadStore((s) => s.clearRetryUrl)
  const appSettings = useDownloadStore((s) => s.appSettings)

  // ---- 核心解析逻辑 ----
  const doParse = async (targetUrl: string) => {
    const trimmed = targetUrl.trim()
    if (!trimmed) {
      messageApi.warning('请输入视频链接')
      return
    }
    setParsing(true)
    setVideoInfo(null)
    setSelectedFormatId(undefined)
    setProgress(null)
    setDownloadDone(false)
    setFinalFilepath(undefined)
    try {
      const result = await window.api.parseVideo(trimmed)
      if (result.status === 'success' && result.data) {
        setVideoInfo(result.data)
        const fmt = appSettings.defaultFormat
        setSelectedFormatId(!fmt || fmt === 'best' ? '__best__' : fmt)
      } else if (result.status === 'cookie_error') {
        messageApi.error(result.errorMessage || 'Cookie读取失败，请确认 Chrome 已安装且未锁定')
      } else if (result.status !== 'cancelled') {
        messageApi.error(`解析失败：${friendlyError(result.errorMessage || '')}`)
      }
    } finally {
      setParsing(false)
    }
  }

  const handleParse = () => doParse(url)

  useEffect(() => {
    if (retryUrl) {
      // 重置页面旧状态 → 填入 URL
      setVideoInfo(null)
      setSelectedFormatId(undefined)
      setProgress(null)
      setDownloadDone(false)
      setFinalFilepath(undefined)
      setStatusText('')
      setUrl(retryUrl)
      clearRetryUrl()
      
      // 填入后自动触发一次解析
      doParse(retryUrl)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retryUrl, clearRetryUrl])

  // ---- 下载 ----
  const handleDownload = async () => {
    if (!videoInfo) return
    const taskId = generateTaskId()
    currentTaskId.current = taskId
    setDownloading(true)
    setProgress(null)
    setDownloadDone(false)
    setIsInstantSkip(false)
    setFinalFilepath(undefined)
    setStatusText('正在连接服务器...')

    const slowTimer = setTimeout(() => {
      setStatusText(prev => prev === '正在连接服务器...' ? '网络较慢，正在重试连接...' : prev)
    }, 3000)

    // 加入全局 store
    const videoUrl = videoInfo.webpage_url || url.trim()
    useDownloadStore.getState().addTask({
      taskId,
      url: videoUrl,
      title: videoInfo.title || '未知标题',
      thumbnail: videoInfo.thumbnail || '',
      platform: detectPlatform(videoUrl),
    })

    const platformFolder = detectPlatform(videoUrl) === '其他' ? '%(extractor_key)s' : detectPlatform(videoUrl)
    const rule = appSettings.namingRule || '%(title)s.%(ext)s'
    const template = `${platformFolder}\\${rule}`
    let outputPath = template
    const baseDir = appSettings.downloadPath ||
      downloadsPath ||
      await window.api.getDownloadsPath().catch(() => '')
    if (baseDir) {
      outputPath = `${baseDir.replace(/\\$/, '')}\\${template}`
    }

    // 监听进度
    const removeListener = window.api.onDownloadProgress((p) => {
      if (p.taskId === taskId) {
        clearTimeout(slowTimer)
        setProgress(p)
        if (p.progress < 100) {
          setStatusText('正在下载…')
        }
        // 同步到 store
        useDownloadStore.getState().updateProgress(
          taskId, p.progress, p.speed, p.eta, p.filesize,
        )
      }
    })

    try {
      const result = await window.api.downloadVideo({
        url: videoUrl,
        formatId: effectiveFormatId,
        outputPath,
        taskId,
      })

      setStatusText('')

      if (result.status === 'success') {
        setFinalFilepath(result.data)
        setDownloadDone(true)
        const taskInStore = useDownloadStore.getState().activeTasks.find(t => t.taskId === taskId)
        const instant = taskInStore ? !taskInStore.hasReceivedProgress : false
        setIsInstantSkip(instant)
        messageApi.success(instant ? '已检测到本地文件，极速秒传完成！' : '下载完成！')
        useDownloadStore.getState().completeTask(taskId, result.data || '')
        if (appSettings.enableNotification) {
          window.api.showNotification('下载完成', videoInfo.title || '视频下载成功').catch(() => {})
        }
      } else if (result.status === 'cancelled') {
        useDownloadStore.getState().cancelTask(taskId)
      } else if (result.status === 'cookie_error') {
        messageApi.error(result.errorMessage || 'Cookie读取失败，请确认 Chrome 已安装且未锁定')
        useDownloadStore.getState().failTask(taskId, result.errorMessage || '')
      } else {
        messageApi.error(`下载失败：${friendlyError(result.errorMessage || '')}`)
        useDownloadStore.getState().failTask(taskId, result.errorMessage || '')
      }
    } finally {
      clearTimeout(slowTimer)
      removeListener()
      setDownloading(false)
    }
  }

  // ---- 格式列表 ----
  const formatOptions = videoInfo
    ? [
        { value: '__best__', label: '最佳质量（自动选择）' },
        ...(videoInfo.formats ?? [])
          .filter((f) => f.vcodec && f.vcodec !== 'none')
          .sort((a, b) => (b.tbr ?? 0) - (a.tbr ?? 0))
          .slice(0, 20)
          .map((f) => ({ value: f.id, label: buildFormatLabel(f) })),
      ]
    : []

  const effectiveFormatId =
    (!selectedFormatId || selectedFormatId === '__best__' || selectedFormatId === 'best')
      ? undefined
      : selectedFormatId

  return (
    <div>
      {contextHolder}

      {/* 输入区域 */}
      <Card style={{ marginBottom: 16, borderRadius: 8 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <Input
            size="large"
            placeholder="粘贴视频链接，支持 YouTube、TikTok、Bilibili、小红书、抖音等..."
            value={url}
            onChange={(e) => {
              const v = e.target.value
              setUrl(v)
              // allowClear 触发时 value 变为空字符串 — 同步重置页面状态
              if (!v) {
                setVideoInfo(null)
                setSelectedFormatId(undefined)
                setProgress(null)
                setDownloadDone(false)
                setFinalFilepath(undefined)
              }
            }}
            onPressEnter={handleParse}
            prefix={<VideoCameraOutlined style={{ color: '#bbb' }} />}
            allowClear={!downloading}
            style={{ borderRadius: 6 }}
            disabled={parsing || downloading}
          />
          <Button
            type="primary"
            size="large"
            icon={<SearchOutlined />}
            loading={parsing}
            onClick={handleParse}
            style={{ borderRadius: 6, minWidth: 100 }}
            disabled={downloading}
          >
            解析
          </Button>
        </div>
      </Card>

      {/* 解析中 */}
      {parsing && (
        <Card style={{ marginBottom: 16, borderRadius: 8 }}>
          <Skeleton active avatar={{ shape: 'square', size: 112 }} title={false} paragraph={{ rows: 3 }} />
        </Card>
      )}

      {/* 视频信息卡片 */}
      {videoInfo && !parsing && (
        <Card style={{ marginBottom: 16, borderRadius: 8 }}>
          <Row gutter={16} align="top">
            {/* 缩略图 */}
            <Col flex="200px">
              <div
                style={{
                  width: 200,
                  height: 112,
                  borderRadius: 6,
                  overflow: 'hidden',
                  background: '#f0f0f0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {videoInfo.thumbnail ? (
                  <img
                    src={videoInfo.thumbnail}
                    alt="thumbnail"
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    onError={(e) => {
                      ;(e.target as HTMLImageElement).style.display = 'none'
                    }}
                  />
                ) : (
                  <VideoCameraOutlined style={{ fontSize: 32, color: '#bbb' }} />
                )}
              </div>
            </Col>

            {/* 视频信息 */}
            <Col flex="1">
              <div
                style={{
                  fontWeight: 600,
                  fontSize: 15,
                  marginBottom: 8,
                  lineHeight: '1.4',
                  color: '#1a1a1a',
                }}
              >
                {videoInfo.title || '（无标题）'}
              </div>
              <Space size={16} style={{ marginBottom: 12 }}>
                <span style={{ color: '#666', fontSize: 13 }}>
                  <UserOutlined style={{ marginRight: 4 }} />
                  {videoInfo.author || '未知'}
                </span>
                <span style={{ color: '#666', fontSize: 13 }}>
                  <ClockCircleOutlined style={{ marginRight: 4 }} />
                  {formatDuration(videoInfo.duration)}
                </span>
                <Tag color="blue">{(videoInfo.formats ?? []).length} 个格式</Tag>
              </Space>

              {/* 清晰度选择 */}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <Select
                  style={{ minWidth: 280, flex: 1, maxWidth: 400 }}
                  placeholder="选择清晰度/格式"
                  options={formatOptions}
                  value={selectedFormatId ?? '__best__'}
                  onChange={(v) => setSelectedFormatId(v === '__best__' ? undefined : v)}
                  size="middle"
                />
                <Button
                  type="primary"
                  icon={<DownloadOutlined />}
                  onClick={handleDownload}
                  loading={downloading}
                  disabled={downloading}
                  style={{ borderRadius: 6 }}
                >
                  {downloading ? '下载中...' : '开始下载'}
                </Button>
              </div>
            </Col>
          </Row>

          {/* 进度条 */}
          {(downloading || downloadDone) && (
            <div style={{ marginTop: 16 }}>
              <Progress
                percent={downloadDone ? 100 : Math.round(progress?.progress ?? 0)}
                status={downloadDone ? 'success' : downloading ? 'active' : 'normal'}
                strokeColor={{ from: '#1677ff', to: '#4096ff' }}
              />
              {downloading && (
                <div style={{ color: '#888', fontSize: 12, marginTop: 4 }}>
                  {progress
                    ? <>速度：{progress.speed}&nbsp;&nbsp;大小：{progress.filesize}&nbsp;&nbsp;剩余：{progress.eta}</>
                    : <span style={{ color: statusText.includes('较慢') ? '#faad14' : '#1677ff' }}>{statusText || '正在连接服务器...'}</span>}
                </div>
              )}
              {downloadDone && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ color: '#52c41a', fontSize: 13, marginBottom: 10 }}>
                    ✓ 已保存到：{finalFilepath || downloadsPath || '当前目录'}
                    {isInstantSkip && (
                      <span style={{ color: '#faad14', marginLeft: 8, fontWeight: 500 }}>
                        ✨ (本地已存该文件，省流秒传！)
                      </span>
                    )}
                  </div>
                  <Space size={8}>
                    <Button
                      icon={<FolderOpenOutlined />}
                      onClick={() => {
                        if (finalFilepath) window.api.showItemInFolder(finalFilepath)
                      }}
                      size="small"
                    >
                      打开文件夹
                    </Button>
                    <Button
                      icon={<ReloadOutlined />}
                      onClick={handleDownload}
                      size="small"
                    >
                      重新下载
                    </Button>
                    <Button
                      type="primary"
                      icon={<PlusOutlined />}
                      onClick={resetPage}
                      size="small"
                    >
                      下载下一个
                    </Button>
                  </Space>
                </div>
              )}
            </div>
          )}
        </Card>
      )}

      {/* 热门网站快捷导航 */}
      <Card
        title={<span style={{ fontSize: 14, fontWeight: 600, color: '#333' }}>热门平台</span>}
        style={{ borderRadius: 8 }}
        styles={{ body: { paddingTop: 12 } }}
      >
        <Row gutter={[12, 12]}>
          {HOT_SITES.map((site) => (
            <Col key={site.name} xs={12} sm={8} md={6} lg={4} xl={3}>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 6,
                  padding: '10px 4px',
                  borderRadius: 8,
                  background: site.bg,
                  cursor: 'default',
                  userSelect: 'none',
                }}
              >
                <Avatar
                  size={36}
                  style={{
                    background: site.color,
                    fontSize: site.abbr.length > 1 ? 12 : 16,
                    fontWeight: 700,
                    flexShrink: 0,
                  }}
                >
                  {site.abbr}
                </Avatar>
                <span style={{ fontSize: 12, color: '#555', fontWeight: 500 }}>{site.name}</span>
              </div>
            </Col>
          ))}
        </Row>
      </Card>
    </div>
  )
}

export default SingleDownload
