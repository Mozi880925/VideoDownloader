import { useState, useCallback } from 'react'
import { App } from 'antd'
import type { LlmConfig, NewVideoItem, TitleAnalysisResult } from '@shared/types'

// ────────── AI 标题拆解流程（状态 + 逻辑内聚，原散布在 Subscriptions 协调器的 7 个 useState）──────────

interface Options {
  llmConfig: LlmConfig | undefined
  videosByChannel: Record<string, NewVideoItem[]>
  channelNames: Record<string, string>
  /** 拆解成功后回调（刷新「已拆解」角标） */
  onAnalyzed: (channelId: string, videoId: string) => void
}

export function useTitleAnalysis({ llmConfig, videosByChannel, channelNames, onAnalyzed }: Options) {
  const { message } = App.useApp()
  const [target, setTarget] = useState<NewVideoItem | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [stage, setStage] = useState('')
  const [usedOpening, setUsedOpening] = useState(false)
  const [fromCache, setFromCache] = useState<{ auto: boolean; createdAt: number } | null>(null)
  const [result, setResult] = useState<TitleAnalysisResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const run = useCallback(async (v: NewVideoItem, force = false) => {
    if (!llmConfig?.baseUrl?.trim() || !llmConfig?.apiKey?.trim() || !llmConfig?.model?.trim()) {
      message.warning('请先到「设置 → AI 分析（LLM）」配置 API')
      return
    }
    setTarget(v)
    setAnalyzing(true)
    setResult(null)
    setError(null)
    setUsedOpening(false)
    setFromCache(null)
    try {
      // 0) 已有拆解记录（手动或爆款自动）直接展示，不重复扣 API
      if (!force) {
        const cached = await window.api.analysisGet(v.id, v.channelId)
        if (cached) {
          setResult(cached.result)
          setUsedOpening(cached.usedOpening)
          setFromCache({ auto: cached.auto, createdAt: cached.createdAt })
          setAnalyzing(false)
          return
        }
      }
      // 1) 拿开头文案（前 90 秒）：缓存命中直接用，否则现场免下载提一次字幕；失败不阻塞标题分析
      let openingText: string | undefined
      setStage('正在获取字幕文案（不下载视频）…')
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
      setUsedOpening(!!openingText)

      // 2) 同频道近期视频做对照（排除目标视频自身）
      const siblings = (videosByChannel[v.channelId] ?? [])
        .filter((s) => s.id !== v.id)
        .map((s) => ({ title: s.title, viewCount: s.viewCount }))

      setStage(openingText ? 'AI 正在拆解标题和开头钩子…' : 'AI 正在拆解标题（未找到字幕，跳过开头分析）…')
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
        setResult(r.data)
        onAnalyzed(v.channelId, v.id)
      } else {
        setError(r.errorMessage || '分析失败')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setAnalyzing(false)
      setStage('')
    }
  }, [llmConfig, videosByChannel, channelNames, onAnalyzed, message])

  const close = useCallback(() => setTarget(null), [])

  return { target, analyzing, stage, usedOpening, fromCache, result, error, run, close }
}
