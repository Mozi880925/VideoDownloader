import React, { useCallback, useEffect, useState } from 'react'
import { App, Button, Empty, Popconfirm, Progress, Table, Tag, Tooltip } from 'antd'
import {
  DeleteOutlined,
  DownloadOutlined,
  EyeOutlined,
  PauseCircleOutlined,
  ReloadOutlined,
  SendOutlined,
  LinkOutlined,
} from '@ant-design/icons'
import type { DistilledArticleMeta, DistillStatus } from '@shared/types'
import PageTitle from '../../components/PageTitle'
import { PURPLE_GRADIENT } from '../../theme/tokens'
import ArticleView from './ArticleView'
import { SOURCE_TYPE_LABEL, exportArticleMarkdown } from './shared'

// ────────── 提纯稿库（AI 提纯任务进度 + 成稿查看/导出）──────────

const STATUS_CFG: Record<DistillStatus, { color: string; label: string }> = {
  running: { color: 'processing', label: '提纯中' },
  done: { color: 'success', label: '已完成' },
  failed: { color: 'error', label: '失败' },
  cancelled: { color: 'default', label: '已取消' },
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const DistillLibrary: React.FC = () => {
  const { message } = App.useApp()
  const [articles, setArticles] = useState<DistilledArticleMeta[]>([])
  const [loading, setLoading] = useState(false)
  const [viewId, setViewId] = useState<string | null>(null)
  const [deliveringId, setDeliveringId] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      setArticles(await window.api.distillList())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  // 提纯进度事件：running 行内更新进度，终态刷新列表
  useEffect(() => {
    const off = window.api.onDistillProgress((p) => {
      if (p.stage === 'distilling' || p.stage === 'preparing') {
        setArticles((prev) =>
          prev.map((a) =>
            a.id === p.articleId
              ? { ...a, status: 'running' as const, chunkDone: Math.max(0, p.chunkIndex - 1), chunkTotal: p.chunkTotal }
              : a,
          ),
        )
      } else {
        refresh()
        if (p.stage === 'done') message.success('提纯完成')
        else if (p.stage === 'failed') message.error(`提纯失败:${p.message || '未知错误'}`)
      }
    })
    return () => off()
  }, [refresh, message])

  const handleCancel = async (id: string) => {
    await window.api.distillCancel(id)
  }

  const handleRetry = async (id: string) => {
    const r = await window.api.distillRetry(id)
    if (r.status === 'success') {
      message.info('已重新开始（从断点续跑）')
      refresh()
    } else {
      message.error(r.errorMessage || '重试失败')
    }
  }

  const handleDelete = async (id: string) => {
    await window.api.distillDelete(id)
    setArticles((prev) => prev.filter((a) => a.id !== id))
  }

  const handleExport = async (a: DistilledArticleMeta) => {
    const saved = await exportArticleMarkdown(a.id, a.title)
    if (saved) message.success(`已导出:${saved}`)
  }

  const handleDeliverFeishu = async (a: DistilledArticleMeta) => {
    if (a.feishuUrl) {
      window.api.openExternal(a.feishuUrl).catch(() => {})
      return
    }
    setDeliveringId(a.id)
    try {
      const r = await window.api.feishuCreateDoc(a.id)
      if (r.status === 'success') {
        message.success('已交付飞书文档')
        setArticles((prev) => prev.map((x) => (x.id === a.id ? { ...x, feishuUrl: r.data.url } : x)))
        window.api.openExternal(r.data.url).catch(() => {})
      } else {
        message.error(r.errorMessage || '交付失败')
      }
    } finally {
      setDeliveringId(null)
    }
  }

  return (
    <div style={{ padding: 24 }}>
      <PageTitle
        title="提纯稿库"
        size={24}
        gradient={PURPLE_GRADIENT}
        style={{ marginBottom: 6 }}
        subtitle="转录稿经 AI 整理成的分享式提纯版原文——不是摘要，是去噪后的可读全文"
        subtitleStyle={{ color: '#888', marginBottom: 20, fontSize: 14 }}
      />

      <Table<DistilledArticleMeta>
        rowKey="id"
        dataSource={articles}
        loading={loading}
        size="middle"
        pagination={{ pageSize: 15, showSizeChanger: false }}
        locale={{
          emptyText: (
            <Empty
              description="还没有提纯稿。在字幕文稿查看器、订阅视频文案或 AI 识别字幕完成后点「AI 提纯」发起"
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            />
          ),
        }}
        columns={[
          {
            title: '标题',
            dataIndex: 'title',
            ellipsis: true,
            render: (v: string, a) => (
              <a onClick={() => a.status === 'done' && setViewId(a.id)} style={{ fontWeight: 600, cursor: a.status === 'done' ? 'pointer' : 'default', color: a.status === 'done' ? undefined : '#999' }}>
                {v}
              </a>
            ),
          },
          {
            title: '来源',
            dataIndex: 'sourceType',
            width: 110,
            render: (v: DistilledArticleMeta['sourceType']) => <Tag style={{ fontSize: 11 }}>{SOURCE_TYPE_LABEL[v]}</Tag>,
          },
          {
            title: '原文字数',
            dataIndex: 'sourceCharCount',
            width: 100,
            render: (v: number) => v.toLocaleString(),
          },
          {
            title: '状态',
            dataIndex: 'status',
            width: 180,
            render: (v: DistillStatus, a) =>
              v === 'running' ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Progress
                    percent={a.chunkTotal > 0 ? Math.round((a.chunkDone / a.chunkTotal) * 100) : 0}
                    size="small"
                    style={{ width: 90, margin: 0 }}
                  />
                  <span style={{ fontSize: 11, color: '#888' }}>{a.chunkDone}/{a.chunkTotal} 块</span>
                </div>
              ) : (
                <Tooltip title={v === 'failed' ? a.errorMessage : undefined}>
                  <Tag color={STATUS_CFG[v].color} style={{ fontSize: 11 }}>{STATUS_CFG[v].label}</Tag>
                </Tooltip>
              ),
          },
          {
            title: '模型',
            dataIndex: 'model',
            width: 120,
            ellipsis: true,
            render: (v: string) => <span style={{ fontSize: 12, color: '#888' }}>{v}</span>,
          },
          {
            title: '创建时间',
            dataIndex: 'createdAt',
            width: 140,
            render: (v: number) => <span style={{ fontSize: 12, color: '#888' }}>{formatTime(v)}</span>,
          },
          {
            title: '操作',
            key: 'actions',
            width: 210,
            render: (_v, a) => (
              <div style={{ display: 'flex', gap: 2 }}>
                {a.status === 'done' && (
                  <>
                    <Button type="text" size="small" icon={<EyeOutlined />} title="查看" onClick={() => setViewId(a.id)} />
                    <Button type="text" size="small" icon={<DownloadOutlined />} title="导出 Markdown" onClick={() => handleExport(a)} />
                    <Button
                      type="text"
                      size="small"
                      icon={a.feishuUrl ? <LinkOutlined /> : <SendOutlined />}
                      loading={deliveringId === a.id}
                      title={a.feishuUrl ? '打开飞书文档' : '交付飞书文档'}
                      onClick={() => handleDeliverFeishu(a)}
                    />
                  </>
                )}
                {a.status === 'running' && (
                  <Button type="text" size="small" danger icon={<PauseCircleOutlined />} title="取消" onClick={() => handleCancel(a.id)} />
                )}
                {(a.status === 'failed' || a.status === 'cancelled') && (
                  <Button type="text" size="small" icon={<ReloadOutlined />} title="重试（断点续跑）" onClick={() => handleRetry(a.id)} />
                )}
                {a.status !== 'running' && (
                  <Popconfirm title="删除这篇提纯稿？" onConfirm={() => handleDelete(a.id)} okText="删除" cancelText="取消">
                    <Button type="text" size="small" danger icon={<DeleteOutlined />} title="删除" />
                  </Popconfirm>
                )}
              </div>
            ),
          },
        ]}
      />

      <ArticleView articleId={viewId} onClose={() => setViewId(null)} />
    </div>
  )
}

export default DistillLibrary
