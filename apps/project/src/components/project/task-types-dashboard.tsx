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
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  GripVerticalIcon,
  ListChecksIcon,
  Loader2Icon,
  PlusIcon,
  SettingsIcon,
  ShapesIcon,
} from "lucide-react"

import { ProjectColorSelect } from "@/components/project/project-form-fields"
import { SaveLine } from "@/components/project/save-line"
import { TaskNotesField } from "@/components/project/task-notes"
import {
  NewFieldDialog,
  TypeBasicsCard,
  TypeFields,
  TypeSteps,
  type Track,
} from "@/components/project/task-type-editor"
import { TypeIconGlyph, TypeIconSelect } from "@/components/project/task-type-icon"
import { ThreePanels } from "@/components/project/three-panels"
import { DashboardCardTitleHeader } from "@/components/shared/dashboard-card-header"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
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
import { ScrollArea } from "@/components/ui/scroll-area"
import { archiveType, makeTaskType, orderTaskTypes, saveTaskType } from "@/lib/api/project/task-types"
import { plural } from "@/lib/format/plural"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { useSyncedDraft } from "@/lib/hooks/use-synced-draft"
import { getProjectErrorMessage } from "@/lib/project/errors"
import { TASK_TYPES_PANEL_LAYOUT_KEY } from "@/lib/project/panel-keys"
import { LIMITS, runsTheTeam, type ProjectColor, type TeamRole } from "@/lib/project/rules"
import {
  FIELD_KIND_INFO,
  liveChoices,
  WHO_CAN_CHANGE_LABEL,
  type FieldRule,
} from "@/lib/project/task-fields"
import type { TaskType, TypeIcon } from "@/lib/project/task-types"
import { useSaveLine } from "@/lib/project/use-save-line"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

type TaskTypesPage = { myRole: TeamRole; types: TaskType[] }

/**
 * The Task types dashboard at `/task-types`, in the left menu after Team
 * (Tyler, 12 Oct 2026: "tasks type should have its own dashboard"). The
 * team's types on the left, with "+" and a cog for the picked type in its
 * header, the picked type's fields in the middle, and the
 * steps and notes a new task of that type starts with on the right. The
 * picked type is in the address (`?type=<id>`). Everyone on the team reads
 * it; the owner and admins change it, and each change saves at once with
 * Saving…, Saved or Not saved in the middle panel's header.
 */
export function TaskTypesDashboard({
  page,
  selectedId,
  onSelect,
}: {
  page: TaskTypesPage
  selectedId: string | undefined
  onSelect: (typeId: string) => void
}) {
  const router = useRouter()
  const canEdit = runsTheTeam(page.myRole)
  const [saveState, track] = useSaveLine()
  const save: Track = React.useCallback(
    async (work) => {
      const ok = await track(work)
      if (ok) await router.invalidate()
      return ok
    },
    [router, track]
  )
  const live = page.types.filter((type) => !type.archived)
  const selected =
    page.types.find((type) => type.id === selectedId) ?? live[0] ?? page.types[0] ?? null

  return (
    <ThreePanels
      layoutKey={TASK_TYPES_PANEL_LAYOUT_KEY}
      showMiddleFor={selectedId}
      left={{
        label: "Types",
        showLabel: "Show the task types",
        content: (
          <TypesListPanel
            types={page.types}
            selected={selected}
            canEdit={canEdit}
            save={save}
            onSelect={onSelect}
          />
        ),
      }}
      middle={{
        label: "Fields",
        content: <TypePanel type={selected} canEdit={canEdit} save={save} saveState={saveState} />,
      }}
      right={{
        label: "Starts with",
        showLabel: "Show the starting steps and notes",
        content: <StartsWithPanel type={selected} canEdit={canEdit} save={save} />,
      }}
    />
  )
}

/**
 * The team's types in order, then the archived ones. The owner and admins
 * add one with the "+" in the header, change the picked one with the cog
 * beside it, and drag a type by its handle to change the order (Tyler, 12 Oct
 * 2026). The new order shows at once, goes back if the save is refused, and
 * nothing can be dragged while it saves.
 */
