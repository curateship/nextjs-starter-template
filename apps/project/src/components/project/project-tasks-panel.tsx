import * as React from "react"
import { useRouter } from "@tanstack/react-router"
import { PlusIcon, XIcon } from "lucide-react"

import { NewTaskDialog } from "@/components/project/new-task-dialog"
import { ReasonDialog } from "@/components/project/reason-dialog"
import { TaskBoard } from "@/components/project/task-board"
import { TaskList } from "@/components/project/task-list"
import { DashboardCardTabsHeader } from "@/components/shared/dashboard-card-header"
import { Button } from "@/components/ui/button"
import { Tabs, TabsTrigger } from "@/components/ui/tabs"
import type { ProjectPage } from "@/lib/api/project/projects"
import { setStatus, type TaskCard } from "@/lib/api/project/tasks"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { useSyncedDraft } from "@/lib/hooks/use-synced-draft"
import { useRememberedChoice } from "@/lib/remembered-choice"
import { getProjectErrorMessage } from "@/lib/project/errors"
import { PROJECT_TASK_VIEW_KEY } from "@/lib/project/panel-keys"
import type { TaskStatus } from "@/lib/project/rules"

const VIEWS = ["board", "list"] as const
type View = (typeof VIEWS)[number]

/**
 * The project's tasks, as a Board (one column per status) or a List. The tab
 * last used is remembered in this browser. A status change shows at once and
 * is put back if the server refuses it.
 */
export function ProjectTasksPanel({
  page,
  memberFilter,
  onClearFilter,
  onOpenTask,
}: {
  page: ProjectPage
  memberFilter: string | null
  onClearFilter: () => void
  onOpenTask: (taskId: string) => void
}) {
  const router = useRouter()
  const [view, setView] = useRememberedChoice<View>(PROJECT_TASK_VIEW_KEY, "board", VIEWS)
  const [tasks, setTasks] = useSyncedDraft(page.tasks)
  const [creating, setCreating] = React.useState(false)
  const [stuckTask, setStuckTask] = React.useState<TaskCard | null>(null)
  const [run, busy] = useAsyncAction(getProjectErrorMessage)
  const readOnly = page.project.archived

  const filtered = memberFilter
    ? tasks.filter((task) => task.assignee?.id === memberFilter)
    : tasks
  const filterName = page.members.find((m) => m.userId === memberFilter)?.name

  async function changeStatus(task: TaskCard, status: TaskStatus, stuckReason: string | null) {
    if (task.status === status) return true
    const before = tasks
    setTasks((current) =>
      current.map((t) => (t.id === task.id ? { ...t, status, stuckReason } : t))
    )
    const ok = await run(() => setStatus({ taskId: task.id, status, stuckReason }))
    if (!ok) setTasks(before)
    await router.invalidate()
    return ok
  }

  function requestStatus(task: TaskCard, status: TaskStatus) {
    // Stuck needs its reason first; every other move goes straight through.
    if (status === "stuck") setStuckTask(task)
    else void changeStatus(task, status, null)
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
        </DashboardCardTabsHeader>
      </Tabs>
      {filterName ? (
        <div className="flex items-center gap-2 border-b px-3 py-2 text-sm">
          <span className="text-muted-foreground">Showing {filterName}'s tasks</span>
          <Button type="button" variant="ghost" size="sm" onClick={onClearFilter}>
            <XIcon className="size-4" />
            Show everyone's
          </Button>
        </div>
      ) : null}
      {view === "board" ? (
        <TaskBoard
          tasks={filtered}
          readOnly={readOnly || busy}
          onOpenTask={onOpenTask}
          onMove={requestStatus}
        />
      ) : (
        <TaskList
          tasks={filtered}
          readOnly={readOnly}
          onOpenTask={(task) => onOpenTask(task.id)}
        />
      )}
      <NewTaskDialog page={page} open={creating} onClose={() => setCreating(false)} />
      <ReasonDialog
        open={Boolean(stuckTask)}
        title="Why is it stuck?"
        description={
          stuckTask
            ? `"${stuckTask.title}" moves to Stuck, and whoever handed it out is told.`
            : ""
        }
        label="Reason"
        confirmLabel="Mark Stuck"
        busy={busy}
        onClose={() => setStuckTask(null)}
        onConfirm={async (reason) =>
          stuckTask ? changeStatus(stuckTask, "stuck", reason) : false
        }
      />
    </>
  )
}
