import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import type { InputRef } from 'antd'
import {
  Segmented,
  Card,
  Progress,
  Button,
  Space,
  Tag,
  Empty,
  Popconfirm,
  Input,
  Select,
  Checkbox,
  Tooltip,
  DatePicker,
  Dropdown,
  message,
} from 'antd'
import type { Dayjs } from 'dayjs'
import {
  FolderOpenOutlined,
  CloseCircleOutlined,
  DeleteOutlined,
  PlayCircleOutlined,
  VideoCameraOutlined,
  ReloadOutlined,
  WarningOutlined,
  SearchOutlined,
  FilterOutlined,
  ClearOutlined,
  PlusOutlined,
  TagOutlined,
  CameraOutlined,
  AudioOutlined,
  LoginOutlined,
  ExportOutlined,
  FileTextOutlined,
} from '@ant-design/icons'
import {
  useDownloadStore,
  PLATFORM_OPTIONS,
  type ActiveTask,
  type CompletedRecord,
  type FailedRecord,
} from '../../store/downloadStore'
import dayjs from 'dayjs'
import ExtractFramesModal from '../../components/ExtractFramesModal'
import TranscribeModal from '../../components/TranscribeModal'
import SrtViewer from '../../components/SrtViewer'

// ---- 工具函数 ----

