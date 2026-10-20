import * as React from "react"
import { closestCenter, DndContext, type DragEndEvent } from "@dnd-kit/core"
import { arrayMove, SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { CopyIcon, GripVerticalIcon, PlusIcon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"

import { DRAG_HANDLE_CLASS, useNavSensors, useSortableRow } from "@/components/settings/nav-editor-shared"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { focusRing } from "@/lib/layout/focus-ring"
import { planAsMarkdown, planAsText, type CopyablePlan } from "@/lib/note/library/copy-plan"
import { LIBRARY_SAYS, PLAN_STEP_MAX, PLAN_STEPS_MAX, type PlanStep } from "@/lib/note/library/notes"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

let lastStepId = 0
function newStepId() {
  lastStepId += 1
  return `step-${lastStepId}`
}

/**
 * The action plan: a tick box per step, the words editable in place, steps
 * added, deleted and dragged into a new order, and the plan copied as plain
 * text or Markdown. Every change is handed up at once, and the panel saves it.
 * A merged plan's step names the note it came from.
 */
export function PlanCard({
  noteId,
  steps,
  locked,
  copyable,
  onChange,
}: {
  noteId: string
  steps: PlanStep[]
  /** Being analysed: the plan is about to be replaced, so nothing changes it meanwhile. */
  locked: boolean
  copyable: CopyablePlan
  onChange: (steps: PlanStep[]) => void
}) {
  const sensors = useNavSensors()
  const [editing, setEditing] = React.useState<string | null>(null)
  const [newStep, setNewStep] = React.useState("")
  const [newInvalid, setNewInvalid] = React.useState(false)

  // Each step keeps one id for as long as it is on screen, so a drag animates
  // the right step and an open edit stays on the step it was opened on. The
  // plan this card handed up comes back as the very same list; any other list
  // (a refused save put back, a new analysis) gets fresh ids and closes the edit.
  const [tracked, setTracked] = React.useState(() => ({ steps, ids: steps.map(newStepId) }))
  let ids = tracked.ids
  if (tracked.steps !== steps) {
    // The same plan read again (the panel's refresh) keeps its ids and the
    // open edit; only a plan that really changed starts over.
    if (JSON.stringify(tracked.steps) === JSON.stringify(steps)) {
      setTracked({ steps, ids })
    } else {
      ids = steps.map(newStepId)
      setTracked({ steps, ids })
      setEditing(null)
    }
  }

  function emit(next: PlanStep[], nextIds: string[]) {
    setTracked({ steps: next, ids: nextIds })
    onChange(next)
  }

  /** While the post is being analysed the plan is about to be replaced, so a change only says so. */
  function guarded(change: () => void) {
    if (locked) showErrorToast(LIBRARY_SAYS.stillAnalysing)
    else change()
  }

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const from = ids.indexOf(String(active.id))
    const to = ids.indexOf(String(over.id))
    if (from < 0 || to < 0) return
    emit(arrayMove(steps, from, to), arrayMove(ids, from, to))
  }

  function addStep(event: React.FormEvent) {
    event.preventDefault()
    const text = newStep.replace(/\s+/g, " ").trim()
    if (!text) {
      setNewInvalid(true)
      showErrorToast(LIBRARY_SAYS.stepEmpty)
      return
    }
    if (steps.length >= PLAN_STEPS_MAX) {
      showErrorToast(LIBRARY_SAYS.tooManySteps)
      return
    }
    emit([...steps, { text: text.slice(0, PLAN_STEP_MAX), done: false }], [...ids, newStepId()])
    setNewStep("")
  }

  async function copy(kind: "text" | "markdown") {
    try {
      await navigator.clipboard.writeText(kind === "text" ? planAsText(copyable) : planAsMarkdown(copyable))
      toast.success(kind === "text" ? "Copied the plan as text." : "Copied the plan as Markdown.")
    } catch {
      showErrorToast("The browser would not let the plan be copied. Try again.")
    }
  }

  return (
    <div className="grid gap-3">
      {steps.length ? (
        <DndContext
          id={`note-plan-${noteId}`}
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
        >
          <SortableContext items={ids} strategy={verticalListSortingStrategy}>
            <ul aria-label="Action plan" className="-mx-1 grid gap-1">
              {steps.map((step, index) => (
                <StepRow
                  key={ids[index]}
                  id={ids[index]}
                  inputId={`note-plan-${noteId}-${ids[index]}`}
                  step={step}
                  locked={locked}
                  editing={editing === ids[index]}
                  onStartEdit={() => guarded(() => setEditing(ids[index]))}
                  onStopEdit={() => setEditing(null)}
                  onTick={(done) =>
                    guarded(() => emit(steps.map((each, at) => (at === index ? { ...each, done } : each)), ids))
                  }
                  onText={(text) => emit(steps.map((each, at) => (at === index ? { ...each, text } : each)), ids)}
                  onDelete={() => {
                    setEditing(null)
                    emit(
                      steps.filter((_, at) => at !== index),
                      ids.filter((_, at) => at !== index)
                    )
                  }}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      ) : (
        <p className="text-sm text-muted-foreground">No steps. Add one below.</p>
      )}

      {locked ? null : (
        <form className="flex gap-2" onSubmit={addStep}>
          <Input
            aria-label="A new step"
            placeholder="Add a step"
            value={newStep}
            maxLength={PLAN_STEP_MAX}
            aria-invalid={newInvalid || undefined}
            onChange={(event) => {
              setNewStep(event.target.value)
              setNewInvalid(false)
            }}
          />
          <Button type="submit" variant="outline">
            <PlusIcon />
            Add step
          </Button>
        </form>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => void copy("text")}>
          <CopyIcon />
          Copy as text
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => void copy("markdown")}>
          <CopyIcon />
          Copy as Markdown
        </Button>
      </div>
    </div>
  )
}

function StepRow({
  id,
  inputId,
  step,
  locked,
  editing,
  onStartEdit,
  onStopEdit,
  onTick,
  onText,
  onDelete,
}: {
  id: string
  inputId: string
  step: PlanStep
  locked: boolean
  editing: boolean
  onStartEdit: () => void
  onStopEdit: () => void
  onTick: (done: boolean) => void
  onText: (text: string) => void
  onDelete: () => void
}) {
  const { attributes, listeners, setNodeRef, style } = useSortableRow(id)
  const [draft, setDraft] = React.useState(step.text)
  const [invalid, setInvalid] = React.useState(false)

  function commit() {
    const text = draft.replace(/\s+/g, " ").trim()
    if (!text) {
      setInvalid(true)
      showErrorToast(LIBRARY_SAYS.stepEmpty)
      return
    }
    if (text !== step.text) onText(text.slice(0, PLAN_STEP_MAX))
    onStopEdit()
  }

  return (
    <li ref={setNodeRef} style={style} className="flex items-start gap-1 rounded-md px-1 py-0.5 hover:bg-muted/50">
      {locked ? null : (
        <button
          type="button"
          aria-label={`Reorder “${step.text.slice(0, 40)}”`}
          className={cn(DRAG_HANDLE_CLASS, "size-7 shrink-0")}
          {...attributes}
          {...listeners}
        >
          <GripVerticalIcon className="size-3.5" />
        </button>
      )}
      <span className="flex pt-1.5">
        <Checkbox
          id={inputId}
          checked={step.done}
          aria-label={step.text}
          onCheckedChange={(checked) => onTick(checked === true)}
        />
      </span>
      {editing ? (
        <Textarea
          autoFocus
          rows={1}
          value={draft}
          maxLength={PLAN_STEP_MAX}
          aria-label="The step's words"
          aria-invalid={invalid || undefined}
          className="min-w-0 flex-1"
          onChange={(event) => {
            setDraft(event.target.value)
            setInvalid(false)
          }}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault()
              commit()
            }
            if (event.key === "Escape") {
              event.preventDefault()
              setDraft(step.text)
              setInvalid(false)
              onStopEdit()
            }
          }}
        />
      ) : (
        <button
          type="button"
          onClick={() => {
            setDraft(step.text)
            onStartEdit()
          }}
          className={cn(
            "min-w-0 flex-1 rounded-sm py-1 text-left text-sm leading-snug",
            step.done && "text-muted-foreground line-through",
            focusRing
          )}
          aria-label={`Edit “${step.text}”`}
        >
          {step.text}
          {step.from ? <span className="ml-1 text-xs text-muted-foreground no-underline">({step.from})</span> : null}
        </button>
      )}
      {locked ? null : (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button type="button" variant="ghost" size="icon-xs" aria-label="Delete this step" onClick={onDelete}>
              <Trash2Icon />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Delete this step</TooltipContent>
        </Tooltip>
      )}
    </li>
  )
}
