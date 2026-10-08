import * as React from "react"
import { getRouteApi } from "@tanstack/react-router"
import { CalendarSyncIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
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
  deletePomodoroRoomRepeats,
  listPomodoroRoomRepeats,
  type AdminRoomRepeatRow,
} from "@/lib/api/pomodoro/admin"
import { formatDate, formatDateTime } from "@/lib/format/format-time"
import { plural } from "@/lib/format/plural"
import { useSelection } from "@/lib/hooks/use-selection"
import {
  useListSearchNavigate,
  useListSort,
  useSearchBoxText,
} from "@/lib/nav/list-search"
import type { RoomRepeatSortColumn } from "@/lib/pomodoro/admin-lists"
import { describeRoomRepeat } from "@/lib/pomodoro/room-repeats"

const route = getRouteApi("/_authenticated/admin/pomodoro-room-repeats")

type SortColumn = RoomRepeatSortColumn

const COLUMNS: TableHeaderColumn<SortColumn>[] = [
  { key: "name", label: "Weekly room", column: "main" },
  { key: "host", label: "Host", column: "meta" },
  { key: "next", label: "Next room", column: "meta" },
  {
    key: "created",
    label: "Set up",
    column: "meta",
    className: "hidden lg:table-cell",
  },
]

/**
 * Every weekly room rule. A rule books an ordinary room a day before each of
 * its days, so deleting that room alone does not stop next week's: the rule is
 * what has to go.
 */
export function AdminRoomRepeatsDashboard({
  initial,
  initialPageSize,
}: {
  initial: { rows: AdminRoomRepeatRow[]; total: number }
  initialPageSize: number
}) {
  const search = route.useSearch()
  const setListSearch = useListSearchNavigate()
  const query = search.q ?? ""
  const status = search.status ?? "all"
  const sort: SortColumn = search.sort ?? "created"
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
      listPomodoroRoomRepeats({
        search: query,
        status,
        sort,
        direction,
        page,
        pageSize,
      }),
    [direction, page, query, sort, status]
  )

  const list = useAdminList({
    initial,
    initialPageSize,
    page,
    onPageChange: setPage,
    load,
  })
  const toggleSort = useListSort<SortColumn>({ sort, direction }, (column) =>
    column === "created" ? "desc" : "asc"
  )
  const rowIds = React.useMemo(
    () => list.rows.map((row) => row.id),
    [list.rows]
  )
  const selectedIds = rowIds.filter((id) => selection.selected.has(id))
  const del = useAdminDelete({
    one: "weekly room",
    many: "weekly rooms",
    run: deletePomodoroRoomRepeats,
    keptReason: "already gone",
    selection,
    onDone: list.refresh,
  })
  const asked = list.rows.filter((row) => del.ids.includes(row.id))

  return (
    <>
      <AdminListTable
        title="Weekly rooms"
        icon={<CalendarSyncIcon />}
        noun="weekly rooms"
        columns={COLUMNS}
        sort={sort}
        direction={direction}
        onSort={toggleSort}
        trailing={<TableHead column="meta">Actions</TableHead>}
        selection={{ noun: "weekly rooms", rowIds, state: selection }}
        list={list}
        page={page}
        onPageChange={setPage}
        controls={
          <>
            <AdminBulkDeleteButton del={del} ids={selectedIds} />
            <DashboardToolbarSearch
              name="room-repeat-search"
              aria-label="Search weekly rooms"
              placeholder="Search room or host…"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
            />
            <Select
              value={status}
              onValueChange={(value) =>
                setListSearch({
                  status: value === "all" ? undefined : value,
                  page: undefined,
                })
              }
            >
              <DashboardToolbarSelectTrigger aria-label="Filter by whether the rule still books rooms">
                <SelectValue placeholder="Status" />
              </DashboardToolbarSelectTrigger>
              <SelectContent>
                <SelectItem value="all">Booking and stopped</SelectItem>
                <SelectItem value="active">Still booking</SelectItem>
                <SelectItem value="cancelled">Stopped by the host</SelectItem>
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
              label={`Select ${row.name}`}
            />
            <TableCell column="main">
              <div className="min-w-0">
                <span className="block max-w-96 truncate" title={row.name}>
                  {row.name}
                </span>
                {/* The time is the host's own clock, so their timezone is
                    named beside it. */}
                <span className="block max-w-96 truncate text-xs text-muted-foreground">
                  {describeRoomRepeat(row.weekdays, row.startMinute)} (
                  {row.timezone}) ·{" "}
                  {row.visibility === "public" ? "Listed" : "Link only"}
                </span>
              </div>
            </TableCell>
            <TableCell column="meta" className="max-w-56">
              <span className="block truncate" title={row.hostEmail}>
                {row.hostName}
              </span>
            </TableCell>
            <TableCell column="meta">
              {row.cancelledAt ? (
                <Badge variant="outline">Stopped</Badge>
              ) : row.nextStartsAt ? (
                formatDateTime(row.nextStartsAt)
              ) : (
                "—"
              )}
            </TableCell>
            <TableCell column="mutedMeta" className="hidden lg:table-cell">
              {formatDate(row.createdAt)}
            </TableCell>
            <TableCell column="actions">
              <AdminRowDeleteButton
                del={del}
                id={row.id}
                label={`Delete the weekly room ${row.name}`}
              />
            </TableCell>
          </TableRow>
        ))}
      </AdminListTable>
      <AdminDeleteConfirm
        del={del}
        title={
          asked.length === 1
            ? `Delete the weekly room ${asked[0].name}?`
            : `Delete ${del.ids.length} weekly rooms?`
        }
        description={`No more rooms will be booked from ${plural(del.ids.length, "this rule", "these rules")}. A room already booked for the next day stays and still opens, and past rooms keep their chat. Delete one of those from Focus rooms if it should not open. This cannot be undone.`}
        confirmLabel={plural(
          del.ids.length,
          "Delete weekly room",
          "Delete weekly rooms"
        )}
      />
    </>
  )
}
