import * as React from "react"

import { DashboardTable } from "@/components/shared/dashboard-table"
import {
  SortableTableHeader,
  type TableHeaderColumn,
} from "@/components/shared/sortable-table-header"
import { getPomodoroAdminErrorMessage } from "@/lib/api/pomodoro/admin"

/**
 * The plumbing every pomodoro operator list shares: hold the rows the loader
 * already fetched, fetch again when the address changes, and draw the result
 * in the shell's own dashboard table.
 *
 * Search, filters, sort and page live in the address rather than in memory, so
 * pressing Back returns the exact list you left and the address can be handed
 * to somebody else. Each section owns its own address shape; this file owns
 * everything that would otherwise be written out five times.
 */

/** How long the list waits after a change before asking the server. */
const REFETCH_DELAY_MS = 250

export type AdminListResult<Row> = { rows: Row[]; total: number }

export function useAdminList<Row>({
  initial,
  initialPageSize,
  page,
  onPageChange,
  load,
}: {
  initial: AdminListResult<Row>
  initialPageSize: number
  /** The page the address is asking for, so a page past the end can be fixed. */
  page: number
  onPageChange: (page: number) => void
  /**
   * Fetches the page the address currently describes. Wrap it in
   * `React.useCallback` over the address values: a new identity is what tells
   * this hook the list has changed and a fetch is due.
   */
  load: (pageSize: number) => Promise<AdminListResult<Row>>
}) {
  const [rows, setRows] = React.useState(initial.rows)
  const [total, setTotal] = React.useState(initial.total)
  const [pageSize, setPageSize] = React.useState(initialPageSize)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  // Which fetch is the current one. Two can be in the air at once — a filter
  // change and the refresh that follows resolving a report — and without this
  // the slower one wins and puts stale rows back on screen.
  const latestRequest = React.useRef(0)

  const refresh = React.useCallback(async () => {
    const request = latestRequest.current + 1
    latestRequest.current = request
    setLoading(true)
    try {
      const result = await load(pageSize)
      if (latestRequest.current !== request) return
      setRows(result.rows)
      setTotal(result.total)
      setError(null)
    } catch (loadError) {
      if (latestRequest.current !== request) return
      setError(getPomodoroAdminErrorMessage(loadError))
    } finally {
      if (latestRequest.current === request) setLoading(false)
    }
  }, [load, pageSize])

  // The loader already fetched what is on screen, so the first render must not
  // fetch it again. Every change after that waits out the same quarter second
  // the shell's tables wait, so holding a key down is one request, not twelve.
  const isFirstRender = React.useRef(true)
  React.useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    const timer = setTimeout(refresh, REFETCH_DELAY_MS)
    return () => clearTimeout(timer)
  }, [refresh])

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  // The page fell off the end — the last report on page 2 was resolved out of
  // a filtered list, or another operator removed rows. Without this the table
  // says "no rows match" while page 1 is full of them.
  React.useEffect(() => {
    if (!loading && total > 0 && page > totalPages) onPageChange(totalPages)
  }, [loading, onPageChange, page, total, totalPages])

  return {
    rows,
    total,
    pageSize,
    setPageSize,
    loading,
    error,
    refresh,
    totalPages,
  }
}

/**
 * One operator list, drawn. A thin pass-through to `DashboardTable` that fixes
 * the parts these five pages agree on: a sortable header, an empty line that
 * names the thing, and a paginated footer.
 */
export function AdminListTable<Row, Sort extends string>({
  title,
  icon,
  noun,
  columns,
  sort,
  direction,
  onSort,
  trailing,
  controls,
  list,
  page,
  onPageChange,
  children,
}: {
  title: string
  icon: React.ReactNode
  /** Plural, lower case: "tasks". Used in the empty line. */
  noun: string
  columns: TableHeaderColumn<Sort>[]
  sort: Sort
  direction: "asc" | "desc"
  onSort: (column: Sort) => void
  /** The last, unsortable heading, when the rows carry a control. */
  trailing?: React.ReactNode
  controls?: React.ReactNode
  list: ReturnType<typeof useAdminList<Row>>
  page: number
  onPageChange: (page: number) => void
  children: React.ReactNode
}) {
  return (
    <DashboardTable
      title={title}
      icon={icon}
      count={list.total}
      busy={list.loading}
      error={
        list.error
          ? { message: list.error, onRetry: () => void list.refresh() }
          : null
      }
      controls={controls}
      header={
        <SortableTableHeader
          columns={columns}
          sort={sort}
          direction={direction}
          onSort={onSort}
          trailing={trailing}
        />
      }
      isEmpty={!list.loading && list.rows.length === 0}
      emptyText={`No ${noun} match those filters.`}
      emptyColSpan={columns.length + (trailing ? 1 : 0)}
      footer={{
        type: "pagination",
        page,
        pageSize: list.pageSize,
        total: list.total,
        totalPages: list.totalPages,
        onPageChange,
        onPageSizeChange: (nextSize) => {
          onPageChange(1)
          list.setPageSize(nextSize)
        },
      }}
    >
      {children}
    </DashboardTable>
  )
}
