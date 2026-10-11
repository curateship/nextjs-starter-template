import * as React from "react"
import { useRouter } from "@tanstack/react-router"
import { PlusIcon, XIcon } from "lucide-react"

import { NewTaskDialog } from "@/components/project/new-task-dialog"
import { ProjectActivity } from "@/components/project/project-activity"
import { ReasonDialog } from "@/components/project/reason-dialog"
import { TaskBoard } from "@/components/project/task-board"
import { TaskFiltersBar } from "@/components/project/task-filters-bar"
import { TaskList } from "@/components/project/task-list"
import { DashboardCardTabsHeader } from "@/components/shared/dashboard-card-header"
import { Button } from "@/components/ui/button"
import { Tabs, TabsTrigger } from "@/components/ui/tabs"
import type { ProjectPage } from "@/lib/api/project/projects"
import { saveTaskOrder } from "@/lib/api/project/sorting"
import { setStatus, type TaskCard } from "@/lib/api/project/tasks"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { useSyncedDraft } from "@/lib/hooks/use-synced-draft"
import { useRememberedChoice } from "@/lib/remembered-choice"
import { getProjectErrorMessage } from "@/lib/project/errors"
import { PROJECT_TASK_VIEW_KEY } from "@/lib/project/panel-keys"
import type { TaskStatus } from "@/lib/project/rules"
import { filterTasks, hasTaskFilters, type TaskFilters } from "@/lib/project/task-filters"
import { placesAfterReorder } from "@/lib/project/task-order"

const VIEWS = ["board", "list", "activity"] as const
type View = (typeof VIEWS)[number]

const NO_SECTION = "none"

/**
 * The project's tasks, as a Board (one column per status) or a List grouped
 * under the project's sections. The tab last used is remembered in this
 * browser; the search and filters live in the address. A status change or a
 * new order shows at once and is put back if the server refuses it.
 */
export function ProjectTasksPanel({
  page,
  filters,
  onFilters,
  onOpenTask,
}: {
  page: ProjectPage
  filters: TaskFilters
  onFilters: (patch: Partial<TaskFilters>) => void
  onOpenTask: (taskId: string) => void
}) {
  const router = useRouter()
  const [view, setView] = useRememberedChoice<View>(PROJECT_TASK_VIEW_KEY, "board", VIEWS)
  const [tasks, setTasks] = useSyncedDraft(page.tasks)
  const [creating, setCreating] = React.useState(false)
  // The task waiting for its Stuck reason, and where the Board dropped it.
  const [stuck, setStuck] = React.useState<{ task: TaskCard; order?: string[] } | null>(null)
  const [run, busy] = useAsyncAction(getProjectErrorMessage)
  const readOnly = page.project.archived

  const filtered = filterTasks(tasks, filters)
  const filterName = page.members.find((m) => m.userId === filters.person)?.name
  const people = page.members.map((m) => ({ id: m.userId, name: m.name }))
  const sectionGroups = React.useMemo(
    () => [
      ...page.sections.map((section) => ({ key: section.id, label: section.name })),
      { key: NO_SECTION, label: "No section" },
    ],
    [page.sections]
  )

  async function reorder(taskIds: string[]) {
    const before = tasks
    const places = placesAfterReorder(tasks, taskIds)
    setTasks((current) =>
      current.map((t) => (places.has(t.id) ? { ...t, position: places.get(t.id)! } : t))
    )
    const ok = await run(() => saveTaskOrder(page.project.id, taskIds))
    if (!ok) setTasks(before)
    else await router.invalidate()
  }

  /** A new status, and with `order` (the new column's tasks, from the Board) its place there too. */
  async function changeStatus(
    task: TaskCard,
    status: TaskStatus,
    stuckReason: string | null,
    order?: string[]
  ) {
    if (task.status === status) return true
    const before = tasks
    const places = order ? placesAfterReorder(tasks, order) : new Map<string, number>()
    setTasks((current) =>
      current.map((t) => ({
        ...t,
        ...(t.id === task.id ? { status, stuckReason } : null),
        ...(places.has(t.id) ? { position: places.get(t.id)! } : null),
      }))
    )
    const ok = await run(async () => {
      await setStatus({ taskId: task.id, status, stuckReason })
      if (order) await saveTaskOrder(page.project.id, order)
    })
    if (!ok) setTasks(before)
    await router.invalidate()
    return ok
  }

  function requestStatus(task: TaskCard, status: TaskStatus, order?: string[]) {
    // Stuck needs its reason first; every other move goes straight through.
    if (status === "stuck") setStuck({ task, order })
    else void changeStatus(task, status, null, order)
  }

  return (
    <>
      <Tabs value={view} onValueChange={(value) => setView(value as View)}>
        <DashboardCardTabsHeader
          action={
            readOnly ? null : (
              <Button type="button" onClick={() => setCreating(true)}>
                <PlusIcon className="size-4" />
                New task
              </Button>
            )
          }
        >
          <TabsTrigger value="board">Board</TabsTrigger>
          <TabsTrigger value="list">List</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </DashboardCardTabsHeader>
      </Tabs>
      {view === "activity" ? null : (
        <TaskFiltersBar filters={filters} onChange={onFilters} people={people} labels={page.labels} />
      )}
      {filterName && view !== "activity" ? (
        <div className="flex items-center gap-2 border-b px-3 py-2 text-sm">
          <span className="text-muted-foreground">Showing {filterName}'s tasks</span>
          <Button type="button" variant="ghost" size="sm" onClick={() => onFilters({ person: undefined })}>
            <XIcon className="size-4" />
            Show everyone's
          </Button>
        </div>
      ) : null}
      {view === "activity" ? (
        <ProjectActivity projectId={page.project.id} onOpenTask={onOpenTask} />
      ) : hasTaskFilters(filters) && filtered.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">
          No tasks match {filters.q?.trim() ? `"${filters.q.trim()}"` : "these filters"}. Clear the
          filters to see every task.
        </p>
      ) : view === "board" ? (
        <TaskBoard
          tasks={filtered}
          readOnly={readOnly || busy}
          onOpenTask={onOpenTask}
          onMove={requestStatus}
          onReorder={(taskIds) => void reorder(taskIds)}
        />
      ) : (
        <TaskList
          tasks={filtered}
          readOnly={readOnly}
          onOpenTask={(task) => onOpenTask(task.id)}
          groups={page.sections.length ? sectionGroups : undefined}
          groupOf={(task) => task.section?.id ?? NO_SECTION}
          showEmptyGroups={!hasTaskFilters(filters)}
          onReorder={readOnly ? undefined : (taskIds) => void reorder(taskIds)}
          bulk={{ people, projects: page.otherProjects }}
        />
      )}
      <NewTaskDialog
        projects={[
          {
            id: page.project.id,
            name: page.project.name,
            color: page.project.color,
            members: page.members,
          },
        ]}
        initialProjectId={page.project.id}
        open={creating}
        onClose={() => setCreating(false)}
      />
      <ReasonDialog
        open={Boolean(stuck)}
        title="Why is it stuck?"
        description={
          stuck
            ? `"${stuck.task.title}" moves to Stuck, and whoever handed it out is told.`
            : ""
        }
        label="Reason"
        confirmLabel="Mark Stuck"
        busy={busy}
        onClose={() => setStuck(null)}
        onConfirm={async (reason) =>
          stuck ? changeStatus(stuck.task, "stuck", reason, stuck.order) : false
        }
      />
    </>
  )
}
