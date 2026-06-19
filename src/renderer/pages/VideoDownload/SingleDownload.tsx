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
  Checkbox,
  Tooltip,
  Collapse,
  Typography,
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
  ScissorOutlined,
} from '@ant-design/icons'
import { useDownloadStore, useSettingsStore, detectPlatform } from '../../store/downloadStore'
import { friendlyError } from '../../../shared/errorTranslator'
import { extractFirstUrl, extractUrls } from '../../../shared/extractUrls'
import { buildOutputPath } from '../../utils/buildOutputPath'

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

function formatTimestamp(seconds: number): string {
  if (!seconds || seconds < 0) return '0:00'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

/**
 * 把 "HH:MM:SS" / "MM:SS" / "纯秒数" 解析为秒；非法输入返回 null
 */
function parseTimeInput(s: string): number | null {
  const trimmed = s.trim()
  if (!trimmed) return null
  if (/^\d+(\.\d+)?$/.test(trimmed)) return Math.floor(Number(trimmed))
  const parts = trimmed.split(':').map((p) => p.trim())
  if (parts.length < 2 || parts.length > 3) return null
  if (!parts.every((p) => /^\d+$/.test(p))) return null
  const nums = parts.map(Number)
  if (parts.length === 2) return nums[0] * 60 + nums[1]
  return nums[0] * 3600 + nums[1] * 60 + nums[2]
}

function formatCount(n: number): string {
  if (n >= 10_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 10_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toLocaleString()
}

function formatUploadDate(yyyymmdd: string): string {
  if (!/^\d{8}$/.test(yyyymmdd)) return yyyymmdd
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`
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
  const [downloadSubtitles, setDownloadSubtitles] = useState<boolean | null>(null)
  const [audioOnly, setAudioOnly] = useState(false)
  const currentTaskId = useRef<string>('')
  const [selectedSection, setSelectedSection] = useState<{ start: number; end: number; title: string } | null>(null)
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
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
    setSelectedSection(null)
    setCustomStart('')
    setCustomEnd('')
    setProgress(null)
    setDownloadDone(false)
    setFinalFilepath(undefined)
    setStatusText('')
    setIsInstantSkip(false)
    setDownloadSubtitles(null)
    setAudioOnly(false)
  }

  // ---- 监听"重新下载"请求 ----
  const retryUrl = useSettingsStore((s) => s.retryUrl)
  const clearRetryUrl = useSettingsStore((s) => s.clearRetryUrl)
  const appSettings = useSettingsStore((s) => s.appSettings)

  // ---- 核心解析逻辑 ----
  const doParse = async (targetUrl: string) => {
    // 支持抖音/小红书等平台的分享口令格式（含垃圾文本的分享消息）
    const trimmed = extractFirstUrl(targetUrl)
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
      setSelectedSection(null)
      setCustomStart('')
      setCustomEnd('')
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

    const baseDir = appSettings.downloadPath ||
      downloadsPath ||
      await window.api.getDownloadsPath().catch(() => '')
    const outputPath = buildOutputPath(
      videoUrl, baseDir,
      appSettings.namingRule || '',
      appSettings.folderOrganize ?? 'none',
    )

    // 磁盘空间预估检查（非阻塞，仅警告）
    try {
      const estimatedBytes = videoInfo.formats?.reduce((max, f) => Math.max(max, f.filesize || 0), 0) || 0
      if (estimatedBytes > 0 && baseDir) {
        const disk = await window.api.getDiskSpace(baseDir)
        if (disk.available > 0 && estimatedBytes > disk.available) {
          const toMB = (b: number) => (b / 1024 / 1024).toFixed(0)
          messageApi.warning(`磁盘空间可能不足：预估 ${toMB(estimatedBytes)} MB，可用 ${toMB(disk.available)} MB`, 6)
        }
      }
    } catch { /* 忽略磁盘检查失败 */ }

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

    const subsBase = appSettings.subtitles
    const wantSubs = downloadSubtitles ?? (subsBase?.enabled ?? false)
    const effectiveSubtitles = subsBase && wantSubs
      ? { ...subsBase, enabled: true }
      : undefined

    try {
      const result = await window.api.downloadVideo({
        url: videoUrl,
        formatId: audioOnly ? undefined : effectiveFormatId,
        outputPath,
        taskId,
        subtitles: effectiveSubtitles,
        section: selectedSection ?? undefined,
        audioOnly,
      })

      setStatusText('')

      if (result.status === 'success') {
        setFinalFilepath(result.data)
        setDownloadDone(true)
        setSelectedSection(null)
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
            placeholder="粘贴视频链接或抖音/小红书分享口令，回车解析..."
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
            onPaste={(e) => {
              const raw = e.clipboardData.getData('text')
              if (!raw) return
              const urls = extractUrls(raw)
              // 只有当粘贴的文本里含有 URL 且原文不是纯 URL 时，才自动净化
              if (urls.length > 0 && urls[0] !== raw.trim()) {
                e.preventDefault()
                setUrl(urls[0])
                messageApi.success({
                  content: `已从分享口令提取链接：${urls[0]}`,
                  duration: 3,
                })
                // 延迟一帧后自动触发解析
                setTimeout(() => doParse(urls[0]), 50)
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
                  placeholder={audioOnly ? '仅音频模式（mp3）' : '选择清晰度/格式'}
                  options={formatOptions}
                  value={selectedFormatId ?? '__best__'}
                  onChange={(v) => setSelectedFormatId(v === '__best__' ? undefined : v)}
                  size="middle"
                  disabled={audioOnly}
                />
                <Tooltip title="勾选后跳过视频下载，仅提取最高音质 mp3（需 ffmpeg）">
                  <Checkbox
                    checked={audioOnly}
                    onChange={(e) => setAudioOnly(e.target.checked)}
                    disabled={downloading}
                    style={{ fontSize: 13 }}
                  >
                    仅音频
                  </Checkbox>
                </Tooltip>
                <Tooltip
                  title={
                    appSettings.subtitles && appSettings.subtitles.languages.length > 0
                      ? `语言：${appSettings.subtitles.languages.join(', ')}${appSettings.subtitles.includeAuto ? '（含自动字幕）' : ''}${appSettings.subtitles.embed ? '（同时嵌入视频）' : ''}`
                      : '可在 设置 → 默认下载字幕 里配置语言'
                  }
                >
                  <Checkbox
                    checked={downloadSubtitles ?? (appSettings.subtitles?.enabled ?? false)}
                    onChange={(e) => setDownloadSubtitles(e.target.checked)}
                    disabled={downloading || audioOnly}
                    style={{ fontSize: 13 }}
                  >
                    下载字幕
                  </Checkbox>
                </Tooltip>
                <Button
                  type="primary"
                  icon={<DownloadOutlined />}
                  onClick={handleDownload}
                  loading={downloading}
                  disabled={downloading}
                  style={{ borderRadius: 6 }}
                >
                  {downloading
                    ? '下载中...'
                    : audioOnly
                      ? selectedSection ? '下载音频片段' : '下载音频(mp3)'
                      : selectedSection ? '下载章节' : '开始下载'}
                </Button>
              </div>
            </Col>
          </Row>

          {/* 自由裁剪（始终显示，章节列表外的备用方式） */}
          <div
            style={{
              marginTop: 12,
              padding: '8px 12px',
              background: '#fafafa',
              border: '1px solid #f0f0f0',
              borderRadius: 6,
              display: 'flex',
              gap: 8,
              alignItems: 'center',
              flexWrap: 'wrap',
              fontSize: 12,
            }}
          >
            <ScissorOutlined style={{ color: '#1677ff' }} />
            <span style={{ color: '#666' }}>自由裁剪（HH:MM:SS 或 MM:SS）：</span>
            <Input
              size="small"
              placeholder="起 00:00"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              disabled={downloading}
              style={{ width: 100 }}
            />
            <span style={{ color: '#bbb' }}>—</span>
            <Input
              size="small"
              placeholder={`止 ${formatTimestamp(videoInfo.duration || 0)}`}
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              disabled={downloading}
              style={{ width: 100 }}
            />
            <Button
              size="small"
              type={selectedSection?.title === '自定义片段' ? 'primary' : 'default'}
              disabled={downloading}
              onClick={() => {
                const start = parseTimeInput(customStart) ?? 0
                const end = parseTimeInput(customEnd)
                if (end == null || end <= 0) {
                  messageApi.warning('请输入有效的结束时间')
                  return
                }
                if (end <= start) {
                  messageApi.warning('结束时间必须大于开始时间')
                  return
                }
                if (videoInfo.duration && end > videoInfo.duration) {
                  messageApi.warning(`结束时间不能超过视频长度（${formatTimestamp(videoInfo.duration)}）`)
                  return
                }
                setSelectedSection({ start, end, title: '自定义片段' })
              }}
            >
              应用
            </Button>
            {selectedSection && selectedSection.title === '自定义片段' && (
              <span style={{ color: '#1677ff' }}>
                ✂️ 已应用：{formatTimestamp(selectedSection.start)} – {formatTimestamp(selectedSection.end)}
                <Button
                  type="link"
                  size="small"
                  onClick={() => setSelectedSection(null)}
                  style={{ fontSize: 11, padding: '0 4px' }}
                >
                  取消
                </Button>
              </span>
            )}
          </div>

          {/* 视频详情（可折叠） */}
          {(() => {
            const hasDetails =
              (videoInfo.description && videoInfo.description.trim()) ||
              (videoInfo.tags && videoInfo.tags.length > 0) ||
              (videoInfo.chapters && videoInfo.chapters.length > 0) ||
              videoInfo.viewCount != null ||
              videoInfo.likeCount != null ||
              videoInfo.uploadDate
            if (!hasDetails) return null
            return (
              <Collapse
                ghost
                size="small"
                style={{ marginTop: 12 }}
                items={[
                  {
                    key: 'details',
                    label: <span style={{ fontSize: 13, color: '#666' }}>📋 查看视频详情</span>,
                    children: (
                      <div style={{ paddingTop: 4 }}>
                        {/* 元信息行 */}
                        <Space size={16} wrap style={{ marginBottom: 12, fontSize: 12, color: '#666' }}>
                          {videoInfo.uploadDate && (
                            <span>📅 发布：{formatUploadDate(videoInfo.uploadDate)}</span>
                          )}
                          {videoInfo.viewCount != null && (
                            <span>👁 {formatCount(videoInfo.viewCount)} 次观看</span>
                          )}
                          {videoInfo.likeCount != null && (
                            <span>👍 {formatCount(videoInfo.likeCount)}</span>
                          )}
                          {videoInfo.categories && videoInfo.categories.length > 0 && (
                            <span>🗂 {videoInfo.categories.join(' / ')}</span>
                          )}
                        </Space>

                        {/* 简介 */}
                        {videoInfo.description && videoInfo.description.trim() && (
                          <div style={{ marginBottom: 12 }}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: '#888', marginBottom: 4 }}>简介</div>
                            <Typography.Paragraph
                              style={{ fontSize: 13, color: '#555', whiteSpace: 'pre-wrap', marginBottom: 0 }}
                              ellipsis={{ rows: 4, expandable: true, symbol: '展开' }}
                            >
                              {videoInfo.description}
                            </Typography.Paragraph>
                          </div>
                        )}

                        {/* 章节 */}
                        {videoInfo.chapters && videoInfo.chapters.length > 0 && (
                          <div style={{ marginBottom: 12 }}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: '#888', marginBottom: 4 }}>
                              章节（{videoInfo.chapters.length}）
                              <span style={{ fontWeight: 400, marginLeft: 8, color: '#aaa' }}>点击 ⬇ 只下载该章节</span>
                            </div>
                            <div
                              style={{
                                maxHeight: 200,
                                overflowY: 'auto',
                                background: '#fafafa',
                                border: '1px solid #f0f0f0',
                                borderRadius: 4,
                                padding: '4px 8px',
                              }}
                            >
                              {videoInfo.chapters.map((c, idx) => {
                                const nextStart = videoInfo.chapters![idx + 1]?.start_time ?? videoInfo.duration
                                const isSelected = selectedSection?.start === c.start_time
                                return (
                                  <div
                                    key={idx}
                                    style={{
                                      display: 'flex',
                                      gap: 8,
                                      alignItems: 'center',
                                      padding: '4px 6px',
                                      fontSize: 12,
                                      color: '#555',
                                      borderRadius: 4,
                                      background: isSelected ? '#e6f4ff' : 'transparent',
                                      borderBottom: idx < videoInfo.chapters!.length - 1 ? '1px dashed #eee' : 'none',
                                      cursor: 'default',
                                    }}
                                  >
                                    <span style={{ color: '#1677ff', fontFamily: 'Consolas, monospace', flexShrink: 0, width: 52 }}>
                                      {formatTimestamp(c.start_time)}
                                    </span>
                                    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.title}>
                                      {c.title}
                                    </span>
                                    <Tooltip title={isSelected ? '取消章节选择（下载整个视频）' : `只下载此章节（${formatTimestamp(c.start_time)}–${formatTimestamp(nextStart)}）`}>
                                      <Button
                                        size="small"
                                        type={isSelected ? 'primary' : 'text'}
                                        icon={<DownloadOutlined />}
                                        disabled={downloading}
                                        onClick={() => setSelectedSection(
                                          isSelected ? null : { start: c.start_time, end: nextStart, title: c.title }
                                        )}
                                        style={{ fontSize: 11, padding: '0 6px', height: 22 }}
                                      />
                                    </Tooltip>
                                  </div>
                                )
                              })}
                            </div>
                            {selectedSection && (
                              <div style={{ marginTop: 6, fontSize: 12, color: '#1677ff' }}>
                                ✂️ 已选：{selectedSection.title}（{formatTimestamp(selectedSection.start)} – {formatTimestamp(selectedSection.end)}）
                                <Button type="link" size="small" onClick={() => setSelectedSection(null)} style={{ fontSize: 11 }}>取消</Button>
                              </div>
                            )}
                          </div>
                        )}

                        {/* 视频原生标签 */}
                        {videoInfo.tags && videoInfo.tags.length > 0 && (
                          <div>
                            <div style={{ fontSize: 12, fontWeight: 600, color: '#888', marginBottom: 4 }}>
                              视频标签（{videoInfo.tags.length}）
                            </div>
                            <Space size={[4, 4]} wrap>
                              {videoInfo.tags.slice(0, 30).map((t) => (
                                <Tag key={t} style={{ fontSize: 11, margin: 0 }}>{t}</Tag>
                              ))}
                              {videoInfo.tags.length > 30 && (
                                <span style={{ fontSize: 11, color: '#999' }}>
                                  …等 {videoInfo.tags.length} 个
                                </span>
                              )}
                            </Space>
                          </div>
                        )}
                      </div>
                    ),
                  },
                ]}
              />
            )
          })()}

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
