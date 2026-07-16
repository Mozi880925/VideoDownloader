import { useState, useMemo, useCallback } from 'react'

// ---- 多选状态 Hook（已完成 / 失败列表共用）----

export function useSelection(ids: string[]) {
  const [selected, setSelected] = useState<Set<string>>(new Set())

  // 清理已不存在的选中项
  const validSelected = useMemo(() => {
    const idSet = new Set(ids)
    const cleaned = new Set<string>()
    for (const id of selected) {
      if (idSet.has(id)) cleaned.add(id)
    }
    return cleaned
  }, [selected, ids])

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const toggleAll = useCallback(() => {
    if (validSelected.size === ids.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(ids))
    }
  }, [validSelected.size, ids])

  const clear = useCallback(() => setSelected(new Set()), [])

  return {
    selected: validSelected,
    toggle,
    toggleAll,
    clear,
    allSelected: ids.length > 0 && validSelected.size === ids.length,
  }
}
