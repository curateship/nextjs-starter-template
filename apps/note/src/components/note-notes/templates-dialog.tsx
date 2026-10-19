import * as React from "react"
import type { JSONContent } from "@tiptap/core"
import { closestCenter, DndContext, type DragEndEvent } from "@dnd-kit/core"
import { arrayMove, SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { GripVerticalIcon, Loader2Icon, PlusIcon, SettingsIcon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"

import { FieldInput } from "@/components/note-notes/field-input"
import { NoteEditor } from "@/components/note-notes/note-editor"
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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { getNotesErrorMessage } from "@/lib/api/note/notes"
import {
  createNoteTemplate,
  deleteNoteTemplate,
  loadNoteTemplate,
  reorderNoteTemplates,
  updateNoteTemplate,
} from "@/lib/api/note/notes-folders"
import { parseFieldValue, type NoteFieldValues } from "@/lib/note/notes/fields"
import { NOTE_TITLE_MAX, TEMPLATE_NAME_MAX, type NoteFolder, type NoteTemplate, type NoteTemplateSummary } from "@/lib/note/notes/notes"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

/** One empty list for a shut window, so it never counts as a change. */
const NO_TEMPLATES: NoteTemplateSummary[] = []

const NO_LINKS = {}

/**
 * A folder's templates (Tyler, 18 Oct 2026: they belong to a folder). Each
 * is a title, field values and text that a new note in the folder starts
 * with. New note in the folder then offers "Blank" and each of these.
 */
export function TemplatesDialog({
  folder,
  onClose,
  onChanged,
}: {
  folder: NoteFolder | null
  onClose: () => void
  onChanged: () => Promise<void> | void
}) {
  const sensors = useNavSensors()
  const [busy, setBusy] = React.useState(false)
  const [name, setName] = React.useState("")
  const [nameInvalid, setNameInvalid] = React.useState(false)
  const [editing, setEditing] = React.useState<NoteTemplate | null>(null)
  const [loadingId, setLoadingId] = React.useState<string | null>(null)
  const [deletingId, setDeletingId] = React.useState<string | null>(null)

  const templates = folder?.templates ?? NO_TEMPLATES
  const [order, setOrder] = React.useState({ from: templates, list: templates })
  if (order.from !== templates) setOrder({ from: templates, list: templates })

  const [shownFor, setShownFor] = React.useState<string | null>(null)
  if ((folder?.id ?? null) !== shownFor) {
    setShownFor(folder?.id ?? null)
    setEditing(null)
    setName("")
    setNameInvalid(false)
    setDeletingId(null)
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
    if (!name.trim()) {
      setNameInvalid(true)
      showErrorToast("Give the template a name")
      return
    }
    let made: NoteTemplate | null = null
    const ok = await run(async () => {
      made = await createNoteTemplate(folder.id, name)
    }, `Made “${name.trim()}”. Fill it in below.`)
    if (ok) {
      setName("")
      setEditing(made)
    } else setNameInvalid(true)
  }

  async function open(template: NoteTemplateSummary) {
    setLoadingId(template.id)
    try {
      setEditing(await loadNoteTemplate(template.id))
    } catch (error) {
      showErrorToast(getNotesErrorMessage(error))
    } finally {
      setLoadingId(null)
    }
  }

  async function onDragEnd(event: DragEndEvent) {
    if (!folder || !event.over || event.active.id === event.over.id) return
    const from = order.list.findIndex((each) => each.id === event.active.id)
    const to = order.list.findIndex((each) => each.id === event.over?.id)
    const before = order.list
    const moved = arrayMove(order.list, from, to)
    setOrder((current) => ({ ...current, list: moved }))
    const ok = await run(() => reorderNoteTemplates(folder.id, moved.map((each) => each.id)))
    if (!ok) setOrder((current) => ({ ...current, list: before }))
  }

  return (
    <Dialog
      open={folder !== null}
      onOpenChange={(next) => {
        if (!next && !busy) onClose()
      }}
    >
      <DialogContent variant="admin" className={editing ? "sm:max-w-4xl" : undefined}>
        <DialogHeader>
          <DialogTitle>{editing ? `Template: ${editing.name}` : `Templates in “${folder?.name}”`}</DialogTitle>
          <DialogDescription>
            {editing
              ? "A new note made from this template starts with this title, these values and this text."
              : "New note in this folder offers Blank and each template here."}
          </DialogDescription>
        </DialogHeader>
        {editing && folder ? (
          <TemplateEditor
            key={editing.id}
            template={editing}
            folder={folder}
            busy={busy}
            onBack={() => setEditing(null)}
            onSave={(changes) =>
              run(() => updateNoteTemplate(editing.id, changes), `Saved “${changes.name.trim()}”.`).then((ok) => {
                if (ok) setEditing(null)
              })
            }
          />
        ) : (
          <>
            <DialogBody>
              <Card size="sm">
                <CardHeader>
                  <CardTitle>Templates</CardTitle>
                  <CardDescription>Drag to change the order New note lists them in.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-2">
                  {order.list.length ? (
                    <DndContext id="note-templates" sensors={sensors} collisionDetection={closestCenter} onDragEnd={(event) => void onDragEnd(event)}>
                      <SortableContext items={order.list.map((each) => each.id)} strategy={verticalListSortingStrategy}>
                        <ul aria-label="Templates" className="grid gap-2">
                          {order.list.map((template) => (
                            <TemplateRow
                              key={template.id}
                              template={template}
                              busy={busy}
                              loading={loadingId === template.id}
                              confirming={deletingId === template.id}
                              onOpen={() => void open(template)}
                              onAskDelete={() => setDeletingId(template.id)}
                              onCancelDelete={() => setDeletingId(null)}
                              onDelete={() =>
                                void run(() => deleteNoteTemplate(template.id), `Deleted “${template.name}”.`).then((ok) => {
                                  if (ok) setDeletingId(null)
                                })
                              }
                            />
                          ))}
                        </ul>
                      </SortableContext>
                    </DndContext>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No templates yet. Make one here, or use Save as template on a note in this folder.
                    </p>
                  )}
                </CardContent>
              </Card>
              <Card size="sm">
                <CardHeader>
                  <CardTitle>New template</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-2">
                  <Label htmlFor="note-new-template">Name</Label>
                  <div className="flex gap-2">
                    <Input
                      id="note-new-template"
                      value={name}
                      maxLength={TEMPLATE_NAME_MAX}
                      placeholder="Book review"
                      aria-invalid={nameInvalid || undefined}
                      onChange={(event) => {
                        setName(event.target.value)
                        setNameInvalid(false)
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault()
                          void create()
                        }
                      }}
                    />
                    <Button type="button" disabled={busy} onClick={() => void create()}>
                      <PlusIcon />
                      Create template
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </DialogBody>
            <DialogFooter>
              <Button type="button" size="lg" disabled={busy} onClick={onClose}>
                Done
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

function TemplateRow({
  template,
  busy,
  loading,
  confirming,
  onOpen,
  onAskDelete,
  onCancelDelete,
  onDelete,
}: {
  template: NoteTemplateSummary
  busy: boolean
  loading: boolean
  confirming: boolean
  onOpen: () => void
  onAskDelete: () => void
  onCancelDelete: () => void
  onDelete: () => void
}) {
  const { attributes, listeners, setNodeRef, style } = useSortableRow(template.id)
  return (
    <li ref={setNodeRef} style={style} className="rounded-md border bg-background">
      <div className="flex min-h-10 items-center gap-2 px-2">
        <button type="button" aria-label={`Reorder ${template.name}`} className={cn(DRAG_HANDLE_CLASS, "size-6 shrink-0")} {...attributes} {...listeners}>
          <GripVerticalIcon className="size-3.5" />
        </button>
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{template.name}</span>
        {loading ? <Loader2Icon className="size-4 animate-spin" /> : null}
        <RowButton label={`Change ${template.name}`} onClick={onOpen}>
          <SettingsIcon />
        </RowButton>
        <RowButton label={`Delete ${template.name}`} onClick={onAskDelete}>
          <Trash2Icon />
        </RowButton>
      </div>
      {confirming ? (
        <div className="flex flex-wrap items-center justify-end gap-2 border-t px-3 py-3" role="alert">
          <p className="mr-auto text-sm">Delete “{template.name}”? Notes made from it stay as they are.</p>
          <Button type="button" variant="outline" disabled={busy} onClick={onCancelDelete}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" disabled={busy} onClick={onDelete}>
            Delete template
          </Button>
        </div>
      ) : null}
    </li>
  )
}

function TemplateEditor({
  template,
  folder,
  busy,
  onBack,
  onSave,
}: {
  template: NoteTemplate
  folder: NoteFolder
  busy: boolean
  onBack: () => void
  onSave: (changes: { name: string; title: string; body: JSONContent; values: NoteFieldValues }) => void
}) {
  const [name, setName] = React.useState(template.name)
  const [title, setTitle] = React.useState(template.title)
  const [values, setValues] = React.useState<NoteFieldValues>(template.values)
  const body = React.useRef<JSONContent>(template.body)

  return (
    <>
      <DialogBody>
        <Card size="sm">
          <CardHeader>
            <CardTitle>Template</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="flex flex-col gap-4 sm:flex-row">
              <div className="grid gap-2 sm:flex-1">
                <Label htmlFor="note-template-name">Template name</Label>
                <Input id="note-template-name" value={name} maxLength={TEMPLATE_NAME_MAX} onChange={(event) => setName(event.target.value)} />
              </div>
              <div className="grid gap-2 sm:flex-1">
                <Label htmlFor="note-template-title">New notes start titled</Label>
                <Input
                  id="note-template-title"
                  value={title}
                  maxLength={NOTE_TITLE_MAX}
                  placeholder="Untitled"
                  onChange={(event) => setTitle(event.target.value)}
                />
              </div>
            </div>
          </CardContent>
        </Card>
        {folder.fields.length ? (
          <Card size="sm">
            <CardHeader>
              <CardTitle>Field values</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              {folder.fields.map((field) => (
                <div key={field.id} className="grid gap-2 sm:grid-cols-[10rem_minmax(0,1fr)] sm:items-center">
                  <Label htmlFor={`note-template-field-${field.id}`}>{field.name}</Label>
                  <FieldInput
                    id={`note-template-field-${field.id}`}
                    field={field}
                    value={values[field.key]}
                    onSave={async (value) => {
                      const parsed = parseFieldValue(field, value)
                      if (!parsed.ok) {
                        showErrorToast(parsed.reason)
                        return false
                      }
                      setValues((current) => {
                        const next = { ...current }
                        if (parsed.value === null) delete next[field.key]
                        else next[field.key] = parsed.value
                        return next
                      })
                      return true
                    }}
                  />
                </div>
              ))}
            </CardContent>
          </Card>
        ) : null}
        <Card size="sm">
          <CardHeader>
            <CardTitle>Text</CardTitle>
          </CardHeader>
          <CardContent>
            <NoteEditor
              noteId={template.id}
              initial={template.body}
              editable
              linkTitles={NO_LINKS}
              onChange={(next) => {
                body.current = next
              }}
            />
          </CardContent>
        </Card>
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="outline" size="lg" disabled={busy} onClick={onBack}>
          Back to templates
        </Button>
        <Button type="button" size="lg" disabled={busy} onClick={() => onSave({ name, title, body: body.current, values })}>
          {busy ? <Loader2Icon className="animate-spin" /> : null}
          Save changes
        </Button>
      </DialogFooter>
    </>
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
