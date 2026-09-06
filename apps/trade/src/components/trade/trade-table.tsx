import * as React from "react"

import { LoadingRow } from "@/components/ui/loading-row"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import {
  TableSortButton,
  TableSurface,
  type TableSortDirection,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"
import {
  stickyPanelTableCellClassName,
  stickyPanelTableHeaderClassName,
} from "@/lib/layout/panel-section-bar"

function HeaderCell({
  children,
  sort,
  info,
  roomy,
}: {
  children: React.ReactNode
  /** Omitted on the actions column, which is the one thing never sorted. */
  sort?: { active: boolean; direction: TableSortDirection; onClick: () => void }
  /** A mark beside the label, kept outside the sort button. */
  info?: React.ReactNode
  roomy: boolean
}) {
  return (
    <th
      scope="col"
      className={cn(
        roomy
          ? "h-10 px-5 text-left text-xs font-medium whitespace-nowrap text-muted-foreground sm:text-sm"
          : "px-3 py-2 text-left text-xs font-medium whitespace-nowrap text-muted-foreground",
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
export function TableStateRow({
  span,
  loading,
  failed,
  loadingLabel,
  onRetry,
  empty,
  children,
  className,
}: {
  span: number
  loading: boolean
  failed: boolean
  loadingLabel: string
  onRetry: () => void
  empty: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <tr data-slot="table-row" className="border-t">
      <td colSpan={span}>
        {loading ? (
          <LoadingRow
            label={loadingLabel}
            className={cn("py-6 text-xs", className)}
          />
        ) : failed ? (
          <div
            className={cn(
              "px-3 py-6 text-center text-xs text-muted-foreground",
              className
            )}
          >
            {children}{" "}
            <button type="button" className="underline" onClick={onRetry}>
              Try again
            </button>
          </div>
        ) : (
          <div
            className={cn(
              "px-3 py-6 text-center text-xs text-muted-foreground",
              className
            )}
          >
            {empty}
          </div>
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
  actions = true,
  roomy = false,
  stateClassName,
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
  renderRow: (row: Row, index: number) => React.ReactNode
  footer?: React.ReactNode
  /** Positions have a final row-action column. Read-only widgets do not. */
  actions?: boolean
  /** Dashboard cards keep the shell table's roomier row and heading gutters. */
  roomy?: boolean
  stateClassName?: string
}) {
  return (
    <table
      className={cn(
        "w-full border-collapse",
        roomy &&
          "text-sm [&_td:first-child]:pl-6 [&_td:last-child]:pr-6 [&_th:first-child]:pl-6 [&_th:last-child]:pr-6"
      )}
    >
      <thead data-slot="table-header">
        <tr data-slot="table-row">
          {leadingHeader === undefined ? null : (
            <HeaderCell roomy={roomy}>{leadingHeader}</HeaderCell>
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
              roomy={roomy}
            >
              {label}
            </HeaderCell>
          ))}
          {actions ? (
            <HeaderCell roomy={roomy}>
              <span className="sr-only">Actions</span>
            </HeaderCell>
          ) : null}
        </tr>
      </thead>
      {/* The heading owns the hairline above the rows. Removing the first
          row's top edge keeps that divider at one pixel; later rows retain
          their own borders so the list still has separators. */}
      <tbody className="[&>tr:first-child]:border-t-0">
        {rows.length === 0 ? (
          <TableStateRow
            span={
              columns.length +
              (leadingHeader === undefined ? 0 : 1) +
              (actions ? 1 : 0)
            }
            loading={loading}
            failed={failed}
            loadingLabel={loadingLabel}
            onRetry={onRetry}
            empty={emptyWords}
            className={stateClassName}
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

/** The shared card, title, scroller and table frame used by dashboard widgets. */
export function TradeTablePanel<Row, Key extends string>({
  className,
  header,
  afterTable,
  ...table
}: React.ComponentProps<typeof TradeTable<Row, Key>> & {
  className?: string
  header: React.ReactNode
  afterTable?: React.ReactNode
}) {
  return (
    <TableSurface className={cn("flex h-full min-h-0 flex-col", className)}>
      {header}
      <TradeTableContent {...table} />
      {afterTable}
    </TableSurface>
  )
}

/** The scrolling table body, for a panel whose tabs own the outer frame. */
export function TradeTableContent<Row, Key extends string>({
  className,
  viewportClassName,
  ...table
}: React.ComponentProps<typeof TradeTable<Row, Key>> & {
  className?: string
  /**
   * Classes for the scrolling box. A panel bounded by its own layout wants
   * nothing here; a card sitting in a page that scrolls passes its ceiling
   * (`max-h-*`) here rather than on the frame outside, because the viewport is
   * what overflows and a height on the frame only clips it.
   */
  viewportClassName?: string
}) {
  return (
    <ScrollArea
      className={cn("min-h-0 flex-1", className)}
      viewportClassName={cn("h-full min-h-24", viewportClassName)}
    >
      <div
        data-slot="table-container"
        className={cn(
          "relative w-full overflow-visible [&_thead_th]:sticky [&_thead_th]:top-0 [&_thead_th]:z-10",
          stickyPanelTableHeaderClassName
        )}
      >
        <TradeTable {...table} actions={false} roomy />
      </div>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  )
}
