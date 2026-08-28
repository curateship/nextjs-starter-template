import * as React from "react"

import { LoadingRow } from "@/components/ui/loading-row"
import { TableSortButton, type TableSortDirection } from "@/components/ui/table"
import { cn } from "@/lib/utils"
import { stickyPanelTableCellClassName } from "@/lib/layout/panel-section-bar"

function HeaderCell({
  children,
  sort,
  info,
}: {
  children: React.ReactNode
  /** Omitted on the actions column, which is the one thing never sorted. */
  sort?: { active: boolean; direction: TableSortDirection; onClick: () => void }
  /** A mark beside the label, kept outside the sort button. */
  info?: React.ReactNode
}) {
  return (
    <th
      scope="col"
      className={cn(
        "px-3 py-2 text-left text-xs font-medium whitespace-nowrap text-muted-foreground",
        // Pinned to the top of the scrolling box, so eleven columns of dollars
        // never end up under an empty strip. `z-10` because a focused row
        // paints an outline and would otherwise draw over the headings.
        "sticky top-0 z-10",
        stickyPanelTableCellClassName
      )}
    >
      <span className="flex items-center gap-1">
        {sort ? (
          <TableSortButton
            active={sort.active}
            direction={sort.direction}
            onClick={sort.onClick}
            // The shared button stands 32px tall for a dashboard's roomy
            // header. This trading readout keeps the row as tall as its text.
            className="h-auto text-xs sm:text-xs"
          >
            {children}
          </TableSortButton>
        ) : (
          children
        )}
        {info}
      </span>
    </th>
  )
}

export type ColumnSpec<Key extends string> = { key: Key; label: string }

/**
 * The row a table shows when it has no rows: still reading, the read failed
 * with nothing to fall back on, or there really is nothing here.
 *
 * All three sit inside the table's own frame, under the real header, so
 * nothing moves when the rows land or when the last one closes. The empty
 * words used to be a paragraph drawn instead of the table, which took the
 * heading row off screen at the exact moment a position closed.
 *
 * "Nothing here" and "I could not find out" stay different answers, and only
 * one is safe to act on. The empty wording is therefore reached only once a
 * read has really landed: still reading wins over both, and a failed read says
 * so rather than claiming the table is empty.
 */
function TableStateRow({
  span,
  loading,
  failed,
  loadingLabel,
  onRetry,
  empty,
  children,
}: {
  span: number
  loading: boolean
  failed: boolean
  loadingLabel: string
  onRetry: () => void
  empty: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <tr className="border-t">
      <td colSpan={span}>
        {loading ? (
          <LoadingRow label={loadingLabel} className="py-6 text-xs" />
        ) : failed ? (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">
            {children}{" "}
            <button type="button" className="underline" onClick={onRetry}>
              Try again
            </button>
          </p>
        ) : (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">
            {empty}
          </p>
        )}
      </td>
    </tr>
  )
}

/** One frame for Positions, Open orders and the Journal. */
export function TradeTable<Row, Key extends string>({
  columns,
  rows,
  loading,
  failed,
  loadingLabel,
  failedWords,
  emptyWords,
  onRetry,
  sort,
  direction,
  onSort,
  leadingHeader,
  headerInfo,
  renderRow,
  footer,
}: {
  columns: readonly ColumnSpec<Key>[]
  rows: readonly Row[]
  loading: boolean
  failed: boolean
  loadingLabel: string
  failedWords: React.ReactNode
  emptyWords: React.ReactNode
  onRetry: () => void
  sort: Key
  direction: TableSortDirection
  onSort: (key: Key) => void
  leadingHeader?: React.ReactNode
  headerInfo?: (key: Key) => React.ReactNode
  renderRow: (row: Row) => React.ReactNode
  footer?: React.ReactNode
}) {
  return (
    <table className="w-full border-collapse">
      <thead data-slot="table-header">
        <tr>
          {leadingHeader === undefined ? null : (
            <HeaderCell>{leadingHeader}</HeaderCell>
          )}
          {columns.map(({ key, label }) => (
            <HeaderCell
              key={key}
              sort={{
                active: sort === key,
                direction,
                onClick: () => onSort(key),
              }}
              info={headerInfo?.(key)}
            >
              {label}
            </HeaderCell>
          ))}
          <HeaderCell>
            <span className="sr-only">Actions</span>
          </HeaderCell>
        </tr>
      </thead>
      {/* The heading owns the hairline above the rows. Removing the first
          row's top edge keeps that divider at one pixel; later rows retain
          their own borders so the list still has separators. */}
      <tbody className="[&>tr:first-child]:border-t-0">
        {rows.length === 0 ? (
          <TableStateRow
            span={columns.length + (leadingHeader === undefined ? 1 : 2)}
            loading={loading}
            failed={failed}
            loadingLabel={loadingLabel}
            onRetry={onRetry}
            empty={emptyWords}
          >
            {failedWords}
          </TableStateRow>
        ) : (
          rows.map(renderRow)
        )}
      </tbody>
      {footer}
    </table>
  )
}
