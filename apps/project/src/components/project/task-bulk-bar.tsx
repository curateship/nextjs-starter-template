import * as React from "react"
import { useRouter } from "@tanstack/react-router"

import { ReasonDialog } from "@/components/project/reason-dialog"
import { ProjectDot, RoomNote } from "@/components/project/task-bits"
import { DashboardToolbarSelectTrigger } from "@/components/shared/dashboard-toolbar"
import { DueDayPicker } from "@/components/project/due-day-picker"
import { Select, SelectContent, SelectItem, SelectValue } from "@/components/ui/select"
import { changeTasks, type BulkChange } from "@/lib/api/project/tasks"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { getProjectErrorMessage } from "@/lib/project/errors"
import {
  LIMITS,
  TASK_STATUSES,
  TASK_STATUS_LABEL,
  type ProjectColor,
  type TaskStatus,
} from "@/lib/project/rules"
import { usePeopleRoom } from "@/lib/project/use-people-room"
import { reportBulkOutcome } from "@/lib/project/bulk-outcome"

const NOBODY = "nobody"
const NO_DATE = "none"

export type BulkTargets = {
  people: { id: string; name: string }[]
  projects: { id: string; name: string; color: ProjectColor }[]
}

/**
 * Status, Hand to, Due date and Move to project for the ticked rows of a
 * project's List tab and of My tasks (which has no Move to project), beside
 * Mark Done. Each task is changed on its own on the server, so one that can't
 * change is refused alone and the result names it with the reason. Hand to
 * asks for one optional note, which goes with every ticked task.
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
  const [handingTo, setHandingTo] = React.useState<{ id: string; name: string } | null>(null)
  const room = usePeopleRoom()
  // The pickers are actions, not settings, so each goes back to its label.
  const [reset, setReset] = React.useState(0)

  async function apply(change: BulkChange, verb: string) {
    let outcome = { changed: [] as string[], refused: [] as { title: string; reason: string }[] }
    const ok = await run(async () => {
      outcome = await changeTasks({ taskIds, change })
    })
    setReset((n) => n + 1)
    if (!ok) return false
    reportBulkOutcome(outcome, verb)
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
        onValueChange={(value) => {
          if (value === NOBODY) {
            void apply({ kind: "assign", assigneeUserId: null, note: null }, "unassigned")
            return
          }
          const person = targets.people.find((p) => p.id === value)
          if (person) setHandingTo(person)
        }}
      >
        <DashboardToolbarSelectTrigger aria-label="Hand the ticked tasks to">
          <SelectValue placeholder="Hand to" />
        </DashboardToolbarSelectTrigger>
        <SelectContent>
          <SelectItem value={NOBODY}>Nobody</SelectItem>
          {targets.people.map((person) => (
            <SelectItem key={person.id} value={person.id}>
              {person.name}
              <RoomNote room={room[person.id]} />
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
        open={Boolean(handingTo)}
        optional
        cardTitle="Note"
        maxLength={LIMITS.handoverNote}
        title={`Hand ${taskIds.length === 1 ? "the task" : `${taskIds.length} tasks`} to ${handingTo?.name ?? "them"}`}
        description={
          taskIds.length === 1
            ? "Add a line saying why, if you like. It goes with the task."
            : `Add a line saying why, if you like. The same note goes with all ${taskIds.length} tasks.`
        }
        label="Note (optional)"
        confirmLabel="Hand over"
        busy={busy}
        onClose={() => {
          setHandingTo(null)
          setReset((n) => n + 1)
        }}
        onConfirm={async (note) => {
          if (!handingTo) return false
          const ok = await apply(
            { kind: "assign", assigneeUserId: handingTo.id, note: note || null },
            "handed over"
          )
          if (ok) setHandingTo(null)
          return ok
        }}
      />
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
      <DueDayPicker
        id="bulk-due"
        value={null}
        placeholder="Pick the due date"
        disabled={disabled}
        defaultOpen
        onOpenChange={(open) => {
          if (!open) setMode("menu")
        }}
        onChange={onPick}
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
