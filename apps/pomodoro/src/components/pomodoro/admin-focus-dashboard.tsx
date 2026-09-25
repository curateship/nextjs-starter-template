import * as React from "react"
import { getRouteApi, Link } from "@tanstack/react-router"
import { TimerIcon, TrendingUpIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { TableCell, TableHead, TableRow } from "@/components/ui/table"
import { DashboardToolbarSearch } from "@/components/shared/dashboard-toolbar"
import type { TableHeaderColumn } from "@/components/shared/sortable-table-header"
import { AdminListTable, useAdminList } from "@/components/pomodoro/admin-list"
import {
  listPomodoroFocusUsers,
  type AdminFocusRow,
} from "@/lib/api/pomodoro/admin"
import { formatDuration, formatUtcDate } from "@/lib/format/format-time"
import {
  useListSearchNavigate,
  useListSort,
  useSearchBoxText,
} from "@/lib/nav/list-search"
import type { FocusSortColumn } from "@/lib/pomodoro/admin-lists"

const route = getRouteApi("/_authenticated/admin/pomodoro-focus")

type SortColumn = FocusSortColumn

// No column of its own for the email: the main column is 320px wide at its
// narrowest, and a seventh column pushed the row actions off the right-hand
// edge at 1280. The address sits under the name instead, where the other
// operator lists put it.
const COLUMNS: TableHeaderColumn<SortColumn>[] = [
  { key: "name", label: "Member", column: "main" },
  { key: "sessions", label: "Focus runs", column: "meta" },
  { key: "focus", label: "Focus time", column: "meta" },
  { key: "tasks", label: "Tasks done", column: "meta" },
  {
    key: "last",
    label: "Last focused",
    column: "meta",
    className: "hidden lg:table-cell",
  },
]

/**
 * Every account and what it has focused, newest totals first.
 *
 * The totals come from `daily_focus_stats`, which is the same rollup the
 * member's own history screen reads, so the two can never disagree. An account
 * that has never run a timer is still listed, on zero.
 */
export function AdminFocusDashboard({
  initial,
  initialPageSize,
}: {
  initial: { rows: AdminFocusRow[]; total: number }
  initialPageSize: number
}) {
  const search = route.useSearch()
  const setListSearch = useListSearchNavigate()
  const query = search.q ?? ""
  const sort: SortColumn = search.sort ?? "focus"
  const direction = search.direction ?? "desc"
  const page = search.page ?? 1
  const setPage = React.useCallback(
    (next: number) => setListSearch({ page: next > 1 ? next : undefined }),
    [setListSearch]
  )

  const [searchText, setSearchText] = useSearchBoxText(query, (text) =>
    setListSearch({ q: text.trim() ? text : undefined, page: undefined })
  )

  const load = React.useCallback(
    (pageSize: number) =>
      listPomodoroFocusUsers({
        search: query,
        sort,
        direction,
        page,
        pageSize,
      }),
    [direction, page, query, sort]
  )

  const list = useAdminList({
    initial,
    initialPageSize,
    page,
    onPageChange: setPage,
    load,
  })
  const toggleSort = useListSort<SortColumn>({ sort, direction }, (column) =>
    column === "name" ? "asc" : "desc"
  )

  return (
    <AdminListTable
      title="Focus data"
      icon={<TrendingUpIcon />}
      noun="members"
      columns={COLUMNS}
      sort={sort}
      direction={direction}
      onSort={toggleSort}
      trailing={<TableHead column="meta">Actions</TableHead>}
      list={list}
      page={page}
      onPageChange={setPage}
      controls={
        <DashboardToolbarSearch
          name="focus-search"
          aria-label="Search members"
          placeholder="Search name or email…"
          value={searchText}
          onChange={(event) => setSearchText(event.target.value)}
        />
      }
    >
      {list.rows.map((row) => (
        <TableRow key={row.userId}>
          <TableCell column="main">
            <div className="min-w-0">
              <span className="block max-w-96 truncate" title={row.name}>
                {row.name}
              </span>
              <span
                className="block max-w-96 truncate text-xs text-muted-foreground"
                title={row.email}
              >
                {row.email}
              </span>
            </div>
          </TableCell>
          <TableCell column="meta">
            {row.focusSessions.toLocaleString()}
          </TableCell>
          <TableCell column="meta">
            {formatDuration(row.focusSeconds * 1000, { zero: "—" })}
          </TableCell>
          <TableCell column="meta">
            {row.tasksCompleted.toLocaleString()}
          </TableCell>
          <TableCell column="mutedMeta" className="hidden lg:table-cell">
            {row.lastActiveDate ? formatUtcDate(row.lastActiveDate) : "—"}
          </TableCell>
          <TableCell column="actions">
            {/* The way from a person to their sessions, which is the question
                this page is usually opened to answer. */}
            <Button type="button" variant="ghost" size="icon" asChild>
              <Link
                to="/admin/pomodoro-sessions"
                search={{ user: row.userId }}
                title={`Focus sessions for ${row.name}`}
                aria-label={`Focus sessions for ${row.name}`}
              >
                <TimerIcon className="size-4" />
              </Link>
            </Button>
          </TableCell>
        </TableRow>
      ))}
    </AdminListTable>
  )
}
