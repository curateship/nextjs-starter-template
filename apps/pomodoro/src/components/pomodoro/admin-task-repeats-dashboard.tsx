import * as React from "react"
import { getRouteApi } from "@tanstack/react-router"
import { Repeat2Icon, XIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { TableCell, TableHead, TableRow } from "@/components/ui/table"
import { DashboardToolbarSearch } from "@/components/shared/dashboard-toolbar"
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
  deletePomodoroTaskRepeats,
  listPomodoroTaskRepeats,
  type AdminTaskRepeatRow,
} from "@/lib/api/pomodoro/admin"
import { formatDate } from "@/lib/format/format-time"
import { plural } from "@/lib/format/plural"
import { useSelection } from "@/lib/hooks/use-selection"
import {
  useListSearchNavigate,
  useListSort,
  useSearchBoxText,
} from "@/lib/nav/list-search"
import type { TaskRepeatSortColumn } from "@/lib/pomodoro/admin-lists"
import { describeWeekdaySet } from "@/lib/pomodoro/task-repeats"

const route = getRouteApi("/_authenticated/admin/pomodoro-task-repeats")

type SortColumn = TaskRepeatSortColumn

const COLUMNS: TableHeaderColumn<SortColumn>[] = [
  { key: "title", label: "Repeating task", column: "main" },
  { key: "person", label: "Member", column: "meta" },
  {
    key: "created",
    label: "Set up",
    column: "meta",
    className: "hidden lg:table-cell",
  },
]

/**
 * Every repeating task rule. A rule puts a fresh task on the member's list on
 * each of its days, so deleting today's task alone does not stop tomorrow's.
 */
export function AdminTaskRepeatsDashboard({
  initial,
  initialPageSize,
}: {
  initial: { rows: AdminTaskRepeatRow[]; total: number }
  initialPageSize: number
}) {
  const search = route.useSearch()
  const setListSearch = useListSearchNavigate()
  const query = search.q ?? ""
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
      listPomodoroTaskRepeats({
        search: query,
        userId,
        sort,
        direction,
        page,
        pageSize,
      }),
    [direction, page, query, sort, userId]
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
    one: "repeating task",
    many: "repeating tasks",
    run: deletePomodoroTaskRepeats,
    keptReason: "already gone",
    selection,
    onDone: list.refresh,
  })
  const asked = list.rows.filter((row) => del.ids.includes(row.id))
  const filteredMemberName = userId ? (list.rows[0]?.userName ?? null) : null

  return (
    <>
      <AdminListTable
        title="Repeating tasks"
        icon={<Repeat2Icon />}
        noun="repeating tasks"
        columns={COLUMNS}
        sort={sort}
        direction={direction}
        onSort={toggleSort}
        trailing={<TableHead column="meta">Actions</TableHead>}
        selection={{ noun: "repeating tasks", rowIds, state: selection }}
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
              name="task-repeat-search"
              aria-label="Search repeating tasks"
              placeholder="Search task, name or email…"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
            />
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
              <div className="min-w-0">
                <span className="block max-w-96 truncate" title={row.title}>
                  {row.title}
                </span>
                <span className="block max-w-96 truncate text-xs text-muted-foreground">
                  Repeats {describeWeekdaySet(row.weekdays)}
                  {row.projectName ? ` · ${row.projectName}` : ""}
                </span>
              </div>
            </TableCell>
            <TableCell column="meta" className="max-w-56">
              <MemberName id={row.userId} name={row.userName} title={row.userEmail} className="max-w-full font-normal" />
            </TableCell>
            <TableCell column="mutedMeta" className="hidden lg:table-cell">
              {formatDate(row.createdAt)}
            </TableCell>
            <TableCell column="actions">
              <AdminRowDeleteButton
                del={del}
                id={row.id}
                label={`Delete the repeating task ${row.title}`}
              />
            </TableCell>
          </TableRow>
        ))}
      </AdminListTable>
      <AdminDeleteConfirm
        del={del}
        title={
          asked.length === 1
            ? `Stop "${asked[0].title}" repeating?`
            : `Delete ${del.ids.length} repeating tasks?`
        }
        description="No new copies will be added to anyone's task list. Tasks already made stay, and so does the focus time spent on them. This cannot be undone."
        confirmLabel={plural(
          del.ids.length,
          "Delete repeating task",
          "Delete repeating tasks"
        )}
      />
    </>
  )
}