function TypesListPanel({
  types,
  selected,
  canEdit,
  save,
  onSelect,
}: {
  types: TaskType[]
  selected: TaskType | null
  canEdit: boolean
  save: Track
  onSelect: (typeId: string) => void
}) {
  const live = types.filter((type) => !type.archived)
  const archived = types.filter((type) => type.archived)
  const [creating, setCreating] = React.useState(false)
  const [editing, setEditing] = React.useState(false)
  // Ids joined into one string, so a fresh copy of the same order doesn't reset the drag.
  const [orderKey, setOrderKey] = useSyncedDraft(live.map((type) => type.id).join(","))
  const [ordering, setOrdering] = React.useState(false)
  const byId = new Map(live.map((type) => [type.id, type]))
  const ordered = orderKey.split(",").flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []))
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))
  const dndId = React.useId()
  const full = types.length >= LIMITS.typesPerTeam

  async function handleDragEnd(event: DragEndEvent) {
    const overId = event.over?.id
    if (overId === undefined || overId === event.active.id) return
    const ids = ordered.map((type) => type.id)
    const next = arrayMove(ids, ids.indexOf(String(event.active.id)), ids.indexOf(String(overId)))
    const before = orderKey
    setOrderKey(next.join(","))
    setOrdering(true)
    const ok = await save(() => orderTaskTypes(next))
    setOrdering(false)
    if (!ok) setOrderKey(before)
  }

  return (
    <>
      <DashboardCardTitleHeader
        icon={<ShapesIcon className="size-4" />}
        title="Task types"
        action={
          canEdit ? (
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="New task type"
                onClick={() =>
                  full
                    ? showErrorToast(
                        `A team can have at most ${LIMITS.typesPerTeam} task types, archived ones included.`
                      )
                    : setCreating(true)
                }
              >
                <PlusIcon className="size-4" />
              </Button>
              {selected ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`${selected.name} settings`}
                  onClick={() => setEditing(true)}
                >
                  <SettingsIcon className="size-4" />
                </Button>
              ) : null}
            </div>
          ) : null
        }
      />
      <ScrollArea className="min-h-0 flex-1" viewportClassName="h-full">
        {live.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">
            {canEdit
              ? 'No task types yet. Add one with the + above, such as "Research" or "Video editing".'
              : "No task types yet. The owner and admins add them here."}
          </p>
        ) : (
          <DndContext
            id={dndId}
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={(event) => void handleDragEnd(event)}
          >
            <SortableContext items={ordered.map((type) => type.id)} strategy={verticalListSortingStrategy}>
              <ul className="divide-y border-b">
                {ordered.map((type) => (
                  <TypeListRow
                    key={type.id}
                    type={type}
                    selected={type.id === selected?.id}
                    onSelect={() => onSelect(type.id)}
                    drag={canEdit ? { disabled: ordering || ordered.length < 2 } : null}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        )}
        {archived.length ? (
          <div>
            <p className="px-3 pt-3 text-sm font-medium">Archived</p>
            <p className="px-3 pb-2 text-xs text-muted-foreground">
              Not offered for new tasks. Tasks that have one keep it.
            </p>
            <ul className="divide-y border-y">
              {archived.map((type) => (
                <TypeListRow
                  key={type.id}
                  type={type}
                  selected={type.id === selected?.id}
                  onSelect={() => onSelect(type.id)}
                  drag={null}
                />
              ))}
            </ul>
          </div>
        ) : null}
      </ScrollArea>
      <NewTypeDialog
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(typeId) => onSelect(typeId)}
      />
      {selected ? (
        <TypeSettingsDialog key={selected.id} type={selected} open={editing} onClose={() => setEditing(false)} />
      ) : null}
    </>
  )
}

/**
 * One type in the list: its name, and how many fields it has as a number at
 * the end (Tyler, 12 Oct 2026, who also had the icons removed). With `drag`,
 * a handle on the left moves it up or down.
 */
function TypeListRow({
  type,
  selected,
  onSelect,
  drag,
}: {
  type: TaskType
  selected: boolean
  onSelect: () => void
  drag: { disabled: boolean } | null
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: type.id, disabled: !drag || drag.disabled })
  const style: React.CSSProperties | undefined = transform
    ? { transform: `translate3d(0, ${transform.y}px, 0)`, transition }
    : undefined
  return (
    <li
      ref={drag ? setNodeRef : undefined}
      style={drag ? style : undefined}
      // The hover covers the whole row, handle included.
      className={cn(
        "flex items-center hover:bg-muted/60",
        selected && "bg-muted hover:bg-muted",
        isDragging && "relative z-10 bg-background shadow-md"
      )}
    >
      {drag ? (
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...listeners}
          {...attributes}
          disabled={drag.disabled}
          aria-label={`Drag ${type.name} to change the order`}
          className="ml-2 flex size-6 shrink-0 cursor-grab items-center justify-center rounded text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-default disabled:opacity-50"
        >
          <GripVerticalIcon className="size-4" aria-hidden />
        </button>
      ) : null}
      <button
        type="button"
        aria-current={selected || undefined}
        onClick={onSelect}
        className={cn(
          "flex min-w-0 flex-1 items-center gap-3 py-2.5 pr-3 text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
          drag ? "pl-2" : "pl-3"
        )}
      >
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{type.name}</span>
        {/* How many fields, as a number at the row's end (Tyler, 12 Oct 2026). */}
        <span className="shrink-0 text-sm text-muted-foreground tabular-nums">
          {type.fields.length}
          <span className="sr-only"> {plural(type.fields.length, "field")}</span>
        </span>
      </button>
    </li>
  )
}

