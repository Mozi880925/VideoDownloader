import React from 'react'
import { Button, Modal, Spin, Tag, message } from 'antd'
import { CopyOutlined, FileTextOutlined, ReloadOutlined } from '@ant-design/icons'

// ────────── 视频文案弹窗（免下载提字幕 → 纯文本） ──────────

interface TranscriptModalProps {
  video: NewVideoItem | null      // null = 关闭
  loading: boolean
  transcript: VideoTranscript | null
  error: string | null
  onClose: () => void
  onRetry: () => void
}

const TranscriptModal: React.FC<TranscriptModalProps> = ({
  video,
  loading,
  transcript,
  error,
  onClose,
  onRetry,
}) => {
  const copyAll = async () => {
    if (!transcript?.text) return
    try {
      await navigator.clipboard.writeText(transcript.text)
      message.success('已复制全部文案')
    } catch {
      message.error('复制失败')
    }
  }

  return (
    <Modal
      title={
        <span>
          <FileTextOutlined style={{ color: '#1677ff', marginRight: 6 }} />
          视频文案
        </span>
      }
      open={!!video}
      onCancel={onClose}
      width={680}
      footer={null}
      destroyOnClose
    >
      {video && (
        <>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 12, color: '#1a1a1a' }}>
            {video.title}
          </div>

          {loading && (
            <div style={{ textAlign: 'center', padding: '48px 0' }}>
              <Spin />
              <div style={{ color: '#888', fontSize: 13, marginTop: 12 }}>
                正在提取字幕文案（不下载视频），约需 5~20 秒…
              </div>
            </div>
          )}

          {!loading && error && (
            <div style={{ textAlign: 'center', padding: '32px 0' }}>
              <div style={{ color: '#ff4d4f', fontSize: 13, marginBottom: 8 }}>{error}</div>
              <div style={{ color: '#888', fontSize: 12, marginBottom: 12 }}>
                若该视频确实没有字幕，可先下载视频后用「AI 识别字幕」（Whisper）转录
              </div>
              <Button icon={<ReloadOutlined />} onClick={onRetry}>重试</Button>
            </div>
          )}

          {!loading && !error && transcript && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                {transcript.language && <Tag color="blue">{transcript.language}</Tag>}
                <span style={{ fontSize: 12, color: '#888' }}>{transcript.text.length} 字</span>
                <div style={{ flex: 1 }} />
                <Button size="small" icon={<CopyOutlined />} onClick={copyAll}>复制全部</Button>
              </div>
              <div
                style={{
                  fontSize: 13,
                  lineHeight: 1.9,
                  color: '#444',
                  background: '#fafafa',
                  borderRadius: 6,
                  padding: '12px 16px',
                  maxHeight: '52vh',
                  overflowY: 'auto',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {transcript.text}
              </div>
            </>
          )}
        </>
      )}
    </Modal>
  )
}

export default TranscriptModal
