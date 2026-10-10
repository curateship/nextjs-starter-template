import * as React from "react"
import { useRouter } from "@tanstack/react-router"
import { CheckIcon, SettingsIcon } from "lucide-react"
import { toast } from "sonner"

import {
  DueDate,
  PersonAvatar,
  StatusBadge,
  WaitingBadge,
} from "@/components/project/task-bits"
import {
  SelectAllTableHead,
  SortableTableHeader,
  type SortableColumn,
} from "@/components/shared/sortable-table-header"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { Table, TableBody, TableCell, TableHead, TableRow } from "@/components/ui/table"
import { markTasksDone, type TaskCard } from "@/lib/api/project/tasks"
import { describeBulkResult } from "@/lib/format/bulk-result"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { useClearSelectionOnListChange } from "@/lib/hooks/use-clear-selection"
import { useSelection } from "@/lib/hooks/use-selection"
import { useTableSort } from "@/lib/hooks/use-table-sort"
import { getProjectErrorMessage } from "@/lib/project/errors"
import { TASK_STATUSES } from "@/lib/project/rules"
import { showErrorToast } from "@/lib/toast/error-toast"

export type TaskColumn = "title" | "project" | "status" | "assignee" | "due" | "steps"

const STATUS_ORDER = Object.fromEntries(TASK_STATUSES.map((s, i) => [s, i]))

function compare(a: TaskCard, b: TaskCard, column: TaskColumn) {
  switch (column) {
    case "project":
      return a.projectName.localeCompare(b.projectName)
    case "status":
      return STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
    case "assignee":
      return (a.assignee?.name ?? "~").localeCompare(b.assignee?.name ?? "~")
    case "due":
      // Tasks with no due date go last whichever way the column is sorted.
      return (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999")
    case "steps":
      return a.steps.total - b.steps.total
    default:
      return a.title.localeCompare(b.title)
  }
}

/**
 * Tasks as rows: the project page's List tab, and My work. Rows sort by any
 * column, and ticked rows can be marked Done together.
 */
export function TaskList({
  tasks,
  readOnly,
  onOpenTask,
  showProject = false,
  emptyText = "No tasks yet.",
}: {
  tasks: TaskCard[]
  readOnly: boolean
  onOpenTask: (task: TaskCard) => void
  showProject?: boolean
  emptyText?: string
}) {
  const router = useRouter()
  const { sort, direction, toggleSort } = useTableSort<TaskColumn>(showProject ? "due" : "status")
  const selection = useSelection()
  const [run, busy] = useAsyncAction(getProjectErrorMessage)
  useClearSelectionOnListChange(selection.setSelected, tasks.map((t) => t.id).join(","))

  const columns: SortableColumn<TaskColumn>[] = [
    // The preset 320px minimum is for a full page; this table also sits in a panel.
    { key: "title", label: "Task", column: "main", className: "min-w-32" },
    ...(showProject ? [{ key: "project" as const, label: "Project", column: "preview" as const }] : []),
    { key: "status", label: "Status", column: "preview" },
    ...(showProject ? [] : [{ key: "assignee" as const, label: "Assigned to", column: "preview" as const }]),
    { key: "due", label: "Due", column: "preview" },
    { key: "steps", label: "Steps", column: "preview" },
  ]

  const rows = React.useMemo(() => {
    const sign = direction === "asc" ? 1 : -1
    return [...tasks].sort(
      (a, b) => compare(a, b, sort) * sign || a.title.localeCompare(b.title)
    )
  }, [direction, sort, tasks])
  const ids = rows.map((row) => row.id)
  const selectedIds = ids.filter((id) => selection.selected.has(id))

  async function markDone() {
    let result = { done: [] as string[], kept: [] as string[] }
    const ok = await run(async () => {
      result = await markTasksDone(selectedIds)
    })
    if (!ok) return
    const line = describeBulkResult({
      done: result.done.length,
      kept: result.kept.length,
      one: "task",
      many: "tasks",
      verb: "marked Done",
    })
    if (result.kept.length) showErrorToast(line)
    else toast.success(line)
    selection.clear()
    await router.invalidate()
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {selectedIds.length && !readOnly ? (
        <div className="flex items-center gap-2 border-b px-3 py-2">
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void markDone()}>
            <CheckIcon className="size-4" />
            Mark Done ({selectedIds.length})
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={selection.clear}>
            Clear selection
          </Button>
        </div>
      ) : null}
      <ScrollArea className="min-h-0 flex-1" viewportClassName="h-full">
        <Table containerClassName="overflow-visible">
          <SortableTableHeader
            columns={columns}
            sort={sort}
            direction={direction}
            onSort={toggleSort}
            leading={
              <SelectAllTableHead
                noun="tasks"
                disabled={readOnly || rows.length === 0}
                checked={selection.selectAllState(ids)}
                onCheckedChange={() => selection.toggleVisible(ids)}
              />
            }
            trailing={<TableHead column="meta">Actions</TableHead>}
          />
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length + 2} className="text-muted-foreground">
                  {emptyText}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((task) => (
                <TableRow key={task.id} className="group" rowAction={() => onOpenTask(task)}>
                  <TableCell column="select">
                    <Checkbox
                      checked={selection.selected.has(task.id)}
                      disabled={readOnly}
                      onCheckedChange={() => selection.toggle(task.id)}
                      aria-label={`Select ${task.title}`}
                    />
                  </TableCell>
                  <TableCell column="main" className="min-w-32">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="truncate font-medium">{task.title}</span>
                      {task.waiting ? <WaitingBadge /> : null}
                    </span>
                  </TableCell>
                  {showProject ? <TableCell column="preview">{task.projectName}</TableCell> : null}
                  <TableCell column="preview">
                    <StatusBadge status={task.status} />
                  </TableCell>
                  {showProject ? null : (
                    <TableCell column="preview">
                      {task.assignee ? (
                        <span className="flex items-center gap-2">
                          <PersonAvatar name={task.assignee.name} avatarUrl={task.assignee.avatarUrl} />
                          {task.assignee.name}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">Nobody</span>
                      )}
                    </TableCell>
                  )}
                  <TableCell column="preview">
                    <DueDate dueDate={task.dueDate} status={task.status} />
                  </TableCell>
                  <TableCell column="preview">
                    {task.steps.total ? `${task.steps.done} of ${task.steps.total}` : "—"}
                  </TableCell>
                  <TableCell column="actions">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Open ${task.title}`}
                      onClick={() => onOpenTask(task)}
                    >
                      <SettingsIcon className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  )
}