/** A new type: its name, icon and colour. It opens on the dashboard, ready for its fields. */
function NewTypeDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: (typeId: string) => void
}) {
  const router = useRouter()
  const [name, setName] = React.useState("")
  const [icon, setIcon] = React.useState<TypeIcon>("file")
  const [color, setColor] = React.useState<ProjectColor>("blue")
  const [invalid, setInvalid] = React.useState(false)
  const [run, busy] = useAsyncAction(getProjectErrorMessage)

  function close() {
    setName("")
    setIcon("file")
    setColor("blue")
    setInvalid(false)
    onClose()
  }

  async function submit() {
    const next = name.trim()
    if (!next) {
      setInvalid(true)
      showErrorToast("Give the type a name.")
      return
    }
    let made: { id: string } | null = null
    const ok = await run(async () => {
      made = await makeTaskType({ name: next, icon, color })
    }, "Task type created.")
    if (!ok || !made) {
      setInvalid(true)
      return
    }
    close()
    await router.invalidate()
    onCreated((made as { id: string }).id)
  }

  return (
    <FormDialog open={open} dirty={Boolean(name.trim())} busy={busy} onClose={close}>
      {(requestClose) => (
        <DialogContent variant="admin" className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New task type</DialogTitle>
            <DialogDescription>
              A kind of task, such as "Research" or "Video editing". Give it fields once it's made.
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
                  <CardTitle>Type</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="new-type-name">Name</Label>
                    <Input
                      id="new-type-name"
                      value={name}
                      maxLength={LIMITS.typeName}
                      placeholder="Research"
                      aria-invalid={invalid || undefined}
                      onChange={(event) => {
                        setName(event.target.value)
                        setInvalid(false)
                      }}
                    />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="grid gap-2">
                      <Label htmlFor="new-type-icon">Icon</Label>
                      <TypeIconSelect id="new-type-icon" value={icon} color={color} onChange={setIcon} />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="new-type-color">Colour</Label>
                      <ProjectColorSelect id="new-type-color" value={color} onChange={setColor} />
                    </div>
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
                Create task type
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      )}
    </FormDialog>
  )
}

/**
 * The picked type's name, icon and colour, and Archive or Bring back, in a
 * window opened from the cog. Each change saves as it is made, with the
 * Saving… line at the top of the window, so it ends with Done.
 */
