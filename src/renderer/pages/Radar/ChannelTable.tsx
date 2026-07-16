import React from 'react'
import { Table, Button, Tag, Tooltip, Popconfirm, Empty } from 'antd'
import { DeleteOutlined, LinkOutlined } from '@ant-design/icons'
import type { RadarChannel } from '@shared/types'
import Thumbnail from '../../components/Thumbnail'
import { PRIMARY } from '../../theme/tokens'

// ---- 数字展示 ----

export function formatCount(n?: number): string {
  if (typeof n !== 'number' || n < 0) return '-'
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}亿`
  if (n >= 10_000) return `${(n / 10_000).toFixed(1)}万`
  return n.toLocaleString()
}

function formatDate(iso: string): string {
  const t = Date.parse(iso)
  if (isNaN(t)) return '-'
  const d = new Date(t)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

interface Props {
  channels: RadarChannel[]
  loading: boolean
  onRemove: (channelId: string) => void
}

const ChannelTable: React.FC<Props> = ({ channels, loading, onRemove }) => {
  const openChannel = (c: RadarChannel) => {
    const url = c.customUrl
      ? `https://www.youtube.com/${c.customUrl}`
      : `https://www.youtube.com/channel/${c.channelId}`
    window.api.openExternal(url).catch(() => {})
  }

  return (
    <Table<RadarChannel>
      rowKey="channelId"
      dataSource={channels}
      loading={loading}
      size="middle"
      pagination={{ pageSize: 20, showSizeChanger: false, showTotal: (t) => `共 ${t} 个频道` }}
      locale={{ emptyText: <Empty description="频道库还是空的，添加关键词后点「开始扫描」" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
      columns={[
        {
          title: '频道',
          dataIndex: 'title',
          render: (_v, c) => (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              <Thumbnail src={c.thumbnail} width={36} height={36} radius={18} iconSize={16} />
              <div style={{ minWidth: 0 }}>
                <a
                  onClick={() => openChannel(c)}
                  style={{ fontWeight: 600, fontSize: 13, color: PRIMARY, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 220 }}
                  title={c.title}
                >
                  {c.title} <LinkOutlined style={{ fontSize: 11 }} />
                </a>
                <span style={{ fontSize: 11, color: '#999' }}>
                  {c.country && <Tag style={{ fontSize: 10, lineHeight: '14px', marginRight: 4 }}>{c.country}</Tag>}
                  建号 {formatDate(c.publishedAt)}
                </span>
              </div>
            </div>
          ),
        },
        {
          title: '月龄',
          dataIndex: 'ageMonths',
          width: 90,
          sorter: (a, b) => a.ageMonths - b.ageMonths,
          render: (v: number) => {
            if (v <= 0) return '-'
            const isNew = v <= 24
            return <Tag color={isNew ? 'green' : 'default'} style={{ fontSize: 11 }}>{v} 个月</Tag>
          },
        },
        {
          title: '订阅',
          dataIndex: 'subscriberCount',
          width: 90,
          sorter: (a, b) => a.subscriberCount - b.subscriberCount,
          render: (v: number) => <span style={{ fontWeight: 600 }}>{formatCount(v)}</span>,
        },
        {
          title: (
            <Tooltip title="订阅数 ÷ 频道月龄。同样的体量，起步越晚数值越高——速度导向的核心指标">
              <span>月均吸粉</span>
            </Tooltip>
          ),
          dataIndex: 'subsPerMonth',
          width: 110,
          defaultSortOrder: 'descend',
          sorter: (a, b) => a.subsPerMonth - b.subsPerMonth,
          render: (v: number) => <span style={{ fontWeight: 600, color: PRIMARY }}>{formatCount(v)}/月</span>,
        },
        {
          title: '视频数',
          dataIndex: 'videoCount',
          width: 85,
          sorter: (a, b) => a.videoCount - b.videoCount,
          render: (v: number) => formatCount(v),
        },
        {
          title: '总播放',
          dataIndex: 'viewCount',
          width: 95,
          sorter: (a, b) => a.viewCount - b.viewCount,
          render: (v: number) => formatCount(v),
        },
        {
          title: '来源关键词',
          dataIndex: 'sourceKeyword',
          width: 130,
          render: (v: string) => v ? <Tag style={{ fontSize: 11 }}>{v}</Tag> : '-',
        },
        {
          title: '',
          key: 'actions',
          width: 50,
          render: (_v, c) => (
            <Popconfirm title="从频道库移除？" onConfirm={() => onRemove(c.channelId)} okText="移除" cancelText="取消">
              <Button type="text" danger size="small" icon={<DeleteOutlined />} title="移除频道" />
            </Popconfirm>
          ),
        },
      ]}
    />
  )
}

export default ChannelTable
