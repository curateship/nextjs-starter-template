import * as React from "react"
import { useRouter } from "@tanstack/react-router"
import { CheckIcon } from "lucide-react"

import { DueChip, PersonAvatar, PersonChip, PriorityChip, StatusBadge, StatusDot } from "@/components/project/task-bits"
import { ReasonDialog } from "@/components/project/reason-dialog"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { assignProjectTask, saveTask, setStatus, type TaskCard } from "@/lib/api/project/tasks"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { dateFromKey, keyFromDate } from "@/lib/project/dates"
import { dayLabel, longDayLabel } from "@/lib/project/days"
import { getProjectErrorMessage } from "@/lib/project/errors"
import {
  LIMITS,
  TASK_PRIORITIES,
  TASK_PRIORITY_LABEL,
  TASK_STATUSES,
  TASK_STATUS_LABEL,
  type TaskStatus,
} from "@/lib/project/rules"
import { useQuickDays } from "@/lib/project/use-quick-days"
import { cn } from "@/lib/utils"

/**
 * The List's Status, Priority, Assigned to and Due cells, and the status dot
 * before each title, each opening a dropdown that changes that one thing on
 * the task (Tyler, 19 Oct 2026). They save the way the task's own panel does:
 * Stuck asks why first, handing the task to someone else asks for an
 * optional note and waits for them to accept, and a refusal names its reason.
 *
 * The row opens the task when clicked, and a click inside a dropdown or a
 * window drawn elsewhere on the page still travels up to the row in React, so
 * each cell keeps its clicks to itself.
 */

/** The cell's own look, kept, with a hover that says it can be clicked. */
const CELL_TRIGGER =
  "-mx-1.5 inline-flex max-w-full cursor-pointer items-center gap-2 rounded-md px-1.5 py-0.5 text-left hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none aria-expanded:bg-muted"

function useTaskChange() {
  const router = useRouter()
  const [run, busy] = useAsyncAction(getProjectErrorMessage)
  async function change(action: () => Promise<unknown>, success?: string) {
    const ok = await run(action, success)
    if (ok) await router.invalidate()
    return ok
  }
  return { change, busy }
}

/** Stops a click from reaching the row, which would open the task. */
function KeepClicks({ children }: { children: React.ReactNode }) {
  return <span onClick={(event) => event.stopPropagation()}>{children}</span>
}

function Choice({
  checked,
  onSelect,
  children,
}: {
  checked: boolean
  onSelect: () => void
  children: React.ReactNode
}) {
  return (
    <DropdownMenuItem onSelect={onSelect} aria-checked={checked} role="menuitemcheckbox">
      <span className="flex min-w-0 flex-1 items-center gap-2">{children}</span>
      {checked ? <CheckIcon className="size-4" /> : null}
    </DropdownMenuItem>
  )
}

