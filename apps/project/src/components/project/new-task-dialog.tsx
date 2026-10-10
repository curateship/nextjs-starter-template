import * as React from "react"
import { getRouteApi, useRouter } from "@tanstack/react-router"
import { Loader2Icon, PlusIcon, Trash2Icon } from "lucide-react"

import { PersonAvatar } from "@/components/project/task-bits"
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
import { Textarea } from "@/components/ui/textarea"
import type { ProjectPage } from "@/lib/api/project/projects"
import { createProjectTask } from "@/lib/api/project/tasks"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { getProjectErrorMessage } from "@/lib/project/errors"
import { LIMITS } from "@/lib/project/rules"
import { showErrorToast } from "@/lib/toast/error-toast"

const authenticatedRoute = getRouteApi("/_authenticated")
const NOBODY = "nobody"

/**
 * A new task. It starts assigned to its maker when they are on the project.
 * Handing it to someone else leaves it Waiting until they accept, and tells
 * them in the bell.
 */
export function NewTaskDialog({
  page,
  open,
  onClose,
}: {
  page: ProjectPage
  open: boolean
  onClose: () => void
}) {
  const router = useRouter()
  const me = authenticatedRoute.useLoaderData().user
  const iAmMember = page.members.some((m) => m.userId === me.id)
  const startingAssignee = iAmMember ? me.id : NOBODY

  const [title, setTitle] = React.useState("")
  const [notes, setNotes] = React.useState("")
  const [assignee, setAssignee] = React.useState(startingAssignee)
  const [due, setDue] = React.useState<Date | undefined>()
  const [steps, setSteps] = React.useState<string[]>([])
  const [stepText, setStepText] = React.useState("")
  const [invalid, setInvalid] = React.useState(false)
  const [run, saving] = useAsyncAction(getProjectErrorMessage)
  const dirty = Boolean(title.trim() || notes.trim() || steps.length || due)

  function reset() {
    setTitle("")
    setNotes("")
    setAssignee(startingAssignee)
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

  async function create() {
    if (!title.trim()) {
      setInvalid(true)
      showErrorToast("Give the task a title.")
      return
    }
    const assigneeUserId = assignee === NOBODY ? null : assignee
    const someoneElse = assigneeUserId && assigneeUserId !== me.id
    const name = page.members.find((m) => m.userId === assigneeUserId)?.name
    const ok = await run(
      () =>
        createProjectTask({
          projectId: page.project.id,
          title,
          notes,
          assigneeUserId,
          dueDate: keyFromDate(due),
          steps,
        }),
      someoneElse && name ? `Task handed to ${name}.` : "Task created."
    )
    if (!ok) return
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
              In {page.project.name}. A task handed to someone else waits for them to accept it.
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
                  <div className="grid gap-2">
                    <Label htmlFor="new-task-title">Title</Label>
                    <Input
                      id="new-task-title"
                      value={title}
                      maxLength={LIMITS.taskTitle}
                      aria-invalid={invalid || undefined}
                      onChange={(event) => {
                        setTitle(event.target.value)
                        setInvalid(false)
                      }}
                    />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="grid gap-2">
                      <Label htmlFor="new-task-assignee">Assigned to</Label>
                      <Select value={assignee} onValueChange={setAssignee}>
                        <SelectTrigger id="new-task-assignee" className="w-full sm:w-fit">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NOBODY}>Nobody</SelectItem>
                          {page.members.map((member) => (
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
                  <div className="grid gap-2">
                    <Label htmlFor="new-task-notes">Notes</Label>
                    <Textarea
                      id="new-task-notes"
                      value={notes}
                      maxLength={LIMITS.taskNotes}
                      onChange={(event) => setNotes(event.target.value)}
                    />
                  </div>
                </CardContent>
              </Card>
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
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={requestClose} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? <Loader2Icon className="size-4 animate-spin" /> : null}
                Create task
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      )}
    </FormDialog>
  )
}
