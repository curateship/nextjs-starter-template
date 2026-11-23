import * as React from "react"
import {
  CheckIcon,
  ListChecksIcon,
  Loader2Icon,
  PlusIcon,
  SettingsIcon,
  XIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { addStep, deleteStep, updateStep } from "@/lib/api/pomodoro/productivity"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"
import {
  MAX_TASK_STEPS,
  STEP_TITLE_MAX_LENGTH,
  stepCountLabel,
  type TaskStepItem,
} from "@/lib/pomodoro/task-steps"

export type StepsUpdate = (
  update: (steps: TaskStepItem[]) => TaskStepItem[]
) => void

/**
 * The button on a task row that opens its steps. With steps it reads "3 of
 * 5"; without any it is the icon alone, which is how the first step gets
 * added on a wide screen. The steps are also open whenever the task's editor
 * is, which is how a phone adds the first one.
 */
export function TaskStepsToggle({
  taskTitle,
  steps,
  expanded,
  onToggle,
}: {
  taskTitle: string
  steps: TaskStepItem[]
  expanded: boolean
  onToggle: () => void
}) {
  const count = steps.length ? stepCountLabel(steps) : null
  return (
    <Button
      variant="ghost"
      size={count ? "sm" : "icon-sm"}
      aria-expanded={expanded}
      aria-label={
        count
          ? `Steps for ${taskTitle}, ${count} done`
          : `Add steps to ${taskTitle}`
      }
      onClick={onToggle}
      // Without steps the button is hidden on a phone, where the row has no
      // room to spare; the task's editor opens the steps there instead.
      className={cn(
        count ? "gap-1 px-1.5 font-mono text-[10px]" : "hidden sm:inline-flex"
      )}
    >
      <ListChecksIcon aria-hidden="true" />
      {count ? <span aria-hidden="true">{count}</span> : null}
    </Button>
  )
}

/**
 * The checklist under a task, opened from its row. A tick, a rename and a
 * delete each send one request and put the step back if it fails. The task's
 * own tick stays separate: finishing every step does not finish the task.
 *
 * A finished task shows its steps as they were left, with nothing to press,
 * because the server refuses changes to a finished task's steps.
 */
export function TaskStepList({
  taskId,
  taskTitle,
  steps,
  readOnly,
  onStepsChange,
  onClose,
}: {
  taskId: string
  taskTitle: string
  steps: TaskStepItem[]
  readOnly: boolean
  onStepsChange: StepsUpdate
  /** Folds the steps away, the same as pressing the row's steps button. */
  onClose: () => void
}) {
  const [pending, setPending] = React.useState<string[]>([])
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const replaceStep = (stepId: string, next: TaskStepItem | null) =>
    onStepsChange((current) =>
      next
        ? current.map((step) => (step.id === stepId ? next : step))
        : current.filter((step) => step.id !== stepId)
    )
  const busy = (stepId: string) => pending.includes(stepId)
  const track = async (stepId: string, work: () => Promise<void>) => {
    setPending((ids) => [...ids, stepId])
    await work()
    setPending((ids) => ids.filter((id) => id !== stepId))
  }

  const toggle = (step: TaskStepItem) =>
    track(step.id, async () => {
      replaceStep(step.id, { ...step, done: !step.done })
      await updateStep({ stepId: step.id, done: !step.done }).catch(() => {
        replaceStep(step.id, step)
        showErrorToast("The step could not be updated.")
      })
    })

  const remove = (step: TaskStepItem, index: number) =>
    track(step.id, async () => {
      replaceStep(step.id, null)
      await deleteStep(step.id).catch(() => {
        onStepsChange((current) => [
          ...current.slice(0, index),
          step,
          ...current.slice(index),
        ])
        showErrorToast("The step could not be removed.")
      })
    })

  const rename = async (step: TaskStepItem, title: string) => {
    try {
      const saved = await updateStep({ stepId: step.id, title })
      replaceStep(step.id, saved)
      setEditingId(null)
    } catch {
      showErrorToast("The step could not be renamed.")
    }
  }

  return (
    <section
      aria-label={`Steps for ${taskTitle}`}
      className="flex flex-col gap-1 border-t py-2 pl-9 pr-2"
    >
      {!steps.length && readOnly ? (
        <p className="text-xs text-muted-foreground">No steps.</p>
      ) : null}
      {steps.map((step, index) =>
        editingId === step.id ? (
          <StepRenameForm
            key={step.id}
            step={step}
            onCancel={() => setEditingId(null)}
            onSave={(title) => rename(step, title)}
          />
        ) : (
          <div key={step.id} className="flex min-h-8 items-center gap-2">
            <Checkbox
              checked={step.done}
              disabled={readOnly || busy(step.id)}
              onCheckedChange={() => void toggle(step)}
              aria-label={`${step.done ? "Untick" : "Tick"} ${step.title}`}
            />
            <span
              className={cn(
                "min-w-0 flex-1 truncate text-sm",
                step.done && "text-muted-foreground line-through"
              )}
            >
              {step.title}
            </span>
            {readOnly ? null : (
              <>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setEditingId(step.id)}
                  aria-label={`Rename ${step.title}`}
                >
                  <SettingsIcon aria-hidden="true" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled={busy(step.id)}
                  onClick={() => void remove(step, index)}
                  aria-label={`Remove ${step.title}`}
                >
                  <XIcon aria-hidden="true" />
                </Button>
              </>
            )}
          </div>
        )
      )}
      {/* The add box and the button that folds the steps away share the
          last line, so closing is where the eye already is. */}
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          {readOnly ? null : steps.length < MAX_TASK_STEPS ? (
            <NewStepForm
              taskTitle={taskTitle}
              onAdd={async (title) => {
                try {
                  const created = await addStep(taskId, title)
                  onStepsChange((current) => [...current, created])
                  return true
                } catch (error) {
                  showErrorToast(
                    String(error).includes("TOO_MANY_STEPS")
                      ? `A task holds at most ${MAX_TASK_STEPS} steps.`
                      : "The step could not be added."
                  )
                  return false
                }
              }}
            />
          ) : (
            <p className="text-xs text-muted-foreground">
              {MAX_TASK_STEPS} steps is the most a task holds.
            </p>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onClose}
          aria-label={`Close the steps for ${taskTitle}`}
        >
          <XIcon aria-hidden="true" />
        </Button>
      </div>
    </section>
  )
}

/**
 * The box that adds a step. Like the task box, a blank Enter sends nothing
 * and keeps what was typed, and the text clears only once the step is saved.
 */
function NewStepForm({
  taskTitle,
  onAdd,
}: {
  taskTitle: string
  onAdd: (title: string) => Promise<boolean>
}) {
  const [title, setTitle] = React.useState("")
  const [invalid, setInvalid] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  return (
    <form
      className="relative"
      onSubmit={async (event) => {
        event.preventDefault()
        if (saving) return
        const clean = title.trim()
        if (!clean) {
          setInvalid(true)
          showErrorToast("Type what the step is before pressing Enter.")
          return
        }
        setSaving(true)
        if (await onAdd(clean)) setTitle("")
        setSaving(false)
      }}
    >
      {saving ? (
        <Loader2Icon
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground"
        />
      ) : (
        <PlusIcon
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        />
      )}
      <Input
        value={title}
        onChange={(event) => {
          setTitle(event.target.value)
          setInvalid(false)
        }}
        aria-invalid={invalid || undefined}
        maxLength={STEP_TITLE_MAX_LENGTH}
        placeholder="Add a step, press Enter…"
        aria-label={`New step for ${taskTitle}`}
        className="pl-9"
      />
    </form>
  )
}

function StepRenameForm({
  step,
  onSave,
  onCancel,
}: {
  step: TaskStepItem
  onSave: (title: string) => Promise<void>
  onCancel: () => void
}) {
  const [title, setTitle] = React.useState(step.title)
  const [saving, setSaving] = React.useState(false)
  const [invalid, setInvalid] = React.useState(false)
  return (
    <form
      className="flex items-center gap-2"
      onSubmit={async (event) => {
        event.preventDefault()
        if (saving) return
        if (!title.trim()) {
          setInvalid(true)
          showErrorToast("A step needs words before it can be saved.")
          return
        }
        setSaving(true)
        await onSave(title.trim())
        setSaving(false)
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") onCancel()
      }}
    >
      <Input
        autoFocus
        value={title}
        maxLength={STEP_TITLE_MAX_LENGTH}
        onChange={(event) => {
          setTitle(event.target.value)
          setInvalid(false)
        }}
        aria-invalid={invalid || undefined}
        aria-label={`New name for ${step.title}`}
        className="flex-1"
      />
      <Button
        type="submit"
        variant="ghost"
        size="icon-sm"
        disabled={saving}
        aria-label={`Save the name of ${step.title}`}
      >
        {saving ? (
          <Loader2Icon className="animate-spin" aria-hidden="true" />
        ) : (
          <CheckIcon aria-hidden="true" />
        )}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={onCancel}
        aria-label={`Cancel renaming ${step.title}`}
      >
        <XIcon aria-hidden="true" />
      </Button>
    </form>
  )
}
