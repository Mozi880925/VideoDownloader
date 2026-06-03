import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Input,
  Button,
  Space,
  Empty,
  Spin,
  Checkbox,
  Tag,
  Tooltip,
  message,
  Select,
} from 'antd'
import {
  SearchOutlined,
  DownloadOutlined,
  LinkOutlined,
  ReloadOutlined,
  CheckSquareOutlined,
  CalendarOutlined,
  EyeOutlined,
} from '@ant-design/icons'
import { useDownloadStore } from '../../store/downloadStore'

function formatUploadDate(yyyymmdd?: string): string {
  if (!yyyymmdd || yyyymmdd.length !== 8) return ''
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`
}

function formatDuration(seconds?: number): string {
  if (!seconds || seconds <= 0) return ''
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

function formatViewCount(n?: number): string {
  if (typeof n !== 'number' || n < 0) return ''
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}亿`
  if (n >= 10_000) return `${(n / 10_000).toFixed(1)}万`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}千`
  return String(n)
}

interface VideoListPickerProps {
  initialUrl?: string
  autoFetch?: boolean
  placeholder?: string
  /** 是否显示 URL 输入框（弹窗里展示已知频道时可隐藏） */
  showUrlInput?: boolean
  /** 拉取数量 */
  defaultLimit?: number
}

const LIMIT_OPTIONS = [
  { label: '20 条', value: 20 },
  { label: '50 条', value: 50 },
  { label: '100 条', value: 100 },
]

const VideoListPicker: React.FC<VideoListPickerProps> = ({
  initialUrl = '',
  autoFetch = false,
  placeholder = '粘贴频道或播放列表 URL（YouTube / Bilibili 等）',
  showUrlInput = true,
  defaultLimit = 30,
}) => {
  const [url, setUrl] = useState(initialUrl)
  const [limit, setLimit] = useState<number>(defaultLimit)
  const [loading, setLoading] = useState(false)
  const [videos, setVideos] = useState<VideoListItem[]>([])
  const [channelName, setChannelName] = useState<string | undefined>(undefined)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const commitBatchUrls = useDownloadStore((s) => s.commitBatchUrls)

  const handleFetch = useCallback(async (target?: string) => {
    const u = (target ?? url).trim()
    if (!u) {
      message.warning('请输入 URL')
      return
    }
    setLoading(true)
    setVideos([])
    setChannelName(undefined)
    setSelectedIds(new Set())
    try {
      // proxy 由主进程 cachedProxyUrl 统一管理，传 undefined 即可
      const r = await window.api.fetchVideoList(u, limit, undefined)
      if (r.status === 'success') {
        setVideos(r.data.videos)
        setChannelName(r.data.channelName)
        if (r.data.videos.length === 0) {
          message.info('未找到视频')
        }
      } else {
        message.error(r.errorMessage || '拉取失败')
      }
    } finally {
      setLoading(false)
    }
  }, [url, limit])

  useEffect(() => {
    if (autoFetch && initialUrl) {
      handleFetch(initialUrl)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const allSelected = videos.length > 0 && selectedIds.size === videos.length
  const someSelected = selectedIds.size > 0

  const toggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    if (allSelected) setSelectedIds(new Set())
    else setSelectedIds(new Set(videos.map((v) => v.id)))
  }

  const selectedUrls = useMemo(
    () => videos.filter((v) => selectedIds.has(v.id)).map((v) => v.url),
    [videos, selectedIds],
  )

  const handleSendToBatch = () => {
    if (selectedUrls.length === 0) {
      message.warning('请先勾选要下载的视频')
      return
    }
    commitBatchUrls(selectedUrls)
    message.success(`已发送 ${selectedUrls.length} 个 URL 到批量下载`)
  }

  return (
    <div>
      {showUrlInput && (
        <Space.Compact style={{ width: '100%', marginBottom: 12 }}>
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={placeholder}
            prefix={<LinkOutlined style={{ color: '#bbb' }} />}
            onPressEnter={() => handleFetch()}
            allowClear
          />
          <Select
            value={limit}
            onChange={setLimit}
            options={LIMIT_OPTIONS}
            style={{ width: 100 }}
          />
          <Button
            type="primary"
            icon={<SearchOutlined />}
            loading={loading}
            onClick={() => handleFetch()}
          >
            拉取
          </Button>
        </Space.Compact>
      )}

      {(channelName || videos.length > 0) && (
        <div
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 10,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 12,
            padding: '8px 12px',
            background: '#fafbff',
            borderRadius: 6,
            border: '1px solid #f0f4ff',
            boxShadow: '0 2px 8px rgba(22, 119, 255, 0.06)',
          }}
        >
          <Space>
            {channelName && <Tag color="blue">{channelName}</Tag>}
            <span style={{ color: '#888', fontSize: 13 }}>
              共 {videos.length} 条视频，已选 {selectedIds.size}
            </span>
          </Space>
          <Space>
            <Button
              size="small"
              icon={<CheckSquareOutlined />}
              onClick={toggleAll}
              disabled={videos.length === 0}
            >
              {allSelected ? '取消全选' : '全选'}
            </Button>
            <Button
              size="small"
              icon={<ReloadOutlined />}
              onClick={() => handleFetch()}
              disabled={loading}
            >
              重新拉取
            </Button>
            <Button
              size="small"
              type="primary"
              icon={<DownloadOutlined />}
              disabled={!someSelected}
              onClick={handleSendToBatch}
            >
              加入批量下载
            </Button>
          </Space>
        </div>
      )}

      <Spin spinning={loading}>
        {videos.length === 0 ? (
          <div
            style={{
              padding: 40,
              background: '#fafafa',
              borderRadius: 8,
              border: '1px dashed #e8e8e8',
            }}
          >
            <Empty description={loading ? '正在拉取…' : '粘贴 URL 后点击「拉取」'} />
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
              gap: 12,
            }}
          >
            {videos.map((v) => {
              const selected = selectedIds.has(v.id)
              return (
                <div
                  key={v.id}
                  onClick={() => toggleOne(v.id)}
                  style={{
                    border: selected ? '2px solid #1677ff' : '1px solid #f0f0f0',
                    borderRadius: 8,
                    padding: 8,
                    background: selected ? '#f0f7ff' : '#fff',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                >
                  <div
                    style={{
                      position: 'relative',
                      width: '100%',
                      aspectRatio: '16/9',
                      borderRadius: 6,
                      overflow: 'hidden',
                      background: '#eee',
                      marginBottom: 6,
                    }}
                  >
                    {v.thumbnail && (
                      <img
                        src={v.thumbnail}
                        alt=""
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        onError={(e) => {
                          ;(e.target as HTMLImageElement).style.display = 'none'
                        }}
                      />
                    )}
                    {v.duration ? (
                      <span
                        style={{
                          position: 'absolute',
                          right: 6,
                          bottom: 6,
                          padding: '2px 6px',
                          background: 'rgba(0,0,0,0.7)',
                          color: '#fff',
                          fontSize: 12,
                          borderRadius: 3,
                        }}
                      >
                        {formatDuration(v.duration)}
                      </span>
                    ) : null}
                    <Checkbox
                      checked={selected}
                      onClick={(e) => e.stopPropagation()}
                      onChange={() => toggleOne(v.id)}
                      style={{
                        position: 'absolute',
                        left: 6,
                        top: 6,
                        background: 'rgba(255,255,255,0.85)',
                        padding: '2px 4px',
                        borderRadius: 3,
                      }}
                    />
                  </div>
                  <Tooltip title={v.title}>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 500,
                        lineHeight: 1.4,
                        height: 36,
                        overflow: 'hidden',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                      }}
                    >
                      {v.title}
                    </div>
                  </Tooltip>
                  <div
                    style={{
                      display: 'flex',
                      gap: 10,
                      alignItems: 'center',
                      marginTop: 6,
                      fontSize: 12,
                      color: '#666',
                      minHeight: 18,
                    }}
                  >
                    {v.uploadDate && (
                      <span>
                        <CalendarOutlined style={{ marginRight: 3, color: '#bbb' }} />
                        {formatUploadDate(v.uploadDate)}
                      </span>
                    )}
                    {typeof v.viewCount === 'number' && (
                      <span>
                        <EyeOutlined style={{ marginRight: 3, color: '#bbb' }} />
                        {formatViewCount(v.viewCount)}
                      </span>
                    )}
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'flex-end',
                      marginTop: 2,
                    }}
                  >
                    <a
                      href={v.url}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      style={{ fontSize: 11, color: '#1677ff' }}
                    >
                      打开 ↗
                    </a>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Spin>
    </div>
  )
}

export default VideoListPicker
