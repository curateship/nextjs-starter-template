import * as React from "react"
import { getRouteApi, useRouter } from "@tanstack/react-router"
import { Loader2Icon } from "lucide-react"
import { toast } from "sonner"

import { DueDayPicker } from "@/components/project/due-day-picker"
import { NOBODY, type NewTaskStart } from "@/components/project/new-task-dialog"
import { DayOffNote, PersonAvatar, ProjectDot, StatusDot } from "@/components/project/task-bits"
import { NoteEditor } from "@/components/project/notes/note-editor"
import { useNotesBoxSetup } from "@/components/project/notes/note-setup"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { createProjectTask, type NewTaskProject } from "@/lib/api/project/tasks"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { dayOffNote } from "@/lib/project/days-off"
import { getProjectErrorMessage } from "@/lib/project/errors"
import { moveNewTasks } from "@/lib/project/new-task-status"
import { linesToTitles } from "@/lib/project/paste-lines"
import { emptyWrittenPageBody } from "@/lib/pages/written-page-body"
import type { NoteNode } from "@/lib/project/note-blocks"
import {
  LIMITS,
  TASK_PRIORITIES,
  TASK_PRIORITY_LABEL,
  TASK_STATUSES,
  TASK_STATUS_LABEL,
  type TaskPriority,
  type TaskStatus,
} from "@/lib/project/rules"
import { useDaysOff } from "@/lib/project/use-days-off"
import { showErrorToast } from "@/lib/toast/error-toast"

const authenticatedRoute = getRouteApi("/_authenticated")
const NO_MILESTONE = "none"
/** The Description before anything is typed. */
const NO_DESCRIPTION = emptyWrittenPageBody()

/**
 * New task as a dropdown under its button, as Tyler asked on 14 Oct 2026:
 * a title, who it is for and a due date, then its status and priority
 * (Tyler, 19 Oct 2026), and no "More options". Enter in the title makes it.
 * The full New task window opens with what was typed only when several lines
 * are pasted.
 *
 * From a Board column's "+" the task goes into that column
 * (Stuck asks why) and, on a person's row, to that person; from a List
 * heading's "+" it starts in that heading's group. Clicking away keeps the
 * title typed for the next opening; the rest starts again from the opener.
 */
