import React from 'react'
import { Badge, Button, Dropdown, Empty, Tooltip } from 'antd'
import type { MenuProps } from 'antd'
import {
  AppstoreOutlined,
  DeleteOutlined,
  FolderOutlined,
  InboxOutlined,
  LoadingOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  MoreOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  PushpinFilled,
  PushpinOutlined,
  ReloadOutlined,
} from '@ant-design/icons'

// ────────── 左栏：频道列表 ──────────

interface ChannelListProps {
  subs: ChannelSubscription[]
  selectedId: string                 // 'all' 或频道 id
  totalNewCount: number
  checkingSubId: string | null
  collapsed: boolean
  onToggleCollapse: () => void
  onSelect: (id: string) => void
  onCheckOne: (id: string) => void
  onTogglePin: (sub: ChannelSubscription) => void
  onToggleEnabled: (sub: ChannelSubscription) => void
  onEditGroup: (sub: ChannelSubscription) => void
  onViewAll: (sub: ChannelSubscription) => void
  onRemove: (sub: ChannelSubscription) => void
}

const ChannelList: React.FC<ChannelListProps> = ({
  subs,
  selectedId,
  totalNewCount,
  checkingSubId,
  collapsed,
  onToggleCollapse,
  onSelect,
  onCheckOne,
  onTogglePin,
  onToggleEnabled,
  onEditGroup,
  onViewAll,
  onRemove,
}) => {
  // ── 分区：置顶 → 命名分组（字母序）→ 未分组 ──
  const sections: { key: string; label: string | null; subs: ChannelSubscription[] }[] = []
  const pinned = subs.filter((s) => s.pinned)
  const rest = subs.filter((s) => !s.pinned)
  const grpMap: Record<string, ChannelSubscription[]> = {}
  for (const s of rest) {
    const k = s.group || ''
    if (!grpMap[k]) grpMap[k] = []
    grpMap[k].push(s)
  }
  if (pinned.length > 0) sections.push({ key: '__pinned__', label: '📌 置顶', subs: pinned })
  Object.keys(grpMap)
    .filter((k) => k !== '')
    .sort((a, b) => a.localeCompare(b))
    .forEach((k) => sections.push({ key: k, label: k, subs: grpMap[k] }))
  if (grpMap['']) {
    // 只有未分组一个分区时不显示标题
    sections.push({ key: '__ungrouped__', label: sections.length > 0 ? '未分组' : null, subs: grpMap[''] })
  }

  const renderRow = (sub: ChannelSubscription) => {
    const selected = selectedId === sub.id
    const checking = checkingSubId === sub.id
    const menu: MenuProps = {
      items: [
        { key: 'check', label: '立即检查', icon: <ReloadOutlined /> },
        { key: 'viewall', label: '浏览频道视频', icon: <AppstoreOutlined /> },
        { type: 'divider' },
        {
          key: 'pin',
          label: sub.pinned ? '取消置顶' : '置顶',
          icon: sub.pinned ? <PushpinFilled /> : <PushpinOutlined />,
        },
        {
          key: 'group',
          label: sub.group ? `分组：${sub.group}` : '设置分组',
          icon: <FolderOutlined />,
        },
        {
          key: 'toggle',
          label: sub.enabled ? '暂停自动检查' : '恢复自动检查',
          icon: sub.enabled ? <PauseCircleOutlined /> : <PlayCircleOutlined />,
        },
        { type: 'divider' },
        { key: 'remove', label: '删除订阅', icon: <DeleteOutlined />, danger: true },
      ],
      onClick: ({ key, domEvent }) => {
        domEvent.stopPropagation()
        if (key === 'check') onCheckOne(sub.id)
        else if (key === 'viewall') onViewAll(sub)
        else if (key === 'pin') onTogglePin(sub)
        else if (key === 'group') onEditGroup(sub)
        else if (key === 'toggle') onToggleEnabled(sub)
        else if (key === 'remove') onRemove(sub)
      },
    }

    return (
      <div
        key={sub.id}
        onClick={() => onSelect(sub.id)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '7px 4px 7px 9px',
          marginBottom: 2,
          cursor: 'pointer',
          borderRadius: 6,
          background: selected ? '#e6f4ff' : 'transparent',
          borderLeft: `3px solid ${selected ? '#1677ff' : 'transparent'}`,
          opacity: sub.enabled ? 1 : 0.55,
          transition: 'background 0.15s',
        }}
      >
        {sub.pinned && <PushpinFilled style={{ color: '#fa8c16', fontSize: 11, flexShrink: 0 }} />}
        <span
          style={{
            flex: 1,
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            fontSize: 13,
            fontWeight: sub.newCount > 0 ? 600 : 400,
            color: selected ? '#1677ff' : '#333',
          }}
          title={sub.name + (sub.enabled ? '' : '（已暂停）')}
        >
          {sub.name}
        </span>
        {checking ? (
          <LoadingOutlined style={{ color: '#1677ff', fontSize: 12, flexShrink: 0 }} />
        ) : (
          sub.newCount > 0 && <Badge count={sub.newCount} size="small" style={{ flexShrink: 0 }} />
        )}
        <Dropdown menu={menu} trigger={['click']} placement="bottomRight">
          <Button
            type="text"
            size="small"
            icon={<MoreOutlined />}
            style={{ color: '#bbb', flexShrink: 0 }}
            onClick={(e) => e.stopPropagation()}
          />
        </Dropdown>
      </div>
    )
  }

  const allSelected = selectedId === 'all'

  // ── 折叠态：窄条，只保留展开按钮 + 全部视频 + 各频道首字头像 ──
  if (collapsed) {
    return (
      <div
        style={{
          width: 48,
          flexShrink: 0,
          background: '#fff',
          borderRadius: 8,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '8px 0',
          gap: 4,
          boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
          overflow: 'hidden',
        }}
      >
        <Tooltip title="展开频道列表" placement="right">
          <Button type="text" icon={<MenuUnfoldOutlined />} onClick={onToggleCollapse} style={{ color: '#888' }} />
        </Tooltip>
        <div style={{ width: 24, height: 1, background: '#f0f0f0', margin: '2px 0' }} />
        <Tooltip title="全部视频" placement="right">
          <Badge count={totalNewCount} size="small" offset={[-4, 4]}>
            <Button
              type="text"
              icon={<InboxOutlined />}
              onClick={() => onSelect('all')}
              style={{ color: allSelected ? '#1677ff' : '#999', background: allSelected ? '#e6f4ff' : undefined }}
            />
          </Badge>
        </Tooltip>
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, width: '100%', paddingTop: 4 }}>
          {subs.map((sub) => {
            const selected = selectedId === sub.id
            return (
              <Tooltip key={sub.id} title={sub.name + (sub.enabled ? '' : '（已暂停）')} placement="right">
                <Badge dot={sub.newCount > 0} offset={[-3, 3]}>
                  <div
                    onClick={() => onSelect(sub.id)}
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: 'pointer',
                      userSelect: 'none',
                      flexShrink: 0,
                      background: selected ? '#1677ff' : '#f0f0f0',
                      color: selected ? '#fff' : '#666',
                      opacity: sub.enabled ? 1 : 0.45,
                      border: sub.pinned ? '2px solid #ffc53d' : '2px solid transparent',
                    }}
                  >
                    {(sub.name || '?').slice(0, 1).toUpperCase()}
                  </div>
                </Badge>
              </Tooltip>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div
      style={{
        width: 280,
        flexShrink: 0,
        background: '#fff',
        borderRadius: 8,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
      }}
    >
      <div
        style={{
          padding: '8px 8px 8px 14px',
          borderBottom: '1px solid #f0f0f0',
          fontWeight: 600,
          fontSize: 13,
          color: '#666',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <span style={{ flex: 1 }}>订阅频道（{subs.length}）</span>
        <Tooltip title="折叠频道列表">
          <Button type="text" size="small" icon={<MenuFoldOutlined />} onClick={onToggleCollapse} style={{ color: '#bbb' }} />
        </Tooltip>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
        {/* 全部视频（聚合入口） */}
        <div
          onClick={() => onSelect('all')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 10px 8px 9px',
            cursor: 'pointer',
            borderRadius: 6,
            background: allSelected ? '#e6f4ff' : 'transparent',
            borderLeft: `3px solid ${allSelected ? '#1677ff' : 'transparent'}`,
          }}
        >
          <InboxOutlined style={{ color: allSelected ? '#1677ff' : '#999', fontSize: 14 }} />
          <span
            style={{
              flex: 1,
              fontSize: 13,
              fontWeight: totalNewCount > 0 ? 600 : 500,
              color: allSelected ? '#1677ff' : '#333',
            }}
          >
            全部视频
          </span>
          {totalNewCount > 0 && <Badge count={totalNewCount} size="small" />}
        </div>

        <div style={{ height: 1, background: '#f0f0f0', margin: '6px 4px' }} />

        {subs.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={<span style={{ fontSize: 12, color: '#bbb' }}>暂无订阅</span>}
            style={{ marginTop: 40 }}
          />
        ) : (
          sections.map((sec) => (
            <div key={sec.key}>
              {sec.label && (
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: '#999',
                    padding: '8px 6px 4px',
                    userSelect: 'none',
                  }}
                >
                  {sec.label}
                  <span style={{ color: '#ccc', fontWeight: 400, marginLeft: 4 }}>{sec.subs.length}</span>
                </div>
              )}
              {sec.subs.map(renderRow)}
            </div>
          ))
        )}
      </div>
    </div>
  )
}

export default ChannelList
