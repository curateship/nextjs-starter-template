"use client"

import { useCallback, useState } from "react"

export type AdminSortDirection = "asc" | "desc"

export function useAdminSort<TColumn extends string>(
  initialColumn: TColumn | null = null,
  initialDirection: AdminSortDirection = "asc"
) {
  const [sortColumn, setSortColumn] = useState<TColumn | null>(initialColumn)
  const [sortDirection, setSortDirection] = useState<AdminSortDirection>(initialDirection)

  const toggleSort = useCallback((column: TColumn) => {
    if (sortColumn === column) {
      if (sortDirection === "desc") {
        setSortColumn(null)
        setSortDirection("asc")
      } else {
        setSortDirection("desc")
      }
      return
    }

    setSortColumn(column)
    setSortDirection("asc")
  }, [sortColumn, sortDirection])

  const resetSort = useCallback(() => {
    setSortColumn(initialColumn)
    setSortDirection(initialDirection)
  }, [initialColumn, initialDirection])

  return {
    sortColumn,
    sortDirection,
    toggleSort,
    resetSort,
  }
}

export function useAdminBulkSelection() {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [allSelected, setAllSelected] = useState(false)

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set())
    setAllSelected(false)
  }, [])

  const toggleOne = useCallback((id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) {
        next.delete(id)
        setAllSelected(false)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  const togglePage = useCallback((pageIds: string[]) => {
    setSelectedIds((current) => {
      const pageSelected = pageIds.length > 0 && pageIds.every((id) => current.has(id)) && current.size === pageIds.length
      setAllSelected(false)
      return pageSelected ? new Set() : new Set(pageIds)
    })
  }, [])

  const selectAll = useCallback((ids: string[]) => {
    setSelectedIds(new Set(ids))
    setAllSelected(ids.length > 0)
  }, [])

  const remove = useCallback((id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current)
      next.delete(id)
      return next
    })
    setAllSelected(false)
  }, [])

  const isPageSelected = useCallback((pageIds: string[]) => {
    return allSelected || (pageIds.length > 0 && selectedIds.size === pageIds.length && pageIds.every((id) => selectedIds.has(id)))
  }, [allSelected, selectedIds])

  return {
    selectedIds,
    selectedCount: selectedIds.size,
    allSelected,
    clearSelection,
    toggleOne,
    togglePage,
    selectAll,
    remove,
    isPageSelected,
  }
}
