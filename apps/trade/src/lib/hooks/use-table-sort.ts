import * as React from "react"

import type { TableSortDirection } from "@/components/ui/table"

/**
 * Sort state for a client-sorted table. Clicking the active column flips it;
 * clicking a new column starts it on its natural direction — "asc" unless
 * `defaultDirectionFor` says otherwise (number columns usually start
 * biggest-first).
 */
export function useTableSort<Column extends string>(
  initialColumn: Column,
  initialDirection: TableSortDirection = "asc",
  defaultDirectionFor?: (column: Column) => TableSortDirection
) {
  const [sort, setSort] = React.useState<Column>(initialColumn)
  const [direction, setDirection] =
    React.useState<TableSortDirection>(initialDirection)

  const toggleSort = React.useCallback(
    (column: Column) => {
      if (column === sort) {
        setDirection((current) => (current === "asc" ? "desc" : "asc"))
        return
      }
      setSort(column)
      setDirection(defaultDirectionFor?.(column) ?? "asc")
    },
    [sort, defaultDirectionFor]
  )

  return { sort, direction, toggleSort }
}
