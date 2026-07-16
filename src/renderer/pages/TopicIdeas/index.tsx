import React, { useState, useEffect, useCallback } from 'react'
import PageTitle from '../../components/PageTitle'
import type { TopicIdea, TopicStatus } from '@shared/types'
import {
  Card, Button, Input, Tag, Space, Empty, Popconfirm,
  Modal, Select, Tooltip, message, Badge,
} from 'antd'
import {
  PlusOutlined, DeleteOutlined, EditOutlined,
  LinkOutlined, BulbOutlined,
} from '@ant-design/icons'

const STATUS_CFG: Record<TopicStatus, { label: string; color: string }> = {
  pending:   { label: '待定',   color: 'default' },
  planned:   { label: '计划中', color: 'blue' },
  filming:   { label: '拍摄中', color: 'orange' },
  published: { label: '已发布', color: 'green' },
}

const STATUS_ORDER: TopicStatus[] = ['pending', 'planned', 'filming', 'published']

function genId() {
  return `topic-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
}

const TopicIdeas: React.FC = () => {
  const [ideas, setIdeas] = useState<TopicIdea[]>([])
  const [editTarget, setEditTarget] = useState<TopicIdea | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState({ title: '', notes: '', ref_url: '', status: 'pending' as TopicStatus })
  const [titleError, setTitleError] = useState(false)
  const [messageApi, ctx] = message.useMessage()

  const load = useCallback(async () => {
    const rows = await window.api.topicList()
    setIdeas(rows)
  }, [])

  useEffect(() => { load() }, [load])

  const openAdd = () => {
    setEditTarget(null)
    setForm({ title: '', notes: '', ref_url: '', status: 'pending' })
    setTitleError(false)
    setModalOpen(true)
  }

  const openEdit = (idea: TopicIdea) => {
    setEditTarget(idea)
    setForm({ title: idea.title, notes: idea.notes, ref_url: idea.ref_url, status: idea.status })
    setTitleError(false)
    setModalOpen(true)
  }

  const handleSave = async () => {
    if (!form.title.trim()) { setTitleError(true); return }
    setTitleError(false)
    const now = Date.now()
    if (editTarget) {
      await window.api.topicUpdate(editTarget.id, {
        title: form.title, notes: form.notes, ref_url: form.ref_url,
        status: form.status, updated_at: now,
      })
    } else {
      const row: TopicIdea = {
        id: genId(), title: form.title, notes: form.notes,
        ref_url: form.ref_url, ref_title: '', ref_thumbnail: '',
        status: form.status, created_at: now, updated_at: now,
      }
      await window.api.topicInsert(row)
    }
    setModalOpen(false)
    await load()
    messageApi.success(editTarget ? '已更新' : '已添加')
  }

  const handleDelete = async (id: string) => {
    await window.api.topicDelete(id)
    await load()
  }

  const handleStatusChange = async (id: string, status: TopicStatus) => {
    await window.api.topicUpdate(id, { status, updated_at: Date.now() })
    setIdeas((prev) => prev.map((i) => i.id === id ? { ...i, status } : i))
  }

  // 按状态分组
  const grouped = STATUS_ORDER.map((s) => ({
    status: s,
    items: ideas.filter((i) => i.status === s),
  }))

  return (
    <div style={{ padding: 24 }}>
      {ctx}
      <div style={{ marginBottom: 20, display: 'flex', alignItems: 'flex-end', gap: 16 }}>
        <div>
          <PageTitle
            title="选题灵感库"
            size={28}
            style={{ margin: 0 }}
            subtitle="记录选题想法，追踪创作进度"
            subtitleStyle={{ color: '#888', marginTop: 6, marginBottom: 0 }}
          />
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={openAdd} style={{ marginLeft: 'auto' }}>
          新增选题
        </Button>
      </div>

      {ideas.length === 0 ? (
        <Card style={{ borderRadius: 8 }}>
          <Empty
            image={<BulbOutlined style={{ fontSize: 48, color: '#bbb' }} />}
            description="还没有选题，点击「新增选题」开始记录灵感"
          />
        </Card>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
          {grouped.map(({ status, items }) => (
            <div key={status}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <Tag color={STATUS_CFG[status].color} style={{ margin: 0 }}>
                  {STATUS_CFG[status].label}
                </Tag>
                <Badge count={items.length} color="#bbb" />
              </div>
              <Space direction="vertical" size={8} style={{ width: '100%' }}>
                {items.length === 0 ? (
                  <div style={{
                    border: '2px dashed #f0f0f0', borderRadius: 8,
                    padding: '20px 12px', textAlign: 'center', color: '#ccc', fontSize: 12,
                  }}>
                    暂无
                  </div>
                ) : items.map((idea) => (
                  <Card
                    key={idea.id}
                    size="small"
                    style={{ borderRadius: 8, borderLeft: `3px solid ${STATUS_CFG[idea.status].color === 'default' ? '#d9d9d9' : STATUS_CFG[idea.status].color}` }}
                    styles={{ body: { padding: '10px 12px' } }}
                  >
                    <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4, lineHeight: '1.4' }}>
                      {idea.title}
                    </div>
                    {idea.notes && (
                      <div style={{ fontSize: 12, color: '#888', marginBottom: 6, lineHeight: '1.5' }}>
                        {idea.notes}
                      </div>
                    )}
                    {idea.ref_url && (
                      <div style={{ fontSize: 11, marginBottom: 6 }}>
                        <LinkOutlined style={{ color: '#bbb', marginRight: 4 }} />
                        <a href={idea.ref_url} target="_blank" rel="noreferrer"
                          style={{ color: '#1677ff', maxWidth: 160, display: 'inline-block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', verticalAlign: 'bottom' }}>
                          {idea.ref_url}
                        </a>
                      </div>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                      <Select
                        size="small"
                        value={idea.status}
                        onChange={(v) => handleStatusChange(idea.id, v)}
                        style={{ flex: 1 }}
                        options={STATUS_ORDER.map((s) => ({ label: STATUS_CFG[s].label, value: s }))}
                      />
                      <Tooltip title="编辑">
                        <Button type="text" size="small" icon={<EditOutlined />} onClick={() => openEdit(idea)} />
                      </Tooltip>
                      <Popconfirm title="删除这条选题？" onConfirm={() => handleDelete(idea.id)} okText="删除" cancelText="取消">
                        <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                      </Popconfirm>
                    </div>
                  </Card>
                ))}
              </Space>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={modalOpen}
        title={editTarget ? '编辑选题' : '新增选题'}
        onCancel={() => setModalOpen(false)}
        onOk={handleSave}
        okText="保存"
        cancelText="取消"
        width={480}
      >
        <Space direction="vertical" size={12} style={{ width: '100%', marginTop: 8 }}>
          <div>
            <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>选题标题 *</div>
            <Input
              placeholder="例如：如何用 AI 提升视频剪辑效率"
              value={form.title}
              status={titleError ? 'error' : ''}
              onChange={(e) => { setTitleError(false); setForm((f) => ({ ...f, title: e.target.value })) }}
            />
            {titleError && <div style={{ color: '#ff4d4f', fontSize: 12, marginTop: 4 }}>请填写选题标题</div>}
          </div>
          <div>
            <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>备注想法</div>
            <Input.TextArea
              rows={3}
              placeholder="记录你的创作思路、参考角度..."
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </div>
          <div>
            <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>参考视频链接</div>
            <Input
              placeholder="https://youtube.com/watch?v=..."
              value={form.ref_url}
              onChange={(e) => setForm((f) => ({ ...f, ref_url: e.target.value }))}
            />
          </div>
          <div>
            <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>状态</div>
            <Select
              value={form.status}
              onChange={(v) => setForm((f) => ({ ...f, status: v }))}
              style={{ width: '100%' }}
              options={STATUS_ORDER.map((s) => ({ label: STATUS_CFG[s].label, value: s }))}
            />
          </div>
        </Space>
      </Modal>
    </div>
  )
}

export default TopicIdeas
