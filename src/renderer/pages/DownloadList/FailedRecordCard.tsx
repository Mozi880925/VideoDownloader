import React from 'react'
import { Card, Button, Space, Tag, Popconfirm, Checkbox, Tooltip } from 'antd'
import {
  DeleteOutlined,
  ReloadOutlined,
  WarningOutlined,
  LoginOutlined,
} from '@ant-design/icons'
import type { FailedRecord } from '@shared/types'
import { useHistoryStore } from '../../store/historyStore'
import { useNavStore } from '../../store/navStore'
import { Thumbnail, formatTime } from './shared'

// ---- 失败记录卡片 ----

interface FailedCardProps {
  record: FailedRecord
  selected: boolean
  onToggle: (taskId: string) => void
}

function isCookieError(msg: string): boolean {
  return /登录|会员|Cookie/i.test(msg)
}

const FailedRecordCard: React.FC<FailedCardProps> = ({ record, selected, onToggle }) => {
  const removeFailedRecord = useHistoryStore((s) => s.removeFailedRecord)
  const needsLogin = isCookieError(record.errorMessage)

  return (
    <Card
      size="small"
      style={{
        marginBottom: 10,
        borderRadius: 6,
        borderLeft: '3px solid #ff4d4f',
        background: selected ? '#fff1f0' : undefined,
      }}
      styles={{ body: { padding: '12px 16px' } }}
    >
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <Checkbox
          checked={selected}
          onChange={() => onToggle(record.taskId)}
          style={{ marginTop: 4 }}
        />
        <Thumbnail src={record.thumbnail} size={56} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontWeight: 600,
              fontSize: 13,
              color: '#1a1a1a',
              marginBottom: 4,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            title={record.title}
          >
            {record.title || '未知标题'}
          </div>
          <Space size={8} style={{ marginBottom: 4 }}>
            <Tag color="blue" style={{ fontSize: 11 }}>{record.platform}</Tag>
            <span style={{ color: '#999', fontSize: 11 }}>{formatTime(record.failedAt)}</span>
          </Space>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
            <div
              style={{
                color: '#ff4d4f',
                fontSize: 12,
                lineHeight: '1.4',
                maxHeight: 40,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                flex: 1,
              }}
              title={record.errorMessage}
            >
              <WarningOutlined style={{ marginRight: 4 }} />
              {record.errorMessage || '未知错误'}
            </div>
            {needsLogin && (
              <Tooltip title="在应用内登录 YouTube，刷新 Cookie 后重试">
                <Button
                  size="small"
                  type="link"
                  icon={<LoginOutlined />}
                  style={{ fontSize: 11, padding: '0 4px', flexShrink: 0 }}
                  onClick={() => window.api.openLoginWindow().catch(() => {})}
                >
                  重新登录
                </Button>
              </Tooltip>
            )}
          </div>
        </div>
        <Space size={4} direction="vertical">
          <Button
            type="text"
            icon={<ReloadOutlined />}
            size="small"
            title="重新下载"
            onClick={() => {
              useNavStore.getState().gotoRetry(record.url)
            }}
          />
          <Popconfirm
            title="确定删除这条失败记录？"
            onConfirm={() => removeFailedRecord(record.taskId)}
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
    </Card>
  )
}

export default FailedRecordCard
