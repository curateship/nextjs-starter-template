import * as React from "react"

import {
  TableHead,
  TableHeader,
  TableRow,
  TableSortButton,
  type TableSortDirection,
} from "@/components/ui/table"

export type SortableColumn<Column extends string> = {
  key: Column
  label: string
  /** The `TableHead` column preset — "main", "meta", "preview", "select". */
  column?: React.ComponentProps<typeof TableHead>["column"]
  className?: string
}

/**
 * The header row every sortable dashboard table used to write by hand: one
 * `TableSortButton` per column, plus slots for the cells that are not sort
 * buttons — `leading` for the select-all checkbox, `trailing` for "Actions".
 *
 * `withAriaSort` is opt-in so converting a table that never set `aria-sort`
 * leaves its DOM byte-for-byte unchanged; pass it where the hand-written
 * version already did.
 */
export function SortableTableHeader<Column extends string>({
  columns,
  sort,
  direction,
  onSort,
  leading,
  trailing,
  withAriaSort,
}: {
  columns: SortableColumn<Column>[]
  sort: Column
  direction: TableSortDirection
  onSort: (column: Column) => void
  leading?: React.ReactNode
  trailing?: React.ReactNode
  withAriaSort?: boolean
}) {
  return (
    <TableHeader>
      <TableRow>
        {leading}
        {columns.map((column) => (
          <TableHead
            key={column.key}
            column={column.column}
            className={column.className}
            aria-sort={
              withAriaSort
                ? sort === column.key
                  ? direction === "asc"
                    ? "ascending"
                    : "descending"
                  : "none"
                : undefined
            }
          >
            <TableSortButton
              active={sort === column.key}
              direction={direction}
              onClick={() => onSort(column.key)}
            >
              {column.label}
            </TableSortButton>
          </TableHead>
        ))}
        {trailing}
      </TableRow>
    </TableHeader>
  )
}
