import * as React from "react"
import { useRouter } from "@tanstack/react-router"
import { toast } from "sonner"

import { ReasonDialog } from "@/components/project/reason-dialog"
import { ProjectDot } from "@/components/project/task-bits"
import { DashboardToolbarSelectTrigger } from "@/components/shared/dashboard-toolbar"
import { DatePicker } from "@/components/ui/date-picker"
import { Select, SelectContent, SelectItem, SelectValue } from "@/components/ui/select"
import { changeTasks, type BulkChange } from "@/lib/api/project/tasks"
import { plural } from "@/lib/format/plural"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { keyFromDate } from "@/lib/project/dates"
import { getProjectErrorMessage } from "@/lib/project/errors"
import {
  TASK_STATUSES,
  TASK_STATUS_LABEL,
  type ProjectColor,
  type TaskStatus,
} from "@/lib/project/rules"
import { showErrorToast } from "@/lib/toast/error-toast"

const NOBODY = "nobody"
const NO_DATE = "none"

export type BulkTargets = {
  people: { id: string; name: string }[]
  projects: { id: string; name: string; color: ProjectColor }[]
}

/**
 * Status, Hand to, Due date and Move to project for the ticked rows of a
 * project's List tab, beside Mark Done. Each task is changed on its own on the
 * server, so one that can't change is refused alone and the result says so.
 */
export function TaskBulkBar({
  taskIds,
  targets,
  onDone,
}: {
  taskIds: string[]
  targets: BulkTargets
  onDone: () => void
}) {
  const router = useRouter()
  const [run, busy] = useAsyncAction(getProjectErrorMessage)
  const [askingStuck, setAskingStuck] = React.useState(false)
  // The pickers are actions, not settings, so each goes back to its label.
  const [reset, setReset] = React.useState(0)

  async function apply(change: BulkChange, verb: string) {
    let outcome = { changed: [] as string[], refused: [] as { title: string; reason: string }[] }
    const ok = await run(async () => {
      outcome = await changeTasks({ taskIds, change })
    })
    setReset((n) => n + 1)
    if (!ok) return false
    const changed = outcome.changed.length
    const refused = outcome.refused.length
    if (refused) {
      const first = outcome.refused[0]
      showErrorToast(
        `${changed} ${plural(changed, "task")} ${verb}, ${refused} refused. ${first.title ? `"${first.title}": ` : ""}${first.reason}`
      )
    } else {
      toast.success(`${changed} ${plural(changed, "task")} ${verb}.`)
    }
    onDone()
    await router.invalidate()
    return true
  }

  return (
    <>
      <Select
        key={`status-${reset}`}
        disabled={busy}
        onValueChange={(value) => {
          if (value === "stuck") setAskingStuck(true)
          else void apply({ kind: "status", status: value as TaskStatus, stuckReason: null }, "changed")
        }}
      >
        <DashboardToolbarSelectTrigger aria-label="Set the status of the ticked tasks">
          <SelectValue placeholder="Status" />
        </DashboardToolbarSelectTrigger>
        <SelectContent>
          {TASK_STATUSES.map((status) => (
            <SelectItem key={status} value={status}>
              {TASK_STATUS_LABEL[status]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        key={`hand-${reset}`}
        disabled={busy}
        onValueChange={(value) =>
          value === NOBODY
            ? void apply({ kind: "assign", assigneeUserId: null }, "unassigned")
            : void apply({ kind: "assign", assigneeUserId: value }, "handed over")
        }
      >
        <DashboardToolbarSelectTrigger aria-label="Hand the ticked tasks to">
          <SelectValue placeholder="Hand to" />
        </DashboardToolbarSelectTrigger>
        <SelectContent>
          <SelectItem value={NOBODY}>Nobody</SelectItem>
          {targets.people.map((person) => (
            <SelectItem key={person.id} value={person.id}>
              {person.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <DueDateAction
        key={`due-${reset}`}
        disabled={busy}
        onPick={(dueDate) => void apply({ kind: "due", dueDate }, "changed")}
      />
      {targets.projects.length ? (
        <Select
          key={`move-${reset}`}
          disabled={busy}
          onValueChange={(projectId) => void apply({ kind: "move", projectId }, "moved")}
        >
          <DashboardToolbarSelectTrigger aria-label="Move the ticked tasks to a project">
            <SelectValue placeholder="Move to project" />
          </DashboardToolbarSelectTrigger>
          <SelectContent>
            {targets.projects.map((project) => (
              <SelectItem key={project.id} value={project.id}>
                <ProjectDot color={project.color} />
                {project.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}
      <ReasonDialog
        open={askingStuck}
        title={taskIds.length === 1 ? "Why is it stuck?" : "Why are they stuck?"}
        description={
          taskIds.length === 1
            ? "The ticked task moves to Stuck, and whoever handed it out is told."
            : `The ${taskIds.length} ticked tasks move to Stuck with this one reason, and whoever handed each out is told.`
        }
        label="Reason"
        confirmLabel="Mark Stuck"
        busy={busy}
        onClose={() => {
          setAskingStuck(false)
          setReset((n) => n + 1)
        }}
        onConfirm={async (reason) => {
          const ok = await apply({ kind: "status", status: "stuck", stuckReason: reason }, "marked Stuck")
          if (ok) setAskingStuck(false)
          return ok
        }}
      />
    </>
  )
}

/**
 * A due date for every ticked task, or none. "Pick a date…" opens the
 * calendar at once, and closing it without a pick brings the menu back.
 */
function DueDateAction({
  disabled,
  onPick,
}: {
  disabled: boolean
  onPick: (dueDate: string | null) => void
}) {
  const [mode, setMode] = React.useState<"menu" | "date">("menu")
  if (mode === "date") {
    return (
      <DatePicker
        id="bulk-due"
        value={undefined}
        placeholder="Pick the due date"
        disabled={disabled}
        defaultOpen
        onOpenChange={(open) => {
          if (!open) setMode("menu")
        }}
        onChange={(date) => onPick(keyFromDate(date))}
      />
    )
  }
  return (
    <Select
      disabled={disabled}
      onValueChange={(value) => (value === NO_DATE ? onPick(null) : setMode("date"))}
    >
      <DashboardToolbarSelectTrigger aria-label="Set the due date of the ticked tasks">
        <SelectValue placeholder="Due date" />
      </DashboardToolbarSelectTrigger>
      <SelectContent>
        <SelectItem value="pick">Pick a date…</SelectItem>
        <SelectItem value={NO_DATE}>No due date</SelectItem>
      </SelectContent>
    </Select>
  )
}
