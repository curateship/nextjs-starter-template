import * as React from "react"
import { useRouter } from "@tanstack/react-router"
import { CheckIcon, ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react"

import { RainbowEdge } from "@/components/project/rainbow-edge"
import { ReasonDialog } from "@/components/project/reason-dialog"
import { ProjectDot, RoomNote } from "@/components/project/task-bits"
import {
  DashboardToolbarButton,
  DashboardToolbarSelectTrigger,
} from "@/components/shared/dashboard-toolbar"
import { DueDayPicker } from "@/components/project/due-day-picker"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectValue } from "@/components/ui/select"
import { changeTasks, type BulkChange } from "@/lib/api/project/tasks"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { keyFromDate } from "@/lib/project/dates"
import { dayLabel, longDayLabel } from "@/lib/project/days"
import { getProjectErrorMessage } from "@/lib/project/errors"
import {
  LIMITS,
  TASK_STATUSES,
  TASK_STATUS_LABEL,
  type ProjectColor,
  type TaskStatus,
} from "@/lib/project/rules"
import { usePeopleRoom } from "@/lib/project/use-people-room"
import { useQuickDays } from "@/lib/project/use-quick-days"
import { reportBulkOutcome } from "@/lib/project/bulk-outcome"
import { cn } from "@/lib/utils"

const NOBODY = "nobody"
const NO_DATE = "none"

export type BulkTargets = {
  people: { id: string; name: string; avatarUrl?: string }[]
  projects: { id: string; name: string; color: ProjectColor }[]
}

/**
 * The changes both the bar and the menu make. Each task is changed on its own
 * on the server, so one that can't change is refused alone and the result names
 * it with the reason. Hand to asks for one optional note, which goes with every
 * ticked task; Stuck asks for one reason for all of them.
 */
