import * as React from "react"
import { Repeat2Icon, Trash2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { TableCell } from "@/components/ui/table"
import type { TableHeaderColumn } from "@/components/shared/sortable-table-header"
import { SelectedMenuRow } from "@/components/shared/mass-select"
import { MainCell } from "@/components/crm/crm-table"
import { AdminListTable, AdminRow, useAdminList } from "@/components/pomodoro/admin-list"
import { MemberName } from "@/components/pomodoro/admin-member-name"
import { AdminDeleteConfirm, useAdminDelete } from "@/components/pomodoro/admin-delete"
import { DetailRecord, NoRecord } from "@/components/pomodoro/flowfly/detail-record"
import { useFlowflySearch } from "@/components/pomodoro/flowfly/flowfly-context"
import {
  deletePomodoroTaskRepeats,
  listPomodoroTaskRepeats,
  type AdminTaskRepeatRow,
} from "@/lib/api/pomodoro/admin"
import { formatDate } from "@/lib/format/format-time"
import { plural } from "@/lib/format/plural"
import { useSelection } from "@/lib/hooks/use-selection"
import { useListSearchNavigate, useListSort } from "@/lib/nav/list-search"
import type { TaskRepeatSortColumn } from "@/lib/pomodoro/admin-lists"
import { describeWeekdaySet } from "@/lib/pomodoro/task-repeats"

type SortColumn = TaskRepeatSortColumn

type RepeatsSearch = { q?: string; user?: string; sort?: SortColumn; direction?: "asc" | "desc"; page?: number }

const COLUMNS: TableHeaderColumn<SortColumn>[] = [
  { key: "title", label: "Repeating task", column: "main" },
  { key: "person", label: "Member", column: "meta", className: "hidden md:hidden @lg:table-cell" },
  { key: "created", label: "Set up", column: "meta", className: "hidden md:hidden @2xl:table-cell" },
]

/**
 * Tasks → Repeating on the Flowfly dashboard: every repeating task rule. A
 * rule puts a fresh task on the member's list on each of its days, so
 * deleting today's task alone does not stop tomorrow's. A rule opens on the
 * right with its days, project and owner.
 */
export function AdminTaskRepeatsDashboard({
  initial,
  initialPageSize,
}: {
  initial: { rows: AdminTaskRepeatRow[]; total: number }
  initialPageSize: number
}) {
  const search = useFlowflySearch<RepeatsSearch>()
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

  const load = React.useCallback(
    (pageSize: number) => listPomodoroTaskRepeats({ search: query, userId, sort, direction, page, pageSize }),
    [direction, page, query, sort, userId]
  )

  const list = useAdminList({ initial, initialPageSize, page, onPageChange: setPage, load })
  const toggleSort = useListSort<SortColumn>({ sort, direction }, (column) => (column === "created" ? "desc" : "asc"))
  const rowIds = React.useMemo(() => list.rows.map((row) => row.id), [list.rows])
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
    <AdminListTable
      noun="repeating tasks"
      columns={COLUMNS}
      sort={sort}
      direction={direction}
      onSort={toggleSort}
      selection={{ noun: "repeating tasks", rowIds, state: selection }}
      list={list}
      page={page}
      onPageChange={setPage}
      search={{
        name: "task-repeat-search",
        label: "Search repeating tasks",
        placeholder: "Search task, name or email",
        value: query,
        onChange: (text) => setListSearch({ q: text.trim() ? text : undefined, page: undefined }),
      }}
      person={userId ? { name: filteredMemberName, onClear: () => setListSearch({ user: undefined, page: undefined }) } : undefined}
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
        label: "Repeating task",
        content: (openId) => {
          const row = list.rows.find((each) => each.id === openId)
          if (!row) return <NoRecord title="Repeating task" icon={<Repeat2Icon aria-hidden />} line="No member repeats a task yet." />
          return (
            <DetailRecord
              key={row.id}
              icon={<Repeat2Icon aria-hidden />}
              title={row.title}
              line={row.userName}
              hideLabel="Hide the repeating task"
              facts={[
                ["Member", <MemberName key="member" id={row.userId} name={row.userName} title={row.userEmail} />],
                ["Repeats", describeWeekdaySet(row.weekdays)],
                ["Project", row.projectName ?? "None"],
                ["Set up", formatDate(row.createdAt)],
              ]}
              state={`Repeats ${describeWeekdaySet(row.weekdays)}`}
              footer={
                <Button type="button" variant="outline" className="text-destructive" onClick={() => del.ask([row.id])}>
                  <Trash2Icon />
                  Stop repeating
                </Button>
              }
            />
          )
        },
      }}
      windows={
        <AdminDeleteConfirm
          del={del}
          title={asked.length === 1 ? `Stop "${asked[0].title}" repeating?` : `Delete ${del.ids.length} repeating tasks?`}
          description="No new copies will be added to anyone's task list. Tasks already made stay, and so does the focus time spent on them. This cannot be undone."
          confirmLabel={plural(del.ids.length, "Delete repeating task", "Delete repeating tasks")}
        />
      }
    >
      {list.rows.map((row) => (
        <AdminRow key={row.id} id={row.id} label={row.title} onDelete={() => del.ask([row.id])}>
          <MainCell name={row.title}>
            <span className="min-w-0 truncate text-xs text-muted-foreground">
              Repeats {describeWeekdaySet(row.weekdays)}
              {row.projectName ? ` · ${row.projectName}` : ""}
            </span>
          </MainCell>
          <TableCell column="meta" className="hidden max-w-56 md:hidden @lg:table-cell">
            <MemberName id={row.userId} name={row.userName} title={row.userEmail} className="max-w-full font-normal" />
          </TableCell>
          <TableCell column="mutedMeta" className="hidden md:hidden @2xl:table-cell">
            {formatDate(row.createdAt)}
          </TableCell>
        </AdminRow>
      ))}
    </AdminListTable>
  )
}