function formatTime(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function statusLabel(status: ActiveTask['status']): string {
  switch (status) {
    case 'preparing': return '正在准备…'
    case 'downloading': return '正在下载'
    case 'merging': return '正在合并'
    default: return '下载中'
  }
}

// ---- 下载记录导出工具 ----

function csvEscape(v: unknown): string {
  if (v == null) return ''
  const s = String(v)
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function recordsToCsv(records: CompletedRecord[]): string {
  const header = ['taskId', 'title', 'platform', 'url', 'filepath', 'tags', 'completedAt']
  const rows = records.map((r) => [
    r.taskId,
    r.title,
    r.platform,
    r.url,
    r.filepath,
    (r.tags ?? []).join('|'),
    new Date(r.completedAt).toISOString(),
  ])
  return [header, ...rows].map((row) => row.map(csvEscape).join(',')).join('\r\n')
}

function downloadBlob(content: string, filename: string, mime: string) {
  // CSV 加 UTF-8 BOM 让 Excel 直接打开不乱码
  const isCsv = mime.startsWith('text/csv')
  const blob = new Blob(isCsv ? ['﻿', content] : [content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function exportRecords(records: CompletedRecord[], format: 'json' | 'csv') {
  const ts = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19)
  if (format === 'json') {
    downloadBlob(JSON.stringify(records, null, 2), `download-history-${ts}.json`, 'application/json')
  } else {
    downloadBlob(recordsToCsv(records), `download-history-${ts}.csv`, 'text/csv;charset=utf-8')
  }
}

// ---- 缩略图组件 ----

const Thumbnail: React.FC<{ src?: string; size?: number }> = ({ src, size = 80 }) => (
  <div
    style={{
      width: size * 16 / 9,
      height: size,
      borderRadius: 4,
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
        alt="thumbnail"
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
      />
    ) : (
      <VideoCameraOutlined style={{ fontSize: 24, color: '#bbb' }} />
    )}
  </div>
)

// ---- 下载中卡片 ----

const ActiveTaskCard: React.FC<{ task: ActiveTask }> = ({ task }) => {
  const cancelTask = useDownloadStore((s) => s.cancelTask)
  const [slowNetwork, setSlowNetwork] = useState(false)

  React.useEffect(() => {
    if (!task.hasReceivedProgress) {
      const timer = setTimeout(() => setSlowNetwork(true), 3000)
      return () => clearTimeout(timer)
    }
  }, [task.hasReceivedProgress])

  const statusText = !task.hasReceivedProgress
    ? (slowNetwork ? '网络较慢，正在重试连接...' : '正在连接服务器...')
    : statusLabel(task.status)

  const handleCancel = async () => {
    await window.api.cancelDownload(task.taskId)
    cancelTask(task.taskId)
  }

  return (
    <Card
      size="small"
      style={{ marginBottom: 10, borderRadius: 6 }}
      styles={{ body: { padding: '12px 16px' } }}
    >
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <Thumbnail src={task.thumbnail} size={64} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontWeight: 600,
              fontSize: 13,
              color: '#1a1a1a',
              marginBottom: 4,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            title={task.title}
          >
            {task.title || '未知标题'}
          </div>
          <div style={{ marginBottom: 6 }}>
            <Tag color="blue" style={{ fontSize: 11 }}>{task.platform}</Tag>
            <span style={{ color: task.hasReceivedProgress ? '#888' : (slowNetwork ? '#faad14' : '#1677ff'), fontSize: 12 }}>
              {statusText}
            </span>
          </div>
          {task.hasReceivedProgress ? (
            <>
              <Progress
                percent={Math.round(task.progress)}
                size="small"
                status="active"
                strokeColor={{ from: '#1677ff', to: '#4096ff' }}
              />
              {task.speed && (
                <div style={{ color: '#888', fontSize: 11, marginTop: 2 }}>
                  速度：{task.speed}&nbsp;&nbsp;大小：{task.filesize}&nbsp;&nbsp;剩余：{task.eta}
                </div>
              )}
            </>
          ) : (
            <div style={{ height: 38, display: 'flex', alignItems: 'center' }}>
              <Progress percent={100} size="small" status="active" strokeColor="#f0f0f0" showInfo={false} />
            </div>
          )}
        </div>
        <Button
          type="text"
          danger
          icon={<CloseCircleOutlined />}
          size="small"
          onClick={handleCancel}
          title="取消下载"
        />
      </div>
    </Card>
  )
}

// ---- 标签编辑器 ----

const TagEditor: React.FC<{
  tags: string[]
  onChange: (tags: string[]) => void
  onClickTag?: (tag: string) => void
}> = ({ tags, onChange, onClickTag }) => {
  const [editing, setEditing] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const inputRef = useRef<InputRef>(null)

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  const handleConfirm = () => {
    const v = inputValue.trim()
    if (v && !tags.includes(v)) {
      onChange([...tags, v])
    }
    setInputValue('')
    setEditing(false)
  }

  const handleRemove = (tag: string) => {
    onChange(tags.filter((t) => t !== tag))
  }

  return (
    <Space size={[4, 4]} wrap style={{ maxWidth: '100%' }}>
      {tags.map((t) => (
        <Tag
          key={t}
          closable
          onClose={(e) => {
            e.preventDefault()
            e.stopPropagation()
            handleRemove(t)
          }}
          onClick={() => onClickTag?.(t)}
          title={onClickTag ? `点击筛选"${t}"` : undefined}
          style={{
            fontSize: 11, margin: 0,
            background: '#e6f4ff', borderColor: '#91caff', color: '#1677ff',
            cursor: onClickTag ? 'pointer' : 'default',
          }}
        >
          <TagOutlined style={{ marginRight: 2 }} />
          {t}
        </Tag>
      ))}
      {editing ? (
        <Input
          ref={inputRef}
          size="small"
          type="text"
          style={{ width: 96, height: 22, fontSize: 11 }}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onBlur={handleConfirm}
          onPressEnter={handleConfirm}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setInputValue('')
              setEditing(false)
            }
          }}
          maxLength={20}
          placeholder="输入标签"
        />
      ) : (
        <Tag
          onClick={() => setEditing(true)}
          style={{
            fontSize: 11,
            margin: 0,
            background: '#fafafa',
            borderStyle: 'dashed',
            color: '#888',
            cursor: 'pointer',
          }}
        >
          <PlusOutlined style={{ fontSize: 10, marginRight: 2 }} />
          添加标签
        </Tag>
      )}
    </Space>
  )
}

// ---- 已完成记录行 ----

interface CompletedCardProps {
  record: CompletedRecord
  selected: boolean
  onToggle: (taskId: string) => void
  fileMissing?: boolean
}

const CompletedRecordCard: React.FC<CompletedCardProps> = ({ record, selected, onToggle, fileMissing }) => {
  const removeRecord = useDownloadStore((s) => s.removeRecord)
  const updateRecordTags = useDownloadStore((s) => s.updateRecordTags)
  const setFilterKeyword = useDownloadStore((s) => s.setFilterKeyword)
  const [framesOpen, setFramesOpen] = useState(false)
  const [transcribeOpen, setTranscribeOpen] = useState(false)
  const [srtOpen, setSrtOpen] = useState(false)

  // 查找同目录下的 .srt 文件
  const srtPath = record.filepath
    ? record.filepath.replace(/\.[^.]+$/, '.srt')
    : undefined

  return (
    <Card
      size="small"
      style={{
        marginBottom: 10,
        borderRadius: 6,
        background: selected ? '#f0f5ff' : fileMissing ? '#fafafa' : undefined,
        borderColor: selected ? '#91caff' : fileMissing ? '#f0f0f0' : undefined,
        opacity: fileMissing ? 0.7 : 1,
      }}
      styles={{ body: { padding: '12px 16px' } }}
    >
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <Checkbox
          checked={selected}
          onChange={() => onToggle(record.taskId)}
        />
        <Thumbnail src={record.thumbnail} size={56} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontWeight: 600,
              fontSize: 13,
              color: fileMissing ? '#888' : '#1a1a1a',
              marginBottom: 4,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              textDecoration: fileMissing ? 'line-through' : undefined,
            }}
            title={record.title}
          >
            {record.title || '未知标题'}
          </div>
          <Space size={8} style={{ marginBottom: 6 }}>
            <Tag color="blue" style={{ fontSize: 11 }}>{record.platform}</Tag>
            <span style={{ color: '#999', fontSize: 11 }}>{formatTime(record.completedAt)}</span>
            {fileMissing && (
              <Tooltip title={`本地文件已不存在：${record.filepath}`}>
                <Tag icon={<WarningOutlined />} color="warning" style={{ fontSize: 11 }}>
                  文件已丢失
                </Tag>
              </Tooltip>
            )}
          </Space>
          <TagEditor
            tags={record.tags ?? []}
            onChange={(next) => updateRecordTags(record.taskId, next)}
            onClickTag={(tag) => setFilterKeyword(tag)}
          />
        </div>
        <Space size={4}>
          <Button
            type="text"
            icon={<PlayCircleOutlined />}
            size="small"
            title={fileMissing ? '文件已丢失，无法打开' : '打开文件'}
            disabled={!record.filepath || fileMissing}
            onClick={() => {
              if (record.filepath) window.api.openFile(record.filepath)
            }}
          />
          <Button
            type="text"
            icon={<CameraOutlined />}
            size="small"
            title={fileMissing ? '文件已丢失，无法提取' : '提取关键帧'}
            disabled={!record.filepath || fileMissing}
            onClick={() => setFramesOpen(true)}
          />
          <Button
            type="text"
            icon={<AudioOutlined />}
            size="small"
            title={fileMissing ? '文件已丢失，无法转写' : '生成字幕（Whisper）'}
            disabled={!record.filepath || fileMissing}
            onClick={() => setTranscribeOpen(true)}
          />
          <Button
            type="text"
            icon={<FileTextOutlined />}
            size="small"
            title="查看字幕文稿"
            disabled={!srtPath}
            onClick={() => setSrtOpen(true)}
          />
          <Button
            type="text"
            icon={<FolderOpenOutlined />}
            size="small"
            title={fileMissing ? '文件已丢失' : '打开文件夹'}
            disabled={!record.filepath || fileMissing}
            onClick={() => {
              if (record.filepath) window.api.showItemInFolder(record.filepath)
            }}
          />
          <Popconfirm
            title="确定删除这条记录？"
            description="仅删除记录，不会删除已下载的文件"
            onConfirm={() => removeRecord(record.taskId)}
            okText="删除"
            cancelText="取消"
          >
            <Button
              type="text"
              danger
              icon={<DeleteOutlined />}
              size="small"
              title="删除记录"
            />
          </Popconfirm>
        </Space>
      </div>
      {framesOpen && record.filepath && (
        <ExtractFramesModal
          open={framesOpen}
          videoPath={record.filepath}
          videoTitle={record.title}
          onClose={() => setFramesOpen(false)}
        />
      )}
      {transcribeOpen && record.filepath && (
        <TranscribeModal
          open={transcribeOpen}
          videoPath={record.filepath}
          videoTitle={record.title}
          onClose={() => setTranscribeOpen(false)}
        />
      )}
      {srtOpen && srtPath && (
        <SrtViewer
          open={srtOpen}
          srtPath={srtPath}
          title={record.title}
          onClose={() => setSrtOpen(false)}
        />
      )}
    </Card>
  )
}

