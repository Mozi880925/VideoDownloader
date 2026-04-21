import React, { useState, useMemo, useCallback } from 'react'
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
} from 'antd'
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
} from '@ant-design/icons'
import {
  useDownloadStore,
  PLATFORM_OPTIONS,
  type ActiveTask,
  type CompletedRecord,
  type FailedRecord,
} from '../../store/downloadStore'

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

// ---- 已完成记录行 ----

interface CompletedCardProps {
  record: CompletedRecord
  selected: boolean
  onToggle: (taskId: string) => void
}

const CompletedRecordCard: React.FC<CompletedCardProps> = ({ record, selected, onToggle }) => {
  const removeRecord = useDownloadStore((s) => s.removeRecord)

  return (
    <Card
      size="small"
      style={{
        marginBottom: 10,
        borderRadius: 6,
        background: selected ? '#f0f5ff' : undefined,
        borderColor: selected ? '#91caff' : undefined,
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
          <Space size={8}>
            <Tag color="blue" style={{ fontSize: 11 }}>{record.platform}</Tag>
            <span style={{ color: '#999', fontSize: 11 }}>{formatTime(record.completedAt)}</span>
          </Space>
        </div>
        <Space size={4}>
          <Button
            type="text"
            icon={<PlayCircleOutlined />}
            size="small"
            title="打开文件"
            onClick={() => {
              if (record.filepath) window.api.openFile(record.filepath)
            }}
          />
          <Button
            type="text"
            icon={<FolderOpenOutlined />}
            size="small"
            title="打开文件夹"
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
    </Card>
  )
}

// ---- 失败记录卡片 ----

interface FailedCardProps {
  record: FailedRecord
  selected: boolean
  onToggle: (taskId: string) => void
}

const FailedRecordCard: React.FC<FailedCardProps> = ({ record, selected, onToggle }) => {
  const removeFailedRecord = useDownloadStore((s) => s.removeFailedRecord)

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
          <div
            style={{
              color: '#ff4d4f',
              fontSize: 12,
              lineHeight: '1.4',
              maxHeight: 40,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
            title={record.errorMessage}
          >
            <WarningOutlined style={{ marginRight: 4 }} />
            {record.errorMessage || '未知错误'}
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
  const setFilterKeyword = useDownloadStore((s) => s.setFilterKeyword)
  const setFilterPlatform = useDownloadStore((s) => s.setFilterPlatform)

  const platformOptions = [
    { value: '__all__', label: '全部平台' },
    ...PLATFORM_OPTIONS.map((p) => ({ value: p, label: p })),
  ]

  return (
    <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
      <Input
        placeholder="搜索标题关键词…"
        prefix={<SearchOutlined style={{ color: '#bbb' }} />}
        value={filterKeyword}
        onChange={(e) => setFilterKeyword(e.target.value)}
        allowClear
        style={{ flex: 1, maxWidth: 360, borderRadius: 6 }}
      />
      <Select
        value={filterPlatform ?? '__all__'}
        onChange={(v) => setFilterPlatform(v === '__all__' ? null : v)}
        options={platformOptions}
        style={{ width: 140 }}
        suffixIcon={<FilterOutlined />}
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
}

const BatchActionBar: React.FC<BatchBarProps> = ({
  selectedCount, totalCount, allSelected,
  onToggleAll, onDeleteSelected, onClearAll, type,
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
  item: { title: string; platform: string },
  keyword: string,
  platform: string | null,
): boolean {
  if (platform && item.platform !== platform) return false
  if (keyword) {
    const kw = keyword.toLowerCase()
    if (!item.title.toLowerCase().includes(kw)) return false
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
  const removeRecord = useDownloadStore((s) => s.removeRecord)
  const removeFailedRecord = useDownloadStore((s) => s.removeFailedRecord)
  const clearAllCompleted = useDownloadStore((s) => s.clearAllCompleted)
  const clearAllFailed = useDownloadStore((s) => s.clearAllFailed)

  const hasFilter = !!filterKeyword || !!filterPlatform

  // 派生筛选结果
  const filteredActive = useMemo(
    () => activeTasks.filter((t) => matchesFilter(t, filterKeyword, filterPlatform)),
    [activeTasks, filterKeyword, filterPlatform],
  )
  const filteredCompleted = useMemo(
    () => completedRecords.filter((r) => matchesFilter(r, filterKeyword, filterPlatform)),
    [completedRecords, filterKeyword, filterPlatform],
  )
  const filteredFailed = useMemo(
    () => failedRecords.filter((r) => matchesFilter(r, filterKeyword, filterPlatform)),
    [failedRecords, filterKeyword, filterPlatform],
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

  return (
    <div style={{ padding: 24 }}>
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
