import React, { useState, useEffect, useRef } from 'react'
import type { TranscribeProgress } from '@shared/types'
import { Modal, Button, Space, Progress, Alert, Checkbox, Typography } from 'antd'
import { AudioOutlined, FolderOpenOutlined, FileTextOutlined } from '@ant-design/icons'
import { useSettingsStore } from '../../store/settingsStore'

interface TranscribeModalProps {
  open: boolean
  videoPath: string
  videoTitle?: string
  onClose: () => void
}

function stageLabel(stage?: string): string {
  switch (stage) {
    case 'extracting-audio': return '正在提取音频…'
    case 'transcribing':     return '正在识别语音…'
    case 'done':             return '识别完成'
    default:                 return '准备中…'
  }
}

function genId(): string {
  return `trans-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

const TranscribeModal: React.FC<TranscribeModalProps> = ({ open, videoPath, videoTitle, onClose }) => {
  const whisperCfg = useSettingsStore((s) => s.appSettings.whisper)

  const [ready, setReady] = useState<{ ready: boolean; reason?: string } | null>(null)
  const [overwrite, setOverwrite] = useState(false)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [stage, setStage] = useState<TranscribeProgress['stage'] | undefined>(undefined)
  const [lastLine, setLastLine] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [srtPath, setSrtPath] = useState<string | null>(null)
  const taskIdRef = useRef<string>('')

  useEffect(() => {
    if (!open) return
    setError(null)
    setSrtPath(null)
    setProgress(0)
    setStage(undefined)
    setLastLine('')
    setBusy(false)
    window.api.whisperReady(whisperCfg).then(setReady).catch(() => setReady({ ready: false, reason: '检测失败' }))
  }, [open, whisperCfg])

  const handleStart = async () => {
    if (!whisperCfg) return
    const taskId = genId()
    taskIdRef.current = taskId
    setBusy(true)
    setError(null)
    setSrtPath(null)
    setProgress(0)
    setStage(undefined)

    const removeListener = window.api.onTranscribeProgress((p) => {
      if (p.taskId !== taskId) return
      setProgress(p.progress)
      setStage(p.stage)
      if (p.lastLine) setLastLine(p.lastLine)
    })

    try {
      const result = await window.api.transcribeVideo({
        videoPath,
        config: whisperCfg,
        taskId,
        overwrite,
      })
      if (result.status === 'success' && result.data) {
        setSrtPath(result.data.srtPath)
        setProgress(100)
        setStage('done')
      } else if (result.status === 'cancelled') {
        setError('已取消')
      } else {
        setError(result.errorMessage || '未知错误')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      removeListener()
      setBusy(false)
    }
  }

  const handleCancel = async () => {
    if (taskIdRef.current) {
      await window.api.cancelTranscribe(taskIdRef.current).catch(() => {})
    }
  }

  const handleOpenSrt = () => { if (srtPath) window.api.openFile(srtPath).catch(() => {}) }
  const handleShowSrt = () => { if (srtPath) window.api.showItemInFolder(srtPath).catch(() => {}) }

  return (
    <Modal
      title={
        <Space>
          <AudioOutlined style={{ color: '#1677ff' }} />
          生成字幕（Whisper）
        </Space>
      }
      open={open}
      onCancel={busy ? undefined : onClose}
      closable={!busy}
      maskClosable={!busy}
      width={560}
      destroyOnClose
      footer={
        srtPath ? (
          <Space>
            <Button onClick={onClose}>关闭</Button>
            <Button icon={<FolderOpenOutlined />} onClick={handleShowSrt}>在文件夹中显示</Button>
            <Button type="primary" icon={<FileTextOutlined />} onClick={handleOpenSrt}>打开字幕文件</Button>
          </Space>
        ) : busy ? (
          <Space>
            <Button danger onClick={handleCancel}>取消转写</Button>
          </Space>
        ) : (
          <Space>
            <Button onClick={onClose}>关闭</Button>
            <Button
              type="primary"
              icon={<AudioOutlined />}
              onClick={handleStart}
              disabled={!ready?.ready}
            >
              开始生成
            </Button>
          </Space>
        )
      }
    >
      {videoTitle && (
        <Typography.Paragraph style={{ color: '#888', fontSize: 12, marginBottom: 12 }} ellipsis={{ rows: 1 }}>
          来源视频：{videoTitle}
        </Typography.Paragraph>
      )}

      {ready && !ready.ready && (
        <Alert
          type="warning"
          showIcon
          message="Whisper 尚未就绪"
          description={ready.reason}
          style={{ marginBottom: 12 }}
        />
      )}

      {ready?.ready && !busy && !srtPath && (
        <div style={{ marginBottom: 12 }}>
          <Checkbox checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)}>
            如存在同名 .srt，覆盖
          </Checkbox>
        </div>
      )}

      {busy && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 13, color: '#555', marginBottom: 6 }}>{stageLabel(stage)}</div>
          <Progress
            percent={Math.round(progress)}
            status="active"
            strokeColor={{ from: '#1677ff', to: '#4096ff' }}
          />
          {lastLine && (
            <div
              style={{
                marginTop: 8,
                padding: '6px 10px',
                background: '#fafafa',
                border: '1px solid #f0f0f0',
                borderRadius: 4,
                fontFamily: 'Consolas, monospace',
                fontSize: 11,
                color: '#666',
                maxHeight: 60,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
              title={lastLine}
            >
              {lastLine}
            </div>
          )}
        </div>
      )}

      {error && (
        <Alert type="error" showIcon message="生成失败" description={error} style={{ marginTop: 12 }} />
      )}

      {srtPath && (
        <Alert
          type="success"
          showIcon
          message="字幕已生成"
          description={srtPath}
          style={{ marginTop: 12 }}
        />
      )}
    </Modal>
  )
}

export default TranscribeModal
