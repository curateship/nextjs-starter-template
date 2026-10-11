import * as React from "react"
import { useNavigate, useRouter } from "@tanstack/react-router"
import { ListPlusIcon, MoreHorizontalIcon, Trash2Icon } from "lucide-react"

import type { Change } from "@/components/project/task-body"
import { PersonAvatar } from "@/components/project/task-bits"
import { Button } from "@/components/ui/button"
import { DatePicker } from "@/components/ui/date-picker"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  deleteTaskStep,
  turnStepIntoTask,
  updateTaskStep,
  type TaskDetail,
  type TaskStep,
} from "@/lib/api/project/tasks"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { dateFromKey, keyFromDate } from "@/lib/project/dates"
import { getProjectErrorMessage } from "@/lib/project/errors"

const NOBODY = "nobody"

/**
 * A step's own settings: who does it and by when, Make it a task, and
 * Delete. A step's person sees it only inside the task, never in their My
 * tasks or check-in (Tyler's choice). Work someone should pick at check-in
 * becomes its own task with Make it a task.
 */
export function StepMenu({
  step,
  people,
  myUserId,
  change,
}: {
  step: TaskStep
  people: TaskDetail["assignable"]
  myUserId: string
  change: Change
}) {
  const router = useRouter()
  const navigate = useNavigate()
  const [open, setOpen] = React.useState(false)
  const [run, busy] = useAsyncAction(getProjectErrorMessage)
  const personId = `step-person-${step.id}`
  const dateId = `step-due-${step.id}`

  async function makeTask() {
    let id = ""
    const ok = await run(async () => {
      id = (await turnStepIntoTask(step.id)).id
    }, "The step is its own task now.")
    if (!ok) return
    setOpen(false)
    await router.invalidate()
    void navigate({
      to: ".",
      search: (previous: Record<string, unknown>) => ({ ...previous, task: id }),
    })
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="icon" aria-label={`More for the step "${step.text}"`}>
          <MoreHorizontalIcon className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="grid w-72 gap-4">
        <div className="grid gap-2">
          <Label htmlFor={personId}>Who does it</Label>
          <Select
            value={step.assignee?.id ?? NOBODY}
            onValueChange={(value) =>
              void change(() =>
                updateTaskStep({ stepId: step.id, assigneeUserId: value === NOBODY ? null : value })
              )
            }
          >
            <SelectTrigger id={personId} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NOBODY}>Nobody</SelectItem>
              {people.map((person) => (
                <SelectItem key={person.id} value={person.id}>
                  <PersonAvatar name={person.name} avatarUrl={person.avatarUrl} />
                  {person.id === myUserId ? `${person.name} (you)` : person.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor={dateId}>Due date</Label>
          <DatePicker
            id={dateId}
            value={dateFromKey(step.dueDate)}
            placeholder="No due date"
            onChange={(date) =>
              void change(() => updateTaskStep({ stepId: step.id, dueDate: keyFromDate(date) }))
            }
          />
          {step.dueDate ? (
            <div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => void change(() => updateTaskStep({ stepId: step.id, dueDate: null }))}
              >
                Clear the date
              </Button>
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void makeTask()}>
            <ListPlusIcon className="size-4" />
            Make it a task
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setOpen(false)
              void change(() => deleteTaskStep(step.id))
            }}
          >
            <Trash2Icon className="size-4" />
            Delete step
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
