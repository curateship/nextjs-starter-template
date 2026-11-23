import * as React from "react"
import { useNavigate } from "@tanstack/react-router"
import { ListChecksIcon, TimerIcon, Trash2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { TableCell } from "@/components/ui/table"
import type { TableHeaderColumn } from "@/components/shared/sortable-table-header"
import { SelectedMenuRow } from "@/components/shared/mass-select"
import { Chip, MainCell } from "@/components/crm/crm-table"
import { AdminListTable, AdminRow, useAdminList } from "@/components/pomodoro/admin-list"
import { MemberName } from "@/components/pomodoro/admin-member-name"
import { AdminDeleteConfirm, useAdminDelete } from "@/components/pomodoro/admin-delete"
import { NoRecord } from "@/components/pomodoro/flowfly/detail-record"
import { FilterPick } from "@/components/pomodoro/flowfly/filter-pick"
import { useFlowflySearch } from "@/components/pomodoro/flowfly/flowfly-context"
import { TaskRecord } from "@/components/pomodoro/flowfly/task-record"
import { deletePomodoroTasks, listPomodoroTasks, type AdminTaskRow } from "@/lib/api/pomodoro/admin"
import { formatDate, formatUtcDate } from "@/lib/format/format-time"
import { plural } from "@/lib/format/plural"
import { useSelection } from "@/lib/hooks/use-selection"
import { useListSearchNavigate, useListSort } from "@/lib/nav/list-search"
import { TASK_STATUS_LOOK, type TASK_STATUS_FILTERS, type TaskSortColumn } from "@/lib/pomodoro/admin-lists"
import { flowflyLink } from "@/lib/pomodoro/flowfly-search"

type SortColumn = TaskSortColumn

type TasksSearch = {
  q?: string
  status?: (typeof TASK_STATUS_FILTERS)[number]
  user?: string
  sort?: SortColumn
  direction?: "asc" | "desc"
  page?: number
}

const COLUMNS: TableHeaderColumn<SortColumn>[] = [
  { key: "title", label: "Task", column: "main" },
  { key: "person", label: "Member", column: "meta", className: "hidden md:hidden @2xl:table-cell" },
  { key: "date", label: "Planned for", column: "meta", className: "hidden md:hidden @4xl:table-cell" },
  { key: "status", label: "Status", column: "meta" },
  { key: "pomodoros", label: "Sessions", column: "meta", className: "hidden md:hidden @5xl:table-cell" },
  { key: "created", label: "Added", column: "meta", className: "hidden md:hidden @6xl:table-cell" },
]

/**
 * Tasks → Tasks on the Flowfly dashboard: everybody's tasks, newest first.
 * An admin can delete them, never edit them: a member's plan for their day
 * is theirs to word. A task opens on the right with its steps, tags, due
 * date and the runs on it (Tyler's pick "Task and session records").
 */
export function AdminTasksDashboard({
  initial,
  initialPageSize,
}: {
  initial: { rows: AdminTaskRow[]; total: number }
  initialPageSize: number
}) {
  const search = useFlowflySearch<TasksSearch>()
  const setListSearch = useListSearchNavigate()
  const navigate = useNavigate()
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

  const load = React.useCallback(
    (pageSize: number) => listPomodoroTasks({ search: query, status, userId, sort, direction, page, pageSize }),
    [direction, page, query, sort, status, userId]
  )

  const list = useAdminList({ initial, initialPageSize, page, onPageChange: setPage, load })
  const toggleSort = useListSort<SortColumn>({ sort, direction }, (column) =>
    column === "created" || column === "date" || column === "pomodoros" ? "desc" : "asc"
  )
  const rowIds = React.useMemo(() => list.rows.map((row) => row.id), [list.rows])
  const del = useAdminDelete({
    one: "task",
    many: "tasks",
    run: deletePomodoroTasks,
    keptReason: "already gone",
    selection,
    onDone: list.refresh,
  })
  const asked = list.rows.filter((row) => del.ids.includes(row.id))
  // A task on its own says little. The runs behind it are the next question.
  const showSessions = (userId: string) =>
    void navigate({ to: "/admin/flowfly", search: flowflyLink("sessions", { user: userId }) })

  return (
    <AdminListTable
      noun="tasks"
      columns={COLUMNS}
      sort={sort}
      direction={direction}
      onSort={toggleSort}
      selection={{ noun: "tasks", rowIds, state: selection }}
      list={list}
      page={page}
      onPageChange={setPage}
      search={{
        name: "task-search",
        label: "Search tasks",
        placeholder: "Search task, name or email",
        value: query,
        onChange: (text) => setListSearch({ q: text.trim() ? text : undefined, page: undefined }),
      }}
      person={
        userId
          ? {
              name: list.rows.find((row) => row.userId === userId)?.userName ?? null,
              onClear: () => setListSearch({ user: undefined, page: undefined }),
            }
          : undefined
      }
      filter={{
        count: status !== "all" ? 1 : 0,
        onClear: () => setListSearch({ status: undefined, page: undefined }),
        children: (
          <FilterPick
            id="tasks-status"
            label="Status"
            value={status === "all" ? undefined : status}
            any="All statuses"
            options={[
              ["active", "Active"],
              ["completed", "Done"],
              ["carried", "Carried over"],
              ["abandoned", "Abandoned"],
            ]}
            onChange={(next) => setListSearch({ status: next, page: undefined })}
          />
        ),
      }}
      bulk={(ids, menu) => (
        <SelectedMenuRow
          className="text-destructive"
          onClick={() => {
            menu.close()
            del.ask(ids)
          }}
        >
          <Trash2Icon className="size-4" />
          Delete
        </SelectedMenuRow>
      )}
      bulkBusy={del.deleting}
      rowIds={rowIds}
      record={{
        label: "Task",
        content: (openId) => {
          const row = list.rows.find((each) => each.id === openId)
          if (!row) return <NoRecord title="Task" icon={<ListChecksIcon aria-hidden />} line="No member has a task yet." />
          return (
            <TaskRecord
              key={row.id}
              row={row}
              footer={
                <>
                  <Button type="button" variant="outline" onClick={() => showSessions(row.userId)}>
                    <TimerIcon />
                    Their sessions
                  </Button>
                  <Button type="button" variant="outline" className="text-destructive" onClick={() => del.ask([row.id])}>
                    <Trash2Icon />
                    Delete
                  </Button>
                </>
              }
            />
          )
        },
      }}
      windows={
        <AdminDeleteConfirm
          del={del}
          title={asked.length === 1 ? `Delete "${asked[0].title}"?` : `Delete ${del.ids.length} tasks?`}
          description={describeTaskDeletion(asked)}
          confirmLabel={plural(del.ids.length, "Delete task", "Delete tasks")}
        />
      }
    >
      {list.rows.map((row) => (
        <AdminRow
          key={row.id}
          id={row.id}
          label={row.title}
          onDelete={() => del.ask([row.id])}
          buttons={[{ label: `Focus sessions for ${row.userName}`, icon: <TimerIcon className="size-4" />, onPress: () => showSessions(row.userId) }]}
        >
          <MainCell name={row.title} />
          <TableCell column="meta" className="hidden max-w-56 md:hidden @2xl:table-cell">
            <MemberName id={row.userId} name={row.userName} title={row.userEmail} className="max-w-full font-normal" />
          </TableCell>
          <TableCell column="meta" className="hidden md:hidden @4xl:table-cell">
            {formatUtcDate(row.plannedDate)}
          </TableCell>
          <TableCell column="meta">
            <Chip muted={row.status !== "active"}>{TASK_STATUS_LOOK[row.status]?.label ?? row.status}</Chip>
          </TableCell>
          <TableCell column="meta" className="hidden md:hidden @5xl:table-cell">
            {row.pomodoroCount}
          </TableCell>
          <TableCell column="mutedMeta" className="hidden md:hidden @6xl:table-cell">
            {formatDate(row.createdAt)}
          </TableCell>
        </AdminRow>
      ))}
    </AdminListTable>
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
