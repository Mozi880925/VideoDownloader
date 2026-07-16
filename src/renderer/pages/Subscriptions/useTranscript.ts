import { useState, useCallback } from 'react'
import type { NewVideoItem, VideoTranscript } from '@shared/types'

// ────────── 视频文案（字幕提取入库）流程 ──────────

export function useTranscript() {
  const [target, setTarget] = useState<NewVideoItem | null>(null)
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<VideoTranscript | null>(null)
  const [error, setError] = useState<string | null>(null)

  const run = useCallback(async (v: NewVideoItem, force = false) => {
    setTarget(v)
    setLoading(true)
    setData(null)
    setError(null)
    try {
      if (!force) {
        const cached = await window.api.transcriptGet(v.id, v.channelId)
        if (cached) { setData(cached); return }
      }
      const r = await window.api.transcriptFetch({ id: v.id, channelId: v.channelId, url: v.url, title: v.title }, force)
      if (r.status === 'success') setData(r.data)
      else setError(r.errorMessage || '提取失败')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  const close = useCallback(() => setTarget(null), [])

  return { target, loading, data, error, run, close }
}
