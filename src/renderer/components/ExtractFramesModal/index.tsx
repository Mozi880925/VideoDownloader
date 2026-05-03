import React, { useState, useEffect } from 'react'
import {
  Modal,
  Radio,
  InputNumber,
  Slider,
  Input,
  Button,
  Space,
  message,
  Alert,
  Typography,
} from 'antd'
import { FolderOpenOutlined, CameraOutlined } from '@ant-design/icons'

interface ExtractFramesModalProps {
  open: boolean
  videoPath: string
  videoTitle?: string
  onClose: () => void
}

const ExtractFramesModal: React.FC<ExtractFramesModalProps> = ({
  open, videoPath, videoTitle, onClose,
}) => {
  const [mode, setMode] = useState<FrameMode>('uniform')
  const [count, setCount] = useState(10)
  const [sceneThreshold, setSceneThreshold] = useState(0.3)
  const [timestampsText, setTimestampsText] = useState('')
  const [outputDir, setOutputDir] = useState<string | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<FrameExtractResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ffmpegAvailable, setFfmpegAvailable] = useState<boolean | null>(null)

  useEffect(() => {
    if (!open) return
    setResult(null)
    setError(null)
    window.api.ffmpegReady().then((s) => {
      setFfmpegAvailable(s.ffmpeg && (mode !== 'uniform' || s.ffprobe))
    }).catch(() => setFfmpegAvailable(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode])

  const handleSelectOutputDir = async () => {
    const picked = await window.api.selectDirectory(outputDir)
    if (picked) setOutputDir(picked)
  }

  const handleExtract = async () => {
    setBusy(true)
    setResult(null)
    setError(null)

    const timestamps = mode === 'timestamps'
      ? timestampsText.split(/[\n,，;；]+/).map((s) => s.trim()).filter(Boolean)
      : undefined

    if (mode === 'timestamps' && (!timestamps || timestamps.length === 0)) {
      setError('请至少输入一个时间戳（如 00:30）')
      setBusy(false)
      return
    }

    try {
      const res = await window.api.extractFrames({
        videoPath,
        mode,
        count: mode === 'uniform' ? count : undefined,
        sceneThreshold: mode === 'scene' ? sceneThreshold : undefined,
        timestamps,
        outputDir,
      })
      if (res.status === 'success') {
        setResult(res.data)
        message.success(`成功生成 ${res.data.frameCount} 张关键帧`)
      } else {
        setError(res.errorMessage)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const handleOpenOutput = () => {
    if (result?.outputDir) {
      // 在文件管理器中打开目录（用目录内任一帧作为 anchor）
      window.api.showItemInFolder(result.outputDir).catch(() => {})
    }
  }

  return (
    <Modal
      title={
        <Space>
          <CameraOutlined style={{ color: '#1677ff' }} />
          提取关键帧
        </Space>
      }
      open={open}
      onCancel={busy ? undefined : onClose}
      closable={!busy}
      maskClosable={!busy}
      footer={
        result ? (
          <Space>
            <Button onClick={onClose}>关闭</Button>
            <Button type="primary" icon={<FolderOpenOutlined />} onClick={handleOpenOutput}>
              打开输出目录
            </Button>
          </Space>
        ) : (
          <Space>
            <Button onClick={onClose} disabled={busy}>取消</Button>
            <Button
              type="primary"
              icon={<CameraOutlined />}
              loading={busy}
              disabled={!ffmpegAvailable}
              onClick={handleExtract}
            >
              {busy ? '提取中…' : '开始提取'}
            </Button>
          </Space>
        )
      }
      width={560}
      destroyOnClose
    >
      {videoTitle && (
        <Typography.Paragraph
          style={{ color: '#888', fontSize: 12, marginBottom: 12 }}
          ellipsis={{ rows: 1 }}
        >
          来源视频：{videoTitle}
        </Typography.Paragraph>
      )}

      {ffmpegAvailable === false && (
        <Alert
          type="error"
          showIcon
          message="未检测到 ffmpeg / ffprobe"
          description="请先安装 ffmpeg 并确保其在系统 PATH 中（均匀模式还需 ffprobe）"
          style={{ marginBottom: 12 }}
        />
      )}

      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: '#555', marginBottom: 8 }}>提取模式</div>
        <Radio.Group
          value={mode}
          onChange={(e) => setMode(e.target.value)}
          disabled={busy}
        >
          <Radio value="uniform">均匀 N 张</Radio>
          <Radio value="scene">场景变化自动</Radio>
          <Radio value="timestamps">指定时间戳</Radio>
        </Radio.Group>
      </div>

      {mode === 'uniform' && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, color: '#555', marginBottom: 6 }}>张数</div>
          <InputNumber
            min={1}
            max={100}
            value={count}
            onChange={(v) => setCount(v ?? 10)}
            disabled={busy}
            style={{ width: 120 }}
            addonAfter="张"
          />
          <div style={{ fontSize: 11, color: '#999', marginTop: 4 }}>
            按视频时长均匀抽取，避开首尾黑屏（1–100）
          </div>
        </div>
      )}

      {mode === 'scene' && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, color: '#555', marginBottom: 6 }}>
            场景变化阈值：<b>{sceneThreshold.toFixed(2)}</b>
          </div>
          <Slider
            min={0.1}
            max={0.8}
            step={0.05}
            value={sceneThreshold}
            onChange={setSceneThreshold}
            disabled={busy}
            marks={{ 0.1: '敏感', 0.3: '推荐', 0.6: '严格' }}
          />
          <div style={{ fontSize: 11, color: '#999', marginTop: 4 }}>
            值越低抓到的帧越多。场景模式会扫描全片，较慢
          </div>
        </div>
      )}

      {mode === 'timestamps' && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, color: '#555', marginBottom: 6 }}>时间戳（每行一个，或用逗号/分号分隔）</div>
          <Input.TextArea
            rows={4}
            value={timestampsText}
            onChange={(e) => setTimestampsText(e.target.value)}
            disabled={busy}
            placeholder={'例如：\n00:30\n01:15\n1:05:30\n90'}
            style={{ fontFamily: 'Consolas, monospace', fontSize: 13 }}
          />
          <div style={{ fontSize: 11, color: '#999', marginTop: 4 }}>
            支持 MM:SS、HH:MM:SS 或纯秒数
          </div>
        </div>
      )}

      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 13, color: '#555', marginBottom: 6 }}>输出目录</div>
        <Space.Compact style={{ width: '100%' }}>
          <Input
            value={outputDir ?? ''}
            placeholder="留空：视频同目录下 <视频名>_frames/"
            readOnly
            disabled={busy}
          />
          <Button icon={<FolderOpenOutlined />} onClick={handleSelectOutputDir} disabled={busy}>
            选择
          </Button>
          {outputDir && (
            <Button onClick={() => setOutputDir(undefined)} disabled={busy}>重置</Button>
          )}
        </Space.Compact>
      </div>

      {error && (
        <Alert type="error" showIcon message="提取失败" description={error} style={{ marginTop: 12 }} />
      )}
      {result && (
        <Alert
          type="success"
          showIcon
          message={`成功生成 ${result.frameCount} 张关键帧`}
          description={`输出目录：${result.outputDir}`}
          style={{ marginTop: 12 }}
        />
      )}
    </Modal>
  )
}

export default ExtractFramesModal
