import * as React from "react"
import { Link, useRouter } from "@tanstack/react-router"
import { FlagIcon, Loader2Icon, PlusIcon, Trash2Icon } from "lucide-react"

import { Chip, CrmTable, CrmTableRow, Dot, MainCell } from "@/components/crm/crm-table"
import { PickDayRow, PickGroup, PickRow } from "@/components/project/pick-rows"
import { SideRecord, SideRecordMenu } from "@/components/project/side-record"
import { PanelCard, PanelCardFooter } from "@/components/shared/panel-card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { focusRingInset } from "@/lib/layout/focus-ring"
import { CardDropdownTitle } from "@/components/project/card-dropdown"
import { DueDayPicker } from "@/components/project/due-day-picker"
import { SaveLine } from "@/components/project/save-line"
import { TaskSearchBox } from "@/components/project/task-header-controls"
import { StatusDot } from "@/components/project/task-bits"
import { StatusCellMenu } from "@/components/project/task-cell-menus"
import { DashboardCardHeader } from "@/components/shared/dashboard-card-header"
import { MiddleHeading } from "@/components/shared/three-panels"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Meter } from "@/components/ui/meter"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { TableCell, type TableSortDirection } from "@/components/ui/table"
import type { TableHeaderColumn } from "@/components/shared/sortable-table-header"
import { addMilestone, removeMilestone, saveMilestone, saveTaskMilestone, type Milestone } from "@/lib/api/project/projects"
import { createProjectTask } from "@/lib/api/project/tasks"
import type { TaskCard } from "@/lib/api/project/tasks"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { todayKey } from "@/lib/project/dates"
import { dayLabel } from "@/lib/project/days"
import { getProjectErrorMessage } from "@/lib/project/errors"
import { milestoneOverdue } from "@/lib/project/milestones"
import { LIMITS, TASK_STATUS_LABEL } from "@/lib/project/rules"
import { byPosition } from "@/lib/project/task-order"
import { TASK_HEADER_BUTTONS } from "@/lib/project/task-header-look"
import { useSaveLine } from "@/lib/project/use-save-line"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

/**
 * A project's milestones, the Milestones dashboard on its page (Tyler, 16 Nov
 * 2026: "remove the notes and milestone block and instead create a dashboards
 * for it"): the list in the middle, soonest first, and the open milestone on
 * the right with its name and date, its tasks, and Delete. They were a block
 * on the project's page from 9 Nov 2026 ("make milestone a block") and a card
 * at the foot of its left panel before that.
 *
 * Each says how many of its tasks are done and turns red with "Overdue" once
 * its date passes with tasks open. Tasks join one from their Plan card.
 * Anyone on the project may add, change or delete one, until it's archived.
 */

type MilestoneSort = "date" | "name" | "status" | "progress"

const MILESTONE_COLUMNS: TableHeaderColumn<MilestoneSort>[] = [
  { key: "name", label: "Milestone", column: "main", className: "min-w-40" },
  { key: "status", label: "Status", column: "preview" },
  { key: "progress", label: "Tasks done", column: "preview", className: "hidden md:hidden @xl:table-cell" },
  { key: "date", label: "Date", column: "meta" },
]

/** Soonest first and the ones with no date last, as the server lists them. */
function compareMilestones(sort: MilestoneSort, a: Milestone, b: Milestone) {
  if (sort === "name") return a.name.localeCompare(b.name)
  if (sort === "status") return STATE_ORDER.indexOf(milestoneState(a, todayKey()).label) - STATE_ORDER.indexOf(milestoneState(b, todayKey()).label)
  if (sort === "progress") return (a.total ? a.done / a.total : -1) - (b.total ? b.done / b.total : -1)
  if (a.dueDate === b.dueDate) return 0
  if (!a.dueDate) return 1
  if (!b.dueDate) return -1
  return a.dueDate.localeCompare(b.dueDate)
}

/** Status sorts most urgent first. */
const STATE_ORDER = ["Overdue", "Open", "No tasks yet", "Done"]

/** Where a milestone stands: its dot and its word. */
function milestoneState(milestone: Milestone, today: string) {
  if (milestoneOverdue(milestone, today)) return { dot: "bg-red-500", label: "Overdue" }
  if (milestone.total === 0) return { dot: "bg-muted-foreground/40", label: "No tasks yet" }
  if (milestone.done === milestone.total) return { dot: "bg-green-600", label: "Done" }
  return { dot: "bg-amber-500", label: "Open" }
}

