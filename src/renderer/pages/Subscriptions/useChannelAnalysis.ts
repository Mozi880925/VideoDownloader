import { useState, useRef, useCallback } from 'react'
import { App } from 'antd'
import type { LlmConfig, NewVideoItem, ChannelSubscription, ChannelAnalysisResult } from '@shared/types'

// ────────── 频道标题规律分析流程（含会话内缓存，重开弹窗不重复扣 API）──────────

interface Options {
  llmConfig: LlmConfig | undefined
  videosByChannel: Record<string, NewVideoItem[]>
}

export function useChannelAnalysis({ llmConfig, videosByChannel }: Options) {
  const { message } = App.useApp()
  const [target, setTarget] = useState<ChannelSubscription | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [result, setResult] = useState<ChannelAnalysisResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  // 本次会话内的频道报告缓存（channelId → result）
  const cacheRef = useRef<Record<string, ChannelAnalysisResult>>({})

  const run = useCallback(async (sub: ChannelSubscription, force = false) => {
    if (!llmConfig?.baseUrl?.trim() || !llmConfig?.apiKey?.trim() || !llmConfig?.model?.trim()) {
      message.warning('请先到「设置 → AI 分析（LLM）」配置 API')
      return
    }
    setTarget(sub)
    setError(null)
    // 会话内缓存命中直接展示
    if (!force && cacheRef.current[sub.id]) {
      setResult(cacheRef.current[sub.id])
      setAnalyzing(false)
      return
    }
    setResult(null)
    setAnalyzing(true)
    try {
      const vids = (videosByChannel[sub.id] ?? []).map((v) => ({
        title: v.title,
        viewCount: v.viewCount,
        uploadDate: v.uploadDate,
      }))
      const r = await window.api.llmAnalyzeChannel(llmConfig, { channelName: sub.name, videos: vids })
      if (r.status === 'success') {
        setResult(r.data)
        cacheRef.current[sub.id] = r.data
      } else {
        setError(r.errorMessage || '分析失败')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setAnalyzing(false)
    }
  }, [llmConfig, videosByChannel, message])

  const close = useCallback(() => setTarget(null), [])

  return { target, analyzing, result, error, run, close }
}
