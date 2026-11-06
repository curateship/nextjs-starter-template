import * as React from "react"
import { getRouteApi, useRouter } from "@tanstack/react-router"
import { Loader2Icon } from "lucide-react"

import { DayOffNote, PersonAvatar, ProjectDot, RoomNote, StatusDot } from "@/components/project/task-bits"
import { DueDayPicker } from "@/components/project/due-day-picker"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { FormDialog } from "@/components/ui/form-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { NoteEditor } from "@/components/project/notes/note-editor"
import { useNotesBoxSetup } from "@/components/project/notes/note-setup"
import {
  createProjectTask,
  createTasksFromLines,
  type NewTaskProject,
} from "@/lib/api/project/tasks"
import { emptyWrittenPageBody } from "@/lib/pages/written-page-body"
import { noteIsEmpty, type NoteNode } from "@/lib/project/note-blocks"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { dayOffNote } from "@/lib/project/days-off"
import { getProjectErrorMessage } from "@/lib/project/errors"
import { moveNewTasks } from "@/lib/project/new-task-status"
import {
  LIMITS,
  TASK_PRIORITIES,
  TASK_PRIORITY_LABEL,
  TASK_STATUSES,
  TASK_STATUS_LABEL,
  type TaskPriority,
  type TaskStatus,
} from "@/lib/project/rules"
import { linesToTitles } from "@/lib/project/paste-lines"
import { useDaysOff } from "@/lib/project/use-days-off"
import { usePeopleRoom } from "@/lib/project/use-people-room"
import { showErrorToast } from "@/lib/toast/error-toast"

const NO_MILESTONE = "none"
const authenticatedRoute = getRouteApi("/_authenticated")
export const NOBODY = "nobody"

/**
 * What the New task dropdown (`quick-new-task.tsx`) already holds when
 * "More options" opens this window: the title or pasted lines, the person,
 * the due date, and the Board column it was started from.
 */
export type NewTaskStart = {
  title: string
  lines: string[] | null
  /** The Description written in the dropdown; left out, the notes start empty. */
  notes?: NoteNode
  /** A member's id, or `NOBODY`. */
  assignee: string
  due: string | null
  status: TaskStatus
  stuckReason: string
  priority: TaskPriority
  milestoneId: string | null
}

/**
 * A new task. It starts assigned to its maker when they are on the project.
 * Handing it to someone else leaves it Waiting until they accept, and tells
 * them in the bell.
 *
 * From a project page it makes the task there. From the header's New task
 * (`projects` holds more than one) it asks which project, with the one last
 * used chosen first. Pasting several lines into the title offers to make one
 * task per line.
 *
 * Its Status and Priority are set here as in the New task dropdown (Tyler,
 * 19 Oct 2026); Stuck asks for its reason.
 */