// ---- 失败记录卡片 ----

interface FailedCardProps {
  record: FailedRecord
  selected: boolean
  onToggle: (taskId: string) => void
}

function isCookieError(msg: string): boolean {
  return /登录|会员|Cookie/i.test(msg)
}

const FailedRecordCard: React.FC<FailedCardProps> = ({ record, selected, onToggle }) => {
  const removeFailedRecord = useDownloadStore((s) => s.removeFailedRecord)
  const needsLogin = isCookieError(record.errorMessage)

  return (
    <Card
      size="small"
      style={{
        marginBottom: 10,
        borderRadius: 6,
        borderLeft: '3px solid #ff4d4f',
        background: selected ? '#fff1f0' : undefined,
      }}
      styles={{ body: { padding: '12px 16px' } }}
    >
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <Checkbox
          checked={selected}
          onChange={() => onToggle(record.taskId)}
          style={{ marginTop: 4 }}
        />
        <Thumbnail src={record.thumbnail} size={56} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontWeight: 600,
              fontSize: 13,
              color: '#1a1a1a',
              marginBottom: 4,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            title={record.title}
          >
            {record.title || '未知标题'}
          </div>
          <Space size={8} style={{ marginBottom: 4 }}>
            <Tag color="blue" style={{ fontSize: 11 }}>{record.platform}</Tag>
            <span style={{ color: '#999', fontSize: 11 }}>{formatTime(record.failedAt)}</span>
          </Space>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
            <div
              style={{
                color: '#ff4d4f',
                fontSize: 12,
                lineHeight: '1.4',
                maxHeight: 40,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                flex: 1,
              }}
              title={record.errorMessage}
            >
              <WarningOutlined style={{ marginRight: 4 }} />
              {record.errorMessage || '未知错误'}
            </div>
            {needsLogin && (
              <Tooltip title="在应用内登录 YouTube，刷新 Cookie 后重试">
                <Button
                  size="small"
                  type="link"
                  icon={<LoginOutlined />}
                  style={{ fontSize: 11, padding: '0 4px', flexShrink: 0 }}
                  onClick={() => window.api.openLoginWindow().catch(() => {})}
                >
                  重新登录
                </Button>
              </Tooltip>
            )}
          </div>
        </div>
        <Space size={4} direction="vertical">
          <Button
            type="text"
            icon={<ReloadOutlined />}
            size="small"
            title="重新下载"
            onClick={() => {
              useDownloadStore.getState().setRetryUrl(record.url)
            }}
          />
          <Popconfirm
            title="确定删除这条失败记录？"
            onConfirm={() => removeFailedRecord(record.taskId)}
            okText="删除"
            cancelText="取消"
          >
            <Button
              type="text"
              danger
              icon={<DeleteOutlined />}
              size="small"
              title="删除记录"
            />
          </Popconfirm>
        </Space>
      </div>
    </Card>
  )
}