/**
 * The Milestones dashboard's middle: the section's name, a search box and New
 * milestone, then the milestones as a table, the shell's `CrmTable` as the
 * CRM's and Admin's lists are (Tyler, 16 Nov 2026: "add proper table to both
 * notes and milestones"). Each row is its dot (red overdue, amber open, green
 * done, grey with no tasks), the name, how many tasks are done with a bar, the
 * date, and a bin that asks first. Soonest first until a heading sorts them.
 */
export function ProjectMilestonesMiddle({
  projectId,
  milestones,
  openId,
  readOnly,
  onOpen,
}: {
  projectId: string
  milestones: Milestone[]
  /** The milestone on the right. */
  openId: string | undefined
  readOnly: boolean
  onOpen: (milestoneId: string) => void
}) {
  const [query, setQuery] = React.useState("")
  const [sort, setSort] = React.useState<MilestoneSort>("date")
  const [direction, setDirection] = React.useState<TableSortDirection>("asc")
  const [deleting, setDeleting] = React.useState<Milestone | null>(null)
  const today = todayKey()
  const words = query.trim().toLowerCase()
  const sign = direction === "asc" ? 1 : -1
  const shown = (words ? milestones.filter((milestone) => milestone.name.toLowerCase().includes(words)) : milestones)
    .slice()
    .sort((a, b) => sign * compareMilestones(sort, a, b))

  function toggleSort(column: MilestoneSort) {
    if (sort === column) setDirection(direction === "asc" ? "desc" : "asc")
    else {
      setSort(column)
      setDirection("asc")
    }
  }

  return (
    // Its own container, so columns drop out as the middle narrows, as the CRM's tables do.
    <div className="@container flex h-full min-h-0 flex-col">
      <DashboardCardHeader className="@container">
        <MiddleHeading icon={FlagIcon} label="Milestones" />
        <div className={cn("ml-auto", TASK_HEADER_BUTTONS)}>
          {/* The header has room for "Search milestones" whole: only New milestone's word drops. */}
          <TaskSearchBox value={query} onChange={setQuery} what="milestones" boxClassName="sm:w-44 lg:w-48" />
          {readOnly ? null : <NewMilestoneButton projectId={projectId} onAdded={onOpen} />}
        </div>
      </DashboardCardHeader>
      <CrmTable<MilestoneSort>
        columns={MILESTONE_COLUMNS}
        sort={sort}
        direction={direction}
        onSort={toggleSort}
        empty={
          shown.length > 0 ? null : words ? (
            <span className="grid justify-items-center gap-2">
              {`No milestone matches "${query.trim()}".`}
              <Button type="button" variant="outline" size="sm" onClick={() => setQuery("")}>
                Clear search
              </Button>
            </span>
          ) : (
            "No milestones. Add one for each date a set of tasks must be finished by."
          )
        }
      >
        {shown.map((milestone) => {
          const state = milestoneState(milestone, today)
          const overdue = milestoneOverdue(milestone, today)
          return (
            <CrmTableRow
              key={milestone.id}
              open={milestone.id === openId}
              label={milestone.name}
              onOpen={() => onOpen(milestone.id)}
              onDelete={readOnly ? undefined : () => setDeleting(milestone)}
            >
              <MainCell name={milestone.name} lead={<Dot className={state.dot} label={state.label} />} />
              <TableCell column="preview">
                <Chip muted className={cn(overdue && "text-destructive")}>{state.label}</Chip>
              </TableCell>
              <TableCell column="preview" className="hidden md:hidden @xl:table-cell">
                <span className="flex items-center gap-2">
                  <span aria-hidden className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-muted">
                    <span
                      className={cn("block h-full rounded-full", overdue ? "bg-red-500" : "bg-green-600")}
                      style={{ width: `${milestone.total ? Math.round((milestone.done / milestone.total) * 100) : 0}%` }}
                    />
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums sm:text-sm">
                    {milestone.total ? `${milestone.done} of ${milestone.total}` : "None yet"}
                  </span>
                </span>
              </TableCell>
              <TableCell column="mutedMeta" className={cn(overdue && "text-destructive sm:text-destructive")}>
                {milestone.dueDate ? dayLabel(milestone.dueDate) : "No date"}
              </TableCell>
            </CrmTableRow>
          )
        })}
      </CrmTable>
      <DeleteMilestoneDialog milestone={deleting} onDone={() => setDeleting(null)} />
    </div>
  )
}