export function NewTaskDialog({
  projects,
  initialProjectId,
  initialTitle = "",
  start,
  milestones,
  open,
  onClose,
  onCreated,
}: {
  projects: NewTaskProject[]
  initialProjectId: string
  /** The title the window opens with, such as a line of a meeting's notes. */
  initialTitle?: string
  /** What the New task dropdown held, for "More options". */
  start?: NewTaskStart
  /** The project's milestones; left out or none, there is no Milestone field. */
  milestones?: { id: string; name: string }[]
  open: boolean
  onClose: () => void
  /**
   * Told which project the task went into, so the header can remember it, and
   * the new task's id. A pasted list makes several, so it has none.
   */
  onCreated?: (projectId: string, taskId: string | null) => void
}) {
  const router = useRouter()
  const me = authenticatedRoute.useLoaderData().user
  const [projectId, setProjectId] = React.useState(initialProjectId)
  const project = projects.find((p) => p.id === projectId) ?? projects[0]
  const startingAssignee = (target: NewTaskProject | undefined) =>
    target?.members.some((m) => m.userId === me.id) ? me.id : NOBODY

  const [title, setTitle] = React.useState("")
  const [pasted, setPasted] = React.useState<string[] | null>(null)
  const [notes, setNotes] = React.useState<NoteNode>(emptyWrittenPageBody)
  const [assignee, setAssignee] = React.useState(() => startingAssignee(project))
  const [handoverNote, setHandoverNote] = React.useState("")
  const room = usePeopleRoom(open)
  const [due, setDue] = React.useState<string | null>(null)
  // A due date on the person's day off or a team holiday says so (Seven features, part 1).
  const daysOff = useDaysOff(open)
  const assigneeName = project?.members.find((member) => member.userId === assignee)?.name
  const dueNote = dayOffNote(daysOff, due, assigneeName ? { id: assignee, name: assigneeName } : null)
  const [invalid, setInvalid] = React.useState(false)
  const [status, setStatusChoice] = React.useState<TaskStatus>("todo")
  const [priority, setPriority] = React.useState<TaskPriority>("normal")
  const [milestoneId, setMilestoneId] = React.useState<string | null>(null)
  const [stuckReason, setStuckReason] = React.useState("")
  const [stuckInvalid, setStuckInvalid] = React.useState(false)
  const [notesKey, setNotesKey] = React.useState(0)
  // No task yet, so no File block or Video or Promo card (Tyler, 5 Nov 2026: "Leave File out there").
  const noteSetup = useNotesBoxSetup("new")
  const [run, saving] = useAsyncAction(getProjectErrorMessage)
  const dirty = Boolean(
    title.trim() || pasted || !noteIsEmpty(notes) || due || handoverNote.trim() || stuckReason.trim()
  )

  // Opening again starts on the project the caller chose. False at first, so
  // a window that mounts open still starts its notes afresh.
  const [wasOpen, setWasOpen] = React.useState(false)
  if (wasOpen !== open) {
    setWasOpen(open)
    const target = projects.find((p) => p.id === initialProjectId) ?? projects[0]
    if (open && initialProjectId !== projectId) {
      setProjectId(initialProjectId)
      setAssignee(startingAssignee(target))
    }
    // Each opening starts on the dropdown's notes, or none.
    if (open) {
      setNotes(start?.notes ?? emptyWrittenPageBody())
      setNotesKey((key) => key + 1)
      setTitle((start?.title ?? initialTitle).slice(0, LIMITS.taskTitle))
      if (start) {
        setPasted(start.lines)
        setAssignee(
          start.assignee === NOBODY || target?.members.some((m) => m.userId === start.assignee)
            ? start.assignee
            : startingAssignee(target)
        )
        setDue(start.due)
        setStatusChoice(start.status)
        setStuckReason(start.stuckReason)
        setPriority(start.priority)
        setMilestoneId(start.milestoneId)
      }
    }
  }

  function pickProject(id: string) {
    setProjectId(id)
    const next = projects.find((p) => p.id === id)
    // Someone who isn't on the new project can't be handed the task there.
    if (assignee !== NOBODY && !next?.members.some((m) => m.userId === assignee)) {
      setAssignee(startingAssignee(next))
    }
  }

  function reset() {
    setTitle("")
    setPasted(null)
    setNotes(emptyWrittenPageBody())
    setAssignee(startingAssignee(project))
    setHandoverNote("")
    setDue(null)
    setInvalid(false)
    setStatusChoice("todo")
    setPriority("normal")
    setMilestoneId(null)
    setStuckReason("")
    setStuckInvalid(false)
  }

  function close() {
    reset()
    onClose()
  }

  function onPasteTitle(event: React.ClipboardEvent<HTMLInputElement>) {
    const titles = linesToTitles(event.clipboardData.getData("text"))
    if (titles.length < 2) return
    event.preventDefault()
    if (titles.length > LIMITS.tasksPerPaste) {
      showErrorToast(
        `That's ${titles.length} lines. Paste at most ${LIMITS.tasksPerPaste} at once, one task per line.`
      )
      return
    }
    setPasted(titles)
  }

  async function create() {
    if (!project) return
    const assigneeUserId = assignee === NOBODY ? null : assignee
    const someoneElse = assigneeUserId && assigneeUserId !== me.id
    const name = project.members.find((m) => m.userId === assigneeUserId)?.name
    // The note only goes with a task handed to someone else.
    const note = someoneElse ? handoverNote.trim() || null : null
    // Checked first, so a refused Stuck never leaves a task made twice.
    if (status === "stuck" && !stuckReason.trim()) {
      setStuckInvalid(true)
      showErrorToast("Say why it's stuck, so whoever handed it out knows.")
      document.getElementById("new-task-stuck-reason")?.focus()
      return
    }
    let madeId: string | null = null
    let madeIds: string[] = []
    if (pasted) {
      const ok = await run(
        async () => {
          madeIds = (await createTasksFromLines({
            projectId: project.id,
            titles: pasted,
            assigneeUserId,
            dueDate: due,
            handoverNote: note,
          })).ids
        },
        `${pasted.length} tasks made${someoneElse && name ? ` and handed to ${name}` : ""}.`
      )
      if (!ok) return
    } else {
      if (!title.trim()) {
        setInvalid(true)
        showErrorToast("Give the task a title.")
        return
      }
      const ok = await run(
        async () => {
          const made = await createProjectTask({
            projectId: project.id,
            title,
            notes,
            assigneeUserId,
            dueDate: due,
            handoverNote: note,
            priority,
            milestoneId,
          })
          madeId = made.id
          madeIds = [made.id]
        },
        someoneElse && name ? `Task handed to ${name}.` : "Task created."
      )
      if (!ok) return
    }
    await moveNewTasks(madeIds, status, stuckReason.trim())
    onCreated?.(project.id, madeId)
    close()
    await router.invalidate()
  }

  return (
    <FormDialog open={open} dirty={dirty} busy={saving} onClose={close}>
      {(requestClose) => (
        <DialogContent variant="admin" className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New task</DialogTitle>
            <DialogDescription>
              {projects.length > 1
                ? "A task handed to someone else waits for them to accept it."
                : `In ${project?.name ?? "this project"}${status === "todo" ? "" : `, in ${TASK_STATUS_LABEL[status]}`}. A task handed to someone else waits for them to accept it.`}
            </DialogDescription>
          </DialogHeader>
          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(event) => {
              event.preventDefault()
              void create()
            }}
          >
            <DialogBody>
              <Card size="sm">
                <CardHeader>
                  <CardTitle>Task</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4">
                  {projects.length > 1 ? (
                    <div className="grid gap-2">
                      <Label htmlFor="new-task-project">Project</Label>
                      <Select value={project?.id} onValueChange={pickProject}>
                        <SelectTrigger id="new-task-project" className="w-full sm:w-fit">
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
                  {pasted ? (
                    <PastedLines
                      titles={pasted}
                      onKeepOne={() => {
                        setTitle(pasted.join(" ").slice(0, LIMITS.taskTitle))
                        setPasted(null)
                      }}
                    />
                  ) : (
                    <div className="grid gap-2">
                      <Label htmlFor="new-task-title">Title</Label>
                      <Input
                        id="new-task-title"
                        value={title}
                        maxLength={LIMITS.taskTitle}
                        aria-invalid={invalid || undefined}
                        onPaste={onPasteTitle}
                        onChange={(event) => {
                          setTitle(event.target.value)
                          setInvalid(false)
                        }}
                      />
                    </div>
                  )}
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="grid gap-2">
                      <Label htmlFor="new-task-assignee">Assigned to</Label>
                      <Select value={assignee} onValueChange={setAssignee}>
                        <SelectTrigger
                          id="new-task-assignee"
                          className="w-full min-w-0 sm:w-fit sm:max-w-full *:data-[slot=select-value]:min-w-0"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NOBODY}>Nobody</SelectItem>
                          {(project?.members ?? []).map((member) => (
                            <SelectItem key={member.userId} value={member.userId}>
                              <PersonAvatar name={member.name} avatarUrl={member.avatarUrl} />
                              <span className="truncate">{member.userId === me.id ? `${member.name} (you)` : member.name}</span>
                              <RoomNote room={room[member.userId]} />
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="new-task-due">Due date</Label>
                      <DueDayPicker id="new-task-due" value={due} onChange={setDue} placeholder="No due date" clearLabel="Clear the due date" />
                    </div>
                  </div>
                  <DayOffNote note={dueNote} />
                  {assignee !== NOBODY && assignee !== me.id ? (
                    <div className="grid gap-2">
                      <Label htmlFor="new-task-handover-note">
                        Note for {project?.members.find((m) => m.userId === assignee)?.name ?? "them"} (optional)
                      </Label>
                      <Input
                        id="new-task-handover-note"
                        value={handoverNote}
                        maxLength={LIMITS.handoverNote}
                        placeholder={
                          pasted
                            ? `Goes with all ${pasted.length} tasks`
                            : "Client wants it by Thursday"
                        }
                        onChange={(event) => setHandoverNote(event.target.value)}
                      />
                    </div>
                  ) : null}
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="grid gap-2">
                      <Label htmlFor="new-task-status">Status</Label>
                      <Select value={status} onValueChange={(value) => setStatusChoice(value as TaskStatus)}>
                        <SelectTrigger id="new-task-status" className="w-full sm:w-fit">
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
                    <div className="grid gap-2">
                      <Label htmlFor="new-task-priority">Priority</Label>
                      <Select value={priority} onValueChange={(value) => setPriority(value as TaskPriority)}>
                        <SelectTrigger id="new-task-priority" className="w-full sm:w-fit">
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
{milestones?.length && !pasted ? (
            <div className="grid gap-2">
              <Label htmlFor="new-task-milestone">Milestone</Label>
              <Select value={milestoneId ?? NO_MILESTONE} onValueChange={(value) => setMilestoneId(value === NO_MILESTONE ? null : value)}>
                <SelectTrigger id="new-task-milestone" className="w-full">
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
                  {status === "stuck" ? (
                    <div className="grid gap-2">
                      <Label htmlFor="new-task-stuck-reason">Why is it stuck?</Label>
                      <Input
                        id="new-task-stuck-reason"
                        value={stuckReason}
                        maxLength={LIMITS.reason}
                        aria-invalid={stuckInvalid || undefined}
                        onChange={(event) => {
                          setStuckReason(event.target.value)
                          setStuckInvalid(false)
                        }}
                      />
                    </div>
                  ) : null}
                  {pasted ? null : (
                    <div className="grid gap-2" role="group" aria-labelledby="new-task-notes-label">
                      <Label id="new-task-notes-label" asChild>
                        <span>Notes</span>
                      </Label>
                      <div className="[&_.page-rte_.tiptap]:min-h-20 [&_.page-rte_.tiptap]:px-3 [&_.page-rte_.tiptap]:py-2 [&_.page-rte_.tiptap]:text-sm">
                        <NoteEditor
                          key={notesKey}
                          setup={noteSetup}
                          value={notes}
                          onChange={setNotes}
                          placeholder="Anything the person doing it should know. Type / for a picture, a checklist and more."
                        />
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={requestClose} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? <Loader2Icon className="size-4 animate-spin" /> : null}
                {pasted ? `Make ${pasted.length} tasks` : "Create task"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      )}
    </FormDialog>
  )
}

/** The pasted lines, one task each, with a way back to a single title. */
function PastedLines({ titles, onKeepOne }: { titles: string[]; onKeepOne: () => void }) {
  return (
    <div className="grid gap-2">
      <p className="text-sm font-medium">Make {titles.length} tasks, one per line?</p>
      <ol className="grid max-h-48 list-decimal gap-1 overflow-hidden pl-5 text-sm">
        {titles.slice(0, 8).map((title, index) => (
          <li key={`${index}-${title}`} className="break-words">
            {title}
          </li>
        ))}
      </ol>
      {titles.length > 8 ? (
        <p className="text-sm text-muted-foreground">and {titles.length - 8} more.</p>
      ) : null}
      <p className="text-sm text-muted-foreground">
        Each gets the person and due date picked below. Blank lines and bullet marks were left out.
      </p>
      <div>
        <Button type="button" variant="outline" size="sm" onClick={onKeepOne}>
          No, make one task
        </Button>
      </div>
    </div>
  )
}
