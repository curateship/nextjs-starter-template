import * as React from "react"
import { getRouteApi, useRouter } from "@tanstack/react-router"
import { Loader2Icon } from "lucide-react"
import { toast } from "sonner"

import { DueDayPicker } from "@/components/project/due-day-picker"
import { NOBODY, type NewTaskStart } from "@/components/project/new-task-dialog"
import { PersonAvatar, ProjectDot } from "@/components/project/task-bits"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { createProjectTask, type NewTaskProject } from "@/lib/api/project/tasks"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { getProjectErrorMessage } from "@/lib/project/errors"
import { moveNewTasks } from "@/lib/project/new-task-status"
import { linesToTitles } from "@/lib/project/paste-lines"
import { LIMITS, TASK_STATUS_LABEL, type TaskStatus } from "@/lib/project/rules"
import type { TaskType } from "@/lib/project/task-types"
import { showErrorToast } from "@/lib/toast/error-toast"

const authenticatedRoute = getRouteApi("/_authenticated")

/**
 * New task as a dropdown under its button, as Tyler asked on 14 Oct 2026:
 * a title, who it is for and a due date. Enter makes it. "More options"
 * opens the full New task window with what was typed, and so does a type
 * that needs fields filled in when it is made, or pasting several lines.
 *
 * It starts on the project's own type, with that type's steps and notes, as
 * the window does. From a Board column's "+" the task goes into that column
 * (Stuck asks why) and, on a person's row, to that person. Clicking away
 * keeps what was typed for the next opening.
 */
export function QuickNewTask({
  projects,
  types,
  initialProjectId,
  status = "todo",
  assignee: startingAssignee,
  open,
  onOpenChange,
  onMoreOptions,
  onCreated,
  align = "end",
  tooltip,
  children,
}: {
  projects: NewTaskProject[]
  types: TaskType[]
  initialProjectId: string
  /** The Board column it was opened from. */
  status?: TaskStatus
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
  const [due, setDue] = React.useState<string | null>(null)
  const [stuckReason, setStuckReason] = React.useState("")
  const [invalid, setInvalid] = React.useState<"title" | "reason" | null>(null)
  const [run, saving] = useAsyncAction(getProjectErrorMessage)

  // Each opening starts on the project the caller chose, keeping any title typed before.
  const [wasOpen, setWasOpen] = React.useState(false)
  if (wasOpen !== open) {
    setWasOpen(open)
    if (open && initialProjectId !== projectId && projects.some((p) => p.id === initialProjectId)) {
      setProjectId(initialProjectId)
      setPerson(personFor(projects.find((p) => p.id === initialProjectId)))
    }
  }

  const typeId =
    project?.defaultTypeId && project.typeIds.includes(project.defaultTypeId) ? project.defaultTypeId : null
  const type = types.find((t) => t.id === typeId)
  // A type that asks for fields when the task is made needs the full window.
  const needsWindow = Boolean(type?.fields.some((field) => field.neededWhenMade && field.kind !== "file"))

  function pickProject(id: string) {
    setProjectId(id)
    const next = projects.find((p) => p.id === id)
    if (person !== NOBODY && !next?.members.some((m) => m.userId === person)) setPerson(personFor(next))
  }

  function reset() {
    setTitle("")
    setDue(null)
    setStuckReason("")
    setInvalid(null)
    setPerson(personFor(project))
  }

  function moreOptions(lines: string[] | null = null) {
    if (!project) return
    onMoreOptions(project.id, { title, lines, assignee: person, due, status, stuckReason })
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
    if (status === "stuck" && !stuckReason.trim()) {
      setInvalid("reason")
      showErrorToast("Say why it's stuck, so whoever handed it out knows.")
      document.getElementById("quick-task-stuck-reason")?.focus()
      return
    }
    if (needsWindow) {
      moreOptions()
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
          notes: type?.notes ?? "",
          assigneeUserId,
          dueDate: due,
          steps: type?.steps ?? [],
          handoverNote: null,
          typeId,
          fieldValues: {},
        })
      ).id
    })
    if (!ok) return
    await moveNewTasks([madeId], status, stuckReason.trim())
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
          aria-label={status === "todo" ? "New task" : `New task in ${TASK_STATUS_LABEL[status]}`}
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
              {status === "todo" ? "Title" : `Title, in ${TASK_STATUS_LABEL[status]}`}
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
          <div className="grid grid-cols-2 gap-2">
            <div className="grid min-w-0 gap-2">
              <Label htmlFor="quick-task-person">Assigned to</Label>
              <Select value={person} onValueChange={setPerson}>
                <SelectTrigger id="quick-task-person" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NOBODY}>Nobody</SelectItem>
                  {(project?.members ?? []).map((member) => (
                    <SelectItem key={member.userId} value={member.userId}>
                      <PersonAvatar name={member.name} avatarUrl={member.avatarUrl} />
                      {member.userId === me.id ? `${member.name} (you)` : member.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid min-w-0 gap-2">
              <Label htmlFor="quick-task-due">Due date</Label>
              <DueDayPicker id="quick-task-due" value={due} onChange={setDue} placeholder="No date" className="w-full" />
            </div>
          </div>
          {status === "stuck" ? (
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
          {needsWindow && type ? (
            <p className="text-xs text-muted-foreground">
              {type.name} asks for more when it's made, so the full window opens next.
            </p>
          ) : null}
          <div className="flex items-center justify-between gap-2">
            <Button type="button" variant="ghost" onClick={() => moreOptions()}>
              More options
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2Icon className="size-4 animate-spin" /> : null}
              {needsWindow ? "Continue" : "Create task"}
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  )
}
