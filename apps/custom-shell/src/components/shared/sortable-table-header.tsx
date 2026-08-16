import * as React from "react"

import { Checkbox } from "@/components/ui/checkbox"
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
 */
export function SortableTableHeader<Column extends string>({
  columns,
  sort,
  direction,
  onSort,
  leading,
  trailing,
}: {
  columns: SortableColumn<Column>[]
  sort: Column
  direction: TableSortDirection
  onSort: (column: Column) => void
  leading?: React.ReactNode
  trailing?: React.ReactNode
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
              sort === column.key
                ? direction === "asc"
                  ? "ascending"
                  : "descending"
                : "none"
            }
          >
            <TableSortButton
              aria-label={column.label}
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

export function SelectAllTableHead({
  checked,
  disabled,
  noun,
  onCheckedChange,
}: {
  checked: boolean | "indeterminate"
  disabled?: boolean
  noun: string
  onCheckedChange: (checked: boolean) => void
}) {
  return (
    <TableHead column="select">
      <Checkbox
        aria-label={`Select the ${noun} on this page`}
        checked={checked}
        disabled={disabled}
        onCheckedChange={(value) => onCheckedChange(value === true)}
      />
    </TableHead>
  )
}
