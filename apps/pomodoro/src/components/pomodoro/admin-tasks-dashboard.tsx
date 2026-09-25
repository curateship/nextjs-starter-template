import * as React from "react"
import { getRouteApi } from "@tanstack/react-router"
import { ListChecksIcon } from "lucide-react"

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
import { listPomodoroTasks, type AdminTaskRow } from "@/lib/api/pomodoro/admin"
import { formatDate, formatUtcDate } from "@/lib/format/format-time"
import {
  useListSearchNavigate,
  useListSort,
  useSearchBoxText,
} from "@/lib/nav/list-search"
import type { TaskSortColumn } from "@/lib/pomodoro/admin-lists"

const route = getRouteApi("/_authenticated/admin/pomodoro-tasks")

type SortColumn = TaskSortColumn

const COLUMNS: TableHeaderColumn<SortColumn>[] = [
  { key: "title", label: "Task", column: "main" },
  { key: "person", label: "Member", column: "meta" },
  { key: "date", label: "Planned for", column: "meta" },
  { key: "status", label: "Status", column: "meta" },
  { key: "pomodoros", label: "Runs", column: "meta" },
  {
    key: "created",
    label: "Added",
    column: "meta",
    className: "hidden lg:table-cell",
  },
]

/** A task's standing, and how strongly to draw it. */
const STATUS_LOOK: Record<
  string,
  { label: string; variant: "default" | "secondary" | "outline" }
> = {
  active: { label: "Active", variant: "default" },
  completed: { label: "Done", variant: "secondary" },
  carried: { label: "Carried over", variant: "outline" },
  abandoned: { label: "Abandoned", variant: "outline" },
}

/**
 * Everybody's tasks, newest first. Read-only: a member's plan for their day is
 * theirs, and an operator is here to see it, not to rewrite it.
 */
export function AdminTasksDashboard({
  initial,
  initialPageSize,
}: {
  initial: { rows: AdminTaskRow[]; total: number }
  initialPageSize: number
}) {
  const search = route.useSearch()
  const setListSearch = useListSearchNavigate()
  const query = search.q ?? ""
  const status = search.status ?? "all"
  const userId = search.user ?? null
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
      listPomodoroTasks({
        search: query,
        status,
        userId,
        sort,
        direction,
        page,
        pageSize,
      }),
    [direction, page, query, sort, status, userId]
  )

  const list = useAdminList({
    initial,
    initialPageSize,
    page,
    onPageChange: setPage,
    load,
  })
  const toggleSort = useListSort<SortColumn>({ sort, direction }, (column) =>
    column === "created" || column === "date" || column === "pomodoros"
      ? "desc"
      : "asc"
  )

  return (
    <AdminListTable
      title="Tasks"
      icon={<ListChecksIcon />}
      noun="tasks"
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
            name="task-search"
            aria-label="Search tasks"
            placeholder="Search task, name or email…"
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
            <DashboardToolbarSelectTrigger aria-label="Filter by status">
              <SelectValue placeholder="Status" />
            </DashboardToolbarSelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="completed">Done</SelectItem>
              <SelectItem value="carried">Carried over</SelectItem>
              <SelectItem value="abandoned">Abandoned</SelectItem>
            </SelectContent>
          </Select>
        </>
      }
    >
      {list.rows.map((row) => (
        <TableRow key={row.id}>
          <TableCell column="main">
            <span className="block max-w-96 truncate" title={row.title}>
              {row.title}
            </span>
          </TableCell>
          <TableCell column="meta" className="max-w-56">
            <span className="block truncate" title={row.userEmail}>
              {row.userName}
            </span>
          </TableCell>
          <TableCell column="meta">{formatUtcDate(row.plannedDate)}</TableCell>
          <TableCell column="meta">
            <Badge variant={STATUS_LOOK[row.status]?.variant ?? "outline"}>
              {STATUS_LOOK[row.status]?.label ?? row.status}
            </Badge>
          </TableCell>
          <TableCell column="meta">{row.pomodoroCount}</TableCell>
          <TableCell column="mutedMeta" className="hidden lg:table-cell">
            {formatDate(row.createdAt)}
          </TableCell>
        </TableRow>
      ))}
    </AdminListTable>
  )
}