/** Delete milestone, asked first, from a row's bin or the open milestone's button. */
function DeleteMilestoneDialog({ milestone, onDone }: { milestone: Milestone | null; onDone: () => void }) {
  const router = useRouter()
  const [run, busy] = useAsyncAction(getProjectErrorMessage)
  return (
    <ConfirmDialog
      open={milestone !== null}
      onOpenChange={(open) => (open ? undefined : onDone())}
      title={milestone ? `Delete "${milestone.name}"?` : "Delete milestone?"}
      description="Its tasks stay where they are and count toward no milestone."
      confirmLabel="Delete milestone"
      destructive
      loading={busy}
      onConfirm={async () => {
        if (!milestone) return
        const ok = await run(() => removeMilestone(milestone.id))
        if (!ok) return
        onDone()
        await router.invalidate()
      }}
    />
  )
}

function MilestoneMeter({ milestone, overdue }: { milestone: Milestone; overdue: boolean }) {
  return (
    <Meter
      value={milestone.done}
      max={milestone.total}
      size="sm"
      tone={overdue ? "critical" : "positive"}
      label={`${milestone.name}: tasks done`}
      valueText={`${milestone.done} of ${milestone.total} tasks done`}
    />
  )
}

/** New milestone in the middle's header: a name and a date in a dropdown, then the new one opens. */
function NewMilestoneButton({ projectId, onAdded }: { projectId: string; onAdded: (milestoneId: string) => void }) {
  const [open, setOpen] = React.useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" aria-label="New milestone" className="@max-3xl:size-8 @max-3xl:px-0">
          <PlusIcon className="size-4" />
          <span className="@max-3xl:hidden">New milestone</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={10} className="w-[min(20rem,calc(100vw-2rem))] gap-4 p-4">
        <NewMilestoneForm
          projectId={projectId}
          onDone={(id) => {
            setOpen(false)
            if (id) onAdded(id)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}

function NewMilestoneForm({ projectId, onDone }: { projectId: string; onDone: (milestoneId: string | null) => void }) {
  const router = useRouter()
  const [name, setName] = React.useState("")
  const [dueDate, setDueDate] = React.useState<string | null>(null)
  const [invalid, setInvalid] = React.useState(false)
  const [run, saving] = useAsyncAction(getProjectErrorMessage)

  async function save() {
    if (!name.trim()) {
      setInvalid(true)
      showErrorToast("Give the milestone a name.")
      return
    }
    let id: string | null = null
    const ok = await run(async () => {
      id = (await addMilestone({ projectId, name: name.trim(), dueDate })).id
    })
    if (!ok) return
    await router.invalidate()
    onDone(id)
  }

  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        void save()
      }}
    >
      <CardDropdownTitle>New milestone</CardDropdownTitle>
      <div className="grid gap-2">
        <Label htmlFor="milestone-name">Name</Label>
        <Input
          id="milestone-name"
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
        <Label htmlFor="milestone-date">Date</Label>
        <DueDayPicker id="milestone-date" value={dueDate} placeholder="No date" clearLabel="Clear the milestone's date" onChange={setDueDate} />
      </div>
      <p className="text-xs text-muted-foreground">
        Link tasks to it from each task's Plan card. A section is where a task sits; a milestone is
        when it must be finished.
      </p>
      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => onDone(null)} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? <Loader2Icon className="size-4 animate-spin" /> : null}
          Add
        </Button>
      </div>
    </form>
  )
}

/**
 * The Milestones dashboard's right panel, drawn as the open task's is
 * (`SideRecord`; Tyler, 16 Nov 2026: "still not following ui standards"):
 * the milestone's name in the header, then its ⋮, the task menu's own look,
 * with Name and Date as rows of a grey group that save themselves and Delete
 * milestone in red under a line ("there needs to be a 3 dotted dropdown for
 * these options to go in there"). The body is the bar and the milestone's
 * tasks as a grey group of rows, each opening on the Tasks dashboard. The
 * footer has where it stands on the left and Add task on the right, as the
 * task's footer has its status and Completed ("there should be an "Add task"
 * button to add tasks to this milestone or connect an existing task to it").
 * It is never empty: with none open it shows the first, and with none at all
 * it says how to add one.
 */
