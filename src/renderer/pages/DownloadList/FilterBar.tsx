import React from 'react'
import { Input, Select, DatePicker } from 'antd'
import { SearchOutlined, FilterOutlined } from '@ant-design/icons'
import dayjs, { type Dayjs } from 'dayjs'
import { PLATFORM_OPTIONS } from '../../utils/platform'
import { useFilterStore } from './filterStore'

// ---- 筛选工具栏 ----

const FilterBar: React.FC = () => {
  const filterKeyword = useFilterStore((s) => s.filterKeyword)
  const filterPlatform = useFilterStore((s) => s.filterPlatform)
  const filterDateRange = useFilterStore((s) => s.filterDateRange)
  const setFilterKeyword = useFilterStore((s) => s.setFilterKeyword)
  const setFilterPlatform = useFilterStore((s) => s.setFilterPlatform)
  const setFilterDateRange = useFilterStore((s) => s.setFilterDateRange)

  const platformOptions = [
    { value: '__all__', label: '全部平台' },
    ...PLATFORM_OPTIONS.map((p) => ({ value: p, label: p })),
  ]

  const rangeValue: [Dayjs, Dayjs] | null = filterDateRange
    ? [dayjs(filterDateRange[0]), dayjs(filterDateRange[1])]
    : null

  return (
    <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
      <Input
        placeholder="搜索标题关键词…"
        prefix={<SearchOutlined style={{ color: '#bbb' }} />}
        value={filterKeyword}
        onChange={(e) => setFilterKeyword(e.target.value)}
        allowClear
        style={{ flex: 1, minWidth: 200, maxWidth: 320, borderRadius: 6 }}
      />
      <Select
        value={filterPlatform ?? '__all__'}
        onChange={(v) => setFilterPlatform(v === '__all__' ? null : v)}
        options={platformOptions}
        style={{ width: 130 }}
        suffixIcon={<FilterOutlined />}
      />
      <DatePicker.RangePicker
        value={rangeValue}
        onChange={(dates) => {
          if (!dates || !dates[0] || !dates[1]) {
            setFilterDateRange(null)
          } else {
            setFilterDateRange([
              dates[0].startOf('day').valueOf(),
              dates[1].endOf('day').valueOf(),
            ])
          }
        }}
        placeholder={['开始日期', '结束日期']}
        style={{ borderRadius: 6 }}
        allowClear
      />
    </div>
  )
}

export default FilterBar