/** The status, as its badge in the Status column or as a dot before the title. */
export function StatusCellMenu({ task, look }: { task: TaskCard; look: "badge" | "dot" }) {
  const { change, busy } = useTaskChange()
  const [askingStuck, setAskingStuck] = React.useState(false)
  const label = `Status: ${TASK_STATUS_LABEL[task.status]}. Change it`

  function pick(status: TaskStatus) {
    if (status === task.status) return
    if (status === "stuck") setAskingStuck(true)
    else void change(() => setStatus({ taskId: task.id, status, stuckReason: null }))
  }

  return (
    <KeepClicks>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          {look === "dot" ? (
            // A bigger target than the dot itself.
            <button
              type="button"
              disabled={busy}
              aria-label={label}
              className="-ml-1 flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none aria-expanded:bg-muted"
            >
              <StatusDot status={task.status} className="size-2.5" />
            </button>
          ) : (
            <button type="button" disabled={busy} aria-label={label} className={CELL_TRIGGER}>
              <StatusBadge status={task.status} />
            </button>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-44">
          {TASK_STATUSES.map((status) => (
            <Choice key={status} checked={status === task.status} onSelect={() => pick(status)}>
              <StatusDot status={status} />
              {TASK_STATUS_LABEL[status]}
            </Choice>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {askingStuck ? (
        <ReasonDialog
          open
          title="Why is it stuck?"
          description={`"${task.title}" moves to Stuck, and whoever handed it out is told.`}
          label="Reason"
          confirmLabel="Mark Stuck"
          busy={busy}
          onClose={() => setAskingStuck(false)}
          onConfirm={async (reason) => {
            const ok = await change(
              () => setStatus({ taskId: task.id, status: "stuck", stuckReason: reason }),
              "Marked Stuck."
            )
            if (ok) setAskingStuck(false)
            return ok
          }}
        />
      ) : null}
    </KeepClicks>
  )
}

export function PriorityCellMenu({ task }: { task: TaskCard }) {
  const { change, busy } = useTaskChange()
  return (
    <KeepClicks>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            disabled={busy}
            aria-label={`Priority: ${TASK_PRIORITY_LABEL[task.priority]}. Change it`}
            className={CELL_TRIGGER}
          >
            <PriorityChip priority={task.priority} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-40">
          {TASK_PRIORITIES.map((priority) => (
            <Choice
              key={priority}
              checked={priority === task.priority}
              onSelect={() => {
                if (priority !== task.priority) {
                  void change(() => saveTask({ taskId: task.id, priority }))
                }
              }}
            >
              {TASK_PRIORITY_LABEL[priority]}
            </Choice>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </KeepClicks>
  )
}

/**
 * Who the task is for. Taking it myself, or giving it to nobody, saves at
 * once; anyone else gets an optional note first and is asked to accept, as
 * from the task's own panel.
 */
export function AssigneeCellMenu({
  task,
  people,
  myUserId,
}: {
  task: TaskCard
  /** The project's members. */
  people: { id: string; name: string; avatarUrl?: string }[]
  myUserId?: string
}) {
  const { change, busy } = useTaskChange()
  const [handingTo, setHandingTo] = React.useState<{ id: string; name: string } | null>(null)
  const current = task.assignee?.id ?? null

  function pick(person: { id: string; name: string } | null) {
    if ((person?.id ?? null) === current) return
    if (person && person.id !== myUserId) {
      setHandingTo(person)
      return
    }
    void change(() => assignProjectTask({ taskId: task.id, assigneeUserId: person?.id ?? null }))
  }

  return (
    <KeepClicks>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            disabled={busy}
            aria-label={`Assigned to ${task.assignee?.name ?? "nobody"}. Change it`}
            className={CELL_TRIGGER}
          >
            <PersonChip person={task.assignee} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-60">
          <ScrollArea className="max-h-72">
            <Choice checked={current === null} onSelect={() => pick(null)}>
              Nobody
            </Choice>
            {people.map((person) => (
              <Choice key={person.id} checked={current === person.id} onSelect={() => pick(person)}>
                <PersonAvatar name={person.name} avatarUrl={person.avatarUrl} />
                <span className="truncate">{person.id === myUserId ? `${person.name} (you)` : person.name}</span>
              </Choice>
            ))}
          </ScrollArea>
        </DropdownMenuContent>
      </DropdownMenu>
      {handingTo ? (
        <ReasonDialog
          open
          optional
          cardTitle="Note"
          maxLength={LIMITS.handoverNote}
          title={`Hand the task to ${handingTo.name}`}
          description="Add a line saying why, if you like. It goes with the task."
          label="Note (optional)"
          confirmLabel="Hand over"
          busy={busy}
          onClose={() => setHandingTo(null)}
          onConfirm={async (note) => {
            const ok = await change(
              () => assignProjectTask({ taskId: task.id, assigneeUserId: handingTo.id, note: note || null }),
              `Handed to ${handingTo.name}.`
            )
            if (ok) setHandingTo(null)
            return ok
          }}
        />
      ) : null}
    </KeepClicks>
  )
}

/** The due date: none, one of the quick days, or any day on the calendar. */
export function DueCellMenu({ task }: { task: TaskCard }) {
  const { change, busy } = useTaskChange()
  const [open, setOpen] = React.useState(false)
  const quick = useQuickDays(open)

  function pick(dueDate: string | null) {
    setOpen(false)
    if (dueDate !== task.dueDate) void change(() => saveTask({ taskId: task.id, dueDate }))
  }

  return (
    <KeepClicks>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={busy}
            aria-label={`Due ${task.dueDate ? longDayLabel(task.dueDate) : "date: none"}. Change it`}
            className={CELL_TRIGGER}
          >
            <DueChip dueDate={task.dueDate} dueAt={task.dueAt} status={task.status} />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto gap-0 p-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn("w-full justify-start font-normal", !task.dueDate && "font-medium")}
            onClick={() => pick(null)}
          >
            No due date
          </Button>
          {quick ? (
            <div className="-mx-1 my-1 grid grid-cols-2 gap-1 border-y px-1 py-1">
              {quick.map((option) => (
                <Button
                  key={option.key}
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="justify-between gap-2 font-normal"
                  aria-label={`${option.label}, ${longDayLabel(option.day)}`}
                  onClick={() => pick(option.day)}
                >
                  {option.label}
                  <span className="text-xs text-muted-foreground">{dayLabel(option.day)}</span>
                </Button>
              ))}
            </div>
          ) : null}
          <Calendar
            mode="single"
            selected={dateFromKey(task.dueDate)}
            defaultMonth={dateFromKey(task.dueDate)}
            onSelect={(date) => {
              const day = keyFromDate(date)
              if (day) pick(day)
            }}
          />
        </PopoverContent>
      </Popover>
    </KeepClicks>
  )
}