export function QuickNewTask({
  projects,
  initialProjectId,
  status = "todo",
  assignee: startingAssignee,
  priority: startingPriority = "normal",
  due: startingDue = null,
  milestones,
  open,
  onOpenChange,
  onMoreOptions,
  onCreated,
  align = "end",
  tooltip,
  children,
}: {
  projects: NewTaskProject[]
  initialProjectId: string
  /** The Board column or List heading it was opened from; the Status field starts on it. */
  status?: TaskStatus
  priority?: TaskPriority
  due?: string | null
  /** The project's milestones (Tyler, 19 Oct 2026); left out or none, there is no Milestone field. */
  milestones?: { id: string; name: string }[]
  /** The person's row it was opened from: a member's id or `NOBODY`. Left out, it is me when I'm on the project. */
  assignee?: string
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Opens the full window with the project and what was typed. */
  onMoreOptions: (projectId: string, start: NewTaskStart) => void
  onCreated?: (projectId: string, taskId: string) => void
  align?: "start" | "end"
  /** The hover hint for an icon-only button. */
  tooltip?: string
  /** The button that opens it. */
  children: React.ReactNode
}) {
  const router = useRouter()
  const me = authenticatedRoute.useLoaderData().user
  const [projectId, setProjectId] = React.useState(initialProjectId)
  const project = projects.find((p) => p.id === projectId) ?? projects[0]
  const personFor = React.useCallback(
    (target: NewTaskProject | undefined) =>
      startingAssignee ?? (target?.members.some((m) => m.userId === me.id) ? me.id : NOBODY),
    [startingAssignee, me.id]
  )
  const [title, setTitle] = React.useState("")
  const [person, setPerson] = React.useState(() => personFor(project))
  const [due, setDue] = React.useState<string | null>(startingDue)
  // A due date on the person's day off or a team holiday says so (Seven features, part 1).
  const daysOff = useDaysOff(open)
  const assigneeName = project?.members.find((member) => member.userId === person)?.name
  const dueNote = dayOffNote(daysOff, due, assigneeName ? { id: person, name: assigneeName } : null)
  const [chosenStatus, setChosenStatus] = React.useState<TaskStatus>(status)
  const [priority, setPriority] = React.useState<TaskPriority>(startingPriority)
  const [milestoneId, setMilestoneId] = React.useState<string | null>(null)
  // What was typed in Description; null while nothing is.
  const [written, setWritten] = React.useState<NoteNode | null>(null)
  const [stuckReason, setStuckReason] = React.useState("")
  const [invalid, setInvalid] = React.useState<"title" | "reason" | null>(null)
  const [run, saving] = useAsyncAction(getProjectErrorMessage)

  // Each opening starts on the project the caller chose, keeping any title typed before.
  const [wasOpen, setWasOpen] = React.useState(false)
  if (wasOpen !== open) {
    setWasOpen(open)
    if (open) {
      setChosenStatus(status)
      setPriority(startingPriority)
      setDue(startingDue)
    }
    if (open && initialProjectId !== projectId && projects.some((p) => p.id === initialProjectId)) {
      setProjectId(initialProjectId)
      setPerson(personFor(projects.find((p) => p.id === initialProjectId)))
    }
  }

  const description = written ?? NO_DESCRIPTION
  // No task yet, so no File block or Video or Promo card (Tyler, 5 Nov 2026: "Leave File out there").
  const noteSetup = useNotesBoxSetup("new")

  function pickProject(id: string) {
    setProjectId(id)
    const next = projects.find((p) => p.id === id)
    if (person !== NOBODY && !next?.members.some((m) => m.userId === person)) setPerson(personFor(next))
  }

  function reset() {
    setTitle("")
    setWritten(null)
    setDue(startingDue)
    setChosenStatus(status)
    setPriority(startingPriority)
    setMilestoneId(null)
    setStuckReason("")
    setInvalid(null)
    setPerson(personFor(project))
  }

  function moreOptions(lines: string[]) {
    if (!project) return
    onMoreOptions(project.id, {
      title,
      lines,
      notes: written ?? undefined,
      assignee: person,
      due,
      status: chosenStatus,
      stuckReason,
      priority,
      milestoneId,
    })
    reset()
    onOpenChange(false)
  }

  function onPasteTitle(event: React.ClipboardEvent<HTMLInputElement>) {
    const lines = linesToTitles(event.clipboardData.getData("text"))
    if (lines.length < 2) return
    event.preventDefault()
    if (lines.length > LIMITS.tasksPerPaste) {
      showErrorToast(`That's ${lines.length} lines. Paste at most ${LIMITS.tasksPerPaste} at once, one task per line.`)
      return
    }
    moreOptions(lines)
  }

  async function create() {
    if (!project) return
    if (!title.trim()) {
      setInvalid("title")
      showErrorToast("Give the task a title.")
      return
    }
    if (chosenStatus === "stuck" && !stuckReason.trim()) {
      setInvalid("reason")
      showErrorToast("Say why it's stuck, so whoever handed it out knows.")
      document.getElementById("quick-task-stuck-reason")?.focus()
      return
    }
    const assigneeUserId = person === NOBODY ? null : person
    const name = project.members.find((m) => m.userId === assigneeUserId)?.name
    let madeId = ""
    const ok = await run(async () => {
      madeId = (
        await createProjectTask({
          projectId: project.id,
          title,
          notes: description,
          assigneeUserId,
          dueDate: due,
          handoverNote: null,
          priority,
          milestoneId,
        })
      ).id
    })
    if (!ok) return
    await moveNewTasks([madeId], chosenStatus, stuckReason.trim())
    toast.success(assigneeUserId && assigneeUserId !== me.id && name ? `Task handed to ${name}.` : "Task created.")
    onCreated?.(project.id, madeId)
    reset()
    onOpenChange(false)
    await router.invalidate()
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      {tooltip ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>{children}</PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent>{tooltip}</TooltipContent>
        </Tooltip>
      ) : (
        <PopoverTrigger asChild>{children}</PopoverTrigger>
      )}
      <PopoverContent align={align} className="w-80 p-3">
        <form
          className="grid gap-4"
          aria-label="New task"
          onSubmit={(event) => {
            event.preventDefault()
            void create()
          }}
        >
          {projects.length > 1 ? (
            <div className="grid gap-2">
              <Label htmlFor="quick-task-project">Project</Label>
              <Select value={project?.id} onValueChange={pickProject}>
                <SelectTrigger id="quick-task-project" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      <ProjectDot color={option.color} />
                      {option.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          <div className="grid gap-2">
            <Label htmlFor="quick-task-title">
              Title
            </Label>
            <Input
              id="quick-task-title"
              autoFocus
              value={title}
              maxLength={LIMITS.taskTitle}
              aria-invalid={invalid === "title" || undefined}
              placeholder="What needs doing?"
              onPaste={onPasteTitle}
              onChange={(event) => {
                setTitle(event.target.value)
                setInvalid(null)
              }}
            />
          </div>
          {/* Under the title, as Tyler marked it on 22 Oct 2026. It saves as the task's notes. */}
          <div className="grid gap-2" role="group" aria-labelledby="quick-task-description-label">
            <Label id="quick-task-description-label" asChild>
              <span>Description</span>
            </Label>
            {/* "!" because the editor's own style tag (260px tall, large text) beats plain utilities. */}
            <div className="[&_.page-rte_.tiptap]:min-h-16! [&_.page-rte_.tiptap]:px-3! [&_.page-rte_.tiptap]:py-2! [&_.page-rte_.tiptap]:text-sm!">
              <NoteEditor
                setup={noteSetup}
                value={description}
                disabled={saving}
                onChange={(body) => setWritten(JSON.stringify(body) === JSON.stringify(NO_DESCRIPTION) ? null : body)}
                placeholder="What it's about. Type / for a picture, a checklist and more."
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="grid min-w-0 gap-2">
              <Label htmlFor="quick-task-person">Assigned to</Label>
              <Select value={person} onValueChange={setPerson}>
                {/* Shrinks to its half and cuts a long name with "…" rather than pushing into Due date. */}
                <SelectTrigger
                  id="quick-task-person"
                  className="w-full min-w-0 *:data-[slot=select-value]:min-w-0"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NOBODY}>Nobody</SelectItem>
                  {(project?.members ?? []).map((member) => (
                    <SelectItem key={member.userId} value={member.userId}>
                      <PersonAvatar name={member.name} avatarUrl={member.avatarUrl} />
                      <span className="truncate">{member.userId === me.id ? `${member.name} (you)` : member.name}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid min-w-0 gap-2">
              <Label htmlFor="quick-task-due">Due date</Label>
              <DueDayPicker id="quick-task-due" value={due} onChange={setDue} placeholder="No date" clearLabel="Clear the due date" />
            </div>
          </div>
          <DayOffNote note={dueNote} />
          <div className="grid grid-cols-2 gap-2">
            <div className="grid min-w-0 gap-2">
              <Label htmlFor="quick-task-status">Status</Label>
              <Select value={chosenStatus} onValueChange={(value) => setChosenStatus(value as TaskStatus)}>
                <SelectTrigger id="quick-task-status" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TASK_STATUSES.map((option) => (
                    <SelectItem key={option} value={option}>
                      <StatusDot status={option} />
                      {TASK_STATUS_LABEL[option]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid min-w-0 gap-2">
              <Label htmlFor="quick-task-priority">Priority</Label>
              <Select value={priority} onValueChange={(value) => setPriority(value as TaskPriority)}>
                <SelectTrigger id="quick-task-priority" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TASK_PRIORITIES.map((option) => (
                    <SelectItem key={option} value={option}>
                      {TASK_PRIORITY_LABEL[option]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {milestones?.length ? (
            <div className="grid gap-2">
              <Label htmlFor="quick-task-milestone">Milestone</Label>
              <Select value={milestoneId ?? NO_MILESTONE} onValueChange={(value) => setMilestoneId(value === NO_MILESTONE ? null : value)}>
                <SelectTrigger id="quick-task-milestone" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_MILESTONE}>No milestone</SelectItem>
                  {milestones.map((milestone) => (
                    <SelectItem key={milestone.id} value={milestone.id}>
                      {milestone.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          {chosenStatus === "stuck" ? (
            <div className="grid gap-2">
              <Label htmlFor="quick-task-stuck-reason">Why is it stuck?</Label>
              <Input
                id="quick-task-stuck-reason"
                value={stuckReason}
                maxLength={LIMITS.reason}
                aria-invalid={invalid === "reason" || undefined}
                onChange={(event) => {
                  setStuckReason(event.target.value)
                  setInvalid(null)
                }}
              />
            </div>
          ) : null}
          {/* No "More options": everything is here (Tyler, 19 Oct 2026: "we dont need the 'more
              option' to open up a modal"). The window still opens on its own for a pasted list. */}
          <div className="flex items-center justify-end gap-2">
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2Icon className="size-4 animate-spin" /> : null}
              Create task
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  )
}