// ---- 筛选工具栏 ----

const FilterBar: React.FC = () => {
  const filterKeyword = useDownloadStore((s) => s.filterKeyword)
  const filterPlatform = useDownloadStore((s) => s.filterPlatform)
  const filterDateRange = useDownloadStore((s) => s.filterDateRange)
  const setFilterKeyword = useDownloadStore((s) => s.setFilterKeyword)
  const setFilterPlatform = useDownloadStore((s) => s.setFilterPlatform)
  const setFilterDateRange = useDownloadStore((s) => s.setFilterDateRange)

  const platformOptions = [
    { value: '__all__', label: '全部平台' },
    ...PLATFORM_OPTIONS.map((p) => ({ value: p, label: p })),
  ]

  const rangeValue: [Dayjs, Dayjs] | null = filterDateRange
    ? [dayjs(filterDateRange[0]), dayjs(filterDateRange[1])]
    : null

  return (
    <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
      <Input
        placeholder="搜索标题关键词…"
        prefix={<SearchOutlined style={{ color: '#bbb' }} />}
        value={filterKeyword}
        onChange={(e) => setFilterKeyword(e.target.value)}
        allowClear
        style={{ flex: 1, minWidth: 200, maxWidth: 320, borderRadius: 6 }}
      />
      <Select
        value={filterPlatform ?? '__all__'}
        onChange={(v) => setFilterPlatform(v === '__all__' ? null : v)}
        options={platformOptions}
        style={{ width: 130 }}
        suffixIcon={<FilterOutlined />}
      />
      <DatePicker.RangePicker
        value={rangeValue}
        onChange={(dates) => {
          if (!dates || !dates[0] || !dates[1]) {
            setFilterDateRange(null)
          } else {
            setFilterDateRange([
              dates[0].startOf('day').valueOf(),
              dates[1].endOf('day').valueOf(),
            ])
          }
        }}
        placeholder={['开始日期', '结束日期']}
        style={{ borderRadius: 6 }}
        allowClear
      />
    </div>
  )
}

