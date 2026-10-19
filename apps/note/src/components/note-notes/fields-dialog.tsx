import * as React from "react"
import { closestCenter, DndContext, type DragEndEvent } from "@dnd-kit/core"
import { arrayMove, SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { GripVerticalIcon, Loader2Icon, PlusIcon, SettingsIcon, Trash2Icon, XIcon } from "lucide-react"
import { toast } from "sonner"

import { DRAG_HANDLE_CLASS, useNavSensors, useSortableRow } from "@/components/settings/nav-editor-shared"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
  countFieldUse,
  createNoteField,
  deleteNoteField,
  reorderNoteFields,
  updateNoteField,
} from "@/lib/api/note/notes-folders"
import { getNotesErrorMessage } from "@/lib/api/note/notes"
import { plural } from "@/lib/format/plural"
import { OPTION_COLOUR_LABELS, OPTION_COLOURS, SWATCH_CLASS, type OptionColour } from "@/lib/note/notes/colours"
import {
  FIELD_NAME_MAX,
  MAX_FIELDS_PER_FOLDER,
  NOTE_FIELD_TYPE_LABELS,
  NOTE_FIELD_TYPES,
  OPTION_LABEL_MAX,
  type NoteField,
  type NoteFieldOption,
  type NoteFieldType,
} from "@/lib/note/notes/fields"
import type { NoteFolder } from "@/lib/note/notes/notes"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

type Draft = { name: string; type: NoteFieldType; options: NoteFieldOption[]; remind: boolean }

/** One empty list for a shut window, so it never counts as a change. */
const NO_FIELDS: NoteField[] = []

const BLANK: Draft = { name: "", type: "text", options: [], remind: false }

function draftOf(field: NoteField): Draft {
  return { name: field.name, type: field.type, options: field.options, remind: field.remind }
}

const isChoice = (type: NoteFieldType) => type === "select" || type === "multi_select"

/**
 * A folder's fields, like a Notion database's properties. Every note in the
 * folder shows them under its title. Each change here saves at once, so the
 * window ends with one Done. A field's type cannot change once a note holds a
 * value in it (the default Tyler agreed on 18 Oct 2026); the window says so
 * and a new field is made instead.
 */
