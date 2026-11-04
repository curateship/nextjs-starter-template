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

/** What one column sorts by: text sorts alphabetically, numbers by size. */
export type SortKey<Row> = (row: Row) => string | number

/**
 * A copy of `rows` in the order the table's header asks for. Each column names
 * the one value it sorts by, so a table states what its columns mean instead
 * of writing the comparison out again. Rows that tie keep their order.
 */
export function sortRows<Row, Column extends string>(
  rows: readonly Row[],
  { sort, direction }: { sort: Column; direction: TableSortDirection },
  keys: Record<Column, SortKey<Row>>
): Row[] {
  const factor = direction === "asc" ? 1 : -1
  const key = keys[sort]
  return [...rows].sort((a, b) => {
    const left = key(a)
    const right = key(b)
    const compared =
      typeof left === "string" && typeof right === "string"
        ? left.localeCompare(right)
        : Number(left) - Number(right)
    return factor * compared
  })
}