// ---- 批量操作栏 ----

interface BatchBarProps {
  selectedCount: number
  totalCount: number
  allSelected: boolean
  onToggleAll: () => void
  onDeleteSelected: () => void
  onClearAll: () => void
  type: 'completed' | 'failed'
  onRetrySelected?: () => void
  onRetryAll?: () => void
  onExport?: (format: 'json' | 'csv', scope: 'selected' | 'all') => void
  onLocalTranscribe?: () => void
}

const BatchActionBar: React.FC<BatchBarProps> = ({
  selectedCount, totalCount, allSelected,
  onToggleAll, onDeleteSelected, onClearAll, type,
  onRetrySelected, onRetryAll, onExport, onLocalTranscribe,
}) => {
  if (totalCount === 0) return null

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '8px 12px',
        marginBottom: 10,
        background: '#fafafa',
        borderRadius: 6,
        border: '1px solid #f0f0f0',
      }}
    >
      <Checkbox
        checked={allSelected && totalCount > 0}
        indeterminate={selectedCount > 0 && !allSelected}
        onChange={onToggleAll}
      >
        <span style={{ fontSize: 13, color: '#666' }}>
          {selectedCount > 0 ? `已选 ${selectedCount} 条` : '全选'}
        </span>
      </Checkbox>

      <div style={{ flex: 1 }} />

      {/* 已完成列表专属：导出 */}
      {type === 'completed' && onExport && (
        <Dropdown
          menu={{
            items: [
              { key: 'json-all', label: `导出全部 (${totalCount}) · JSON` },
              { key: 'csv-all', label: `导出全部 (${totalCount}) · CSV` },
              { type: 'divider' as const },
              {
                key: 'json-selected',
                label: `导出选中 (${selectedCount}) · JSON`,
                disabled: selectedCount === 0,
              },
              {
                key: 'csv-selected',
                label: `导出选中 (${selectedCount}) · CSV`,
                disabled: selectedCount === 0,
              },
            ],
            onClick: ({ key }) => {
              const [fmt, scope] = key.split('-') as ['json' | 'csv', 'selected' | 'all']
              onExport(fmt, scope)
            },
          }}
        >
          <Button size="small" icon={<ExportOutlined />}>
            导出
          </Button>
        </Dropdown>
      )}

      {/* 已完成列表专属：本地音频转写 */}
      {type === 'completed' && onLocalTranscribe && (
        <Tooltip title="选择本地音频文件（mp3/m4a/wav）进行 Whisper 转写">
          <Button size="small" icon={<AudioOutlined />} onClick={onLocalTranscribe}>
            本地音频转写
          </Button>
        </Tooltip>
      )}

      {/* 失败列表专属：重试按钮 */}
      {type === 'failed' && onRetrySelected && selectedCount > 0 && (
        <Button
          size="small"
          icon={<ReloadOutlined />}
          onClick={onRetrySelected}
          title="将选中的失败任务加入批量下载"
        >
          重试选中 ({selectedCount})
        </Button>
      )}
      {type === 'failed' && onRetryAll && (
        <Button
          size="small"
          icon={<ReloadOutlined />}
          onClick={onRetryAll}
          title="将全部失败任务加入批量下载"
        >
          全部重试 ({totalCount})
        </Button>
      )}

      {selectedCount > 0 && (
        <Popconfirm
          title={`确定删除选中的 ${selectedCount} 条记录？`}
          description={type === 'completed' ? '仅删除记录，不会删除已下载的文件' : undefined}
          onConfirm={onDeleteSelected}
          okText="删除"
          cancelText="取消"
          okButtonProps={{ danger: true }}
        >
          <Button
            size="small"
            danger
            icon={<DeleteOutlined />}
          >
            删除选中 ({selectedCount})
          </Button>
        </Popconfirm>
      )}

      <Popconfirm
        title={`确定清空全部 ${totalCount} 条${type === 'completed' ? '已完成' : '失败'}记录？`}
        description={type === 'completed' ? '仅删除记录，不会删除已下载的文件' : '此操作不可恢复'}
        onConfirm={onClearAll}
        okText="全部清空"
        cancelText="取消"
        okButtonProps={{ danger: true }}
      >
        <Button
          size="small"
          icon={<ClearOutlined />}
        >
          清空全部
        </Button>
      </Popconfirm>
    </div>
  )
}

