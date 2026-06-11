import React from 'react'
import { Button, Empty, Segmented, Select, Space, Spin, Tag, Tooltip } from 'antd'
import {
  AppstoreOutlined,
  BarChartOutlined,
  CheckOutlined,
  ClockCircleOutlined,
  DownloadOutlined,
  EyeOutlined,
  FileTextOutlined,
  FireOutlined,
  LinkOutlined,
  ReloadOutlined,
  RobotOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons'
import { formatDuration } from '../../utils/format'

// ────────── 右栏：视频流 ──────────

export type FeedFilter = 'all' | 'new' | 'hot'
export type FeedSort = 'date' | 'views'
export type FeedViewMode = 'list' | 'card'

// ── 工具 ──

function formatUploadDate(yyyymmdd?: string): string {
  if (!yyyymmdd || yyyymmdd.length !== 8) return ''
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`
}

/** YouTube 风格相对时间：3天前 / 2周前 / 1个月前 / 2年前 */
function formatUploadAge(yyyymmdd?: string): string {
  if (!yyyymmdd || yyyymmdd.length !== 8) return ''
  const d = new Date(Number(yyyymmdd.slice(0, 4)), Number(yyyymmdd.slice(4, 6)) - 1, Number(yyyymmdd.slice(6, 8)))
  if (isNaN(d.getTime())) return ''
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000)
  if (days <= 0) return '今天'
  if (days < 7) return `${days}天前`
  if (days < 30) return `${Math.floor(days / 7)}周前`
  if (days < 365) return `${Math.floor(days / 30)}个月前`
  return `${Math.floor(days / 365)}年前`
}

function formatViewCount(n?: number): string {
  if (!n) return ''
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}亿`
  if (n >= 10_000) return `${(n / 10_000).toFixed(1)}万`
  return n.toLocaleString()
}

/** YouTube 风格元信息行：4.2万次观看 · 1个月前 */
function formatVideoMeta(v: NewVideoItem): string {
  const parts: string[] = []
  if (v.viewCount) parts.push(`${formatViewCount(v.viewCount)}次观看`)
  const age = formatUploadAge(v.uploadDate)
  if (age) parts.push(age)
  return parts.join(' · ')
}

function formatRelativeTime(ts: number): string {
  if (!ts) return '从未检查'
  const mins = Math.floor((Date.now() - ts) / 60_000)
  if (mins < 1) return '刚刚检查过'
  if (mins < 60) return `${mins} 分钟前检查`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} 小时前检查`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days} 天前检查`
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} 检查`
}

// ── 单条视频（列表行 / 卡片） ──

interface VideoItemProps {
  v: NewVideoItem
  hot: boolean
  analyzed: boolean      // 已有 AI 拆解缓存
  growth?: number        // 24h 播放量日增（快照不足时无）
  channelName?: string   // 聚合模式下显示来源频道
  onDownload: (url: string) => void
  onDismiss: (videoId: string, channelId: string) => void
  onAnalyze: (v: NewVideoItem) => void
  onTranscript: (v: NewVideoItem) => void
}

/** 日增展示：≥100 才显示，避免噪音 */
function formatGrowth(growth?: number): string {
  if (!growth || growth < 100) return ''
  return `↑${formatViewCount(growth)}/天`
}

const VideoRow: React.FC<VideoItemProps> = ({ v, hot, analyzed, growth, channelName, onDownload, onDismiss, onAnalyze, onTranscript }) => {
  const isNew = v.status === 'new'
  return (
    <div
      style={{
        display: 'flex',
        gap: 10,
        padding: '8px 10px',
        background: isNew ? '#f0f5ff' : '#fafafa',
        borderRadius: 6,
        border: `1px solid ${isNew ? '#d6e4ff' : '#f0f0f0'}`,
        borderLeft: `3px solid ${isNew ? '#1677ff' : '#e0e0e0'}`,
      }}
    >
      {/* 缩略图 */}
      <div
        style={{
          width: 96,
          height: 54,
          borderRadius: 4,
          overflow: 'hidden',
          background: '#e8e8e8',
          flexShrink: 0,
          position: 'relative',
          cursor: 'pointer',
        }}
        onClick={() => window.open(v.url, '_blank')}
      >
        {v.thumbnail && (
          <img
            src={v.thumbnail}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
          />
        )}
        {v.duration && (
          <div
            style={{
              position: 'absolute',
              bottom: 2,
              right: 4,
              fontSize: 10,
              color: '#fff',
              background: 'rgba(0,0,0,0.6)',
              padding: '0 3px',
              borderRadius: 2,
            }}
          >
            {formatDuration(v.duration)}
          </div>
        )}
      </div>

      {/* 标题 + 元信息 */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: isNew ? 500 : 400,
            color: isNew ? '#1a1a1a' : '#555',
            marginBottom: 4,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            lineHeight: '1.4',
            cursor: 'pointer',
          }}
          title={`${v.title}（点击在浏览器打开）`}
          onClick={() => window.open(v.url, '_blank')}
        >
          {isNew && (
            <Tag color="blue" style={{ fontSize: 10, padding: '0 4px', marginRight: 4, lineHeight: '16px', height: 16 }}>新</Tag>
          )}
          {hot && (
            <Tag color="red" icon={<FireOutlined />} style={{ fontSize: 10, padding: '0 4px', marginRight: 4, lineHeight: '16px', height: 16 }}>爆款</Tag>
          )}
          {v.title}
        </div>
        <div style={{ fontSize: 12, color: '#888', display: 'flex', gap: 8, alignItems: 'center' }}>
          {channelName && (
            <Tag style={{ fontSize: 10, padding: '0 5px', lineHeight: '15px', margin: 0, color: '#666' }}>
              {channelName}
            </Tag>
          )}
          <span
            style={{ color: hot ? '#f5222d' : '#888', fontWeight: hot ? 500 : 400 }}
            title={formatUploadDate(v.uploadDate) ? `发布于 ${formatUploadDate(v.uploadDate)}` : undefined}
          >
            {formatVideoMeta(v) || '暂无观看数据'}
          </span>
          {formatGrowth(growth) && (
            <span style={{ color: '#fa541c', fontWeight: 500 }} title="近 24 小时播放量增长（基于检查快照折算）">
              {formatGrowth(growth)}
            </span>
          )}
        </div>
      </div>

      {/* 操作 */}
      <Space size={2} style={{ flexShrink: 0, alignSelf: 'center' }}>
        <Tooltip title={analyzed ? '查看 AI 拆解（已有结果）' : 'AI 拆解标题'}>
          <Button
            size="small"
            type="text"
            icon={<RobotOutlined />}
            style={{ color: '#722ed1', background: analyzed ? '#f9f0ff' : undefined }}
            onClick={() => onAnalyze(v)}
          />
        </Tooltip>
        <Tooltip title="提取文案（免下载）">
          <Button size="small" type="text" icon={<FileTextOutlined />} onClick={() => onTranscript(v)} />
        </Tooltip>
        <Tooltip title="加入批量下载">
          <Button size="small" type="text" icon={<DownloadOutlined />} onClick={() => onDownload(v.url)} />
        </Tooltip>
        <Tooltip title="在浏览器打开">
          <Button size="small" type="text" icon={<LinkOutlined />} onClick={() => window.open(v.url, '_blank')} />
        </Tooltip>
        {isNew && (
          <Tooltip title="标为已读">
            <Button
              size="small"
              type="text"
              icon={<EyeOutlined />}
              style={{ color: '#1677ff' }}
              onClick={() => onDismiss(v.id, v.channelId)}
            />
          </Tooltip>
        )}
      </Space>
    </div>
  )
}

const VideoCard: React.FC<VideoItemProps> = ({ v, hot, analyzed, growth, channelName, onDownload, onDismiss, onAnalyze, onTranscript }) => {
  const isNew = v.status === 'new'
  return (
    <div
      style={{
        borderRadius: 8,
        overflow: 'hidden',
        border: `1px solid ${isNew ? '#d6e4ff' : '#f0f0f0'}`,
        background: isNew ? '#f0f5ff' : '#fff',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* 缩略图 */}
      <div
        style={{ position: 'relative', paddingTop: '56.25%', background: '#e8e8e8', cursor: 'pointer' }}
        onClick={() => window.open(v.url, '_blank')}
      >
        {v.thumbnail && (
          <img
            src={v.thumbnail}
            alt=""
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
          />
        )}
        {v.duration && (
          <div
            style={{
              position: 'absolute', bottom: 4, right: 6,
              fontSize: 10, color: '#fff', background: 'rgba(0,0,0,0.65)',
              padding: '1px 4px', borderRadius: 2,
            }}
          >
            {formatDuration(v.duration)}
          </div>
        )}
        {isNew && (
          <div
            style={{
              position: 'absolute', top: 4, left: 4,
              background: '#1677ff', color: '#fff',
              fontSize: 10, padding: '1px 5px', borderRadius: 3,
            }}
          >
            新
          </div>
        )}
        {hot && (
          <div
            style={{
              position: 'absolute', top: 4, right: 4,
              background: '#f5222d', color: '#fff',
              fontSize: 10, padding: '1px 5px', borderRadius: 3,
            }}
          >
            🔥 爆款
          </div>
        )}
      </div>
      {/* 内容 */}
      <div style={{ padding: '8px 10px', flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div
          style={{
            fontSize: 13, fontWeight: 500, color: isNew ? '#1a1a1a' : '#444',
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
            overflow: 'hidden', lineHeight: '1.4', cursor: 'pointer',
          }}
          title={v.title}
          onClick={() => window.open(v.url, '_blank')}
        >
          {v.title}
        </div>
        <div style={{ fontSize: 12, color: '#888', lineHeight: '1.5' }}>
          {channelName && <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{channelName}</div>}
          <div
            style={{ color: hot ? '#f5222d' : '#888', fontWeight: hot ? 500 : 400 }}
            title={formatUploadDate(v.uploadDate) ? `发布于 ${formatUploadDate(v.uploadDate)}` : undefined}
          >
            {formatVideoMeta(v) || '暂无观看数据'}
            {formatGrowth(growth) && (
              <span style={{ color: '#fa541c', fontWeight: 500, marginLeft: 6 }} title="近 24 小时播放量增长（基于检查快照折算）">
                {formatGrowth(growth)}
              </span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 2, marginTop: 'auto' }}>
          <Tooltip title={analyzed ? '查看 AI 拆解（已有结果）' : 'AI 拆解标题'}>
            <Button
              size="small"
              type="text"
              icon={<RobotOutlined />}
              style={{ color: '#722ed1', background: analyzed ? '#f9f0ff' : undefined }}
              onClick={() => onAnalyze(v)}
            />
          </Tooltip>
          <Tooltip title="提取文案（免下载）">
            <Button size="small" type="text" icon={<FileTextOutlined />} onClick={() => onTranscript(v)} />
          </Tooltip>
          <Tooltip title="加入批量下载">
            <Button size="small" type="text" icon={<DownloadOutlined />} onClick={() => onDownload(v.url)} />
          </Tooltip>
          <Tooltip title="在浏览器打开">
            <Button size="small" type="text" icon={<LinkOutlined />} onClick={() => window.open(v.url, '_blank')} />
          </Tooltip>
          {isNew && (
            <Tooltip title="标为已读">
              <Button
                size="small" type="text" icon={<EyeOutlined />} style={{ color: '#1677ff' }}
                onClick={() => onDismiss(v.id, v.channelId)}
              />
            </Tooltip>
          )}
        </div>
      </div>
    </div>
  )
}

// ── 主组件 ──

interface VideoFeedProps {
  mode: 'all' | 'channel'
  channel?: ChannelSubscription
  subsCount: number
  loading: boolean
  checking: boolean
  videos: NewVideoItem[]                          // 已筛选 + 排序
  counts: { all: number; new: number; hot: number }
  filter: FeedFilter
  sort: FeedSort
  viewMode: FeedViewMode
  channelNames: Record<string, string>
  isHot: (v: NewVideoItem) => boolean
  isAnalyzed: (v: NewVideoItem) => boolean
  getGrowth: (v: NewVideoItem) => number | undefined
  onFilterChange: (f: FeedFilter) => void
  onSortChange: (s: FeedSort) => void
  onViewModeChange: (m: FeedViewMode) => void
  onCheck: () => void
  onAnalyzeVideo: (v: NewVideoItem) => void
  onTranscriptVideo: (v: NewVideoItem) => void
  onDownloadVideo: (url: string) => void
  onDownloadAllNew: () => void
  onMarkAllRead: () => void
  onDismiss: (videoId: string, channelId: string) => void
  onViewAllVideos?: () => void                    // 仅单频道模式
  onAnalyzeChannel?: () => void                   // 仅单频道模式：频道标题规律
  onOpenAdd: () => void
}

const VideoFeed: React.FC<VideoFeedProps> = ({
  mode,
  channel,
  subsCount,
  loading,
  checking,
  videos,
  counts,
  filter,
  sort,
  viewMode,
  channelNames,
  isHot,
  isAnalyzed,
  getGrowth,
  onFilterChange,
  onSortChange,
  onViewModeChange,
  onCheck,
  onAnalyzeVideo,
  onTranscriptVideo,
  onDownloadVideo,
  onDownloadAllNew,
  onMarkAllRead,
  onDismiss,
  onViewAllVideos,
  onAnalyzeChannel,
  onOpenAdd,
}) => {
  const title = mode === 'all' ? '全部视频' : channel?.name ?? ''

  const renderEmpty = () => {
    if (loading) return <Spin style={{ display: 'block', margin: '60px auto' }} />
    if (subsCount === 0) {
      return (
        <Empty description="还没有订阅频道" style={{ marginTop: 60 }}>
          <Button type="primary" onClick={onOpenAdd}>添加第一个订阅</Button>
        </Empty>
      )
    }
    const hint = filter !== 'all'
      ? '当前筛选条件下没有视频'
      : mode === 'channel'
        ? '暂无视频缓存，点击右上角「检查」拉取最新视频'
        : '暂无视频缓存，点击「检查全部」拉取最新视频'
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={hint} style={{ marginTop: 60 }} />
  }

  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        background: '#fff',
        borderRadius: 8,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
      }}
    >
      {/* ── 头部 ── */}
      <div style={{ padding: '12px 16px 10px', borderBottom: '1px solid #f0f0f0', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <span style={{ fontSize: 16, fontWeight: 600, color: '#1a1a1a' }}>{title}</span>
          {mode === 'channel' && channel && !channel.enabled && <Tag>已暂停</Tag>}
          <span style={{ fontSize: 12, color: '#aaa', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {mode === 'all' ? (
              `${subsCount} 个频道 · 缓存 ${counts.all} 条视频`
            ) : channel ? (
              <>
                <a href={channel.url} target="_blank" rel="noreferrer" style={{ marginRight: 8 }}>
                  <LinkOutlined style={{ marginRight: 2 }} />频道主页
                </a>
                <ClockCircleOutlined style={{ marginRight: 2 }} />
                {formatRelativeTime(channel.lastCheckedAt)}
              </>
            ) : null}
          </span>
          <Space size={6} style={{ flexShrink: 0 }}>
            {counts.new > 0 && (
              <Button size="small" type="primary" ghost icon={<DownloadOutlined />} onClick={onDownloadAllNew}>
                下载新视频（{counts.new}）
              </Button>
            )}
            {counts.new > 0 && (
              <Button size="small" icon={<CheckOutlined />} onClick={onMarkAllRead}>
                全部已读
              </Button>
            )}
            {mode === 'channel' && onAnalyzeChannel && (
              <Tooltip title="AI 对比高低播放标题，归纳这个频道的标题公式">
                <Button size="small" icon={<BarChartOutlined />} style={{ color: '#722ed1', borderColor: '#d3adf7' }} onClick={onAnalyzeChannel}>
                  频道规律
                </Button>
              </Tooltip>
            )}
            {mode === 'channel' && onViewAllVideos && (
              <Tooltip title="在线拉取频道更多历史视频">
                <Button size="small" icon={<AppstoreOutlined />} onClick={onViewAllVideos}>更多视频</Button>
              </Tooltip>
            )}
            <Button size="small" icon={<ReloadOutlined />} loading={checking} onClick={onCheck}>
              {mode === 'all' ? '检查全部' : '检查'}
            </Button>
          </Space>
        </div>

        {/* 筛选 / 排序 / 视图 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Segmented
            size="small"
            value={filter}
            onChange={(v) => onFilterChange(v as FeedFilter)}
            options={[
              { label: `全部 ${counts.all}`, value: 'all' },
              { label: `新视频 ${counts.new}`, value: 'new' },
              { label: `🔥 爆款 ${counts.hot}`, value: 'hot' },
            ]}
          />
          <div style={{ flex: 1 }} />
          <Select
            size="small"
            value={sort}
            onChange={onSortChange}
            style={{ width: 110 }}
            options={[
              { label: '最新发布', value: 'date' },
              { label: '播放量最高', value: 'views' },
            ]}
          />
          <Tooltip title={viewMode === 'list' ? '切换卡片视图' : '切换列表视图'}>
            <Button
              size="small"
              icon={viewMode === 'list' ? <AppstoreOutlined /> : <UnorderedListOutlined />}
              onClick={() => onViewModeChange(viewMode === 'list' ? 'card' : 'list')}
            />
          </Tooltip>
        </div>
      </div>

      {/* ── 视频列表 ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
        {videos.length === 0 ? (
          renderEmpty()
        ) : viewMode === 'card' ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 10 }}>
            {videos.map((v) => (
              <VideoCard
                key={`${v.channelId}-${v.id}`}
                v={v}
                hot={isHot(v)}
                analyzed={isAnalyzed(v)}
                growth={getGrowth(v)}
                channelName={mode === 'all' ? channelNames[v.channelId] : undefined}
                onDownload={onDownloadVideo}
                onDismiss={onDismiss}
                onAnalyze={onAnalyzeVideo}
                onTranscript={onTranscriptVideo}
              />
            ))}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {videos.map((v) => (
              <VideoRow
                key={`${v.channelId}-${v.id}`}
                v={v}
                hot={isHot(v)}
                analyzed={isAnalyzed(v)}
                growth={getGrowth(v)}
                channelName={mode === 'all' ? channelNames[v.channelId] : undefined}
                onDownload={onDownloadVideo}
                onDismiss={onDismiss}
                onAnalyze={onAnalyzeVideo}
                onTranscript={onTranscriptVideo}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default VideoFeed
