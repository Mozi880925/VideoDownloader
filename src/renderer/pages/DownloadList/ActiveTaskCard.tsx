import React, { useState } from 'react'
import { Card, Progress, Button, Tag } from 'antd'
import { CloseCircleOutlined } from '@ant-design/icons'
import { useActiveTasksStore, type ActiveTask } from '../../store/activeTasksStore'
import { Thumbnail, statusLabel } from './shared'

// ---- 下载中卡片 ----

const ActiveTaskCard: React.FC<{ task: ActiveTask }> = ({ task }) => {
  const cancelTask = useActiveTasksStore((s) => s.removeTask)
  const [slowNetwork, setSlowNetwork] = useState(false)

  React.useEffect(() => {
    if (!task.hasReceivedProgress) {
      const timer = setTimeout(() => setSlowNetwork(true), 3000)
      return () => clearTimeout(timer)
    }
  }, [task.hasReceivedProgress])

  const statusText = !task.hasReceivedProgress
    ? (slowNetwork ? '网络较慢，正在重试连接...' : '正在连接服务器...')
    : statusLabel(task.status)

  const handleCancel = async () => {
    await window.api.cancelDownload(task.taskId)
    cancelTask(task.taskId)
  }

  return (
    <Card
      size="small"
      style={{ marginBottom: 10, borderRadius: 6 }}
      styles={{ body: { padding: '12px 16px' } }}
    >
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <Thumbnail src={task.thumbnail} size={64} />
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
            title={task.title}
          >
            {task.title || '未知标题'}
          </div>
          <div style={{ marginBottom: 6 }}>
            <Tag color="blue" style={{ fontSize: 11 }}>{task.platform}</Tag>
            <span style={{ color: task.hasReceivedProgress ? '#888' : (slowNetwork ? '#faad14' : '#1677ff'), fontSize: 12 }}>
              {statusText}
            </span>
          </div>
          {task.hasReceivedProgress ? (
            <>
              <Progress
                percent={Math.round(task.progress)}
                size="small"
                status="active"
                strokeColor={{ from: '#1677ff', to: '#4096ff' }}
              />
              {task.speed && (
                <div style={{ color: '#888', fontSize: 11, marginTop: 2 }}>
                  速度：{task.speed}&nbsp;&nbsp;大小：{task.filesize}&nbsp;&nbsp;剩余：{task.eta}
                </div>
              )}
            </>
          ) : (
            <div style={{ height: 38, display: 'flex', alignItems: 'center' }}>
              <Progress percent={100} size="small" status="active" strokeColor="#f0f0f0" showInfo={false} />
            </div>
          )}
        </div>
        <Button
          type="text"
          danger
          icon={<CloseCircleOutlined />}
          size="small"
          onClick={handleCancel}
          title="取消下载"
        />
      </div>
    </Card>
  )
}

export default ActiveTaskCard