// ---- 筛选逻辑 ----

function matchesFilter(
  item: { title: string; platform: string; tags?: string[]; ts?: number },
  keyword: string,
  platform: string | null,
  dateRange: [number, number] | null,
): boolean {
  if (platform && item.platform !== platform) return false
  if (keyword) {
    const kw = keyword.toLowerCase()
    const titleHit = item.title.toLowerCase().includes(kw)
    const tagHit = (item.tags ?? []).some((t) => t.toLowerCase().includes(kw))
    if (!titleHit && !tagHit) return false
  }
  if (dateRange && item.ts != null) {
    if (item.ts < dateRange[0] || item.ts > dateRange[1]) return false
  }
  return true
}

// ---- 空状态 ----

const EmptyState: React.FC<{ description: string; hasFilter: boolean }> = ({ description, hasFilter }) => (
  <Card style={{ borderRadius: 8 }}>
    <Empty
      description={hasFilter ? '没有匹配的记录' : description}
      image={Empty.PRESENTED_IMAGE_SIMPLE}
    />
  </Card>
)

// ---- 选择 Hook ----

function useSelection(ids: string[]) {
  const [selected, setSelected] = useState<Set<string>>(new Set())

  // 清理已不存在的选中项
  const validSelected = useMemo(() => {
    const idSet = new Set(ids)
    const cleaned = new Set<string>()
    for (const id of selected) {
      if (idSet.has(id)) cleaned.add(id)
    }
    return cleaned
  }, [selected, ids])

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const toggleAll = useCallback(() => {
    if (validSelected.size === ids.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(ids))
    }
  }, [validSelected.size, ids])

  const clear = useCallback(() => setSelected(new Set()), [])

  return {
    selected: validSelected,
    toggle,
    toggleAll,
    clear,
    allSelected: ids.length > 0 && validSelected.size === ids.length,
  }
}

// ---- 主页面 ----

type TabKey = 'active' | 'completed' | 'failed'