export function ProjectMilestoneSide({
  projectId,
  milestone,
  tasks,
  readOnly,
  newTaskAssignee,
}: {
  projectId: string
  milestone: Milestone | undefined
  /** The project's tasks; the milestone's own are picked out here. */
  tasks: TaskCard[]
  readOnly: boolean
  /** Who a task made here is handed to: me when I'm on the project, as New task does. */
  newTaskAssignee: string | null
}) {
  if (!milestone) {
    return (
      <SideRecord icon={<FlagIcon className="size-4" />} title="Milestone" hideLabel="Hide the milestone">
        <p className="text-sm text-muted-foreground">
          {readOnly
            ? "This project has no milestones."
            : "No milestones yet. Press New milestone for each date a set of tasks must be finished by."}
        </p>
      </SideRecord>
    )
  }
  const overdue = milestoneOverdue(milestone, todayKey())
  const own = tasks.filter((task) => task.milestoneId === milestone.id).sort(byPosition)
  return (
    <SideRecord
      key={milestone.id}
      icon={<FlagIcon className="size-4" />}
      title={milestone.name}
      menu={readOnly ? null : <MilestoneMenu milestone={milestone} />}
      hideLabel="Hide the milestone"
    >
      {/* Its tasks on a card, as Promo's open item has its own. Where it stands is the
          table's Status column (Tyler, 16 Nov 2026: "remove ... and put the status on the table instead"). */}
      <PanelCard
        storageId="project-milestone-tasks"
        title="Tasks"
        meta={milestone.total ? `${milestone.done} of ${milestone.total} done` : String(own.length)}
      >
        <MilestoneMeter milestone={milestone} overdue={overdue} />
        {own.length === 0 ? (
          <p className="text-sm text-muted-foreground">No tasks yet. Add one, or connect one the project already has.</p>
        ) : (
          <ul className="-mx-2 grid grid-cols-[minmax(0,1fr)] gap-0.5" aria-label={`Tasks in ${milestone.name}`}>
            {own.map((task) => (
              <li key={task.id} className="flex min-w-0 items-center gap-1 rounded-md pr-1 hover:bg-muted">
                {/* The title opens the task on the Tasks dashboard, beside the list. */}
                <Link
                  to="/projects/$projectId"
                  params={{ projectId }}
                  search={{ task: task.id }}
                  className={cn(TASK_ROW, focusRingInset, "hover:bg-transparent")}
                >
                  <StatusDot status={task.status} />
                  <span className={cn("min-w-0 flex-1 truncate", task.status === "done" && "text-muted-foreground line-through")}>
                    {task.title}
                  </span>
                </Link>
                {/* The status changes here, as in the List's Status column (Tyler, 16 Nov 2026:
                    "this should be a dropdown to change status"); Stuck asks why first. */}
                <span className="shrink-0 text-xs">
                  {readOnly ? (
                    <span className="text-muted-foreground">{TASK_STATUS_LABEL[task.status]}</span>
                  ) : (
                    <StatusCellMenu task={task} look="badge" />
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
        {readOnly ? null : (
          <PanelCardFooter>
            <AddTaskButton projectId={projectId} milestone={milestone} allTasks={tasks} assignee={newTaskAssignee} />
          </PanelCardFooter>
        )}
      </PanelCard>
    </SideRecord>
  )
}

/** A task in the milestone's Tasks card, or in Add task's list: its dot, title and status. */
const TASK_ROW = "flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"

/** The ⋮ in the right panel's header: Name and Date, then Delete milestone. */
function MilestoneMenu({ milestone }: { milestone: Milestone }) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [name, setName] = React.useState(milestone.name)
  const [invalid, setInvalid] = React.useState(false)
  const [saveState, track] = useSaveLine()
  const [deleting, setDeleting] = React.useState(false)

  async function save(next: { name: string; dueDate: string | null }) {
    if (await track(() => saveMilestone({ milestoneId: milestone.id, ...next }))) await router.invalidate()
  }

  function saveName() {
    const trimmed = name.trim()
    if (trimmed === milestone.name) return
    if (!trimmed) {
      setInvalid(true)
      showErrorToast("Give the milestone a name.")
      return
    }
    void save({ name: trimmed, dueDate: milestone.dueDate })
  }

  return (
    <>
      <SideRecordMenu
        label="Milestone menu"
        open={open}
        onOpenChange={setOpen}
        groups={
          <PickGroup title="Milestone" after={<SaveLine state={saveState} className="px-0.5" />}>
            <PickRow label="Name" value={milestone.name}>
              <div className="grid gap-2">
                <Label htmlFor={`milestone-name-${milestone.id}`}>Name</Label>
                <Input
                  id={`milestone-name-${milestone.id}`}
                  value={name}
                  maxLength={LIMITS.milestoneName}
                  aria-invalid={invalid || undefined}
                  onChange={(event) => {
                    setName(event.target.value)
                    setInvalid(false)
                  }}
                  onBlur={saveName}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") event.currentTarget.blur()
                  }}
                />
              </div>
            </PickRow>
            <PickDayRow
              label="Date"
              empty={!milestone.dueDate}
              value={milestone.dueDate ? dayLabel(milestone.dueDate) : "None"}
              day={milestone.dueDate}
              clearLabel="Clear the milestone's date"
              onPick={(dueDate) => void save({ name: milestone.name, dueDate })}
            />
          </PickGroup>
        }
        remove={{
          label: "Delete milestone",
          icon: <Trash2Icon className="size-4" />,
          onSelect: () => {
            setOpen(false)
            setDeleting(true)
          },
        }}
      />
      <DeleteMilestoneDialog milestone={deleting ? milestone : null} onDone={() => setDeleting(false)} />
    </>
  )
}

/**
 * Add task, the footer's main button, as the task's footer has Completed. It
 * opens a box of two plain parts: New task, whose title makes the task in the
 * project counted toward this milestone, and Connect a task, the project's
 * other tasks found by title, one press moving a task here. A task in another
 * milestone says so, since a task counts toward one at most.
 */
function AddTaskButton({
  projectId,
  milestone,
  allTasks,
  assignee,
}: {
  projectId: string
  milestone: Milestone
  allTasks: TaskCard[]
  assignee: string | null
}) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [title, setTitle] = React.useState("")
  const [query, setQuery] = React.useState("")
  const [run, busy] = useAsyncAction(getProjectErrorMessage)
  const others = allTasks.filter((task) => task.milestoneId !== milestone.id)
  const words = query.trim().toLowerCase()
  const found = (words ? others.filter((task) => task.title.toLowerCase().includes(words)) : others)
    // Open tasks first, then the rest, each in the project's order.
    .sort((a, b) => Number(a.status === "done") - Number(b.status === "done") || byPosition(a, b))
    .slice(0, 50)

  async function addNew() {
    if (!title.trim()) {
      showErrorToast("Give the task a title.")
      return
    }
    const ok = await run(() =>
      createProjectTask({ projectId, title: title.trim(), assigneeUserId: assignee, handoverNote: null, milestoneId: milestone.id })
    )
    if (!ok) return
    setTitle("")
    await router.invalidate()
  }

  async function connect(task: TaskCard) {
    if (!(await run(() => saveTaskMilestone(task.id, milestone.id)))) return
    await router.invalidate()
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="sm" className="-ml-2 text-muted-foreground">
          <PlusIcon className="size-4" />
          Add task
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={8} collisionPadding={16} className="grid w-[min(20.4rem,calc(100vw-2rem))] gap-4 p-4">
        {/* Plain, no grey box behind either part (Tyler, 16 Nov 2026: "remove bg"). */}
        <section className="grid gap-2" aria-label="New task">
          <h3 className="px-0.5 text-sm font-medium text-muted-foreground">New task</h3>
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault()
              void addNew()
            }}
          >
            <Input
              aria-label="New task's title"
              value={title}
              maxLength={LIMITS.taskTitle}
              placeholder="Task title"
              onChange={(event) => setTitle(event.target.value)}
            />
            <Button type="submit" disabled={busy}>
              {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
              Add
            </Button>
          </form>
        </section>
        <section className="grid min-w-0 gap-2" aria-label="Connect a task">
          <h3 className="px-0.5 text-sm font-medium text-muted-foreground">Connect a task</h3>
          <Input
            aria-label="Search the project's tasks"
            value={query}
            placeholder="Search the project's tasks"
            onChange={(event) => setQuery(event.target.value)}
          />
          {found.length === 0 ? (
            <p className="px-0.5 text-sm text-muted-foreground">
              {others.length === 0 ? "Every task in the project is already in this milestone." : "No task has those words."}
            </p>
          ) : (
            <ScrollArea className="-mx-2 max-h-56" viewportClassName="max-h-56">
              <div className="grid grid-cols-[minmax(0,1fr)] gap-0.5 px-2">
                {found.map((task) => (
                  <button
                    key={task.id}
                    type="button"
                    disabled={busy}
                    onClick={() => void connect(task)}
                    className={cn(TASK_ROW, focusRingInset, "disabled:opacity-60")}
                  >
                    <StatusDot status={task.status} />
                    <span className="min-w-0 flex-1 truncate">{task.title}</span>
                    {task.milestoneId ? <span className="shrink-0 text-xs text-muted-foreground">In another</span> : null}
                  </button>
                ))}
              </div>
            </ScrollArea>
          )}
        </section>
      </PopoverContent>
    </Popover>
  )
}
