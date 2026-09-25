import * as React from "react"
import { getRouteApi } from "@tanstack/react-router"
import { TimerIcon, XIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select"
import { TableCell, TableRow } from "@/components/ui/table"
import {
  DashboardToolbarSearch,
  DashboardToolbarSelectTrigger,
} from "@/components/shared/dashboard-toolbar"
import type { TableHeaderColumn } from "@/components/shared/sortable-table-header"
import { AdminListTable, useAdminList } from "@/components/pomodoro/admin-list"
import {
  listPomodoroSessions,
  type AdminSessionRow,
} from "@/lib/api/pomodoro/admin"
import { formatDateTime, formatDuration } from "@/lib/format/format-time"
import {
  useListSearchNavigate,
  useListSort,
  useSearchBoxText,
} from "@/lib/nav/list-search"
import type { SessionSortColumn } from "@/lib/pomodoro/admin-lists"

const route = getRouteApi("/_authenticated/admin/pomodoro-sessions")

type SortColumn = SessionSortColumn

const COLUMNS: TableHeaderColumn<SortColumn>[] = [
  { key: "person", label: "Member", column: "main" },
  { key: "mode", label: "Kind", column: "meta" },
  { key: "status", label: "Status", column: "meta" },
  { key: "length", label: "Ran for", column: "meta" },
  {
    key: "started",
    label: "Started",
    column: "meta",
    className: "hidden lg:table-cell",
  },
]

const MODE_LABELS: Record<string, string> = {
  focus: "Focus",
  short: "Short break",
  long: "Long break",
}

const STATUS_LOOK: Record<
  string,
  { label: string; variant: "default" | "secondary" | "outline" }
> = {
  running: { label: "Running", variant: "default" },
  paused: { label: "Paused", variant: "outline" },
  completed: { label: "Finished", variant: "secondary" },
  cancelled: { label: "Cancelled", variant: "outline" },
}

/**
 * Every timer run, newest first. Filtering to one member is what makes this
 * the page an operator lands on from Focus data, so the chosen member is named
 * on screen with a way to clear it rather than hiding in the address.
 */
export function AdminSessionsDashboard({
  initial,
  initialPageSize,
}: {
  initial: { rows: AdminSessionRow[]; total: number }
  initialPageSize: number
}) {
  const search = route.useSearch()
  const setListSearch = useListSearchNavigate()
  const query = search.q ?? ""
  const mode = search.mode ?? "all"
  const status = search.status ?? "all"
  const userId = search.user ?? null
  const sort: SortColumn = search.sort ?? "started"
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
      listPomodoroSessions({
        search: query,
        mode,
        status,
        userId,
        sort,
        direction,
        page,
        pageSize,
      }),
    [direction, mode, page, query, sort, status, userId]
  )

  const list = useAdminList({
    initial,
    initialPageSize,
    page,
    onPageChange: setPage,
    load,
  })
  const toggleSort = useListSort<SortColumn>({ sort, direction }, (column) =>
    column === "person" ? "asc" : "desc"
  )

  // Whose sessions these are, taken off the first row rather than fetched: the
  // filter is an account id, and every row it can return belongs to them.
  const filteredMemberName = userId ? (list.rows[0]?.userName ?? null) : null

  return (
    <AdminListTable
      title="Focus sessions"
      icon={<TimerIcon />}
      noun="sessions"
      columns={COLUMNS}
      sort={sort}
      direction={direction}
      onSort={toggleSort}
      list={list}
      page={page}
      onPageChange={setPage}
      controls={
        <>
          {userId ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-2"
              onClick={() =>
                setListSearch({ user: undefined, page: undefined })
              }
            >
              <XIcon className="size-4" />
              {filteredMemberName
                ? `Only ${filteredMemberName}`
                : "One member only"}
            </Button>
          ) : null}
          <DashboardToolbarSearch
            name="session-search"
            aria-label="Search sessions"
            placeholder="Search name or email…"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
          />
          <Select
            value={mode}
            onValueChange={(value) =>
              setListSearch({
                mode: value === "all" ? undefined : value,
                page: undefined,
              })
            }
          >
            <DashboardToolbarSelectTrigger aria-label="Filter by kind">
              <SelectValue placeholder="Kind" />
            </DashboardToolbarSelectTrigger>
            <SelectContent>
              <SelectItem value="all">Focus and breaks</SelectItem>
              <SelectItem value="focus">Focus</SelectItem>
              <SelectItem value="short">Short breaks</SelectItem>
              <SelectItem value="long">Long breaks</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={status}
            onValueChange={(value) =>
              setListSearch({
                status: value === "all" ? undefined : value,
                page: undefined,
              })
            }
          >
            <DashboardToolbarSelectTrigger aria-label="Filter by status">
              <SelectValue placeholder="Status" />
            </DashboardToolbarSelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="running">Running</SelectItem>
              <SelectItem value="paused">Paused</SelectItem>
              <SelectItem value="completed">Finished</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </>
      }
    >
      {list.rows.map((row) => (
        <TableRow key={row.id}>
          <TableCell column="main">
            <div className="min-w-0">
              <span className="block max-w-96 truncate" title={row.userEmail}>
                {row.userName}
              </span>
              {/* What the run was for, when there was something. A member can
                  focus with no task chosen, and a room run names the room. */}
              {row.taskTitle || row.roomName ? (
                <span className="block max-w-96 truncate text-xs text-muted-foreground">
                  {[row.taskTitle, row.roomName && `in ${row.roomName}`]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              ) : null}
            </div>
          </TableCell>
          <TableCell column="meta">
            {MODE_LABELS[row.mode] ?? row.mode}
          </TableCell>
          <TableCell column="meta">
            <Badge variant={STATUS_LOOK[row.status]?.variant ?? "outline"}>
              {STATUS_LOOK[row.status]?.label ?? row.status}
            </Badge>
          </TableCell>
          <TableCell column="meta">
            {formatDuration(row.accumulatedSeconds * 1000, { zero: "—" })}
            <span className="text-muted-foreground">
              {" "}
              of {formatDuration(row.plannedSeconds * 1000)}
            </span>
          </TableCell>
          <TableCell column="mutedMeta" className="hidden lg:table-cell">
            {formatDateTime(row.createdAt)}
          </TableCell>
        </TableRow>
      ))}
    </AdminListTable>
  )
}