const DownloadList: React.FC = () => {
  const [tab, setTab] = useState<TabKey>('active')
  const activeTasks = useDownloadStore((s) => s.activeTasks)
  const completedRecords = useDownloadStore((s) => s.completedRecords)
  const failedRecords = useDownloadStore((s) => s.failedRecords)
  const filterKeyword = useDownloadStore((s) => s.filterKeyword)
  const filterPlatform = useDownloadStore((s) => s.filterPlatform)
  const filterDateRange = useDownloadStore((s) => s.filterDateRange)
  const removeRecord = useDownloadStore((s) => s.removeRecord)
  const removeFailedRecord = useDownloadStore((s) => s.removeFailedRecord)
  const clearAllCompleted = useDownloadStore((s) => s.clearAllCompleted)
  const clearAllFailed = useDownloadStore((s) => s.clearAllFailed)
  const commitBatchUrls = useDownloadStore((s) => s.commitBatchUrls)

  const hasFilter = !!filterKeyword || !!filterPlatform || !!filterDateRange

  // 派生筛选结果
  const filteredActive = useMemo(
    () => activeTasks.filter((t) => matchesFilter({ ...t, ts: t.startedAt }, filterKeyword, filterPlatform, null)),
    [activeTasks, filterKeyword, filterPlatform],
  )
  const filteredCompleted = useMemo(
    () => completedRecords.filter((r) => matchesFilter({ ...r, ts: r.completedAt }, filterKeyword, filterPlatform, filterDateRange)),
    [completedRecords, filterKeyword, filterPlatform, filterDateRange],
  )
  const filteredFailed = useMemo(
    () => failedRecords.filter((r) => matchesFilter({ ...r, ts: r.failedAt }, filterKeyword, filterPlatform, filterDateRange)),
    [failedRecords, filterKeyword, filterPlatform, filterDateRange],
  )

  // 选择状态
  const completedIds = useMemo(() => filteredCompleted.map((r) => r.taskId), [filteredCompleted])
  const failedIds = useMemo(() => filteredFailed.map((r) => r.taskId), [filteredFailed])
  const completedSel = useSelection(completedIds)
  const failedSel = useSelection(failedIds)

  // 批量删除
  const handleDeleteSelectedCompleted = useCallback(() => {
    for (const id of completedSel.selected) {
      removeRecord(id)
    }
    completedSel.clear()
  }, [completedSel, removeRecord])

  const handleDeleteSelectedFailed = useCallback(() => {
    for (const id of failedSel.selected) {
      removeFailedRecord(id)
    }
    failedSel.clear()
  }, [failedSel, removeFailedRecord])

  const handleClearAllCompleted = useCallback(() => {
    clearAllCompleted()
    completedSel.clear()
  }, [clearAllCompleted, completedSel])

  const handleClearAllFailed = useCallback(() => {
    clearAllFailed()
    failedSel.clear()
  }, [clearAllFailed, failedSel])

  const handleRetrySelectedFailed = useCallback(() => {
    const urls = filteredFailed
      .filter((r) => failedSel.selected.has(r.taskId))
      .map((r) => r.url)
    if (urls.length > 0) commitBatchUrls(urls)
  }, [filteredFailed, failedSel.selected, commitBatchUrls])

  const handleRetryAllFailed = useCallback(() => {
    const urls = filteredFailed.map((r) => r.url)
    if (urls.length > 0) commitBatchUrls(urls)
  }, [filteredFailed, commitBatchUrls])

  // 文件存在性检测：completedRecords 变化时批量探测一次
  const [fileExists, setFileExists] = useState<Record<string, boolean>>({})
  useEffect(() => {
    const paths = Array.from(
      new Set(
        completedRecords
          .map((r) => r.filepath)
          .filter((p): p is string => typeof p === 'string' && p.length > 0),
      ),
    )
    if (paths.length === 0) {
      setFileExists({})
      return
    }
    let cancelled = false
    window.api.checkPaths(paths).then((res) => {
      if (!cancelled) setFileExists(res ?? {})
    }).catch(() => {})
    return () => { cancelled = true }
  }, [completedRecords])

  const [localTranscribePath, setLocalTranscribePath] = useState<string | null>(null)
  const handleLocalTranscribe = async () => {
    const file = await window.api.selectFile([
      { name: '音频/视频文件', extensions: ['mp3', 'm4a', 'wav', 'aac', 'ogg', 'flac', 'mp4', 'mkv', 'webm'] },
    ])
    if (file) setLocalTranscribePath(file)
  }

  const [exportMsgApi, exportCtxHolder] = message.useMessage()
  const handleExportCompleted = useCallback(
    (format: 'json' | 'csv', scope: 'selected' | 'all') => {
      const records =
        scope === 'selected'
          ? filteredCompleted.filter((r) => completedSel.selected.has(r.taskId))
          : filteredCompleted
      if (records.length === 0) {
        exportMsgApi.warning(scope === 'selected' ? '请先勾选要导出的记录' : '当前没有可导出的记录')
        return
      }
      try {
        exportRecords(records, format)
        exportMsgApi.success(`已导出 ${records.length} 条记录`)
      } catch (err) {
        exportMsgApi.error(`导出失败：${(err as Error).message}`)
      }
    },
    [filteredCompleted, completedSel.selected, exportMsgApi],
  )

  return (
    <div style={{ padding: 24 }}>
      {exportCtxHolder}
      {localTranscribePath && (
        <TranscribeModal
          open={true}
          videoPath={localTranscribePath}
          videoTitle={localTranscribePath.split(/[\\/]/).pop()}
          onClose={() => setLocalTranscribePath(null)}
        />
      )}
      {/* 标题 */}
      <h2
        style={{
          fontSize: 26,
          fontWeight: 700,
          background: 'linear-gradient(90deg, #1677ff, #4096ff)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          marginBottom: 4,
        }}
      >
        下载列表
      </h2>
      <p style={{ color: '#999', marginBottom: 20, fontSize: 13 }}>
        查看当前下载任务和历史下载记录
      </p>

      {/* 搜索 + 平台筛选 */}
      <FilterBar />

      {/* Tab */}
      <div style={{ marginBottom: 20 }}>
        <Segmented
          options={[
            {
              label: `下载中${activeTasks.length ? ` (${hasFilter ? `${filteredActive.length}/` : ''}${activeTasks.length})` : ''}`,
              value: 'active',
            },
            {
              label: `已完成${completedRecords.length ? ` (${hasFilter ? `${filteredCompleted.length}/` : ''}${completedRecords.length})` : ''}`,
              value: 'completed',
            },
            {
              label: `失败${failedRecords.length ? ` (${hasFilter ? `${filteredFailed.length}/` : ''}${failedRecords.length})` : ''}`,
              value: 'failed',
            },
          ]}
          value={tab}
          onChange={(v) => setTab(v as TabKey)}
          style={{ borderRadius: 8 }}
          size="middle"
        />
      </div>

      {/* 下载中 */}
      {tab === 'active' && (
        <div>
          {filteredActive.length === 0 ? (
            <EmptyState description="当前没有正在下载的任务" hasFilter={hasFilter && activeTasks.length > 0} />
          ) : (
            filteredActive.map((task) => (
              <ActiveTaskCard key={task.taskId} task={task} />
            ))
          )}
        </div>
      )}

      {/* 已完成 */}
      {tab === 'completed' && (
        <div>
          <BatchActionBar
            selectedCount={completedSel.selected.size}
            totalCount={filteredCompleted.length}
            allSelected={completedSel.allSelected}
            onToggleAll={completedSel.toggleAll}
            onDeleteSelected={handleDeleteSelectedCompleted}
            onClearAll={handleClearAllCompleted}
            type="completed"
            onExport={handleExportCompleted}
            onLocalTranscribe={handleLocalTranscribe}
          />
          {filteredCompleted.length === 0 ? (
            <EmptyState description="留下你的第一个下载足迹吧" hasFilter={hasFilter && completedRecords.length > 0} />
          ) : (
            filteredCompleted.map((record) => (
              <CompletedRecordCard
                key={record.taskId}
                record={record}
                selected={completedSel.selected.has(record.taskId)}
                onToggle={completedSel.toggle}
                fileMissing={
                  record.filepath
                    ? fileExists[record.filepath] === false
                    : undefined
                }
              />
            ))
          )}
        </div>
      )}

      {/* 失败 */}
      {tab === 'failed' && (
        <div>
          <BatchActionBar
            selectedCount={failedSel.selected.size}
            totalCount={filteredFailed.length}
            allSelected={failedSel.allSelected}
            onToggleAll={failedSel.toggleAll}
            onDeleteSelected={handleDeleteSelectedFailed}
            onClearAll={handleClearAllFailed}
            type="failed"
            onRetrySelected={handleRetrySelectedFailed}
            onRetryAll={handleRetryAllFailed}
          />
          {filteredFailed.length === 0 ? (
            <EmptyState description="非常好，尚未有任务失败" hasFilter={hasFilter && failedRecords.length > 0} />
          ) : (
            filteredFailed.map((record) => (
              <FailedRecordCard
                key={record.taskId}
                record={record}
                selected={failedSel.selected.has(record.taskId)}
                onToggle={failedSel.toggle}
              />
            ))
          )}
        </div>
      )}
    </div>
  )
}

export default DownloadList
