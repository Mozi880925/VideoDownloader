import React, { useEffect, useState, useCallback, useMemo } from 'react'
import type { ChannelSubscription, NewVideoItem, TitleAnalysisResult, ChannelAnalysisResult, VideoTranscript } from '@shared/types'
import { AutoComplete, Button, Input, Modal, Select, Space, message } from 'antd'
import { ClockCircleOutlined, PlusOutlined } from '@ant-design/icons'
import { useDownloadStore, useSettingsStore } from '../../store/downloadStore'
import VideoListPicker from '../../components/VideoListPicker'
import type { CheckInterval } from '../../../shared/types'
import ChannelList from './ChannelList'
import VideoFeed, { type FeedFilter, type FeedSort, type FeedViewMode } from './VideoFeed'
import TitleAnalysisModal from './TitleAnalysisModal'
import TranscriptModal from './TranscriptModal'
import ChannelAnalysisModal from './ChannelAnalysisModal'

// ────────── 频道订阅（双栏布局：左侧频道列表 + 右侧视频流） ──────────

const Subscriptions: React.FC = () => {
  // ── 数据 ──
  const [subs, setSubs] = useState<ChannelSubscription[]>([])
  const [channelVideos, setChannelVideos] = useState<NewVideoItem[]>([])
  const [loading, setLoading] = useState(false)
  const [checkingAll, setCheckingAll] = useState(false)
  const [checkingSubId, setCheckingSubId] = useState<string | null>(null)

  // ── 视图状态 ──
  const [selectedChannelId, setSelectedChannelId] = useState<string>('all')
  const [filter, setFilter] = useState<FeedFilter>('all')
  const [sort, setSort] = useState<FeedSort>('date')
  const [viewMode, setViewMode] = useState<FeedViewMode>('list')
  const [paneCollapsed, setPaneCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem('vd_sub_pane_collapsed') === '1' } catch { return false }
  })
  const togglePaneCollapsed = () => setPaneCollapsed((prev) => {
    const next = !prev
    try { localStorage.setItem('vd_sub_pane_collapsed', next ? '1' : '0') } catch {}
    return next
  })

  // ── 弹窗 ──
  const [addOpen, setAddOpen] = useState(false)
  const [addUrl, setAddUrl] = useState('')
  const [addName, setAddName] = useState('')
  const [adding, setAdding] = useState(false)
  const [viewSub, setViewSub] = useState<ChannelSubscription | null>(null)
  const [groupEditSub, setGroupEditSub] = useState<ChannelSubscription | null>(null)
  const [groupVal, setGroupVal] = useState('')

  // ── AI 标题拆解 ──
  const [analyzeTarget, setAnalyzeTarget] = useState<NewVideoItem | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [analysisStage, setAnalysisStage] = useState('')
  const [analysisUsedOpening, setAnalysisUsedOpening] = useState(false)
  const [analysisFromCache, setAnalysisFromCache] = useState<{ auto: boolean; createdAt: number } | null>(null)
  const [analysisResult, setAnalysisResult] = useState<TitleAnalysisResult | null>(null)
  const [analysisError, setAnalysisError] = useState<string | null>(null)
  // 已有拆解记录的视频键（channelId|videoId），用于角标
  const [analyzedKeys, setAnalyzedKeys] = useState<Set<string>>(new Set())
  // 播放量日增（channelId|videoId → growth24h），快照不足两次的视频没有数据
  const [growthMap, setGrowthMap] = useState<Record<string, number>>({})

  // ── 频道标题规律 ──
  const [chanAnalyzeTarget, setChanAnalyzeTarget] = useState<ChannelSubscription | null>(null)
  const [chanAnalyzing, setChanAnalyzing] = useState(false)
  const [chanResult, setChanResult] = useState<ChannelAnalysisResult | null>(null)
  const [chanError, setChanError] = useState<string | null>(null)
  // 本次会话内的频道报告缓存（channelId → result），重开弹窗不重复扣 API
  const chanCacheRef = React.useRef<Record<string, ChannelAnalysisResult>>({})

  // ── 视频文案 ──
  const [transcriptTarget, setTranscriptTarget] = useState<NewVideoItem | null>(null)
  const [transcriptLoading, setTranscriptLoading] = useState(false)
  const [transcriptData, setTranscriptData] = useState<VideoTranscript | null>(null)
  const [transcriptError, setTranscriptError] = useState<string | null>(null)

  const llmConfig = useSettingsStore((s) => s.appSettings.llm)
  const interval = useSettingsStore((s) => s.appSettings.subscriptionCheckInterval || '6h')
  const updateSettings = useSettingsStore((s) => s.updateSettings)
  const commitBatchUrls = useDownloadStore((s) => s.commitBatchUrls)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const [list, allVids, keys, growth] = await Promise.all([
        window.api.subList(),
        window.api.subListNewVideos(),   // 返回所有状态（new + seen + dismissed）
        window.api.analysisKeys(),
        window.api.subGrowthStats(),
      ])
      setSubs(list)
      setChannelVideos(allVids)
      setAnalyzedKeys(new Set(keys.map((k) => `${k.channelId}|${k.videoId}`)))
      setGrowthMap(Object.fromEntries(growth.map((g) => [`${g.channelId}|${g.videoId}`, g.growth24h])))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  useEffect(() => {
    const off = window.api.onSubSchedulerTick(() => { refresh() })
    return () => off()
  }, [refresh])

  // 爆款自动拆解完成 → 提示 + 刷新角标
  useEffect(() => {
    const off = window.api.onAnalysisAutoDone((info) => {
      message.success(`已自动拆解爆款：${info.videoTitle}`, 5)
      setAnalyzedKeys((prev) => new Set(prev).add(`${info.channelId}|${info.videoId}`))
    })
    return () => off()
  }, [])

  // 选中的频道被删除后回退到「全部」
  useEffect(() => {
    if (selectedChannelId !== 'all' && subs.length > 0 && !subs.some((s) => s.id === selectedChannelId)) {
      setSelectedChannelId('all')
    }
  }, [subs, selectedChannelId])

  // ── 派生数据 ──

  // 按频道分组，每频道按发布日期降序保留最近 20 条
  const videosByChannel = useMemo(() => {
    const map: Record<string, NewVideoItem[]> = {}
    for (const v of channelVideos) {
      if (!map[v.channelId]) map[v.channelId] = []
      map[v.channelId].push(v)
    }
    const cmp = (a: NewVideoItem, b: NewVideoItem) => {
      const d = (b.uploadDate ?? '').localeCompare(a.uploadDate ?? '')
      return d !== 0 ? d : b.discoveredAt - a.discoveredAt
    }
    for (const k of Object.keys(map)) map[k] = map[k].sort(cmp).slice(0, 20)
    return map
  }, [channelVideos])

  // 爆款阈值：频道播放量中位数 × 2（中位数比均值更抗爆款值自身的拉高；样本 < 5 不判定）
  const hotThresholds = useMemo(() => {
    const map: Record<string, number> = {}
    for (const [cid, vids] of Object.entries(videosByChannel)) {
      const views = vids.map((v) => v.viewCount ?? 0).filter((n) => n > 0).sort((a, b) => a - b)
      if (views.length >= 5) map[cid] = views[Math.floor(views.length / 2)] * 2
    }
    return map
  }, [videosByChannel])

  // 爆款双信号：绝对值（播放量 ≥ 中位数×2）或增速（日增 ≥ 中位数一半，可在爬坡期提前预警）
  const isHot = useCallback((v: NewVideoItem) => {
    const t = hotThresholds[v.channelId]
    if (!t) return false
    if ((v.viewCount ?? 0) >= t) return true
    const g = growthMap[`${v.channelId}|${v.id}`]
    return g !== undefined && g >= Math.max(t / 4, 500)
  }, [hotThresholds, growthMap])

  const getGrowth = useCallback(
    (v: NewVideoItem) => growthMap[`${v.channelId}|${v.id}`],
    [growthMap],
  )

  const isAnalyzed = useCallback(
    (v: NewVideoItem) => analyzedKeys.has(`${v.channelId}|${v.id}`),
    [analyzedKeys],
  )

  // 当前作用域内的视频（全部聚合 或 单频道）
  const scopeVideos = useMemo(() => (
    selectedChannelId === 'all'
      ? Object.values(videosByChannel).flat()
      : videosByChannel[selectedChannelId] ?? []
  ), [videosByChannel, selectedChannelId])

  const counts = useMemo(() => ({
    all: scopeVideos.length,
    new: scopeVideos.filter((v) => v.status === 'new').length,
    hot: scopeVideos.filter(isHot).length,
  }), [scopeVideos, isHot])

  // 筛选 + 排序后的最终视频流
  const feedVideos = useMemo(() => {
    let vids = scopeVideos
    if (filter === 'new') vids = vids.filter((v) => v.status === 'new')
    else if (filter === 'hot') vids = vids.filter(isHot)
    const sorted = [...vids]
    if (sort === 'views') {
      sorted.sort((a, b) => (b.viewCount ?? 0) - (a.viewCount ?? 0))
    } else {
      sorted.sort((a, b) => {
        const d = (b.uploadDate ?? '').localeCompare(a.uploadDate ?? '')
        return d !== 0 ? d : b.discoveredAt - a.discoveredAt
      })
    }
    return sorted
  }, [scopeVideos, filter, sort, isHot])

  const channelNames = useMemo(() => {
    const m: Record<string, string> = {}
    for (const s of subs) m[s.id] = s.name
    return m
  }, [subs])

  const knownGroups = useMemo(() => (
    Array.from(new Set(subs.map((s) => s.group ?? '').filter(Boolean))).sort((a, b) => a.localeCompare(b))
  ), [subs])

  const totalNewCount = useMemo(() => subs.reduce((n, s) => n + s.newCount, 0), [subs])

  const selectedSub = selectedChannelId === 'all' ? undefined : subs.find((s) => s.id === selectedChannelId)
  const feedMode: 'all' | 'channel' = selectedChannelId === 'all' ? 'all' : 'channel'

  // ── 操作 ──

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
        setSelectedChannelId(r.data.id)   // 自动选中新频道
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
        if (r.data.length > 0) message.success(`发现 ${r.data.length} 个新视频`)
        else message.info('没有新视频，已更新最近视频列表')
        setSelectedChannelId(id)   // 检查哪个频道就切到哪个频道
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

  const handleRemove = (sub: ChannelSubscription) => {
    Modal.confirm({
      title: `删除订阅「${sub.name}」？`,
      content: '同时清除此频道缓存的全部视频记录',
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        await window.api.subRemove(sub.id)
        if (selectedChannelId === sub.id) setSelectedChannelId('all')
        message.success('已删除')
        await refresh()
      },
    })
  }

  const handleToggleEnabled = async (sub: ChannelSubscription) => {
    await window.api.subToggle(sub.id, !sub.enabled)
    setSubs((prev) => prev.map((s) => (s.id === sub.id ? { ...s, enabled: !sub.enabled } : s)))
  }

  const handleTogglePin = async (sub: ChannelSubscription) => {
    await window.api.subSetPinned(sub.id, !sub.pinned)
    await refresh()   // 刷新让左栏排序立即生效
  }

  const openGroupEditor = (sub: ChannelSubscription) => {
    setGroupEditSub(sub)
    setGroupVal(sub.group ?? '')
  }

  const handleSaveGroup = async () => {
    if (!groupEditSub) return
    await window.api.subSetGroup(groupEditSub.id, groupVal.trim())
    setGroupEditSub(null)
    await refresh()
  }

  const handleIntervalChange = async (val: CheckInterval) => {
    updateSettings({ subscriptionCheckInterval: val })  // 内部会同步到主进程重启调度器
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
      prev.map((s) => (s.id === channelId ? { ...s, newCount: Math.max(0, s.newCount - 1) } : s)),
    )
  }

  const handleMarkAllRead = async () => {
    if (selectedChannelId === 'all') {
      const targets = subs.filter((s) => s.newCount > 0)
      await Promise.all(targets.map((s) => window.api.subClearNewVideos(s.id)))
      setChannelVideos((prev) =>
        prev.map((v) => (v.status === 'new' ? { ...v, status: 'dismissed' as const } : v)),
      )
      setSubs((prev) => prev.map((s) => ({ ...s, newCount: 0 })))
    } else {
      await window.api.subClearNewVideos(selectedChannelId)
      setChannelVideos((prev) =>
        prev.map((v) =>
          v.channelId === selectedChannelId && v.status === 'new' ? { ...v, status: 'dismissed' as const } : v,
        ),
      )
      setSubs((prev) => prev.map((s) => (s.id === selectedChannelId ? { ...s, newCount: 0 } : s)))
    }
    message.success('已全部标记已读')
  }

  const handleDownloadVideo = (url: string) => {
    commitBatchUrls([url])
    message.success('已发送到批量下载')
  }

  const runAnalysis = useCallback(async (v: NewVideoItem, force = false) => {
    if (!llmConfig?.baseUrl?.trim() || !llmConfig?.apiKey?.trim() || !llmConfig?.model?.trim()) {
      message.warning('请先到「设置 → AI 分析（LLM）」配置 API')
      return
    }
    setAnalyzeTarget(v)
    setAnalyzing(true)
    setAnalysisResult(null)
    setAnalysisError(null)
    setAnalysisUsedOpening(false)
    setAnalysisFromCache(null)
    try {
      // 0) 已有拆解记录（手动或爆款自动）直接展示，不重复扣 API
      if (!force) {
        const cached = await window.api.analysisGet(v.id, v.channelId)
        if (cached) {
          setAnalysisResult(cached.result)
          setAnalysisUsedOpening(cached.usedOpening)
          setAnalysisFromCache({ auto: cached.auto, createdAt: cached.createdAt })
          setAnalyzing(false)
          return
        }
      }
      // 1) 拿开头文案（前 90 秒）：缓存命中直接用，否则现场免下载提一次字幕；失败不阻塞标题分析
      let openingText: string | undefined
      setAnalysisStage('正在获取字幕文案（不下载视频）…')
      try {
        let opening = await window.api.transcriptOpening(v.id, v.channelId)
        if (!opening) {
          const tr = await window.api.transcriptFetch({ id: v.id, channelId: v.channelId, url: v.url, title: v.title })
          if (tr.status === 'success') {
            opening = await window.api.transcriptOpening(v.id, v.channelId)
          }
        }
        openingText = opening || undefined
      } catch { /* 没有字幕时退化为纯标题分析 */ }
      setAnalysisUsedOpening(!!openingText)

      // 2) 同频道近期视频做对照（排除目标视频自身）
      const siblings = (videosByChannel[v.channelId] ?? [])
        .filter((s) => s.id !== v.id)
        .map((s) => ({ title: s.title, viewCount: s.viewCount }))

      setAnalysisStage(openingText ? 'AI 正在拆解标题和开头钩子…' : 'AI 正在拆解标题（未找到字幕，跳过开头分析）…')
      const r = await window.api.llmAnalyzeTitle(
        llmConfig,
        {
          title: v.title,
          viewCount: v.viewCount,
          channelName: channelNames[v.channelId],
          siblings,
          openingText,
        },
        { videoId: v.id, channelId: v.channelId },   // 主进程同步入库
      )
      if (r.status === 'success') {
        setAnalysisResult(r.data)
        setAnalyzedKeys((prev) => new Set(prev).add(`${v.channelId}|${v.id}`))
      } else {
        setAnalysisError(r.errorMessage || '分析失败')
      }
    } catch (err) {
      setAnalysisError(err instanceof Error ? err.message : String(err))
    } finally {
      setAnalyzing(false)
      setAnalysisStage('')
    }
  }, [llmConfig, videosByChannel, channelNames])

  const runChannelAnalysis = useCallback(async (sub: ChannelSubscription, force = false) => {
    if (!llmConfig?.baseUrl?.trim() || !llmConfig?.apiKey?.trim() || !llmConfig?.model?.trim()) {
      message.warning('请先到「设置 → AI 分析（LLM）」配置 API')
      return
    }
    setChanAnalyzeTarget(sub)
    setChanError(null)
    // 会话内缓存命中直接展示
    if (!force && chanCacheRef.current[sub.id]) {
      setChanResult(chanCacheRef.current[sub.id])
      setChanAnalyzing(false)
      return
    }
    setChanResult(null)
    setChanAnalyzing(true)
    try {
      const vids = (videosByChannel[sub.id] ?? []).map((v) => ({
        title: v.title,
        viewCount: v.viewCount,
        uploadDate: v.uploadDate,
      }))
      const r = await window.api.llmAnalyzeChannel(llmConfig, { channelName: sub.name, videos: vids })
      if (r.status === 'success') {
        setChanResult(r.data)
        chanCacheRef.current[sub.id] = r.data
      } else {
        setChanError(r.errorMessage || '分析失败')
      }
    } catch (err) {
      setChanError(err instanceof Error ? err.message : String(err))
    } finally {
      setChanAnalyzing(false)
    }
  }, [llmConfig, videosByChannel])

  const runTranscript = useCallback(async (v: NewVideoItem, force = false) => {
    setTranscriptTarget(v)
    setTranscriptLoading(true)
    setTranscriptData(null)
    setTranscriptError(null)
    try {
      if (!force) {
        const cached = await window.api.transcriptGet(v.id, v.channelId)
        if (cached) { setTranscriptData(cached); return }
      }
      const r = await window.api.transcriptFetch({ id: v.id, channelId: v.channelId, url: v.url, title: v.title }, force)
      if (r.status === 'success') setTranscriptData(r.data)
      else setTranscriptError(r.errorMessage || '提取失败')
    } catch (err) {
      setTranscriptError(err instanceof Error ? err.message : String(err))
    } finally {
      setTranscriptLoading(false)
    }
  }, [])

  const handleDownloadAllNew = () => {
    const urls = scopeVideos.filter((v) => v.status === 'new').map((v) => v.url)
    if (urls.length === 0) { message.info('当前没有新视频'); return }
    commitBatchUrls(urls)
    message.success(`已发送 ${urls.length} 个链接到批量下载`)
  }

  // ── 渲染 ──

  return (
    <div style={{ padding: 24, height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
      {/* 页头 */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 16, flexShrink: 0 }}>
        <div>
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
          <p style={{ color: '#888', marginTop: 6, marginBottom: 0 }}>
            监控对标频道更新，新视频和爆款一目了然
          </p>
        </div>
        <Space>
          <span style={{ color: '#888', fontSize: 13 }}>
            <ClockCircleOutlined style={{ marginRight: 4 }} />自动检查
          </span>
          <Select
            value={interval}
            onChange={handleIntervalChange}
            style={{ width: 110 }}
            options={[
              { label: '关闭', value: 'off' },
              { label: '每小时', value: 'hourly' },
              { label: '每 6 小时', value: '6h' },
              { label: '每天', value: 'daily' },
            ]}
          />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setAddOpen(true)}>
            添加订阅
          </Button>
        </Space>
      </div>

      {/* 双栏主体 */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 16 }}>
        <ChannelList
          subs={subs}
          selectedId={selectedChannelId}
          totalNewCount={totalNewCount}
          checkingSubId={checkingSubId}
          collapsed={paneCollapsed}
          onToggleCollapse={togglePaneCollapsed}
          onSelect={setSelectedChannelId}
          onCheckOne={handleCheckOne}
          onTogglePin={handleTogglePin}
          onToggleEnabled={handleToggleEnabled}
          onEditGroup={openGroupEditor}
          onViewAll={setViewSub}
          onRemove={handleRemove}
        />
        <VideoFeed
          mode={feedMode}
          channel={selectedSub}
          subsCount={subs.length}
          loading={loading}
          checking={feedMode === 'all' ? checkingAll : checkingSubId === selectedChannelId}
          videos={feedVideos}
          counts={counts}
          filter={filter}
          sort={sort}
          viewMode={viewMode}
          channelNames={channelNames}
          isHot={isHot}
          isAnalyzed={isAnalyzed}
          getGrowth={getGrowth}
          onFilterChange={setFilter}
          onSortChange={setSort}
          onViewModeChange={setViewMode}
          onCheck={() => (feedMode === 'all' ? handleCheckAll() : handleCheckOne(selectedChannelId))}
          onAnalyzeVideo={runAnalysis}
          onTranscriptVideo={runTranscript}
          onDownloadVideo={handleDownloadVideo}
          onDownloadAllNew={handleDownloadAllNew}
          onMarkAllRead={handleMarkAllRead}
          onDismiss={handleDismiss}
          onViewAllVideos={selectedSub ? () => setViewSub(selectedSub) : undefined}
          onAnalyzeChannel={selectedSub ? () => runChannelAnalysis(selectedSub) : undefined}
          onOpenAdd={() => setAddOpen(true)}
        />
      </div>

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

      {/* 设置分组 Modal */}
      <Modal
        title={groupEditSub ? `设置分组：${groupEditSub.name}` : '设置分组'}
        open={!!groupEditSub}
        onCancel={() => setGroupEditSub(null)}
        onOk={handleSaveGroup}
        okText="保存"
        cancelText="取消"
        width={400}
      >
        <AutoComplete
          value={groupVal}
          onChange={setGroupVal}
          options={knownGroups.map((g) => ({ value: g }))}
          placeholder="输入或选择分组（留空 = 未分组）"
          style={{ width: '100%' }}
          allowClear
        />
      </Modal>

      {/* AI 标题拆解 Modal */}
      <TitleAnalysisModal
        video={analyzeTarget}
        channelName={analyzeTarget ? channelNames[analyzeTarget.channelId] : undefined}
        loading={analyzing}
        loadingText={analysisStage}
        usedOpening={analysisUsedOpening}
        fromCache={analysisFromCache}
        result={analysisResult}
        error={analysisError}
        onClose={() => setAnalyzeTarget(null)}
        onRetry={() => analyzeTarget && runAnalysis(analyzeTarget)}
        onReanalyze={() => analyzeTarget && runAnalysis(analyzeTarget, true)}
      />

      {/* 频道标题规律 Modal */}
      <ChannelAnalysisModal
        channel={chanAnalyzeTarget}
        videoCount={chanAnalyzeTarget ? (videosByChannel[chanAnalyzeTarget.id] ?? []).length : 0}
        loading={chanAnalyzing}
        result={chanResult}
        error={chanError}
        onClose={() => setChanAnalyzeTarget(null)}
        onRerun={() => chanAnalyzeTarget && runChannelAnalysis(chanAnalyzeTarget, true)}
      />

      {/* 视频文案 Modal */}
      <TranscriptModal
        video={transcriptTarget}
        loading={transcriptLoading}
        transcript={transcriptData}
        error={transcriptError}
        onClose={() => setTranscriptTarget(null)}
        onRetry={() => transcriptTarget && runTranscript(transcriptTarget, true)}
      />

      {/* 浏览频道全部视频 Modal */}
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
