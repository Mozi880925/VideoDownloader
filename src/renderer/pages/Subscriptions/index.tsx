import React, { useEffect, useState, useCallback } from 'react'
import {
  Card,
  Button,
  Input,
  Space,
  Tag,
  Empty,
  Switch,
  Select,
  Popconfirm,
  message,
  Modal,
  Badge,
  Tooltip,
  Spin,
  Popover,
  AutoComplete,
} from 'antd'
import {
  PlusOutlined,
  ReloadOutlined,
  DeleteOutlined,
  LinkOutlined,
  EyeOutlined,
  DownloadOutlined,
  ClockCircleOutlined,
  BellOutlined,
  AppstoreOutlined,
  FireOutlined,
  PushpinOutlined,
  PushpinFilled,
  FolderOutlined,
} from '@ant-design/icons'
import { useDownloadStore } from '../../store/downloadStore'
import VideoListPicker from '../../components/VideoListPicker'
import type { CheckInterval } from '../../../shared/types'

// ---- 工具函数 ----

function formatTime(ts: number): string {
  if (!ts) return '从未'
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

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

// ---- 单条视频行 ----

interface VideoRowProps {
  v: NewVideoItem
  onDownload: (url: string) => void
  onDismiss?: (videoId: string, channelId: string) => void
}

const VideoRow: React.FC<VideoRowProps> = ({ v, onDownload, onDismiss }) => {
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
        opacity: isNew ? 1 : 0.8,
        transition: 'opacity 0.2s',
      }}
    >
      {/* 缩略图 */}
      <div
        style={{
          width: 88,
          height: 50,
          borderRadius: 4,
          overflow: 'hidden',
          background: '#e8e8e8',
          flexShrink: 0,
          position: 'relative',
        }}
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

      {/* 标题 + 日期 */}
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
          }}
          title={v.title}
        >
          {isNew && (
            <Tag
              color="blue"
              style={{ fontSize: 10, padding: '0 4px', marginRight: 4, lineHeight: '16px', height: 16 }}
            >
              新
            </Tag>
          )}
          {v.title}
        </div>
        <div style={{ fontSize: 11, color: '#aaa' }}>
          {formatUploadDate(v.uploadDate)}
        </div>
      </div>

      {/* 操作按钮 */}
      <Space size={2} style={{ flexShrink: 0, alignSelf: 'center' }}>
        <Tooltip title="加入批量下载">
          <Button
            size="small"
            type="text"
            icon={<DownloadOutlined />}
            onClick={() => onDownload(v.url)}
          />
        </Tooltip>
        <Tooltip title="在浏览器打开">
          <Button
            size="small"
            type="text"
            icon={<LinkOutlined />}
            onClick={() => window.open(v.url, '_blank')}
          />
        </Tooltip>
        {isNew && onDismiss && (
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

// ---- 分组编辑器（Popover 形式） ----

interface GroupEditorProps {
  current: string
  knownGroups: string[]
  onSave: (groupName: string) => void
}

const GroupEditor: React.FC<GroupEditorProps> = ({ current, knownGroups, onSave }) => {
  const [open, setOpen] = useState(false)
  const [val, setVal] = useState(current)
  useEffect(() => { setVal(current) }, [current, open])

  return (
    <Popover
      trigger="click"
      open={open}
      onOpenChange={setOpen}
      content={
        <div style={{ width: 220 }}>
          <div style={{ fontSize: 12, color: '#888', marginBottom: 6 }}>所属分组</div>
          <AutoComplete
            value={val}
            onChange={setVal}
            options={knownGroups.filter((g) => g).map((g) => ({ value: g }))}
            placeholder="输入或选择分组（留空 = 未分组）"
            style={{ width: '100%' }}
            allowClear
          />
          <div style={{ marginTop: 8, display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
            <Button size="small" onClick={() => setOpen(false)}>取消</Button>
            <Button
              size="small"
              type="primary"
              onClick={() => {
                onSave((val ?? '').trim())
                setOpen(false)
              }}
            >
              保存
            </Button>
          </div>
        </div>
      }
    >
      <Tooltip title={current ? `分组：${current}` : '设置分组'}>
        <Button
          size="small"
          icon={<FolderOutlined />}
          type={current ? 'default' : 'text'}
        >
          {current || '分组'}
        </Button>
      </Tooltip>
    </Popover>
  )
}

// ---- 主页面 ----

const Subscriptions: React.FC = () => {
  const [subs, setSubs] = useState<ChannelSubscription[]>([])
  // 所有状态的视频（new + seen），用于卡片展示
  const [channelVideos, setChannelVideos] = useState<NewVideoItem[]>([])
  const [loading, setLoading] = useState(false)
  const [checkingAll, setCheckingAll] = useState(false)
  const [checkingSubId, setCheckingSubId] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [addUrl, setAddUrl] = useState('')
  const [addName, setAddName] = useState('')
  const [adding, setAdding] = useState(false)
  const [viewSub, setViewSub] = useState<ChannelSubscription | null>(null)
  // 每个频道是否展开视频列表
  const [expandedChannels, setExpandedChannels] = useState<Set<string>>(new Set())

  const interval = useDownloadStore((s) => s.appSettings.subscriptionCheckInterval || '6h')
  const updateSettings = useDownloadStore((s) => s.updateSettings)
  const commitBatchUrls = useDownloadStore((s) => s.commitBatchUrls)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const [list, allVids] = await Promise.all([
        window.api.subList(),
        window.api.subListNewVideos(),   // 返回所有状态，不过滤
      ])
      setSubs(list)
      setChannelVideos(allVids)          // 包含 new + seen
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  useEffect(() => {
    const off = window.api.onSubSchedulerTick(() => { refresh() })
    return () => off()
  }, [refresh])

  // 按频道分组所有视频，最多保留最近 10 条
  const videosByChannel = channelVideos.reduce<Record<string, NewVideoItem[]>>((acc, v) => {
    if (!acc[v.channelId]) acc[v.channelId] = []
    acc[v.channelId].push(v)
    return acc
  }, {})

  // 已知分组列表（去重 + 按字母序）
  const knownGroups = Array.from(
    new Set(subs.map((s) => s.group ?? '').filter((g) => g))
  ).sort((a, b) => a.localeCompare(b))

  // 把订阅按 pinned + group 分桶（pinned 单独成段，置顶不再受 group 影响）
  const grouped: { key: string; label: string; subs: ChannelSubscription[] }[] = []
  const pinned = subs.filter((s) => s.pinned)
  if (pinned.length > 0) grouped.push({ key: '__pinned__', label: '📌 置顶', subs: pinned })

  const nonPinned = subs.filter((s) => !s.pinned)
  const grpMap: Record<string, ChannelSubscription[]> = {}
  for (const s of nonPinned) {
    const k = s.group || '__ungrouped__'
    if (!grpMap[k]) grpMap[k] = []
    grpMap[k].push(s)
  }
  // 命名分组按字母序
  Object.keys(grpMap)
    .filter((k) => k !== '__ungrouped__')
    .sort((a, b) => a.localeCompare(b))
    .forEach((k) => grouped.push({ key: k, label: k, subs: grpMap[k] }))
  // 未分组放最后
  if (grpMap['__ungrouped__']) {
    grouped.push({ key: '__ungrouped__', label: '未分组', subs: grpMap['__ungrouped__'] })
  }

  const toggleExpand = (id: string) => {
    setExpandedChannels((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // ---- 操作 ----

  const handleAdd = async () => {
    const url = addUrl.trim()
    if (!url) { message.warning('请输入频道 URL'); return }
    setAdding(true)
    try {
      const r = await window.api.subAdd(url, addName.trim() || undefined)
      if (r.status === 'success') {
        message.success(`已添加：${r.data.name}`)
        setAddOpen(false)
        setAddUrl('')
        setAddName('')
        // 添加后自动展开新频道的视频列表
        setExpandedChannels((prev) => new Set([...prev, r.data.id]))
        await refresh()
      } else {
        message.error(r.errorMessage || '添加失败')
      }
    } finally {
      setAdding(false)
    }
  }

  const handleCheckOne = async (id: string) => {
    setCheckingSubId(id)
    try {
      const r = await window.api.subCheck(id)
      if (r.status === 'success') {
        if (r.data.length > 0) {
          message.success(`发现 ${r.data.length} 个新视频`)
          setExpandedChannels((prev) => new Set([...prev, id]))
        } else {
          message.info('没有新视频，已更新最近视频列表')
        }
        await refresh()
      } else {
        message.error(r.errorMessage || '检查失败')
      }
    } finally {
      setCheckingSubId(null)
    }
  }

  const handleCheckAll = async () => {
    if (subs.length === 0) return
    setCheckingAll(true)
    try {
      const results = await window.api.subCheckAll()
      const total = results.reduce((sum, r) => sum + r.newVideos.length, 0)
      const failed = results.filter((r) => r.err).length
      if (total > 0) {
        message.success(`检查完成：发现 ${total} 个新视频${failed ? `（${failed} 个失败）` : ''}`)
        // 有新视频的频道自动展开
        const withNew = results.filter((r) => r.newVideos.length > 0).map((r) => r.subId)
        setExpandedChannels((prev) => new Set([...prev, ...withNew]))
      } else if (failed > 0) {
        message.warning(`检查完成，但有 ${failed} 个失败`)
      } else {
        message.info('全部已是最新')
      }
      await refresh()
    } finally {
      setCheckingAll(false)
    }
  }

  const handleRemove = async (id: string) => {
    await window.api.subRemove(id)
    message.success('已删除')
    await refresh()
  }

  const handleToggle = async (id: string, enabled: boolean) => {
    await window.api.subToggle(id, enabled)
    setSubs((prev) => prev.map((s) => (s.id === id ? { ...s, enabled } : s)))
  }

  const handleTogglePin = async (id: string, pinned: boolean) => {
    await window.api.subSetPinned(id, pinned)
    await refresh()  // 刷新让排序立即生效
  }

  const handleSetGroup = async (id: string, groupName: string) => {
    await window.api.subSetGroup(id, groupName)
    await refresh()
  }

  const handleIntervalChange = async (val: CheckInterval) => {
    updateSettings({ subscriptionCheckInterval: val })
    await window.api.subSetInterval(val)
    message.success('检查间隔已更新')
  }

  const handleDismiss = async (videoId: string, channelId: string) => {
    await window.api.subDismissNewVideo(videoId, channelId)
    setChannelVideos((prev) =>
      prev.map((v) =>
        v.id === videoId && v.channelId === channelId ? { ...v, status: 'dismissed' as const } : v,
      ),
    )
    setSubs((prev) =>
      prev.map((s) => s.id === channelId ? { ...s, newCount: Math.max(0, s.newCount - 1) } : s),
    )
  }

  const handleClearChannel = async (channelId: string) => {
    await window.api.subClearNewVideos(channelId)
    setChannelVideos((prev) =>
      prev.map((v) =>
        v.channelId === channelId && v.status === 'new' ? { ...v, status: 'dismissed' as const } : v,
      ),
    )
    setSubs((prev) => prev.map((s) => s.id === channelId ? { ...s, newCount: 0 } : s))
  }

  const handleAddToBatch = (urls: string[]) => {
    if (urls.length === 0) return
    commitBatchUrls(urls)
    message.success(`已发送 ${urls.length} 个链接到批量下载`)
  }

  return (
    <div style={{ padding: 24 }}>
      {/* 标题 */}
      <div style={{ marginBottom: 24 }}>
        <h1
          style={{
            fontSize: 28, fontWeight: 700,
            background: 'linear-gradient(90deg, #1677ff, #4096ff)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            margin: 0,
          }}
        >
          频道订阅
        </h1>
        <p style={{ color: '#888', marginTop: 8, marginBottom: 0 }}>
          监控 YouTube 频道更新，新视频会通过桌面通知提醒你
        </p>
      </div>

      {/* 工具栏 */}
      <Card style={{ marginBottom: 16, borderRadius: 8 }} bodyStyle={{ padding: '12px 16px' }}>
        <Space size="middle" wrap>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setAddOpen(true)}>
            添加订阅
          </Button>
          <Button
            icon={<ReloadOutlined />}
            loading={checkingAll}
            disabled={subs.length === 0}
            onClick={handleCheckAll}
          >
            立即检查全部
          </Button>
          <span style={{ color: '#888' }}>
            <ClockCircleOutlined style={{ marginRight: 4 }} />自动检查间隔：
          </span>
          <Select
            value={interval}
            onChange={handleIntervalChange}
            style={{ width: 120 }}
            options={[
              { label: '关闭', value: 'off' },
              { label: '每小时', value: 'hourly' },
              { label: '每 6 小时', value: '6h' },
              { label: '每天', value: 'daily' },
            ]}
          />
        </Space>
      </Card>

      {/* 订阅列表 */}
      <Spin spinning={loading}>
        {subs.length === 0 ? (
          <Card style={{ borderRadius: 8 }}>
            <Empty description="还没有订阅，点击右上方「添加订阅」开始" />
          </Card>
        ) : (
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            {grouped.map((group) => (
              <div key={group.key}>
                {/* 分组标题（只有当存在多个分组或非默认未分组时才显示） */}
                {grouped.length > 1 && (
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: '#666',
                      marginBottom: 8,
                      paddingLeft: 4,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <span>{group.label}</span>
                    <span style={{ color: '#bbb', fontWeight: 400, fontSize: 12 }}>
                      ({group.subs.length})
                    </span>
                  </div>
                )}
                <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                  {group.subs.map((sub) => {
              const allVids = (videosByChannel[sub.id] || []).slice(0, 20)
              const newVids = allVids.filter((v) => v.status === 'new')
              const isExpanded = expandedChannels.has(sub.id)

              return (
                <Card
                  key={sub.id}
                  style={{
                    borderRadius: 8,
                    borderColor: sub.pinned ? '#ffc53d' : undefined,
                    background: sub.pinned ? '#fffbe6' : undefined,
                  }}
                  bodyStyle={{ padding: 16 }}
                  title={
                    <Space>
                      <Badge count={sub.newCount} offset={[0, 0]}>
                        <BellOutlined style={{ fontSize: 18, color: sub.newCount > 0 ? '#1677ff' : '#bbb' }} />
                      </Badge>
                      <span style={{ fontSize: 16, fontWeight: 600 }}>{sub.name}</span>
                      {sub.pinned && <Tag color="gold" icon={<PushpinFilled />}>置顶</Tag>}
                      {sub.group && <Tag color="default">{sub.group}</Tag>}
                      {!sub.enabled && <Tag color="default">已暂停</Tag>}
                    </Space>
                  }
                  extra={
                    <Space>
                      <Tooltip title={sub.enabled ? '暂停自动检查' : '恢复自动检查'}>
                        <Switch size="small" checked={sub.enabled} onChange={(v) => handleToggle(sub.id, v)} />
                      </Tooltip>
                      <Tooltip title={sub.pinned ? '取消置顶' : '置顶'}>
                        <Button
                          size="small"
                          icon={sub.pinned ? <PushpinFilled style={{ color: '#fa8c16' }} /> : <PushpinOutlined />}
                          onClick={() => handleTogglePin(sub.id, !sub.pinned)}
                        />
                      </Tooltip>
                      <GroupEditor
                        current={sub.group ?? ''}
                        knownGroups={knownGroups}
                        onSave={(g) => handleSetGroup(sub.id, g)}
                      />
                      <Button
                        size="small"
                        icon={<AppstoreOutlined />}
                        onClick={() => setViewSub(sub)}
                      >
                        查看全部视频
                      </Button>
                      <Button
                        size="small"
                        icon={<ReloadOutlined />}
                        loading={checkingSubId === sub.id}
                        onClick={() => handleCheckOne(sub.id)}
                      >
                        检查
                      </Button>
                      <Popconfirm
                        title="删除订阅？"
                        description="同时清除此频道的全部新视频记录"
                        okText="删除" cancelText="取消"
                        onConfirm={() => handleRemove(sub.id)}
                      >
                        <Button size="small" danger icon={<DeleteOutlined />}>删除</Button>
                      </Popconfirm>
                    </Space>
                  }
                >
                  {/* 基本信息 */}
                  <Space direction="vertical" size={4} style={{ width: '100%' }}>
                    <div style={{ color: '#888', fontSize: 12 }}>
                      <LinkOutlined style={{ marginRight: 4 }} />
                      <a href={sub.url} target="_blank" rel="noreferrer">{sub.url}</a>
                    </div>
                    <div style={{ color: '#888', fontSize: 12 }}>
                      <ClockCircleOutlined style={{ marginRight: 4 }} />
                      上次检查：{formatTime(sub.lastCheckedAt)}
                    </div>
                  </Space>

                  {/* 视频列表区域 */}
                  {allVids.length > 0 && (
                    <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px dashed #eee' }}>
                      {/* 区域头部 */}
                      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8, gap: 8 }}>
                        <span
                          style={{ fontSize: 12, color: '#666', cursor: 'pointer', userSelect: 'none' }}
                          onClick={() => toggleExpand(sub.id)}
                        >
                          {isExpanded ? '▾' : '▸'}{' '}
                          <strong>最近视频</strong>
                          <span style={{ color: '#aaa', marginLeft: 4 }}>({allVids.length} 条)</span>
                        </span>
                        {newVids.length > 0 && (
                          <Tag
                            color="blue"
                            icon={<FireOutlined />}
                            style={{ fontSize: 11, cursor: 'default' }}
                          >
                            {newVids.length} 条新视频
                          </Tag>
                        )}
                        {newVids.length > 0 && isExpanded && (
                          <Space size={4} style={{ marginLeft: 'auto' }}>
                            <Button
                              size="small"
                              type="link"
                              icon={<DownloadOutlined />}
                              style={{ padding: 0, fontSize: 12 }}
                              onClick={() => handleAddToBatch(newVids.map((v) => v.url))}
                            >
                              全部下载新视频
                            </Button>
                            <Button
                              size="small"
                              type="link"
                              icon={<EyeOutlined />}
                              style={{ padding: 0, fontSize: 12 }}
                              onClick={() => handleClearChannel(sub.id)}
                            >
                              全部标记已读
                            </Button>
                          </Space>
                        )}
                      </div>

                      {/* 视频行列表（展开时显示） */}
                      {isExpanded && (
                        <Space direction="vertical" size={6} style={{ width: '100%' }}>
                          {allVids.map((v) => (
                            <VideoRow
                              key={`${v.channelId}-${v.id}`}
                              v={v}
                              onDownload={(url) => handleAddToBatch([url])}
                              onDismiss={handleDismiss}
                            />
                          ))}
                        </Space>
                      )}
                    </div>
                  )}

                  {/* 无视频缓存时的提示 */}
                  {allVids.length === 0 && (
                    <div style={{ marginTop: 10, color: '#bbb', fontSize: 12, paddingTop: 10, borderTop: '1px dashed #eee' }}>
                      暂无视频缓存，点击「检查」拉取最新视频
                    </div>
                  )}
                </Card>
              )
            })}
                </Space>
              </div>
            ))}
          </Space>
        )}
      </Spin>

      {/* 添加订阅 Modal */}
      <Modal
        title="添加频道订阅"
        open={addOpen}
        onCancel={() => setAddOpen(false)}
        onOk={handleAdd}
        confirmLoading={adding}
        okText="添加"
        cancelText="取消"
      >
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <div>
            <div style={{ marginBottom: 6, color: '#666' }}>频道 URL</div>
            <Input
              placeholder="例：https://www.youtube.com/@channelName"
              value={addUrl}
              onChange={(e) => setAddUrl(e.target.value)}
              autoFocus
              onPressEnter={handleAdd}
            />
          </div>
          <div>
            <div style={{ marginBottom: 6, color: '#666' }}>
              自定义名称 <span style={{ color: '#bbb' }}>（可选，留空使用频道名）</span>
            </div>
            <Input
              placeholder="为这个订阅起一个名字"
              value={addName}
              onChange={(e) => setAddName(e.target.value)}
              onPressEnter={handleAdd}
            />
          </div>
          <div style={{ fontSize: 12, color: '#888', background: '#fafafa', padding: 8, borderRadius: 4 }}>
            添加时会立即拉取一次最新视频（约 20 条）并缓存展示。后续检查到的新视频会以蓝色高亮显示。
          </div>
        </Space>
      </Modal>

      {/* 查看全部视频 Modal */}
      <Modal
        title={viewSub ? `${viewSub.name} 的视频` : '频道视频'}
        open={!!viewSub}
        onCancel={() => setViewSub(null)}
        footer={null}
        width={920}
        destroyOnClose
        styles={{ body: { maxHeight: '70vh', overflowY: 'auto' } }}
      >
        {viewSub && (
          <VideoListPicker
            initialUrl={viewSub.url}
            autoFetch
            showUrlInput={false}
            defaultLimit={50}
          />
        )}
      </Modal>
    </div>
  )
}

export default Subscriptions
