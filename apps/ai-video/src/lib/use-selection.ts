import * as React from "react"

// Multi-select state shared by the list/grid dashboards: a Set of selected ids
// plus the "select all visible" helpers. `visibleIds` is the current page's ids
// so select-all only affects what's on screen.
export function useSelection(visibleIds: string[]) {
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set())

  function toggleSelected(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id))

  function toggleVisibleSelected() {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (allVisibleSelected) {
        visibleIds.forEach((id) => next.delete(id))
      } else {
        visibleIds.forEach((id) => next.add(id))
      }
      return next
    })
  }

  // Drop the given ids from the selection (after a delete), or all when omitted.
  function clearSelection(ids?: string[]) {
    setSelectedIds((current) => {
      if (!ids) return new Set()
      const next = new Set(current)
      ids.forEach((id) => next.delete(id))
      return next
    })
  }

  return {
    selectedIds,
    toggleSelected,
    allVisibleSelected,
    toggleVisibleSelected,
    clearSelection,
  }
}