export function FieldsDialog({
  folder,
  onClose,
  onChanged,
}: {
  /** The folder whose fields are open, or null when the window is shut. */
  folder: NoteFolder | null
  onClose: () => void
  /** Something changed; the page reads the folders again. */
  onChanged: () => Promise<void> | void
}) {
  const sensors = useNavSensors()
  const [editing, setEditing] = React.useState<string | null>(null)
  const [deleting, setDeleting] = React.useState<{ field: NoteField; uses: number | null } | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [newDraft, setNewDraft] = React.useState<Draft>(BLANK)
  const [newInvalid, setNewInvalid] = React.useState(false)

  const fields = folder?.fields ?? NO_FIELDS
  const [order, setOrder] = React.useState({ from: fields, list: fields })
  if (order.from !== fields) setOrder({ from: fields, list: fields })

  const [shownFor, setShownFor] = React.useState<string | null>(null)
  if ((folder?.id ?? null) !== shownFor) {
    setShownFor(folder?.id ?? null)
    setEditing(null)
    setDeleting(null)
    setNewDraft(BLANK)
    setNewInvalid(false)
  }

  async function run(work: () => Promise<unknown>, success?: string) {
    setBusy(true)
    dismissErrorToast()
    try {
      await work()
      await onChanged()
      if (success) toast.success(success)
      return true
    } catch (error) {
      showErrorToast(getNotesErrorMessage(error))
      return false
    } finally {
      setBusy(false)
    }
  }

  async function create() {
    if (!folder) return
    if (!newDraft.name.trim()) {
      setNewInvalid(true)
      showErrorToast("Give the field a name")
      return
    }
    const ok = await run(() => createNoteField(folder.id, newDraft), `Added “${newDraft.name.trim()}”.`)
    if (ok) setNewDraft(BLANK)
    else setNewInvalid(true)
  }

  async function onDragEnd(event: DragEndEvent) {
    if (!folder || !event.over || event.active.id === event.over.id) return
    const from = order.list.findIndex((field) => field.id === event.active.id)
    const to = order.list.findIndex((field) => field.id === event.over?.id)
    const before = order.list
    const moved = arrayMove(order.list, from, to)
    setOrder((current) => ({ ...current, list: moved }))
    const ok = await run(() => reorderNoteFields(folder.id, moved.map((field) => field.id)))
    if (!ok) setOrder((current) => ({ ...current, list: before }))
  }

  async function askDelete(field: NoteField) {
    setDeleting({ field, uses: null })
    try {
      const uses = await countFieldUse(field.id)
      setDeleting((current) => (current?.field.id === field.id ? { field, uses } : current))
    } catch {
      setDeleting((current) => (current?.field.id === field.id ? { field, uses: -1 } : current))
    }
  }

  return (
    <Dialog
      open={folder !== null}
      onOpenChange={(next) => {
        if (!next && !busy) onClose()
      }}
    >
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>Fields in “{folder?.name}”</DialogTitle>
          <DialogDescription>
            Every note in this folder shows these under its title. Changes save at once.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <Card size="sm">
            <CardHeader>
              <CardTitle>Fields</CardTitle>
              <CardDescription>Drag to change the order notes show them in.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2">
              {order.list.length ? (
                <DndContext id="note-fields" sensors={sensors} collisionDetection={closestCenter} onDragEnd={(event) => void onDragEnd(event)}>
                  <SortableContext items={order.list.map((field) => field.id)} strategy={verticalListSortingStrategy}>
                    <ul aria-label="Fields" className="grid gap-2">
                      {order.list.map((field) => (
                        <FieldRow
                          key={field.id}
                          field={field}
                          busy={busy}
                          editing={editing === field.id}
                          deleting={deleting?.field.id === field.id ? deleting : null}
                          onEdit={() => {
                            setEditing(field.id)
                            setDeleting(null)
                          }}
                          onCancel={() => setEditing(null)}
                          onSave={async (draft) => {
                            const ok = await run(() => updateNoteField(field.id, draft), `Saved “${draft.name.trim()}”.`)
                            if (ok) setEditing(null)
                            return ok
                          }}
                          onAskDelete={() => void askDelete(field)}
                          onCancelDelete={() => setDeleting(null)}
                          onDelete={async () => {
                            const ok = await run(() => deleteNoteField(field.id), `Deleted “${field.name}”.`)
                            if (ok) setDeleting(null)
                          }}
                        />
                      ))}
                    </ul>
                  </SortableContext>
                </DndContext>
              ) : (
                <p className="text-sm text-muted-foreground">No fields yet. Add the first one below.</p>
              )}
            </CardContent>
          </Card>
          {fields.length < MAX_FIELDS_PER_FOLDER ? (
            <Card size="sm">
              <CardHeader>
                <CardTitle>New field</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4">
                <FieldForm
                  idPrefix="note-new-field"
                  draft={newDraft}
                  invalid={newInvalid}
                  onChange={(next) => {
                    setNewDraft(next)
                    setNewInvalid(false)
                  }}
                  onSubmit={() => void create()}
                />
                <div className="flex justify-end">
                  <Button type="button" disabled={busy} onClick={() => void create()}>
                    {busy ? <Loader2Icon className="animate-spin" /> : <PlusIcon />}
                    Add field
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button type="button" size="lg" disabled={busy} onClick={onClose}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function FieldRow({
  field,
  busy,
  editing,
  deleting,
  onEdit,
  onCancel,
  onSave,
  onAskDelete,
  onCancelDelete,
  onDelete,
}: {
  field: NoteField
  busy: boolean
  editing: boolean
  deleting: { uses: number | null } | null
  onEdit: () => void
  onCancel: () => void
  onSave: (draft: Draft) => Promise<boolean>
  onAskDelete: () => void
  onCancelDelete: () => void
  onDelete: () => void
}) {
  const { attributes, listeners, setNodeRef, style } = useSortableRow(field.id)
  const [draft, setDraft] = React.useState<Draft>(() => draftOf(field))
  const [invalid, setInvalid] = React.useState(false)

  return (
    <li ref={setNodeRef} style={style} className="rounded-md border bg-background">
      <div className="flex min-h-10 items-center gap-2 px-2">
        <button type="button" aria-label={`Reorder ${field.name}`} className={cn(DRAG_HANDLE_CLASS, "size-6 shrink-0")} {...attributes} {...listeners}>
          <GripVerticalIcon className="size-3.5" />
        </button>
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{field.name}</span>
        <span className="shrink-0 text-xs text-muted-foreground">
          {NOTE_FIELD_TYPE_LABELS[field.type]}
          {field.remind ? ", reminds you" : ""}
        </span>
        <RowButton
          label={`Change ${field.name}`}
          onClick={() => {
            setDraft(draftOf(field))
            setInvalid(false)
            onEdit()
          }}
        >
          <SettingsIcon />
        </RowButton>
        <RowButton label={`Delete ${field.name}`} onClick={onAskDelete}>
          <Trash2Icon />
        </RowButton>
      </div>
      {deleting ? (
        <div className="grid gap-3 border-t px-3 py-3" role="alert">
          <p className="text-sm">
            {deleting.uses === null
              ? "Checking how many notes use it…"
              : deleting.uses > 0
                ? `${deleting.uses} ${plural(deleting.uses, "note holds a value", "notes hold a value")} in “${field.name}”. Deleting the field deletes those values too.`
                : deleting.uses === 0
                  ? `No note has a value in “${field.name}” yet.`
                  : `Deleting “${field.name}” deletes every value notes hold in it.`}
          </p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" disabled={busy} onClick={onCancelDelete}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" disabled={busy} onClick={onDelete}>
              {busy ? <Loader2Icon className="animate-spin" /> : null}
              Delete field
            </Button>
          </div>
        </div>
      ) : null}
      {editing ? (
        <div className="grid gap-4 border-t px-3 py-3">
          <FieldForm
            idPrefix={`note-field-${field.id}`}
            draft={draft}
            invalid={invalid}
            onChange={(next) => {
              setDraft(next)
              setInvalid(false)
            }}
            onSubmit={() => void onSave(draft).then((ok) => setInvalid(!ok))}
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>
              Cancel
            </Button>
            <Button type="button" disabled={busy} onClick={() => void onSave(draft).then((ok) => setInvalid(!ok))}>
              {busy ? <Loader2Icon className="animate-spin" /> : null}
              Save changes
            </Button>
          </div>
        </div>
      ) : null}
    </li>
  )
}

function FieldForm({
  idPrefix,
  draft,
  invalid,
  onChange,
  onSubmit,
}: {
  idPrefix: string
  draft: Draft
  invalid: boolean
  onChange: (draft: Draft) => void
  onSubmit: () => void
}) {
  return (
    <>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="grid gap-2 sm:flex-1">
          <Label htmlFor={`${idPrefix}-name`}>Name</Label>
          <Input
            id={`${idPrefix}-name`}
            value={draft.name}
            maxLength={FIELD_NAME_MAX}
            placeholder="Status"
            aria-invalid={invalid || undefined}
            onChange={(event) => onChange({ ...draft, name: event.target.value })}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault()
                onSubmit()
              }
            }}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`${idPrefix}-type`}>Type</Label>
          <Select
            value={draft.type}
            onValueChange={(type) =>
              onChange({
                ...draft,
                type: type as NoteFieldType,
                options: isChoice(type as NoteFieldType) ? draft.options : [],
                remind: type === "date" ? draft.remind : false,
              })
            }
          >
            <SelectTrigger id={`${idPrefix}-type`} className="w-full sm:w-fit">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {NOTE_FIELD_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {NOTE_FIELD_TYPE_LABELS[type]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {isChoice(draft.type) ? (
        <OptionsEditor idPrefix={idPrefix} options={draft.options} onChange={(options) => onChange({ ...draft, options })} />
      ) : null}
      {draft.type === "date" ? (
        <div className="flex items-center gap-3">
          <Switch
            id={`${idPrefix}-remind`}
            checked={draft.remind}
            onCheckedChange={(remind) => onChange({ ...draft, remind })}
          />
          <Label htmlFor={`${idPrefix}-remind`} className="font-normal">
            Remind me in the bell on the day, at 9:00 or at the date's own time
          </Label>
        </div>
      ) : null}
    </>
  )
}

/** A choice field's options: a name and a colour each, in order. */
function OptionsEditor({
  idPrefix,
  options,
  onChange,
}: {
  idPrefix: string
  options: NoteFieldOption[]
  onChange: (options: NoteFieldOption[]) => void
}) {
  function update(at: number, patch: Partial<NoteFieldOption>) {
    onChange(options.map((option, index) => (index === at ? { ...option, ...patch } : option)))
  }
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-2 text-sm font-medium">Options</legend>
      {options.map((option, at) => (
        <div key={option.id} className="flex items-center gap-2">
          <ColourPicker colour={option.colour} label={option.label || `Option ${at + 1}`} onPick={(colour) => update(at, { colour })} />
          <Input
            aria-label={`Option ${at + 1}`}
            value={option.label}
            maxLength={OPTION_LABEL_MAX}
            placeholder="To do"
            onChange={(event) => update(at, { label: event.target.value })}
          />
          <RowButton label={`Remove ${option.label || `option ${at + 1}`}`} onClick={() => onChange(options.filter((_, index) => index !== at))}>
            <XIcon />
          </RowButton>
        </div>
      ))}
      <div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            onChange([
              ...options,
              { id: crypto.randomUUID(), label: "", colour: OPTION_COLOURS[options.length % OPTION_COLOURS.length] },
            ])
          }
          id={`${idPrefix}-add-option`}
        >
          <PlusIcon />
          Add option
        </Button>
      </div>
    </fieldset>
  )
}

function ColourPicker({ colour, label, onPick }: { colour: OptionColour; label: string; onPick: (colour: OptionColour) => void }) {
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="outline" size="icon" aria-label={`Colour of ${label}: ${OPTION_COLOUR_LABELS[colour]}`}>
              <span className={cn("size-3.5 rounded-full", SWATCH_CLASS[colour])} />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>Colour</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="start">
        {OPTION_COLOURS.map((each) => (
          <DropdownMenuItem key={each} onSelect={() => onPick(each)}>
            <span className={cn("size-3 rounded-full", SWATCH_CLASS[each])} />
            {OPTION_COLOUR_LABELS[each]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function RowButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button type="button" variant="ghost" size="icon-xs" aria-label={label} onClick={onClick}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}