function useBulkActions(taskIds: string[], onDone: () => void) {
  const router = useRouter()
  const [run, busy] = useAsyncAction(getProjectErrorMessage)
  const [askingStuck, setAskingStuck] = React.useState(false)
  const [handingTo, setHandingTo] = React.useState<{ id: string; name: string } | null>(null)
  // The bar's pickers are actions, not settings, so each goes back to its label.
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

  const dialogs = (
    <>
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

  return { apply, busy, reset, askStuck: () => setAskingStuck(true), handTo: setHandingTo, dialogs }
}

/**
 * Status, Hand to, Due date and Move to project as a row of pickers for the
 * ticked rows of My tasks (which has no Move to project), beside Mark Done.
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
  const { apply, busy, reset, askStuck, handTo, dialogs } = useBulkActions(taskIds, onDone)
  const room = usePeopleRoom()

  return (
    <>
      <Select
        key={`status-${reset}`}
        disabled={busy}
        onValueChange={(value) => {
          if (value === "stuck") askStuck()
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
          if (person) handTo(person)
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
      {dialogs}
    </>
  )
}

type MenuPage = "main" | "status" | "hand" | "due" | "move"

/**
 * The project List's ticked rows as one "3 selected" button in the header,
 * beside All time (Tyler, 19 Oct 2026). Its dropdown holds Mark Done, then
 * Status, Hand to, Due date and Move to project, each stepping into its own
 * list with a back arrow, then Clear selection.
 */
export function TaskBulkMenu({
  taskIds,
  targets,
  onDone,
}: {
  taskIds: string[]
  targets: BulkTargets
  /** Clears the ticks: after a change, and from Clear selection. */
  onDone: () => void
}) {
  const { apply, busy, askStuck, handTo, dialogs } = useBulkActions(taskIds, onDone)
  const room = usePeopleRoom()
  const [open, setOpen] = React.useState(false)
  const [page, setPage] = React.useState<MenuPage>("main")
  const quick = useQuickDays(open && page === "due")
  const content = React.useRef<HTMLDivElement>(null)
  const cameFrom = React.useRef<MenuPage>("main")

  // A page change takes away the row that had focus, so focus moves into the
  // new page: its back row, or on the way back the row it was opened from.
  React.useEffect(() => {
    const from = cameFrom.current
    cameFrom.current = page
    if (from === page) return
    const target =
      page === "main"
        ? content.current?.querySelector<HTMLElement>(`[data-page="${from}"]`)
        : content.current?.querySelector<HTMLElement>("button")
    target?.focus()
  }, [page])

  function openChange(next: boolean) {
    setOpen(next)
    if (!next) setPage("main")
  }
  function act(change: BulkChange, verb: string) {
    openChange(false)
    void apply(change, verb)
  }

  return (
    <>
      <Popover open={open} onOpenChange={openChange}>
        {/* A rainbow runs round the button so the eye finds it (Tyler, 19 Oct 2026). */}
        <RainbowEdge className="rounded-lg">
          <PopoverTrigger asChild>
            <DashboardToolbarButton
              type="button"
              variant="outline"
              disabled={busy}
              // Inset, so the ring isn't cut off by the rainbow's edge.
              className="relative border-transparent bg-background hover:bg-muted focus-visible:ring-inset dark:bg-background"
            >
              {taskIds.length} selected
              <ChevronDownIcon className="size-4 text-muted-foreground" />
            </DashboardToolbarButton>
          </PopoverTrigger>
        </RainbowEdge>
        <PopoverContent
          ref={content}
          align="end"
          className={cn("gap-0 p-1", page === "due" ? "w-auto" : "w-56")}
          onEscapeKeyDown={(event) => {
            // Escape on a list goes back one step; on the first page it closes.
            if (page === "main") return
            event.preventDefault()
            setPage("main")
          }}
        >
          {page === "main" ? (
            <>
              <MenuRow onClick={() => act({ kind: "status", status: "done", stuckReason: null }, "marked Done")}>
                <CheckIcon className="size-4 text-muted-foreground" />
                Mark Done
              </MenuRow>
              <MenuRow more page="status" onClick={() => setPage("status")}>
                Status
              </MenuRow>
              <MenuRow more page="hand" onClick={() => setPage("hand")}>
                Hand to
              </MenuRow>
              <MenuRow more page="due" onClick={() => setPage("due")}>
                Due date
              </MenuRow>
              {targets.projects.length ? (
                <MenuRow more page="move" onClick={() => setPage("move")}>
                  Move to project
                </MenuRow>
              ) : null}
              <div className="-mx-1 my-1 h-px bg-border" />
              <MenuRow
                onClick={() => {
                  openChange(false)
                  onDone()
                }}
              >
                Clear selection
              </MenuRow>
            </>
          ) : (
            <>
              <MenuRow onClick={() => setPage("main")} className="font-medium">
                <ChevronLeftIcon className="size-4 text-muted-foreground" />
                {MENU_TITLE[page]}
              </MenuRow>
              <div className="-mx-1 my-1 h-px bg-border" />
              {page === "status"
                ? TASK_STATUSES.map((status) => (
                    <MenuRow
                      key={status}
                      onClick={() => {
                        if (status === "stuck") {
                          openChange(false)
                          askStuck()
                        } else act({ kind: "status", status, stuckReason: null }, "changed")
                      }}
                    >
                      {TASK_STATUS_LABEL[status]}
                    </MenuRow>
                  ))
                : null}
              {page === "hand" ? (
                <ScrollArea className="max-h-72">
                  <MenuRow onClick={() => act({ kind: "assign", assigneeUserId: null, note: null }, "unassigned")}>
                    Nobody
                  </MenuRow>
                  {targets.people.map((person) => (
                    <MenuRow
                      key={person.id}
                      onClick={() => {
                        openChange(false)
                        handTo(person)
                      }}
                    >
                      {person.name}
                      <RoomNote room={room[person.id]} />
                    </MenuRow>
                  ))}
                </ScrollArea>
              ) : null}
              {page === "move" ? (
                <ScrollArea className="max-h-72">
                  {targets.projects.map((project) => (
                    <MenuRow key={project.id} onClick={() => act({ kind: "move", projectId: project.id }, "moved")}>
                      <ProjectDot color={project.color} />
                      {project.name}
                    </MenuRow>
                  ))}
                </ScrollArea>
              ) : null}
              {page === "due" ? (
                <>
                  <MenuRow onClick={() => act({ kind: "due", dueDate: null }, "changed")}>No due date</MenuRow>
                  {quick ? (
                    <div className="-mx-1 grid grid-cols-2 gap-1 border-y px-1 py-1">
                      {quick.map((option) => (
                        <Button
                          key={option.key}
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="justify-between gap-2 font-normal"
                          aria-label={`${option.label}, ${longDayLabel(option.day)}`}
                          onClick={() => act({ kind: "due", dueDate: option.day }, "changed")}
                        >
                          {option.label}
                          <span className="text-xs text-muted-foreground">{dayLabel(option.day)}</span>
                        </Button>
                      ))}
                    </div>
                  ) : null}
                  <Calendar
                    mode="single"
                    onSelect={(date) => {
                      const day = keyFromDate(date)
                      if (day) act({ kind: "due", dueDate: day }, "changed")
                    }}
                  />
                </>
              ) : null}
            </>
          )}
        </PopoverContent>
      </Popover>
      {dialogs}
    </>
  )
}

const MENU_TITLE: Record<Exclude<MenuPage, "main">, string> = {
  status: "Status",
  hand: "Hand to",
  due: "Due date",
  move: "Move to project",
}

/** One line of the menu, drawn like the shell's dropdown items. */
function MenuRow({
  more = false,
  page,
  className,
  children,
  onClick,
}: {
  /** Steps into a list of its own, so it ends in an arrow. */
  more?: boolean
  /** The list it opens, so focus can come back to it. */
  page?: MenuPage
  className?: string
  children: React.ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      data-page={page}
      onClick={onClick}
      className={cn(
        "flex w-full cursor-pointer items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-sm outline-hidden select-none hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground",
        className
      )}
    >
      {children}
      {more ? <ChevronRightIcon className="ml-auto size-4 text-muted-foreground" /> : null}
    </button>
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
