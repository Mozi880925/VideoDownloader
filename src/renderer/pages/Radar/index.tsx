import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { App, Button, Card, Input, Progress, Segmented, Select, Space, Tag, Tooltip } from 'antd'
import { PlayCircleOutlined, PauseCircleOutlined, PlusOutlined, RadarChartOutlined, ReloadOutlined } from '@ant-design/icons'
import type { RadarChannel, RadarKeyword, RadarScanProgress } from '@shared/types'
import PageTitle from '../../components/PageTitle'
import { PRIMARY, RADIUS_CARD } from '../../theme/tokens'
import ChannelTable, { formatCount } from './ChannelTable'

// ────────── 蓝海雷达（MVP：关键词扫描 → 新锐频道榜单 → 频道库沉淀）──────────

/** 「新锐」阈值：建号 ≤ 24 个月 */
const FRESH_MONTHS = 24

type Scope = 'fresh' | 'all'

const Radar: React.FC = () => {
  const { message } = App.useApp()

  // ── 关键词 ──
  const [keywords, setKeywords] = useState<RadarKeyword[]>([])
  const [kwInput, setKwInput] = useState('')

  // ── 频道库 ──
  const [channels, setChannels] = useState<RadarChannel[]>([])
  const [loadingChannels, setLoadingChannels] = useState(false)
  const [scope, setScope] = useState<Scope>('fresh')
  const [minSubs, setMinSubs] = useState(0)

  // ── 扫描 ──
  const [scanning, setScanning] = useState(false)
  const [progress, setProgress] = useState<RadarScanProgress | null>(null)

  // ── 配额 ──
  const [quota, setQuota] = useState<{ used: number; limit: number } | null>(null)

  // ── 加入对标（雷达 → 频道订阅）──
  const [subscribingId, setSubscribingId] = useState<string | null>(null)
  const [subscribedIds, setSubscribedIds] = useState<Set<string>>(new Set())

  /** 雷达频道 → 订阅可用的频道 URL（与 ChannelTable.openChannel 同构造） */
  const channelUrl = (c: RadarChannel) =>
    c.customUrl ? `https://www.youtube.com/${c.customUrl}` : `https://www.youtube.com/channel/${c.channelId}`

  // mount 时用现有订阅列表预填「已订阅」标记（两种 URL 形态精确比对；
  // 跨形态漏检由 subAdd 的「已存在」报错兜底）
  useEffect(() => {
    window.api.subList().then((subs) => {
      const subUrls = new Set(subs.map((s) => s.url))
      setSubscribedIds((prev) => {
        const next = new Set(prev)
        for (const c of channels) {
          if (subUrls.has(`https://www.youtube.com/${c.customUrl}`) ||
              subUrls.has(`https://www.youtube.com/channel/${c.channelId}`)) {
            next.add(c.channelId)
          }
        }
        return next
      })
    }).catch(() => {})
  }, [channels])

  const handleSubscribe = useCallback(async (c: RadarChannel) => {
    setSubscribingId(c.channelId)
    try {
      const r = await window.api.subAdd(channelUrl(c), c.title)
      if (r.status === 'success') {
        setSubscribedIds((prev) => new Set(prev).add(c.channelId))
        message.success(`已加入对标：${r.data.name}，可在「频道订阅」页查看`)
      } else if (r.errorMessage?.includes('已存在')) {
        setSubscribedIds((prev) => new Set(prev).add(c.channelId))
        message.info('该频道已在订阅列表中')
      } else {
        message.error(r.errorMessage || '加入对标失败')
      }
    } finally {
      setSubscribingId(null)
    }
  }, [message])

  const refreshKeywords = useCallback(async () => {
    setKeywords(await window.api.radarListKeywords())
  }, [])

  const refreshChannels = useCallback(async () => {
    setLoadingChannels(true)
    try {
      const opts = scope === 'fresh' ? { maxAgeMonths: FRESH_MONTHS, minSubs } : { minSubs }
      setChannels(await window.api.radarListChannels(opts))
    } finally {
      setLoadingChannels(false)
    }
  }, [scope, minSubs])

  const refreshQuota = useCallback(async () => {
    setQuota(await window.api.ytApiGetQuota().catch(() => null))
  }, [])

  useEffect(() => { refreshKeywords() }, [refreshKeywords])
  useEffect(() => { refreshChannels() }, [refreshChannels])
  useEffect(() => { refreshQuota() }, [refreshQuota])

  // 扫描进度事件
  useEffect(() => {
    const off = window.api.onRadarScanProgress((p) => {
      setProgress(p)
      if (p.stage === 'scanning') {
        setScanning(true)
      } else {
        setScanning(false)
        refreshChannels()
        refreshKeywords()
        refreshQuota()
        if (p.stage === 'done') {
          message.success(`扫描完成：触达 ${p.channelsFound} 个频道，新入库 ${p.newChannels} 个，消耗配额 ${p.quotaSpent}`)
        } else if (p.stage === 'stopped') {
          message.warning(p.message || '扫描已停止')
        } else if (p.stage === 'failed') {
          message.error(`扫描失败：${p.message || '未知错误'}`)
        }
      }
    })
    return () => off()
  }, [refreshChannels, refreshKeywords, refreshQuota, message])

  // ── 关键词操作 ──

  const handleAddKeywords = async () => {
    const parts = kwInput.split(/[,，\n;；]/).map((s) => s.trim()).filter(Boolean)
    if (parts.length === 0) return
    const added = await window.api.radarAddKeywords(parts)
    if (added.length > 0) {
      message.success(`已添加 ${added.length} 个关键词`)
    } else {
      message.info('关键词已存在')
    }
    setKwInput('')
    await refreshKeywords()
  }

  const handleRemoveKeyword = async (id: string) => {
    await window.api.radarRemoveKeyword(id)
    await refreshKeywords()
  }

  const handleToggleKeyword = async (kw: RadarKeyword) => {
    await window.api.radarToggleKeyword(kw.id, !kw.enabled)
    await refreshKeywords()
  }

  // ── 扫描操作 ──

  const enabledCount = useMemo(() => keywords.filter((k) => k.enabled).length, [keywords])
  /** 预估本轮消耗：每词 search 100 单位 + channels 约 1 单位 */
  const estimatedCost = enabledCount * 101

  const handleStartScan = async () => {
    const r = await window.api.radarStartScan()
    if (r.status === 'success') {
      setScanning(true)
      setProgress(null)
      message.info('扫描已开始')
    } else {
      message.error(r.errorMessage || '扫描启动失败')
    }
  }

  const handleStopScan = async () => {
    await window.api.radarStopScan()
    message.info('正在停止（当前关键词完成后收口）…')
  }

  const handleRemoveChannel = async (channelId: string) => {
    await window.api.radarRemoveChannel(channelId)
    setChannels((prev) => prev.filter((c) => c.channelId !== channelId))
  }

  const quotaLeft = quota ? quota.limit - quota.used : null

  return (
    <div style={{ padding: 24 }}>
      <PageTitle
        title="蓝海雷达"
        subtitle="关键词扫描 YouTube 近 90 天活跃频道，专挑起步晚、涨得快的新锐黑马"
      />

      {/* ── 关键词 + 扫描控制 ── */}
      <Card
        bordered={false}
        style={{ borderRadius: RADIUS_CARD, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', marginBottom: 16 }}
        styles={{ body: { padding: '16px 20px' } }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <span style={{ fontWeight: 600, fontSize: 14 }}>
            <RadarChartOutlined style={{ marginRight: 6, color: PRIMARY }} />
            赛道关键词
          </span>
          <span style={{ fontSize: 12, color: '#999' }}>
            每个关键词一次扫描消耗约 101 配额单位（search 100 + 频道详情 1）
          </span>
          <div style={{ flex: 1 }} />
          {quota && (
            <Tooltip title="YouTube Data API 每日免费配额，太平洋时间 0 点重置；扫描会自动为订阅检查保留 1000 单位保底">
              <span style={{ fontSize: 12, color: quotaLeft !== null && quotaLeft < 1500 ? '#faad14' : '#888' }}>
                今日配额 {quota.used.toLocaleString()} / {quota.limit.toLocaleString()}
              </span>
            </Tooltip>
          )}
          <Button size="small" icon={<ReloadOutlined />} onClick={() => { refreshChannels(); refreshQuota() }} title="刷新" />
        </div>

        <Space size={[6, 8]} wrap style={{ marginBottom: 12 }}>
          {keywords.map((kw) => (
            <Tag
              key={kw.id}
              closable={!scanning}
              onClose={(e) => { e.preventDefault(); handleRemoveKeyword(kw.id) }}
              onClick={() => !scanning && handleToggleKeyword(kw)}
              style={{
                fontSize: 12,
                padding: '2px 8px',
                cursor: scanning ? 'default' : 'pointer',
                background: kw.enabled ? '#e6f4ff' : '#fafafa',
                borderColor: kw.enabled ? '#91caff' : '#d9d9d9',
                color: kw.enabled ? PRIMARY : '#999',
              }}
              title={kw.enabled ? '点击停用（本轮不扫）' : '点击启用'}
            >
              {kw.keyword}
              {kw.lastScannedAt > 0 && kw.enabled && (
                <span style={{ marginLeft: 4, fontSize: 10, color: '#bbb' }}>✓</span>
              )}
            </Tag>
          ))}
          {keywords.length === 0 && (
            <span style={{ fontSize: 12, color: '#bbb' }}>还没有关键词，先添加几个想研究的赛道，如「AI 教程」「露营装备」</span>
          )}
        </Space>

        <div style={{ display: 'flex', gap: 8 }}>
          <Input
            placeholder="输入赛道关键词，逗号/分号分隔可批量添加"
            value={kwInput}
            onChange={(e) => setKwInput(e.target.value)}
            onPressEnter={handleAddKeywords}
            style={{ maxWidth: 420 }}
            disabled={scanning}
          />
          <Button icon={<PlusOutlined />} onClick={handleAddKeywords} disabled={scanning || !kwInput.trim()}>
            添加
          </Button>
          <div style={{ flex: 1 }} />
          {scanning ? (
            <Button danger icon={<PauseCircleOutlined />} onClick={handleStopScan}>
              停止扫描
            </Button>
          ) : (
            <Tooltip title={enabledCount > 0 ? `本轮预估消耗约 ${estimatedCost} 配额单位` : '先添加并启用关键词'}>
              <Button type="primary" icon={<PlayCircleOutlined />} onClick={handleStartScan} disabled={enabledCount === 0}>
                开始扫描（{enabledCount} 个关键词）
              </Button>
            </Tooltip>
          )}
        </div>

        {/* 扫描进度 */}
        {scanning && progress && (
          <div style={{ marginTop: 12 }}>
            <Progress
              percent={Math.round((progress.keywordIndex / Math.max(1, progress.keywordTotal)) * 100)}
              size="small"
              status="active"
            />
            <span style={{ fontSize: 12, color: '#888' }}>
              正在扫描「{progress.currentKeyword}」（{progress.keywordIndex}/{progress.keywordTotal}）
              · 已触达 {progress.channelsFound} 个频道，新入库 {progress.newChannels} 个
              · 本轮已耗配额 {progress.quotaSpent}
            </span>
          </div>
        )}
      </Card>

      {/* ── 频道榜单 ── */}
      <Card
        bordered={false}
        style={{ borderRadius: RADIUS_CARD, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}
        styles={{ body: { padding: '16px 20px' } }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <Segmented
            options={[
              { label: `新锐频道（≤${FRESH_MONTHS}个月）`, value: 'fresh' },
              { label: '全部频道库', value: 'all' },
            ]}
            value={scope}
            onChange={(v) => setScope(v as Scope)}
          />
          <Select
            value={minSubs}
            onChange={setMinSubs}
            style={{ width: 140 }}
            options={[
              { label: '订阅数不限', value: 0 },
              { label: '订阅 ≥ 1000', value: 1000 },
              { label: '订阅 ≥ 1万', value: 10_000 },
              { label: '订阅 ≥ 10万', value: 100_000 },
            ]}
          />
          <span style={{ fontSize: 12, color: '#999' }}>
            共 {channels.length} 个频道{scope === 'fresh' && channels.length > 0 && `，订阅中位数 ${formatCount(medianSubs(channels))}`}
          </span>
        </div>

        <ChannelTable
          channels={channels}
          loading={loadingChannels}
          onRemove={handleRemoveChannel}
          onSubscribe={handleSubscribe}
          subscribingId={subscribingId}
          subscribedIds={subscribedIds}
        />
      </Card>
    </div>
  )
}

function medianSubs(channels: RadarChannel[]): number {
  const sorted = channels.map((c) => c.subscriberCount).sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)] ?? 0
}

export default Radar