function TypeSettingsDialog({
  type,
  open,
  onClose,
}: {
  type: TaskType
  open: boolean
  onClose: () => void
}) {
  const router = useRouter()
  const [saveState, track] = useSaveLine()
  const save: Track = React.useCallback(
    async (work) => {
      const ok = await track(work)
      if (ok) await router.invalidate()
      return ok
    },
    [router, track]
  )
  // The name saves when it is left, so it is left first: Escape or a click
  // outside would otherwise close the window over it.
  function close() {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? null : close())}>
      <DialogContent variant="admin" className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Task type settings</DialogTitle>
          <DialogDescription className="flex items-center justify-between gap-2">
            Changes save as you make them.
            <SaveLine state={saveState} />
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <TypeBasicsCard type={type} save={save} />
          <Card size="sm">
            <CardHeader>
              <CardTitle>{type.archived ? "Archived" : "Archive"}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <p className="text-sm text-muted-foreground">
                {type.archived
                  ? "New tasks can't pick it. Bring it back to offer it again."
                  : "Archiving takes it out of New task and the type picker. Tasks that have it keep it, with every value."}
              </p>
              <div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void save(() => archiveType(type.id, !type.archived))}
                >
                  {type.archived ? <ArchiveRestoreIcon className="size-4" /> : <ArchiveIcon className="size-4" />}
                  {type.archived ? "Bring back" : "Archive type"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </DialogBody>
        <DialogFooter>
          <Button type="button" onClick={close}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** The picked type's fields with their settings. Its name, icon and colour are behind the cog. */
function TypePanel({
  type,
  canEdit,
  save,
  saveState,
}: {
  type: TaskType | null
  canEdit: boolean
  save: Track
  saveState: ReturnType<typeof useSaveLine>[0]
}) {
  const [addingField, setAddingField] = React.useState(false)
  if (!type) {
    return (
      <>
        <DashboardCardTitleHeader icon={<ShapesIcon className="size-4" />} title="Fields" />
        <p className="p-4 text-sm text-muted-foreground">
          {canEdit
            ? "Add a type with the + on the left, then Add field here gives it what that kind of work needs."
            : "When the team has task types, their fields show here."}
        </p>
      </>
    )
  }
  return (
    <>
      <DashboardCardTitleHeader
        icon={<TypeIconGlyph icon={type.icon} />}
        title={<span className="truncate">{type.name}</span>}
        meta={canEdit ? <SaveLine state={saveState} /> : null}
        action={
          canEdit ? (
            <Button
              type="button"
              onClick={() =>
                type.fields.length >= LIMITS.fieldsPerType
                  ? showErrorToast(`A task type can have at most ${LIMITS.fieldsPerType} fields.`)
                  : setAddingField(true)
              }
            >
              <PlusIcon className="size-4" />
              Add field
            </Button>
          ) : null
        }
      />
      <ScrollArea className="min-h-0 flex-1" viewportClassName="h-full">
        <div className="grid gap-4 p-4">
          {type.archived ? (
            <p className="text-sm text-muted-foreground">
              Archived. New tasks can't pick it, and tasks that have it keep it with every value.
            </p>
          ) : null}
          {canEdit ? (
            <TypeFields key={`fields-${type.id}`} type={type} save={save} />
          ) : (
            <ReadFieldsCard type={type} />
          )}
        </div>
      </ScrollArea>
      {canEdit ? (
        <NewFieldDialog key={type.id} type={type} open={addingField} onClose={() => setAddingField(false)} />
      ) : null}
    </>
  )
}

/** A type's fields as words, for everyone who can't change them. */
function ReadFieldsCard({ type }: { type: TaskType }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Fields</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        {type.fields.length === 0 ? (
          <p className="text-sm text-muted-foreground">No fields yet.</p>
        ) : (
          <ul className="grid gap-3">
            {type.fields.map((field) => (
              <li key={field.id} className="grid gap-0.5">
                <span className="text-sm font-medium">{field.name}</span>
                <span className="text-xs text-muted-foreground">{fieldSummary(field, type.fields)}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

/** "Dropdown · Needed before Done · Only the person assigned · YouTube, TikTok". */
function fieldSummary(field: FieldRule, siblings: readonly FieldRule[]) {
  const parts: string[] = [FIELD_KIND_INFO[field.kind].label]
  if (field.neededBeforeDone) parts.push("Needed before Done")
  if (field.neededWhenMade) parts.push("Needed when made")
  if (field.whoCanChange !== "anyone") parts.push(WHO_CAN_CHANGE_LABEL[field.whoCanChange])
  const when = field.settings.showWhen
  const controller = when ? siblings.find((other) => other.id === when.fieldId) : undefined
  const choice = controller?.settings.choices?.find((c) => c.id === when?.choiceId && !c.removed)
  if (controller && choice) parts.push(`Only when ${controller.name} is ${choice.name}`)
  const choices = liveChoices(field.settings)
  if (field.kind === "dropdown" && choices.length) parts.push(choices.map((c) => c.name).join(", "))
  return parts.join(" · ")
}

/** The steps and notes a new task of the picked type starts with. */
function StartsWithPanel({
  type,
  canEdit,
  save,
}: {
  type: TaskType | null
  canEdit: boolean
  save: Track
}) {
  return (
    <>
      <DashboardCardTitleHeader icon={<ListChecksIcon className="size-4" />} title="Starts with" />
      <ScrollArea className="min-h-0 flex-1" viewportClassName="h-full">
        {type ? (
          <div className="grid gap-4 p-4">
            <p className="text-sm text-muted-foreground">
              Picking {type.name} in New task fills its steps and notes with these. They can still be
              changed before the task is made.
            </p>
            {canEdit ? (
              <TypeSteps key={type.id} type={type} save={save} />
            ) : (
              <Card size="sm">
                <CardHeader>
                  <CardTitle>Starting steps</CardTitle>
                </CardHeader>
                <CardContent>
                  {type.steps.length ? (
                    <ol className="grid list-decimal gap-1 pl-5 text-sm">
                      {type.steps.map((step, index) => (
                        <li key={`${index}-${step}`} className="break-words">
                          {step}
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="text-sm text-muted-foreground">None.</p>
                  )}
                </CardContent>
              </Card>
            )}
            <Card size="sm">
              <CardContent>
                <TaskNotesField
                  key={type.id}
                  notes={type.notes}
                  readOnly={!canEdit}
                  label="Starting notes"
                  labelId="task-type-notes"
                  onSave={(notes) => save(() => saveTaskType({ typeId: type.id, notes }))}
                />
              </CardContent>
            </Card>
          </div>
        ) : (
          <p className="p-4 text-sm text-muted-foreground">Pick a type to see what it starts with.</p>
        )}
      </ScrollArea>
    </>
  )
}
