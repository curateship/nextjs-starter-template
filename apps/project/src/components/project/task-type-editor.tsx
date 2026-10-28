import * as React from "react"
import {
  closestCenter,
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { useRouter } from "@tanstack/react-router"
import { GripVerticalIcon, Loader2Icon, PlusIcon, SettingsIcon, Trash2Icon } from "lucide-react"

import { ProjectColorSelect } from "@/components/project/project-form-fields"
import { TypeIconSelect } from "@/components/project/task-type-icon"
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
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import {
  makeTypeField,
  orderTypeFields,
  removeTypeField,
  saveTaskType,
  saveTypeField,
} from "@/lib/api/project/task-types"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { useSyncedDraft } from "@/lib/hooks/use-synced-draft"
import { getProjectErrorMessage } from "@/lib/project/errors"
import { plural } from "@/lib/format/plural"
import { LIMITS } from "@/lib/project/rules"
import {
  FIELD_KINDS,
  FIELD_KIND_INFO,
  liveChoices,
  WHO_CAN_CHANGE,
  WHO_CAN_CHANGE_LABEL,
  type FieldKind,
  type WhoCanChange,
} from "@/lib/project/task-fields"
import { stepFieldNames, type TaskType, type TaskTypeField } from "@/lib/project/task-types"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

export type Track = (work: () => Promise<unknown>) => Promise<boolean>

/**
 * The pieces the Task types dashboard edits a type with, for the owner and
 * admins: its name, icon and colour, its fields with their settings, and the
 * steps a new task of the type starts with. Every change saves at once
 * through `save`, which shows Saving… in the dashboard's header.
 */

/** A type's name, icon and colour. */
export function TypeBasicsCard({ type, save }: { type: TaskType; save: Track }) {
  const [name, setName] = useSyncedDraft(type.name)
  const [invalid, setInvalid] = React.useState(false)

  async function commitName() {
    const next = name.trim()
    if (next === type.name) return
    if (!next) {
      setInvalid(true)
      showErrorToast("A template needs a name.")
      return
    }
    if (!(await save(() => saveTaskType({ typeId: type.id, name: next })))) setInvalid(true)
  }

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Template</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="task-type-name">Name</Label>
          <Input
            id="task-type-name"
            value={name}
            maxLength={LIMITS.typeName}
            aria-invalid={invalid || undefined}
            onChange={(event) => {
              setName(event.target.value)
              setInvalid(false)
            }}
            onBlur={() => void commitName()}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur()
            }}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="task-type-icon">Icon</Label>
            <TypeIconSelect
              id="task-type-icon"
              value={type.icon}
              color={type.color}
              onChange={(icon) => void save(() => saveTaskType({ typeId: type.id, icon }))}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="task-type-color">Colour</Label>
            <ProjectColorSelect
              id="task-type-color"
              value={type.color}
              onChange={(color) => void save(() => saveTaskType({ typeId: type.id, color }))}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * The type's fields, in order, and a way to add one. A field is dragged up or
 * down by its handle (Tyler, 12 Oct 2026: "the field order should be
 * draggable"), the way List rows are. The new order shows at once, goes back
 * if the server refuses it, and nothing can be dragged while it saves, so two
 * quick drags save in the order they were made.
 */
export function TypeFields({ type, save }: { type: TaskType; save: Track }) {
  // Ids joined into one string, so a fresh copy of the same order doesn't reset the drag.
  const [orderKey, setOrderKey] = useSyncedDraft(type.fields.map((field) => field.id).join(","))
  const [ordering, setOrdering] = React.useState(false)
  const byId = new Map(type.fields.map((field) => [field.id, field]))
  const ordered = orderKey
    .split(",")
    .flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []))
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))
  const dndId = React.useId()

  async function handleDragEnd(event: DragEndEvent) {
    const overId = event.over?.id
    if (overId === undefined || overId === event.active.id) return
    const ids = ordered.map((field) => field.id)
    const next = arrayMove(ids, ids.indexOf(String(event.active.id)), ids.indexOf(String(overId)))
    const before = orderKey
    setOrderKey(next.join(","))
    setOrdering(true)
    const ok = await save(() => orderTypeFields(type.id, next))
    setOrdering(false)
    if (!ok) setOrderKey(before)
  }

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Fields</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        {ordered.length ? (
          <DndContext
            id={dndId}
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={(event) => void handleDragEnd(event)}
          >
            <SortableContext items={ordered.map((field) => field.id)} strategy={verticalListSortingStrategy}>
              <ul className="grid gap-2">
                {ordered.map((field) => (
                  <FieldRow
                    key={field.id}
                    field={field}
                    siblings={type.fields}
                    canDrag={!ordering && ordered.length > 1}
                    save={save}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        ) : (
          <p className="text-sm text-muted-foreground">
            No fields yet. Use Add field at the top to give this kind of task what it needs, such
            as a link, a date or a file.
          </p>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * A new field: its name and kind, in a window opened from Add field at the top
 * of the dashboard's middle panel. Its other settings are under its cog once
 * it's made.
 */
export function NewFieldDialog({
  type,
  open,
  onClose,
}: {
  type: TaskType
  open: boolean
  onClose: () => void
}) {
  const router = useRouter()
  const [name, setName] = React.useState("")
  const [kind, setKind] = React.useState<FieldKind>("text")
  const [invalid, setInvalid] = React.useState(false)
  const [run, busy] = useAsyncAction(getProjectErrorMessage)

  function close() {
    setName("")
    setKind("text")
    setInvalid(false)
    onClose()
  }

  async function submit() {
    const next = name.trim()
    if (!next) {
      setInvalid(true)
      showErrorToast("Give the field a name.")
      return
    }
    const ok = await run(() => makeTypeField({ typeId: type.id, name: next, kind }), "Field added.")
    if (!ok) {
      setInvalid(true)
      return
    }
    close()
    await router.invalidate()
  }

  return (
    <FormDialog open={open} dirty={Boolean(name.trim())} busy={busy} onClose={close}>
      {(requestClose) => (
        <DialogContent variant="admin" className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New field</DialogTitle>
            <DialogDescription>
              For every {type.name} task. Whether it's needed, who can change it and when it shows are under
              its cog once it's made.
            </DialogDescription>
          </DialogHeader>
          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(event) => {
              event.preventDefault()
              void submit()
            }}
          >
            <DialogBody>
              <Card size="sm">
                <CardHeader>
                  <CardTitle>Field</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="new-field-name">Name</Label>
                    <Input
                      id="new-field-name"
                      value={name}
                      maxLength={LIMITS.fieldName}
                      placeholder="Footage link"
                      aria-invalid={invalid || undefined}
                      onChange={(event) => {
                        setName(event.target.value)
                        setInvalid(false)
                      }}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="new-field-kind">Kind</Label>
                    <KindSelect id="new-field-kind" value={kind} onChange={setKind} />
                  </div>
                </CardContent>
              </Card>
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={requestClose} disabled={busy}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
                Create field
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      )}
    </FormDialog>
  )
}

function KindSelect({
  id,
  value,
  onChange,
  disabled,
  ariaLabel,
}: {
  id: string
  value: FieldKind
  onChange: (kind: FieldKind) => void
  disabled?: boolean
  ariaLabel?: string
}) {
  return (
    <Select value={value} onValueChange={(next) => onChange(next as FieldKind)} disabled={disabled}>
      <SelectTrigger id={id} aria-label={ariaLabel} className="w-full sm:w-fit">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {FIELD_KINDS.map((kind) => (
          <SelectItem key={kind} value={kind}>
            {FIELD_KIND_INFO[kind].label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

const ALWAYS = "always"

/**
 * One field: its name and kind on the row, and under the cog its switches,
 * who can change it, "Show only when" and a dropdown's choices. Removing it
 * asks first, saying how many tasks have a value in it.
 */
function FieldRow({
  field,
  siblings,
  canDrag,
  save,
}: {
  field: TaskTypeField
  siblings: TaskTypeField[]
  canDrag: boolean
  save: Track
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: field.id, disabled: !canDrag })
  const style: React.CSSProperties | undefined = transform
    ? { transform: `translate3d(0, ${transform.y}px, 0)`, transition }
    : undefined
  const [name, setName] = useSyncedDraft(field.name)
  const [invalid, setInvalid] = React.useState(false)
  const [open, setOpen] = React.useState(false)
  const [removing, setRemoving] = React.useState(false)
  const inUse = field.inUse ?? 0
  const optionsId = `task-field-${field.id}-options`
  const dependents = siblings.filter((other) => other.settings.showWhen?.fieldId === field.id)

  async function commitName() {
    const next = name.trim()
    if (next === field.name) return
    if (!next) {
      setInvalid(true)
      showErrorToast("A field needs a name.")
      return
    }
    if (!(await save(() => saveTypeField({ fieldId: field.id, name: next })))) setInvalid(true)
  }

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn("grid gap-2 rounded-md bg-muted/50 p-2", isDragging && "relative z-10 shadow-md")}
    >
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...listeners}
          {...attributes}
          disabled={!canDrag}
          aria-label={`Drag ${field.name} to change the order`}
          className="flex size-6 shrink-0 cursor-grab items-center justify-center rounded text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-default disabled:opacity-50"
        >
          <GripVerticalIcon className="size-4" aria-hidden />
        </button>
        <Input
          aria-label={`Field name: ${field.name}`}
          className="min-w-0 flex-1 basis-32"
          value={name}
          maxLength={LIMITS.fieldName}
          aria-invalid={invalid || undefined}
          onChange={(event) => {
            setName(event.target.value)
            setInvalid(false)
          }}
          onBlur={() => void commitName()}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur()
          }}
        />
        <KindSelect
          id={`task-field-${field.id}-kind`}
          ariaLabel={
            inUse
              ? `Kind of ${field.name}: fixed, because ${inUse} ${plural(inUse, "task")} have a value in it`
              : `Kind of ${field.name}`
          }
          value={field.kind}
          disabled={inUse > 0}
          onChange={(kind) => void save(() => saveTypeField({ fieldId: field.id, kind }))}
        />
        <div className="flex items-center">
          <Button
            type="button"
            variant={open ? "secondary" : "ghost"}
            size="icon"
            aria-label={`${field.name}: options`}
            aria-expanded={open}
            aria-controls={optionsId}
            onClick={() => setOpen((current) => !current)}
          >
            <SettingsIcon className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Remove ${field.name}`}
            onClick={() => setRemoving(true)}
          >
            <Trash2Icon className="size-4" />
          </Button>
        </div>
      </div>
      {inUse ? (
        <p className="text-xs text-muted-foreground">
          {inUse} {plural(inUse, "task")} {inUse === 1 ? "has" : "have"} a value in it, so its kind stays{" "}
          {FIELD_KIND_INFO[field.kind].label}.
        </p>
      ) : null}
      {removing ? (
        <div className="grid gap-2 rounded-md border bg-background p-2 text-sm">
          <p>
            Remove {field.name}?{" "}
            {inUse
              ? `${inUse} ${plural(inUse, "task")} ${inUse === 1 ? "has" : "have"} a value in it, which goes too${field.kind === "file" ? ", files included" : ""}.`
              : "No task has a value in it yet."}
            {dependents.length
              ? ` ${dependents.map((d) => d.name).join(" and ")} will always show.`
              : ""}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setRemoving(false)}>
              Keep it
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() => void save(() => removeTypeField(field.id))}
            >
              Remove field
            </Button>
          </div>
        </div>
      ) : null}
      {open ? (
        <div id={optionsId} className="grid gap-4 border-t pt-3">
          <FieldOptions field={field} siblings={siblings} save={save} />
        </div>
      ) : null}
    </li>
  )
}

function FieldOptions({
  field,
  siblings,
  save,
}: {
  field: TaskTypeField
  siblings: TaskTypeField[]
  save: Track
}) {
  const base = `task-field-${field.id}`
  const update = (patch: Omit<Parameters<typeof saveTypeField>[0], "fieldId">) =>
    void save(() => saveTypeField({ fieldId: field.id, ...patch }))
  // Every live choice of every other dropdown in the type, as "Platform is YouTube".
  const conditions = siblings
    .filter((other) => other.id !== field.id && other.kind === "dropdown")
    .flatMap((other) =>
      liveChoices(other.settings).map((choice) => ({
        value: `${other.id}:${choice.id}`,
        label: `${other.name} is ${choice.name}`,
      }))
    )
  const when = field.settings.showWhen
  const whenValue = when ? `${when.fieldId}:${when.choiceId}` : ALWAYS

  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <FieldLabel
          htmlFor={`${base}-before-done`}
          hint="Nobody can mark the task Done while this is empty. A task already Done stays Done."
        >
          Needed before Done
        </FieldLabel>
        <Switch
          id={`${base}-before-done`}
          checked={field.neededBeforeDone}
          onCheckedChange={(on) => update({ neededBeforeDone: on })}
        />
      </div>
      {field.kind === "file" ? null : (
        <div className="flex items-center justify-between gap-4">
          <FieldLabel
            htmlFor={`${base}-when-made`}
            hint="New task shows it once this template is picked, and won't make the task without it."
          >
            Needed when made
          </FieldLabel>
          <Switch
            id={`${base}-when-made`}
            checked={field.neededWhenMade}
            onCheckedChange={(on) => update({ neededWhenMade: on })}
          />
        </div>
      )}
      <div className="grid gap-2">
        <FieldLabel
          htmlFor={`${base}-who`}
          hint="The owner and admins can always change it. Everyone else reads it as plain text."
        >
          Who can change it
        </FieldLabel>
        <Select value={field.whoCanChange} onValueChange={(value) => update({ whoCanChange: value as WhoCanChange })}>
          <SelectTrigger id={`${base}-who`} className="w-full sm:w-fit">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {WHO_CAN_CHANGE.map((who) => (
              <SelectItem key={who} value={who}>
                {WHO_CAN_CHANGE_LABEL[who]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-2">
        <FieldLabel
          htmlFor={`${base}-when`}
          hint="Hidden, it keeps its value, and is never needed before Done or when made."
        >
          Show
        </FieldLabel>
        <Select
          value={whenValue}
          onValueChange={(value) => {
            if (value === ALWAYS) return update({ showWhen: null })
            const [fieldId, choiceId] = value.split(":")
            update({ showWhen: { fieldId, choiceId } })
          }}
        >
          <SelectTrigger id={`${base}-when`} className="w-full sm:w-fit">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALWAYS}>Always</SelectItem>
            {conditions.map((condition) => (
              <SelectItem key={condition.value} value={condition.value}>
                Only when {condition.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {conditions.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Add a Dropdown field with choices to show this one only for some of them.
          </p>
        ) : null}
      </div>
      {field.kind === "dropdown" ? <ChoicesEditor field={field} siblings={siblings} save={save} /> : null}
    </>
  )
}

/** A dropdown's choices. A removed choice still reads on the tasks that picked it. */
function ChoicesEditor({
  field,
  siblings,
  save,
}: {
  field: TaskTypeField
  siblings: TaskTypeField[]
  save: Track
}) {
  const choices = liveChoices(field.settings)
  const [name, setName] = React.useState("")
  const [invalid, setInvalid] = React.useState(false)
  const [removing, setRemoving] = React.useState<string | null>(null)
  const full = choices.length >= LIMITS.choicesPerField

  const saveChoices = (next: { id?: string; name: string }[]) =>
    save(() => saveTypeField({ fieldId: field.id, choices: next }))

  async function add() {
    const next = name.trim()
    if (!next) {
      setInvalid(true)
      showErrorToast("Type the choice first.")
      return
    }
    if (await saveChoices([...choices, { name: next }])) setName("")
    else setInvalid(true)
  }

  const dependentsOf = (choiceId: string) =>
    siblings.filter(
      (other) => other.settings.showWhen?.fieldId === field.id && other.settings.showWhen.choiceId === choiceId
    )

  return (
    <div className="grid gap-2">
      <Label htmlFor={`task-field-${field.id}-new-choice`}>Choices</Label>
      {choices.length ? (
        <ul className="grid gap-2">
          {choices.map((choice) => (
            <ChoiceRow
              key={choice.id}
              choice={choice}
              removing={removing === choice.id}
              dependents={dependentsOf(choice.id).map((d) => d.name)}
              onRename={(next) =>
                saveChoices(choices.map((c) => (c.id === choice.id ? { id: c.id, name: next } : c)))
              }
              onAskRemove={() => setRemoving(choice.id)}
              onCancelRemove={() => setRemoving(null)}
              onRemove={async () => {
                if (await saveChoices(choices.filter((c) => c.id !== choice.id))) setRemoving(null)
              }}
            />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No choices yet.</p>
      )}
      {full ? (
        <p className="text-sm text-muted-foreground">
          That's {LIMITS.choicesPerField} choices, the most a dropdown can have.
        </p>
      ) : (
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            void add()
          }}
        >
          <Input
            id={`task-field-${field.id}-new-choice`}
            placeholder="YouTube"
            value={name}
            maxLength={LIMITS.choiceName}
            aria-invalid={invalid || undefined}
            onChange={(event) => {
              setName(event.target.value)
              setInvalid(false)
            }}
          />
          <Button type="submit" variant="outline">
            <PlusIcon className="size-4" />
            Add
          </Button>
        </form>
      )}
    </div>
  )
}

function ChoiceRow({
  choice,
  removing,
  dependents,
  onRename,
  onAskRemove,
  onCancelRemove,
  onRemove,
}: {
  choice: { id: string; name: string }
  removing: boolean
  dependents: string[]
  onRename: (name: string) => Promise<boolean>
  onAskRemove: () => void
  onCancelRemove: () => void
  onRemove: () => Promise<void>
}) {
  const [name, setName] = useSyncedDraft(choice.name)
  const [invalid, setInvalid] = React.useState(false)

  async function commit() {
    const next = name.trim()
    if (next === choice.name) return
    if (!next) {
      setInvalid(true)
      showErrorToast("A choice needs a name.")
      return
    }
    if (!(await onRename(next))) setInvalid(true)
  }

  return (
    <li className="grid gap-2">
      <div className="flex items-center gap-2">
        <Input
          aria-label={`Choice: ${choice.name}`}
          value={name}
          maxLength={LIMITS.choiceName}
          aria-invalid={invalid || undefined}
          onChange={(event) => {
            setName(event.target.value)
            setInvalid(false)
          }}
          onBlur={() => void commit()}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault()
              event.currentTarget.blur()
            }
          }}
        />
        <Button type="button" variant="ghost" size="icon" aria-label={`Remove the choice ${choice.name}`} onClick={onAskRemove}>
          <Trash2Icon className="size-4" />
        </Button>
      </div>
      {removing ? (
        <div className="grid gap-2 rounded-md border bg-background p-2 text-sm">
          <p>
            Remove {choice.name}? Tasks that picked it keep it, marked "(removed)".
            {dependents.length ? ` ${dependents.join(" and ")} will always show.` : ""}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onCancelRemove}>
              Keep it
            </Button>
            <Button type="button" variant="destructive" size="sm" onClick={() => void onRemove()}>
              Remove choice
            </Button>
          </div>
        </div>
      ) : null}
    </li>
  )
}

/** The steps a new task of this type starts with. */
export function TypeSteps({ type, save }: { type: TaskType; save: Track }) {
  const [text, setText] = React.useState("")
  const full = type.steps.length >= LIMITS.stepsPerTask
  const saveSteps = (steps: string[]) => save(() => saveTaskType({ typeId: type.id, steps }))

  async function add() {
    const next = text.trim()
    if (!next) {
      showErrorToast("Type the step first.")
      return
    }
    if (await saveSteps([...type.steps, next])) setText("")
  }

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Starting steps</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        {type.steps.length ? (
          <ol className="grid gap-2">
            {type.steps.map((step, index) => (
              <li key={`${index}-${step}`} className="flex items-center gap-2 text-sm">
                <span className="min-w-0 flex-1 break-words">
                  {step}
                  {stepFieldNames(type, step) ? (
                    <span className="block text-xs text-muted-foreground">{stepFieldNames(type, step)}</span>
                  ) : null}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove the step "${step}"`}
                  onClick={() => void saveSteps(type.steps.filter((_, i) => i !== index))}
                >
                  <Trash2Icon className="size-4" />
                </Button>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-muted-foreground">
            None. Steps added here fill a new task's Steps when this template is picked.
          </p>
        )}
        {full ? (
          <p className="text-sm text-muted-foreground">That's {LIMITS.stepsPerTask} steps, the most a task can have.</p>
        ) : (
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault()
              void add()
            }}
          >
            <Input
              id={`task-type-${type.id}-new-step`}
              aria-label="New starting step"
              placeholder="Rough cut"
              value={text}
              maxLength={LIMITS.stepText}
              onChange={(event) => setText(event.target.value)}
            />
            <Button type="submit" variant="outline">
              <PlusIcon className="size-4" />
              Add
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  )
}
