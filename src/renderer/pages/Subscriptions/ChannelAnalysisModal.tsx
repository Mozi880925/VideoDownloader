import React, { useEffect, useState } from 'react'
import type { ChannelSubscription, ChannelAnalysisResult } from '@shared/types'
import { Button, Modal, Spin, Tag, Tooltip, message } from 'antd'
import { BarChartOutlined, CopyOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons'

// ────────── 频道标题规律报告弹窗 ──────────

interface ChannelAnalysisModalProps {
  channel: ChannelSubscription | null   // null = 关闭
  videoCount: number
  loading: boolean
  result: ChannelAnalysisResult | null
  error: string | null
  onClose: () => void
  onRerun: () => void
}

function genTopicId(): string {
  return `topic-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
}

const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ fontSize: 13, fontWeight: 600, color: '#1a1a1a', margin: '14px 0 6px' }}>{children}</div>
)

const ChannelAnalysisModal: React.FC<ChannelAnalysisModalProps> = ({
  channel,
  videoCount,
  loading,
  result,
  error,
  onClose,
  onRerun,
}) => {
  const [savedKeys, setSavedKeys] = useState<Set<string>>(new Set())

  // 换频道后重置「已存入」状态
  useEffect(() => { setSavedKeys(new Set()) }, [channel?.id])

  const parsed = result?.parsed

  const fullText = parsed
    ? [
        `标题公式：${parsed.formula}`,
        parsed.patterns.length ? `高播放共性：\n${parsed.patterns.map((p) => `- ${p}`).join('\n')}` : '',
        parsed.weaknesses ? `低播放问题：${parsed.weaknesses}` : '',
        parsed.templates.length ? `可复用模板：\n${parsed.templates.map((t) => `- ${t}`).join('\n')}` : '',
      ].filter(Boolean).join('\n\n')
    : result?.raw ?? ''

  const saveTopic = async (title: string, key: string) => {
    if (!channel) return
    const now = Date.now()
    await window.api.topicInsert({
      id: genTopicId(),
      title,
      notes: `来自频道「${channel.name}」的标题规律分析\n\n${fullText}`,
      ref_url: channel.url,
      ref_title: channel.name,
      ref_thumbnail: '',
      status: 'pending',
      created_at: now,
      updated_at: now,
    })
    setSavedKeys((prev) => new Set(prev).add(key))
    message.success('已存入选题库')
  }

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      message.success('已复制')
    } catch {
      message.error('复制失败')
    }
  }

  return (
    <Modal
      title={
        <span>
          <BarChartOutlined style={{ color: '#1677ff', marginRight: 6 }} />
          频道标题规律{channel ? `：${channel.name}` : ''}
        </span>
      }
      open={!!channel}
      onCancel={onClose}
      width={660}
      footer={null}
      destroyOnClose
    >
      {channel && (
        <>
          <div style={{ fontSize: 12, color: '#888', marginBottom: 8 }}>
            基于该频道缓存的 {videoCount} 条视频（标题 + 播放量）对比分析
          </div>

          {loading && (
            <div style={{ textAlign: 'center', padding: '48px 0' }}>
              <Spin />
              <div style={{ color: '#888', fontSize: 13, marginTop: 12 }}>
                AI 正在对比高低播放标题，归纳这个频道的公式，约需 15~40 秒…
              </div>
            </div>
          )}

          {!loading && error && (
            <div style={{ textAlign: 'center', padding: '32px 0' }}>
              <div style={{ color: '#ff4d4f', fontSize: 13, marginBottom: 12 }}>{error}</div>
              <Button icon={<ReloadOutlined />} onClick={onRerun}>重试</Button>
            </div>
          )}

          {!loading && !error && result && (
            parsed ? (
              <div>
                <SectionTitle>标题公式</SectionTitle>
                <div
                  style={{
                    fontSize: 14, fontWeight: 500, color: '#1a1a1a', lineHeight: 1.7,
                    background: '#e6f4ff', border: '1px solid #91caff', borderRadius: 6, padding: '10px 14px',
                  }}
                >
                  {parsed.formula}
                </div>

                {parsed.patterns.length > 0 && (
                  <>
                    <SectionTitle>高播放标题的共性</SectionTitle>
                    {parsed.patterns.map((p, i) => (
                      <div key={i} style={{ fontSize: 13, color: '#444', lineHeight: 1.8 }}>• {p}</div>
                    ))}
                  </>
                )}

                {parsed.weaknesses && (
                  <>
                    <SectionTitle>低播放标题的问题</SectionTitle>
                    <div style={{ fontSize: 13, color: '#444', lineHeight: 1.7 }}>{parsed.weaknesses}</div>
                  </>
                )}

                {parsed.templates.length > 0 && (
                  <>
                    <SectionTitle>可复用模板</SectionTitle>
                    {parsed.templates.map((t, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#444', padding: '4px 0' }}>
                        <span style={{ flex: 1 }}>{t}</span>
                        <Tooltip title="复制模板">
                          <Button size="small" type="text" icon={<CopyOutlined />} onClick={() => copyText(t)} />
                        </Tooltip>
                      </div>
                    ))}
                  </>
                )}

                {parsed.suggestions.length > 0 && (
                  <>
                    <SectionTitle>给你的选题建议</SectionTitle>
                    {parsed.suggestions.map((s, i) => {
                      const key = `sug-${i}`
                      const saved = savedKeys.has(key)
                      return (
                        <div
                          key={i}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            fontSize: 13, padding: '6px 10px', marginBottom: 6,
                            background: '#e6f4ff', border: '1px solid #bae0ff', borderRadius: 6,
                          }}
                        >
                          <span style={{ flex: 1, color: '#1a1a1a' }}>{s}</span>
                          <Button
                            size="small"
                            type={saved ? 'text' : 'primary'}
                            ghost={!saved}
                            disabled={saved}
                            icon={<PlusOutlined />}
                            onClick={() => saveTopic(s, key)}
                          >
                            {saved ? '已存入' : '存入选题库'}
                          </Button>
                        </div>
                      )
                    })}
                  </>
                )}

                <div style={{ display: 'flex', gap: 8, marginTop: 16, borderTop: '1px solid #f0f0f0', paddingTop: 12 }}>
                  <Button icon={<CopyOutlined />} onClick={() => copyText(fullText)}>复制全部</Button>
                  <Button icon={<ReloadOutlined />} onClick={onRerun}>重新分析</Button>
                </div>
              </div>
            ) : (
              <div>
                <SectionTitle>分析结果（原始输出）</SectionTitle>
                <pre style={{ fontSize: 12, background: '#fafafa', padding: 12, borderRadius: 6, whiteSpace: 'pre-wrap', maxHeight: 360, overflowY: 'auto' }}>
                  {result.raw}
                </pre>
                <Button icon={<CopyOutlined />} onClick={() => copyText(result.raw)}>复制全部</Button>
              </div>
            )
          )}
        </>
      )}
    </Modal>
  )
}

export default ChannelAnalysisModal
