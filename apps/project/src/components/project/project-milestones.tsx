import * as React from "react"
import { useRouter } from "@tanstack/react-router"
import { Link } from "@tanstack/react-router"
import { ListChecksIcon, Loader2Icon, PlusIcon, SettingsIcon } from "lucide-react"

import { CardDropdown, CardDropdownTitle } from "@/components/project/card-dropdown"
import { DueDayPicker } from "@/components/project/due-day-picker"
import { PanelCard } from "@/components/project/panel-card"
import { StatusDot } from "@/components/project/task-bits"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Meter } from "@/components/ui/meter"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  addMilestone,
  removeMilestone,
  saveMilestone,
  type Milestone,
} from "@/lib/api/project/projects"
import type { TaskCard } from "@/lib/api/project/tasks"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { todayKey } from "@/lib/project/dates"
import { getProjectErrorMessage } from "@/lib/project/errors"
import { milestoneLine, milestoneOverdue } from "@/lib/project/milestones"
import { LIMITS, TASK_STATUS_LABEL } from "@/lib/project/rules"
import { byPosition } from "@/lib/project/task-order"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

/**
 * The project's milestones, a folding card on its details panel, soonest
 * first. Each says how many of its tasks are done and turns red with
 * "Overdue" once its date passes with tasks open. The "+" in the heading and
 * the two icons on each row (its tasks, and the cog) open dropdowns, shown on
 * hover (Tyler, 15 Oct 2026).
 * Tasks join one from their Plan card.
 */
export function ProjectMilestones({
  projectId,
  milestones,
  tasks,
  readOnly,
}: {
  projectId: string
  milestones: Milestone[]
  /** The project's tasks, for each milestone's list. */
  tasks: TaskCard[]
  readOnly: boolean
}) {
  const [adding, setAdding] = React.useState(false)
  const today = todayKey()
  return (
    <PanelCard
      storageId="project-details-milestones"
      title="Milestones"
      after={milestones.length ? <span className="font-normal text-muted-foreground">{milestones.length}</span> : null}
      actionOpen={adding}
      action={
        readOnly ? null : (
          <CardDropdown
            label="Add a milestone"
            icon={<PlusIcon className="size-4" />}
            open={adding}
            onOpenChange={setAdding}
          >
            <MilestoneForm projectId={projectId} milestone={null} onDone={() => setAdding(false)} />
          </CardDropdown>
        )
      }
    >
      {milestones.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No milestones. Add one for each date a set of tasks must be finished by.
        </p>
      ) : (
        <ul className="grid gap-2">
          {milestones.map((milestone) => (
            <MilestoneRow
              key={milestone.id}
              projectId={projectId}
              milestone={milestone}
              tasks={tasks.filter((task) => task.milestoneId === milestone.id).sort(byPosition)}
              overdue={milestoneOverdue(milestone, today)}
              readOnly={readOnly}
            />
          ))}
        </ul>
      )}
    </PanelCard>
  )
}

/** Shown while the row is pointed at, holds the keyboard, or its dropdown is open; always on a touch screen. */
const ROW_ICON =
  "opacity-0 transition-opacity group-hover/row:opacity-100 group-has-[:focus-visible]/row:opacity-100 [@media(hover:none)]:opacity-100"

function MilestoneRow({
  projectId,
  milestone,
  tasks,
  overdue,
  readOnly,
}: {
  projectId: string
  milestone: Milestone
  tasks: TaskCard[]
  overdue: boolean
  readOnly: boolean
}) {
  const router = useRouter()
  const [listing, setListing] = React.useState(false)
  const [editing, setEditing] = React.useState(false)
  const [deleting, setDeleting] = React.useState(false)
  const [run, busy] = useAsyncAction(getProjectErrorMessage)
  return (
    <li className="group/row flex items-center gap-1 rounded-lg border bg-background py-2 pr-1 pl-3">
      <span className="grid min-w-0 flex-1 gap-1">
        <span className="truncate text-sm font-medium">{milestone.name}</span>
        <Meter
          value={milestone.done}
          max={milestone.total}
          size="sm"
          tone={overdue ? "critical" : "positive"}
          label={`${milestone.name}: tasks done`}
          valueText={`${milestone.done} of ${milestone.total} tasks done`}
        />
        <span className={cn("text-xs", overdue ? "text-destructive" : "text-muted-foreground")}>
          {overdue ? "Overdue · " : ""}
          {milestoneLine(milestone)}
        </span>
      </span>
      <CardDropdown
        label={`Tasks in ${milestone.name}`}
        icon={<ListChecksIcon className="size-4" />}
        open={listing}
        onOpenChange={setListing}
        className={cn(ROW_ICON, listing && "opacity-100")}
      >
        <MilestoneTasks
          projectId={projectId}
          milestone={milestone}
          tasks={tasks}
          onOpenTask={() => setListing(false)}
        />
      </CardDropdown>
      {readOnly ? null : (
        <CardDropdown
          label={`Change ${milestone.name}`}
          icon={<SettingsIcon className="size-4" />}
          open={editing}
          onOpenChange={setEditing}
          className={cn(ROW_ICON, editing && "opacity-100")}
        >
          <MilestoneForm
            projectId={projectId}
            milestone={milestone}
            onDone={() => setEditing(false)}
            onDelete={() => {
              setEditing(false)
              setDeleting(true)
            }}
          />
        </CardDropdown>
      )}
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={`Delete "${milestone.name}"?`}
        description="Its tasks stay where they are and count toward no milestone."
        confirmLabel="Delete milestone"
        destructive
        loading={busy}
        onConfirm={async () => {
          const ok = await run(() => removeMilestone(milestone.id), "Milestone deleted.")
          if (!ok) return
          setDeleting(false)
          await router.invalidate()
        }}
      />
    </li>
  )
}

