import * as React from "react"
import { getRouteApi, Link } from "@tanstack/react-router"
import { ListChecksIcon, TimerIcon } from "lucide-react"

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
import { MemberName } from "@/components/pomodoro/admin-member-name"
import {
  AdminBulkDeleteButton,
  AdminDeleteConfirm,
  AdminRowDeleteButton,
  useAdminDelete,
} from "@/components/pomodoro/admin-delete"
import {
  deletePomodoroTasks,
  listPomodoroTasks,
  type AdminTaskRow,
} from "@/lib/api/pomodoro/admin"
import { plural } from "@/lib/format/plural"
import { formatDate, formatUtcDate } from "@/lib/format/format-time"
import { useSelection } from "@/lib/hooks/use-selection"
import {
  useListSearchNavigate,
  useListSort,
  useSearchBoxText,
} from "@/lib/nav/list-search"
import { TASK_STATUS_LOOK, type TaskSortColumn } from "@/lib/pomodoro/admin-lists"

const route = getRouteApi("/_authenticated/admin/pomodoro-tasks")

type SortColumn = TaskSortColumn

const COLUMNS: TableHeaderColumn<SortColumn>[] = [
  { key: "title", label: "Task", column: "main" },
  { key: "person", label: "Member", column: "meta" },
  { key: "date", label: "Planned for", column: "meta" },
  { key: "status", label: "Status", column: "meta" },
  { key: "pomodoros", label: "Sessions", column: "meta" },
  {
    key: "created",
    label: "Added",
    column: "meta",
    className: "hidden 2xl:table-cell",
  },
]

/**
 * Everybody's tasks, newest first. An operator can delete them, never edit
 * them: a member's plan for their day is theirs to word.
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

  const selection = useSelection()

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
  const rowIds = React.useMemo(
    () => list.rows.map((row) => row.id),
    [list.rows]
  )
  const selectedIds = rowIds.filter((id) => selection.selected.has(id))
  const del = useAdminDelete({
    one: "task",
    many: "tasks",
    run: deletePomodoroTasks,
    keptReason: "already gone",
    selection,
    onDone: list.refresh,
  })
  const asked = list.rows.filter((row) => del.ids.includes(row.id))

  return (
    <>
      <AdminListTable
        title="Tasks"
        icon={<ListChecksIcon />}
        noun="tasks"
        columns={COLUMNS}
        sort={sort}
        direction={direction}
        onSort={toggleSort}
        trailing={<TableHead column="meta">Actions</TableHead>}
        selection={{ noun: "tasks", rowIds, state: selection }}
        list={list}
        page={page}
        onPageChange={setPage}
        controls={
          <>
            <AdminBulkDeleteButton del={del} ids={selectedIds} />
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
            <AdminSelectCell
              selection={selection}
              id={row.id}
              label={`Select ${row.title}`}
            />
            <TableCell column="main">
              <span className="block max-w-96 truncate" title={row.title}>
                {row.title}
              </span>
            </TableCell>
            <TableCell column="meta" className="max-w-56">
              <MemberName id={row.userId} name={row.userName} title={row.userEmail} className="max-w-full font-normal" />
            </TableCell>
            <TableCell column="meta">{formatUtcDate(row.plannedDate)}</TableCell>
            <TableCell column="meta">
              <Badge variant={TASK_STATUS_LOOK[row.status]?.variant ?? "outline"}>
                {TASK_STATUS_LOOK[row.status]?.label ?? row.status}
              </Badge>
            </TableCell>
            <TableCell column="meta">{row.pomodoroCount}</TableCell>
            <TableCell column="mutedMeta" className="hidden 2xl:table-cell">
              {formatDate(row.createdAt)}
            </TableCell>
            <TableCell column="actions">
              {/* A task on its own says little. The runs behind it are the next
                  question, so the row leads to that member's timer runs. */}
              <Button type="button" variant="ghost" size="icon" asChild>
                <Link
                  to="/admin/pomodoro-sessions"
                  search={{ user: row.userId }}
                  aria-label={`Focus sessions for ${row.userName}`}
                >
                  <TimerIcon className="size-4" />
                </Link>
              </Button>
              <AdminRowDeleteButton
                del={del}
                id={row.id}
                label={`Delete ${row.title}`}
              />
            </TableCell>
          </TableRow>
        ))}
      </AdminListTable>
      <AdminDeleteConfirm
        del={del}
        title={
          asked.length === 1
            ? `Delete "${asked[0].title}"?`
            : `Delete ${del.ids.length} tasks?`
        }
        description={describeTaskDeletion(asked)}
        confirmLabel={plural(del.ids.length, "Delete task", "Delete tasks")}
      />
    </>
  )
}

function describeTaskDeletion(rows: AdminTaskRow[]) {
  const done = rows.filter((row) => row.status === "completed").length
  const lines = [
    "Their steps and tags go with them. Focus time spent on them stays in each person's history, without the task's name.",
  ]
  if (done)
    lines.push(
      `${done} ${plural(done, "was", "were")} ticked off, so "tasks done" drops by ${done} on ${plural(done, "that day", "those days")}.`
    )
  lines.push("This cannot be undone.")
  return lines.join(" ")
}
