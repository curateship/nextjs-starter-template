import * as React from "react"

import type { TableSortDirection } from "@/components/ui/table"

// Sort state shared by the dashboard tables: the active column, its direction,
// and the click handler that toggles direction on the active column or switches
// to a new one (resetting to ascending). The comparator itself stays in each
// dashboard because it is data-specific — this only owns the column/direction
// state and the toggle rule, so every table sorts the same way.
export function useTableSort<Column extends string>(
  initialColumn: Column,
  initialDirection: TableSortDirection = "asc"
) {
  const [sortColumn, setSortColumn] = React.useState<Column>(initialColumn)
  const [sortDirection, setSortDirection] =
    React.useState<TableSortDirection>(initialDirection)

  function toggleSort(column: Column) {
    if (sortColumn === column) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"))
      return
    }
    setSortColumn(column)
    setSortDirection("asc")
  }

  return {
    sortColumn,
    sortDirection,
    toggleSort,
    setSortColumn,
    setSortDirection,
  }
}
