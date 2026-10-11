import * as React from "react"
import { getRouteApi, useRouter } from "@tanstack/react-router"
import { Loader2Icon, PlusIcon, Trash2Icon } from "lucide-react"

import { PersonAvatar, ProjectDot } from "@/components/project/task-bits"
import { keyFromDate } from "@/lib/project/dates"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { DatePicker } from "@/components/ui/date-picker"
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
import { DocumentEditor } from "@/components/shared/rich-text-editor"
import {
  createProjectTask,
  createTasksFromLines,
  type NewTaskProject,
} from "@/lib/api/project/tasks"
import {
  emptyWrittenPageBody,
  writtenPageBodyIsEmpty,
  type WrittenPageNode,
} from "@/lib/pages/written-page-body"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { getProjectErrorMessage } from "@/lib/project/errors"
import { LIMITS } from "@/lib/project/rules"
import { linesToTitles } from "@/lib/project/paste-lines"
import { showErrorToast } from "@/lib/toast/error-toast"

const authenticatedRoute = getRouteApi("/_authenticated")
const NOBODY = "nobody"

/**
 * A new task. It starts assigned to its maker when they are on the project.
 * Handing it to someone else leaves it Waiting until they accept, and tells
 * them in the bell.
 *
 * From a project page it makes the task there. From the header's New task
 * (`projects` holds more than one) it asks which project, with the one last
 * used chosen first. Pasting several lines into the title offers to make one
 * task per line.
 */
export function NewTaskDialog({
  projects,
  initialProjectId,
  open,
  onClose,
  onCreated,
}: {
  projects: NewTaskProject[]
  initialProjectId: string
  open: boolean
  onClose: () => void
  /** Told which project the task went into, so the header can remember it. */
  onCreated?: (projectId: string) => void
}) {
  const router = useRouter()
  const me = authenticatedRoute.useLoaderData().user
  const [projectId, setProjectId] = React.useState(initialProjectId)
  const project = projects.find((p) => p.id === projectId) ?? projects[0]
  const startingAssignee = (target: NewTaskProject | undefined) =>
    target?.members.some((m) => m.userId === me.id) ? me.id : NOBODY

  const [title, setTitle] = React.useState("")
  const [pasted, setPasted] = React.useState<string[] | null>(null)
  const [notes, setNotes] = React.useState<WrittenPageNode>(emptyWrittenPageBody)
  const [assignee, setAssignee] = React.useState(() => startingAssignee(project))
  const [due, setDue] = React.useState<Date | undefined>()
  const [steps, setSteps] = React.useState<string[]>([])
  const [stepText, setStepText] = React.useState("")
  const [invalid, setInvalid] = React.useState(false)
  const [run, saving] = useAsyncAction(getProjectErrorMessage)
  const dirty = Boolean(
    title.trim() || pasted || !writtenPageBodyIsEmpty(notes) || steps.length || due
  )

  // Opening again starts on the project the caller chose.
  const [wasOpen, setWasOpen] = React.useState(open)
  if (wasOpen !== open) {
    setWasOpen(open)
    if (open && initialProjectId !== projectId) {
      setProjectId(initialProjectId)
      setAssignee(startingAssignee(projects.find((p) => p.id === initialProjectId)))
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
    setDue(undefined)
    setSteps([])
    setStepText("")
    setInvalid(false)
  }

  function close() {
    reset()
    onClose()
  }

  function addStep() {
    const next = stepText.trim()
    if (!next) return
    if (steps.length >= LIMITS.stepsPerTask) {
      showErrorToast(`A task can have at most ${LIMITS.stepsPerTask} steps.`)
      return
    }
    setSteps((current) => [...current, next])
    setStepText("")
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
    if (pasted) {
      const ok = await run(
        () =>
          createTasksFromLines({
            projectId: project.id,
            titles: pasted,
            assigneeUserId,
            dueDate: keyFromDate(due),
          }),
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
        () =>
          createProjectTask({
            projectId: project.id,
            title,
            notes,
            assigneeUserId,
            dueDate: keyFromDate(due),
            steps,
          }),
        someoneElse && name ? `Task handed to ${name}.` : "Task created."
      )
      if (!ok) return
    }
    onCreated?.(project.id)
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
                : `In ${project?.name ?? "this project"}. A task handed to someone else waits for them to accept it.`}
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
                        <SelectTrigger id="new-task-assignee" className="w-full sm:w-fit">
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
                    <div className="grid gap-2">
                      <Label htmlFor="new-task-due">Due date</Label>
                      <DatePicker
                        id="new-task-due"
                        value={due}
                        onChange={setDue}
                        placeholder="No due date"
                      />
                    </div>
                  </div>
                  {pasted ? null : (
                    <div className="grid gap-2" role="group" aria-labelledby="new-task-notes-label">
                      <Label id="new-task-notes-label" asChild>
                        <span>Notes</span>
                      </Label>
                      <div className="[&_.page-rte_.tiptap]:min-h-20 [&_.page-rte_.tiptap]:px-3 [&_.page-rte_.tiptap]:py-2 [&_.page-rte_.tiptap]:text-sm">
                        <DocumentEditor
                          value={notes}
                          onChange={setNotes}
                          placeholder="Anything the person doing it should know. Select words to make them bold, a list or a link."
                        />
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
              {pasted ? null : (
                <Card size="sm">
                  <CardHeader>
                    <CardTitle>Steps</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-4">
                    {steps.length ? (
                      <ol className="grid gap-2">
                        {steps.map((step, index) => (
                          <li key={`${index}-${step}`} className="flex items-center gap-2 text-sm">
                            <span className="min-w-0 flex-1 break-words">{step}</span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              aria-label={`Remove the step "${step}"`}
                              onClick={() =>
                                setSteps((current) => current.filter((_, i) => i !== index))
                              }
                            >
                              <Trash2Icon className="size-4" />
                            </Button>
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Optional. Steps show progress as "3 of 5 steps done".
                      </p>
                    )}
                    <div className="flex gap-2">
                      <Input
                        aria-label="New step"
                        placeholder="Add a step"
                        value={stepText}
                        maxLength={LIMITS.stepText}
                        onChange={(event) => setStepText(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault()
                            addStep()
                          }
                        }}
                      />
                      <Button type="button" variant="outline" onClick={addStep}>
                        <PlusIcon className="size-4" />
                        Add
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
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
