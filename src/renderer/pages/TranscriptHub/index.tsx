import React, { useEffect, useState } from 'react'
import { Segmented } from 'antd'
import PageTitle from '../../components/PageTitle'
import { PURPLE_GRADIENT } from '../../theme/tokens'
import { useNavStore } from '../../store/navStore'
import Transcription from '../Transcription'
import SubtitleExtract from '../SubtitleExtract'
import DistillLibrary from '../DistillLibrary'

// ────────── 字幕和转录（合并页：AI 识别字幕 | 字幕提取 | 提纯稿库）──────────
// 三个工作流共用一个入口，页内胶囊 Tab 切换（同视频下载页的模式）。
// Whisper 引擎配置在「设置 → 字幕设置」。

type TabKey = 'transcribe' | 'extract' | 'library'

const TAB_OPTIONS: { label: string; value: TabKey }[] = [
  { label: 'AI 识别字幕', value: 'transcribe' },
  { label: '字幕提取', value: 'extract' },
  { label: '提纯稿库', value: 'library' },
]

const TAB_SUBTITLE: Record<TabKey, string> = {
  transcribe: '用本地 Whisper 对视频/播客链接或本地文件做语音识别，生成 .srt 字幕（引擎在设置 → 字幕设置里配置）',
  extract: '从在线视频抓取平台字幕文件（播客等无字幕音频请用 AI 识别字幕）',
  library: '转录稿经 AI 整理成的分享式提纯版原文',
}

const TranscriptHub: React.FC = () => {
  const [tab, setTab] = useState<TabKey>('transcribe')

  // 消费跨页 Tab 定位信号（如「AI 提纯」发起后跳转到提纯稿库 Tab）
  const hubTab = useNavStore((s) => s.hubTab)
  const clearHubTab = useNavStore((s) => s.clearHubTab)
  useEffect(() => {
    if (hubTab) {
      setTab(hubTab)
      clearHubTab()
    }
  }, [hubTab, clearHubTab])

  return (
    <div style={{ padding: 24, height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
      <PageTitle
        title="字幕和转录"
        size={24}
        gradient={PURPLE_GRADIENT}
        style={{ marginBottom: 6 }}
        subtitle={TAB_SUBTITLE[tab]}
        subtitleStyle={{ color: '#888', marginBottom: 16, fontSize: 14 }}
      />

      <div style={{ marginBottom: 16, flexShrink: 0 }}>
        <Segmented
          options={TAB_OPTIONS}
          value={tab}
          onChange={(v) => setTab(v as TabKey)}
          style={{ borderRadius: 8 }}
          size="middle"
        />
      </div>

      <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        {tab === 'transcribe' && <Transcription />}
        {tab === 'extract' && <SubtitleExtract />}
        {tab === 'library' && <DistillLibrary />}
      </div>
    </div>
  )
}

export default TranscriptHub
