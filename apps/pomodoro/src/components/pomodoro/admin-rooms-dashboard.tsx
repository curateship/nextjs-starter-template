import * as React from "react"
import { getRouteApi } from "@tanstack/react-router"
import { UsersRoundIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
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
import { listPomodoroRooms, type AdminRoomRow } from "@/lib/api/pomodoro/admin"
import { formatDateTime } from "@/lib/format/format-time"
import {
  useListSearchNavigate,
  useListSort,
  useSearchBoxText,
} from "@/lib/nav/list-search"
import type { RoomSortColumn } from "@/lib/pomodoro/admin-lists"

const route = getRouteApi("/_authenticated/admin/pomodoro-rooms")

type SortColumn = RoomSortColumn

const COLUMNS: TableHeaderColumn<SortColumn>[] = [
  { key: "name", label: "Room", column: "main" },
  { key: "host", label: "Host", column: "meta" },
  { key: "phase", label: "Doing now", column: "meta" },
  { key: "members", label: "In the room", column: "meta" },
  {
    key: "created",
    label: "Opened",
    column: "meta",
    className: "hidden lg:table-cell",
  },
]

const PHASE_LOOK: Record<
  string,
  { label: string; variant: "default" | "secondary" | "outline" }
> = {
  waiting: { label: "Waiting", variant: "outline" },
  focus: { label: "Focusing", variant: "default" },
  short: { label: "Short break", variant: "secondary" },
  long: { label: "Long break", variant: "secondary" },
  closed: { label: "Closed", variant: "outline" },
}

/**
 * Every focus room, open and closed, newest first. A room is closed by its
 * host or by the host starting another one, and closed rows stay so a report
 * about a room can still be read in context after the room is gone.
 */
export function AdminRoomsDashboard({
  initial,
  initialPageSize,
}: {
  initial: { rows: AdminRoomRow[]; total: number }
  initialPageSize: number
}) {
  const search = route.useSearch()
  const setListSearch = useListSearchNavigate()
  const query = search.q ?? ""
  const phase = search.phase ?? "all"
  const visibility = search.visibility ?? "all"
  const sort: SortColumn = search.sort ?? "created"
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
      listPomodoroRooms({
        search: query,
        phase,
        visibility,
        sort,
        direction,
        page,
        pageSize,
      }),
    [direction, page, phase, query, sort, visibility]
  )

  const list = useAdminList({
    initial,
    initialPageSize,
    page,
    onPageChange: setPage,
    load,
  })
  const toggleSort = useListSort<SortColumn>({ sort, direction }, (column) =>
    column === "created" || column === "members" ? "desc" : "asc"
  )

  return (
    <AdminListTable
      title="Focus rooms"
      icon={<UsersRoundIcon />}
      noun="rooms"
      columns={COLUMNS}
      sort={sort}
      direction={direction}
      onSort={toggleSort}
      list={list}
      page={page}
      onPageChange={setPage}
      controls={
        <>
          <DashboardToolbarSearch
            name="room-search"
            aria-label="Search rooms"
            placeholder="Search room or host…"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
          />
          <Select
            value={phase}
            onValueChange={(value) =>
              setListSearch({
                phase: value === "all" ? undefined : value,
                page: undefined,
              })
            }
          >
            <DashboardToolbarSelectTrigger aria-label="Filter by what the room is doing">
              <SelectValue placeholder="Doing now" />
            </DashboardToolbarSelectTrigger>
            <SelectContent>
              <SelectItem value="all">Anything</SelectItem>
              <SelectItem value="waiting">Waiting</SelectItem>
              <SelectItem value="focus">Focusing</SelectItem>
              <SelectItem value="short">Short break</SelectItem>
              <SelectItem value="long">Long break</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={visibility}
            onValueChange={(value) =>
              setListSearch({
                visibility: value === "all" ? undefined : value,
                page: undefined,
              })
            }
          >
            <DashboardToolbarSelectTrigger aria-label="Filter by who can find the room">
              <SelectValue placeholder="Listing" />
            </DashboardToolbarSelectTrigger>
            <SelectContent>
              <SelectItem value="all">Listed and unlisted</SelectItem>
              <SelectItem value="public">Listed</SelectItem>
              <SelectItem value="unlisted">Link only</SelectItem>
            </SelectContent>
          </Select>
        </>
      }
    >
      {list.rows.map((row) => (
        <TableRow key={row.id}>
          <TableCell column="main">
            <div className="min-w-0">
              <span className="block max-w-96 truncate" title={row.name}>
                {row.name}
              </span>
              <span className="block max-w-96 truncate text-xs text-muted-foreground">
                /{row.slug} ·{" "}
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
            <Badge variant={PHASE_LOOK[row.phase]?.variant ?? "outline"}>
              {PHASE_LOOK[row.phase]?.label ?? row.phase}
            </Badge>
          </TableCell>
          <TableCell column="meta">{row.memberCount}</TableCell>
          <TableCell column="mutedMeta" className="hidden lg:table-cell">
            {formatDateTime(row.createdAt)}
          </TableCell>
        </TableRow>
      ))}
    </AdminListTable>
  )
}