/**
 * Every task in a milestone, in the project's order, each with its status.
 * Clicking one opens it in the page's right panel.
 */
function MilestoneTasks({
  projectId,
  milestone,
  tasks,
  onOpenTask,
}: {
  projectId: string
  milestone: Milestone
  tasks: TaskCard[]
  onOpenTask: () => void
}) {
  return (
    // minmax(0, 1fr): a long title is cut with "…" rather than widening the dropdown.
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3">
      <CardDropdownTitle>
        {milestone.name}
        <span className="ml-2 font-normal text-muted-foreground">{tasks.length}</span>
      </CardDropdownTitle>
      {tasks.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No tasks yet. Link one from a task's Plan card, under Milestone.
        </p>
      ) : (
        <ScrollArea className="-mx-2 max-h-72 min-w-0">
          <ul className="grid grid-cols-[minmax(0,1fr)] gap-0.5 px-2">
            {tasks.map((task) => (
              <li key={task.id}>
                <Link
                  to="/projects/$projectId"
                  params={{ projectId }}
                  search={{ task: task.id }}
                  onClick={onOpenTask}
                  className="flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                >
                  <StatusDot status={task.status} />
                  <span className={cn("min-w-0 flex-1 truncate", task.status === "done" && "text-muted-foreground line-through")}>
                    {task.title}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">{TASK_STATUS_LABEL[task.status]}</span>
                </Link>
              </li>
            ))}
          </ul>
        </ScrollArea>
      )}
    </div>
  )
}

/** A milestone's name and date, new or changed, inside a dropdown. */
function MilestoneForm({
  projectId,
  milestone,
  onDone,
  onDelete,
}: {
  projectId: string
  /** Null makes a new one. */
  milestone: Milestone | null
  onDone: () => void
  /** Only for one that exists: closes the dropdown and asks first. */
  onDelete?: () => void
}) {
  const router = useRouter()
  const [name, setName] = React.useState(milestone?.name ?? "")
  const [dueDate, setDueDate] = React.useState<string | null>(milestone?.dueDate ?? null)
  const [invalid, setInvalid] = React.useState(false)
  const [run, saving] = useAsyncAction(getProjectErrorMessage)

  async function save() {
    if (!name.trim()) {
      setInvalid(true)
      showErrorToast("Give the milestone a name.")
      return
    }
    const ok = await run(
      () =>
        milestone
          ? saveMilestone({ milestoneId: milestone.id, name: name.trim(), dueDate })
          : addMilestone({ projectId, name: name.trim(), dueDate }),
      milestone ? "Milestone saved." : "Milestone added."
    )
    if (!ok) return
    await router.invalidate()
    onDone()
  }

  const nameId = milestone ? `milestone-name-${milestone.id}` : "milestone-name"
  const dateId = milestone ? `milestone-date-${milestone.id}` : "milestone-date"
  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        void save()
      }}
    >
      <CardDropdownTitle>{milestone ? "Change milestone" : "New milestone"}</CardDropdownTitle>
      <div className="grid gap-2">
        <Label htmlFor={nameId}>Name</Label>
        <Input
          id={nameId}
          value={name}
          maxLength={LIMITS.milestoneName}
          placeholder="Design signed off"
          aria-invalid={invalid || undefined}
          onChange={(event) => {
            setName(event.target.value)
            setInvalid(false)
          }}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={dateId}>Date</Label>
        <DueDayPicker
          id={dateId}
          value={dueDate}
          placeholder="No date"
          clearLabel="Clear the milestone's date"
          onChange={setDueDate}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Link tasks to it from each task's Plan card. A section is where a task sits; a milestone is
        when it must be finished.
      </p>
      <div className="flex items-center gap-2">
        {onDelete ? (
          <Button type="button" variant="ghost" className="mr-auto text-destructive" disabled={saving} onClick={onDelete}>
            Delete
          </Button>
        ) : null}
        <Button type="button" variant="outline" className={onDelete ? undefined : "ml-auto"} onClick={onDone} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? <Loader2Icon className="size-4 animate-spin" /> : null}
          {milestone ? "Save" : "Add"}
        </Button>
      </div>
    </form>
  )
}
