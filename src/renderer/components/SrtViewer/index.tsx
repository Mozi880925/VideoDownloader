import React, { useState, useEffect } from 'react'
import { Modal, Button, Space, Input, Typography, message, Empty, Tooltip } from 'antd'
import { CopyOutlined, FileTextOutlined, SearchOutlined, TranslationOutlined } from '@ant-design/icons'

interface SrtEntry {
  index: number
  start: string
  end: string
  text: string
}

function parseSrt(content: string): SrtEntry[] {
  const blocks = content.trim().split(/\n\s*\n/)
  const entries: SrtEntry[] = []
  for (const block of blocks) {
    const lines = block.trim().split('\n')
    if (lines.length < 3) continue
    const index = parseInt(lines[0])
    const timeLine = lines[1]
    const text = lines.slice(2).join(' ').replace(/<[^>]+>/g, '').trim()
    const m = timeLine.match(/(\d{2}:\d{2}:\d{2}[,\.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,\.]\d{3})/)
    if (!m || !text) continue
    entries.push({ index, start: m[1].replace(',', '.'), end: m[2].replace(',', '.'), text })
  }
  return entries
}

interface Props {
  open: boolean
  srtPath: string
  title?: string
  onClose: () => void
}

const SrtViewer: React.FC<Props> = ({ open, srtPath, title, onClose }) => {
  const [entries, setEntries] = useState<SrtEntry[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [messageApi, contextHolder] = message.useMessage()

  useEffect(() => {
    if (!open || !srtPath) return
    setLoading(true)
    setSearch('')
    // 通过 IPC 读取文件内容
    window.api.readTextFile(srtPath)
      .then((content) => {
        setEntries(parseSrt(content))
      })
      .catch(() => {
        messageApi.error('读取字幕文件失败')
        setEntries([])
      })
      .finally(() => setLoading(false))
  }, [open, srtPath])

  const filtered = search
    ? entries.filter((e) => e.text.toLowerCase().includes(search.toLowerCase()))
    : entries

  const plainText = entries.map((e) => e.text).join('\n')

  const handleCopyAll = () => {
    navigator.clipboard.writeText(plainText).then(() => {
      messageApi.success('已复制全文到剪贴板')
    })
  }

  const handleExportTxt = () => {
    const blob = new Blob([plainText], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = (title || 'transcript') + '.txt'
    a.click()
    URL.revokeObjectURL(url)
    messageApi.success('已导出纯文本')
  }

  return (
    <Modal
      open={open}
      title={
        <Space>
          <FileTextOutlined style={{ color: '#1677ff' }} />
          <span style={{ fontSize: 14 }}>{title || '字幕文稿'}</span>
        </Space>
      }
      onCancel={onClose}
      footer={null}
      width={720}
      styles={{ body: { padding: '12px 24px 24px' } }}
    >
      {contextHolder}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
        <Input
          prefix={<SearchOutlined style={{ color: '#bbb' }} />}
          placeholder="搜索文稿内容..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          allowClear
          style={{ flex: 1 }}
        />
        <Tooltip title="复制全文（去时间戳）">
          <Button icon={<CopyOutlined />} onClick={handleCopyAll} disabled={entries.length === 0}>
            复制全文
          </Button>
        </Tooltip>
        <Tooltip title="导出为 .txt 纯文本">
          <Button icon={<FileTextOutlined />} onClick={handleExportTxt} disabled={entries.length === 0}>
            导出文本
          </Button>
        </Tooltip>
        <Tooltip title="复制全文后可粘贴到 ChatGPT/Claude 进行翻译">
          <Button icon={<TranslationOutlined />} onClick={handleCopyAll} disabled={entries.length === 0}>
            翻译（复制后粘贴 AI）
          </Button>
        </Tooltip>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>加载中...</div>
      ) : entries.length === 0 ? (
        <Empty description="暂无字幕内容" />
      ) : (
        <div style={{ height: 480, overflowY: 'auto', border: '1px solid #f0f0f0', borderRadius: 6 }}>
          {filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>未找到匹配内容</div>
          ) : (
            filtered.map((e) => (
              <div
                key={e.index}
                style={{
                  display: 'flex',
                  gap: 12,
                  padding: '8px 14px',
                  borderBottom: '1px solid #f5f5f5',
                  alignItems: 'flex-start',
                }}
              >
                <span style={{ color: '#bbb', fontSize: 11, minWidth: 80, paddingTop: 2, fontFamily: 'monospace' }}>
                  {e.start.slice(0, 8)}
                </span>
                <Typography.Text
                  style={{ fontSize: 13, lineHeight: '1.6', flex: 1 }}
                  copyable={{ tooltips: ['复制这句', '已复制'] }}
                >
                  {e.text}
                </Typography.Text>
              </div>
            ))
          )}
        </div>
      )}

      <div style={{ marginTop: 8, color: '#999', fontSize: 12 }}>
        共 {entries.length} 条字幕{search ? `，匹配 ${filtered.length} 条` : ''}
        {entries.length > 0 && (
          <span style={{ marginLeft: 12 }}>约 {Math.ceil(plainText.length / 500)} 分钟阅读</span>
        )}
      </div>
    </Modal>
  )
}

export default SrtViewer
