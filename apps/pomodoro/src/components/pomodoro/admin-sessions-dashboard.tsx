import * as React from "react"
import { getRouteApi, Link } from "@tanstack/react-router"
import { ListChecksIcon, TimerIcon, XIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select"
import { TableCell, TableHead, TableRow } from "@/components/ui/table"
import {
  DashboardToolbarSearch,
  DashboardToolbarSelectTrigger,
} from "@/components/shared/dashboard-toolbar"
import type { TableHeaderColumn } from "@/components/shared/sortable-table-header"
import {
  AdminSelectCell,
  AdminListTable,
  useAdminList,
} from "@/components/pomodoro/admin-list"
import {
  AdminBulkDeleteButton,
  AdminDeleteConfirm,
  AdminRowDeleteButton,
  useAdminDelete,
} from "@/components/pomodoro/admin-delete"
import {
  deletePomodoroSessions,
  listPomodoroSessions,
  type AdminSessionRow,
} from "@/lib/api/pomodoro/admin"
import { plural } from "@/lib/format/plural"
import { formatDateTime, formatDuration } from "@/lib/format/format-time"
import { useSelection } from "@/lib/hooks/use-selection"
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

  const selection = useSelection()

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
  const rowIds = React.useMemo(
    () => list.rows.map((row) => row.id),
    [list.rows]
  )

  // Whose sessions these are, taken off the first row rather than fetched: the
  // filter is an account id, and every row it can return belongs to them.
  const filteredMemberName = userId ? (list.rows[0]?.userName ?? null) : null

  const selectedIds = rowIds.filter((id) => selection.selected.has(id))
  const del = useAdminDelete({
    one: "session",
    many: "sessions",
    run: deletePomodoroSessions,
    keptReason: "still running, or already gone",
    selection,
    onDone: list.refresh,
  })
  const asked = list.rows.filter((row) => del.ids.includes(row.id))

  return (
    <>
      <AdminListTable
        title="Focus sessions"
        icon={<TimerIcon />}
        noun="sessions"
        columns={COLUMNS}
        sort={sort}
        direction={direction}
        onSort={toggleSort}
        trailing={<TableHead column="meta">Actions</TableHead>}
        selection={{ noun: "sessions", rowIds, state: selection }}
        list={list}
        page={page}
        onPageChange={setPage}
        controls={
          <>
            <AdminBulkDeleteButton del={del} ids={selectedIds} />
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
            <AdminSelectCell
              selection={selection}
              id={row.id}
              label={`Select the ${MODE_LABELS[row.mode] ?? row.mode} run by ${row.userName}`}
            />
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
            <TableCell column="actions">
              {/* Focus data leads here, and this leads on to what the member was
                  working through, which closes the loop the three pages make. */}
              <Button type="button" variant="ghost" size="icon" asChild>
                <Link
                  to="/admin/pomodoro-tasks"
                  search={{ user: row.userId }}
                  aria-label={`Tasks for ${row.userName}`}
                >
                  <ListChecksIcon className="size-4" />
                </Link>
              </Button>
              <AdminRowDeleteButton
                del={del}
                id={row.id}
                label={`Delete the ${MODE_LABELS[row.mode] ?? row.mode} run by ${row.userName}`}
              />
            </TableCell>
          </TableRow>
        ))}
      </AdminListTable>
      <AdminDeleteConfirm
        del={del}
        title={`Delete ${del.ids.length} ${plural(del.ids.length, "session", "sessions")}?`}
        description={describeSessionDeletion(asked)}
        confirmLabel={plural(del.ids.length, "Delete session", "Delete sessions")}
      />
    </>
  )
}

/**
 * What the delete takes out of people's history, worked out from the rows on
 * screen: only a finished focus ever counted towards anyone's totals.
 */
function describeSessionDeletion(rows: AdminSessionRow[]) {
  const counted = rows.filter(
    (row) => row.mode === "focus" && row.status === "completed"
  )
  const live = rows.filter(
    (row) => row.status === "running" || row.status === "paused"
  )
  const people = [...new Set(counted.map((row) => row.userName))]
  const seconds = counted.reduce((sum, row) => sum + row.accumulatedSeconds, 0)
  const whose =
    people.length === 1 ? `${people[0]}'s` : `${people.length} people's`
  const lines = [
    counted.length
      ? `${formatDuration(seconds * 1000)} of finished focus comes off ${whose} history, and their streak and leaderboard figures drop to match. Badges already earned stay.`
      : "None of these counted towards anyone's focus totals, so no figures change.",
  ]
  if (live.length)
    lines.push(
      `${live.length} ${plural(live.length, "timer is", "timers are")} still running and will be left alone.`
    )
  lines.push("This cannot be undone.")
  return lines.join(" ")
}
