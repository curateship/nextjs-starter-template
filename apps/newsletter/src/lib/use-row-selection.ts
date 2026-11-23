import * as React from "react"

/** Multi-select over the currently visible page of row ids. */
export function useRowSelection(visibleIds: string[]) {
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set())

  const visibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id))
  const visiblePartiallySelected =
    !visibleSelected && visibleIds.some((id) => selectedIds.has(id))

  const toggleRow = (id: string) => {
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

  const toggleVisible = () => {
    setSelectedIds((current) => {
      if (visibleSelected) {
        const next = new Set(current)
        visibleIds.forEach((id) => next.delete(id))
        return next
      }

      return new Set([...current, ...visibleIds])
    })
  }

  const removeId = (id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current)
      next.delete(id)
      return next
    })
  }

  return {
    selectedIds,
    setSelectedIds,
    visibleSelected,
    visiblePartiallySelected,
    toggleRow,
    toggleVisible,
    removeId,
  }
}
