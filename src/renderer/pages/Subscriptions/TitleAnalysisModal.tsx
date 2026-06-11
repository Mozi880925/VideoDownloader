import React, { useEffect, useState } from 'react'
import { Button, Modal, Spin, Tag, Tooltip, message } from 'antd'
import { CopyOutlined, PlusOutlined, ReloadOutlined, RobotOutlined } from '@ant-design/icons'

// ────────── AI 标题拆解结果弹窗 ──────────

interface TitleAnalysisModalProps {
  video: NewVideoItem | null      // null = 关闭
  channelName?: string
  loading: boolean
  result: TitleAnalysisResult | null
  error: string | null
  onClose: () => void
  onRetry: () => void
}

function genTopicId(): string {
  return `topic-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
}

const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ fontSize: 13, fontWeight: 600, color: '#1a1a1a', margin: '14px 0 6px' }}>{children}</div>
)

const TitleAnalysisModal: React.FC<TitleAnalysisModalProps> = ({
  video,
  channelName,
  loading,
  result,
  error,
  onClose,
  onRetry,
}) => {
  const [savedKeys, setSavedKeys] = useState<Set<string>>(new Set())

  // 换了目标视频后重置「已存入」状态
  useEffect(() => { setSavedKeys(new Set()) }, [video?.id, video?.channelId])

  const saveTopic = async (title: string, notes: string, key: string) => {
    if (!video) return
    const now = Date.now()
    await window.api.topicInsert({
      id: genTopicId(),
      title,
      notes,
      ref_url: video.url,
      ref_title: video.title,
      ref_thumbnail: video.thumbnail,
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

  const parsed = result?.parsed

  /** 完整拆解的纯文本（保存到选题库备注 / 兜底展示用） */
  const fullText = parsed
    ? [
        `标题结构：${parsed.structure}`,
        parsed.hooks.length ? `钩子技巧：\n${parsed.hooks.map((h) => `- ${h}`).join('\n')}` : '',
        `情绪触发：${parsed.emotion}`,
        parsed.templates.length ? `可复用模板：\n${parsed.templates.map((t) => `- ${t}`).join('\n')}` : '',
      ].filter(Boolean).join('\n\n')
    : result?.raw ?? ''

  return (
    <Modal
      title={
        <span>
          <RobotOutlined style={{ color: '#722ed1', marginRight: 6 }} />
          AI 标题拆解
        </span>
      }
      open={!!video}
      onCancel={onClose}
      width={640}
      footer={null}
      destroyOnClose
    >
      {video && (
        <>
          {/* 目标视频 */}
          <div style={{ display: 'flex', gap: 10, padding: 10, background: '#fafafa', borderRadius: 6, marginBottom: 4 }}>
            {video.thumbnail && (
              <img
                src={video.thumbnail}
                alt=""
                style={{ width: 96, height: 54, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }}
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
              />
            )}
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>{video.title}</div>
              <div style={{ fontSize: 12, color: '#888' }}>
                {channelName}
                {video.viewCount ? ` · ${video.viewCount.toLocaleString()} 次观看` : ''}
              </div>
            </div>
          </div>

          {loading && (
            <div style={{ textAlign: 'center', padding: '48px 0' }}>
              <Spin />
              <div style={{ color: '#888', fontSize: 13, marginTop: 12 }}>正在拆解标题套路，约需 10~30 秒…</div>
            </div>
          )}

          {!loading && error && (
            <div style={{ textAlign: 'center', padding: '32px 0' }}>
              <div style={{ color: '#ff4d4f', fontSize: 13, marginBottom: 12 }}>{error}</div>
              <Button icon={<ReloadOutlined />} onClick={onRetry}>重试</Button>
            </div>
          )}

          {!loading && !error && result && (
            parsed ? (
              <div>
                <SectionTitle>标题结构</SectionTitle>
                <div style={{ fontSize: 13, color: '#444', lineHeight: 1.7 }}>{parsed.structure}</div>

                {parsed.hooks.length > 0 && (
                  <>
                    <SectionTitle>钩子技巧</SectionTitle>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {parsed.hooks.map((h, i) => (
                        <Tag key={i} color="purple" style={{ margin: 0, whiteSpace: 'normal', lineHeight: 1.6 }}>{h}</Tag>
                      ))}
                    </div>
                  </>
                )}

                <SectionTitle>情绪触发</SectionTitle>
                <div style={{ fontSize: 13, color: '#444', lineHeight: 1.7 }}>{parsed.emotion}</div>

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
                            background: '#f9f0ff', border: '1px solid #efdbff', borderRadius: 6,
                          }}
                        >
                          <span style={{ flex: 1, color: '#1a1a1a' }}>{s}</span>
                          <Button
                            size="small"
                            type={saved ? 'text' : 'primary'}
                            ghost={!saved}
                            disabled={saved}
                            icon={<PlusOutlined />}
                            onClick={() => saveTopic(s, `来自对标视频「${video.title}」的标题拆解\n\n${fullText}`, key)}
                          >
                            {saved ? '已存入' : '存入选题库'}
                          </Button>
                        </div>
                      )
                    })}
                  </>
                )}

                <div style={{ display: 'flex', gap: 8, marginTop: 16, borderTop: '1px solid #f0f0f0', paddingTop: 12 }}>
                  <Button
                    icon={<PlusOutlined />}
                    disabled={savedKeys.has('full')}
                    onClick={() => saveTopic(`【拆解】${video.title}`, fullText, 'full')}
                  >
                    {savedKeys.has('full') ? '已保存完整拆解' : '保存完整拆解到选题库'}
                  </Button>
                  <Button icon={<CopyOutlined />} onClick={() => copyText(fullText)}>复制全部</Button>
                </div>
              </div>
            ) : (
              // JSON 解析失败：直接展示原始回复
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

export default TitleAnalysisModal
