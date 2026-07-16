import React, { useState } from 'react'
import { Card, Button, Space, Tag, Popconfirm, Checkbox, Tooltip } from 'antd'
import {
  FolderOpenOutlined,
  DeleteOutlined,
  PlayCircleOutlined,
  WarningOutlined,
  CameraOutlined,
  AudioOutlined,
  FileTextOutlined,
} from '@ant-design/icons'
import type { CompletedRecord } from '@shared/types'
import { useHistoryStore } from '../../store/historyStore'
import ExtractFramesModal from '../../components/ExtractFramesModal'
import TranscribeModal from '../../components/TranscribeModal'
import SrtViewer from '../../components/SrtViewer'
import { Thumbnail, formatTime } from './shared'
import { useFilterStore } from './filterStore'
import TagEditor from './TagEditor'

// ---- 已完成记录行 ----

interface CompletedCardProps {
  record: CompletedRecord
  selected: boolean
  onToggle: (taskId: string) => void
  fileMissing?: boolean
}

const CompletedRecordCard: React.FC<CompletedCardProps> = ({ record, selected, onToggle, fileMissing }) => {
  const removeRecord = useHistoryStore((s) => s.removeRecord)
  const updateRecordTags = useHistoryStore((s) => s.updateRecordTags)
  const setFilterKeyword = useFilterStore((s) => s.setFilterKeyword)
  const [framesOpen, setFramesOpen] = useState(false)
  const [transcribeOpen, setTranscribeOpen] = useState(false)
  const [srtOpen, setSrtOpen] = useState(false)

  // 查找同目录下的 .srt 文件
  const srtPath = record.filepath
    ? record.filepath.replace(/\.[^.]+$/, '.srt')
    : undefined

  return (
    <Card
      size="small"
      style={{
        marginBottom: 10,
        borderRadius: 6,
        background: selected ? '#f0f5ff' : fileMissing ? '#fafafa' : undefined,
        borderColor: selected ? '#91caff' : fileMissing ? '#f0f0f0' : undefined,
        opacity: fileMissing ? 0.7 : 1,
      }}
      styles={{ body: { padding: '12px 16px' } }}
    >
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <Checkbox
          checked={selected}
          onChange={() => onToggle(record.taskId)}
        />
        <Thumbnail src={record.thumbnail} size={56} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontWeight: 600,
              fontSize: 13,
              color: fileMissing ? '#888' : '#1a1a1a',
              marginBottom: 4,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              textDecoration: fileMissing ? 'line-through' : undefined,
            }}
            title={record.title}
          >
            {record.title || '未知标题'}
          </div>
          <Space size={8} style={{ marginBottom: 6 }}>
            <Tag color="blue" style={{ fontSize: 11 }}>{record.platform}</Tag>
            <span style={{ color: '#999', fontSize: 11 }}>{formatTime(record.completedAt)}</span>
            {fileMissing && (
              <Tooltip title={`本地文件已不存在：${record.filepath}`}>
                <Tag icon={<WarningOutlined />} color="warning" style={{ fontSize: 11 }}>
                  文件已丢失
                </Tag>
              </Tooltip>
            )}
          </Space>
          <TagEditor
            tags={record.tags ?? []}
            onChange={(next) => updateRecordTags(record.taskId, next)}
            onClickTag={(tag) => setFilterKeyword(tag)}
          />
        </div>
        <Space size={4}>
          <Button
            type="text"
            icon={<PlayCircleOutlined />}
            size="small"
            title={fileMissing ? '文件已丢失，无法打开' : '打开文件'}
            disabled={!record.filepath || fileMissing}
            onClick={() => {
              if (record.filepath) window.api.openFile(record.filepath)
            }}
          />
          <Button
            type="text"
            icon={<CameraOutlined />}
            size="small"
            title={fileMissing ? '文件已丢失，无法提取' : '提取关键帧'}
            disabled={!record.filepath || fileMissing}
            onClick={() => setFramesOpen(true)}
          />
          <Button
            type="text"
            icon={<AudioOutlined />}
            size="small"
            title={fileMissing ? '文件已丢失，无法转写' : '生成字幕（Whisper）'}
            disabled={!record.filepath || fileMissing}
            onClick={() => setTranscribeOpen(true)}
          />
          <Button
            type="text"
            icon={<FileTextOutlined />}
            size="small"
            title="查看字幕文稿"
            disabled={!srtPath}
            onClick={() => setSrtOpen(true)}
          />
          <Button
            type="text"
            icon={<FolderOpenOutlined />}
            size="small"
            title={fileMissing ? '文件已丢失' : '打开文件夹'}
            disabled={!record.filepath || fileMissing}
            onClick={() => {
              if (record.filepath) window.api.showItemInFolder(record.filepath)
            }}
          />
          <Popconfirm
            title="确定删除这条记录？"
            description="仅删除记录，不会删除已下载的文件"
            onConfirm={() => removeRecord(record.taskId)}
            okText="删除"
            cancelText="取消"
          >
            <Button
              type="text"
              danger
              icon={<DeleteOutlined />}
              size="small"
              title="删除记录"
            />
          </Popconfirm>
        </Space>
      </div>
      {framesOpen && record.filepath && (
        <ExtractFramesModal
          open={framesOpen}
          videoPath={record.filepath}
          videoTitle={record.title}
          onClose={() => setFramesOpen(false)}
        />
      )}
      {transcribeOpen && record.filepath && (
        <TranscribeModal
          open={transcribeOpen}
          videoPath={record.filepath}
          videoTitle={record.title}
          onClose={() => setTranscribeOpen(false)}
        />
      )}
      {srtOpen && srtPath && (
        <SrtViewer
          open={srtOpen}
          srtPath={srtPath}
          title={record.title}
          onClose={() => setSrtOpen(false)}
        />
      )}
    </Card>
  )
}

export default CompletedRecordCard
