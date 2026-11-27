import * as React from "react"
import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core"
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { GripVertical, Loader2Icon, PlusIcon, Trash2Icon } from "lucide-react"

import { DRAG_HANDLE_CLASS, reorderByDrag, useNavSensors, useSortableRow } from "@/components/settings/nav-editor-shared"
import { Hint } from "@/components/social/hint"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import {
  arrangeYoutubeTemplateOrder,
  getYoutubeErrorMessage,
  newYoutubeTemplate,
  removeYoutubeTemplate,
  saveYoutubeTemplate,
  type YoutubeTemplateRow,
} from "@/lib/api/social/youtube"
import {
  TEMPLATE_NAME_MAX,
  TEMPLATE_SECTION_KIND_WORDS,
  TEMPLATE_SECTION_NAME_MAX,
  TEMPLATE_SECTIONS_MAX,
  type TemplateSection,
  type TemplateSectionKind,
} from "@/lib/social/youtube/options"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"

const SAVE_DELAY_MS = 700

/** A new template's sections, Tyler's own example of 26 Nov 2026 without the links, which only he can type. */
const STARTING_SECTIONS: TemplateSection[] = [
  { name: "Hook", kind: "ai", text: "One or two lines on what the viewer gets from watching." },
  { name: "What it covers", kind: "ai", text: "A short list of what the video shows, in order." },
  { name: "Sign-off", kind: "fixed", text: "Thanks for watching. Subscribe for the next one." },
]

/** Why a section cannot be saved as it is, or null. Checked before a save goes out, so nothing half-typed is refused. */
function sectionProblem(section: TemplateSection): string | null {
  if (!section.name.trim()) return "Give the section a name."
  if (section.kind === "fixed" && !section.text.trim()) return "Fixed words need their words."
  return null
}

/**
 * Templates, from the YouTube module's middle header (YouTube task, part 6).
 * Tyler, 26 Nov 2026: "I want to have discription templates so we can use
 * similiar structure every time for certain video". Each is this project's
 * own, a name and a list of sections in order, each Fixed words or AI writes
 * it. Everything saves itself 700ms after the last letter; a section still
 * missing its name or its words waits, marked, until it has them. Templates
 * and sections reorder by their handles. Deleting a template asks first.
 *
 * The open window is in the address as `?window=templates`, as Jobs is.
 */
export function YoutubeTemplatesWindow({
  open,
  projectId,
  templates,
  onClose,
  onChanged,
}: {
  open: boolean
  projectId: string
  templates: YoutubeTemplateRow[]
  onClose: () => void
  onChanged: () => Promise<void>
}) {
  // Held here while the window is open, so typing never waits on a reload.
  const [rows, setRows] = React.useState(templates)
  const [adding, setAdding] = React.useState(false)
  const [deleting, setDeleting] = React.useState<YoutubeTemplateRow | null>(null)
  const [busy, setBusy] = React.useState(false)
  const sensors = useNavSensors()
  const timers = React.useRef(new Map<string, ReturnType<typeof setTimeout>>())
  /** Each template's save still waiting on its 700ms, sent at once when the window closes or the page goes. */
  const pending = React.useRef(new Map<string, () => void>())

  // A fresh list from the server each time the window opens.
  const [wasOpen, setWasOpen] = React.useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setRows(templates)
  }

  /** Sends every save still waiting, now. */
  const flush = React.useCallback(() => {
    for (const timer of timers.current.values()) clearTimeout(timer)
    timers.current.clear()
    const saves = [...pending.current.values()]
    pending.current.clear()
    for (const save of saves) save()
  }, [])

  // Leaving the page never drops the last edit.
  React.useEffect(() => flush, [flush])

  function change(id: string, patch: Partial<Pick<YoutubeTemplateRow, "name" | "sections">>) {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)))
    const next = { ...rows.find((row) => row.id === id), ...patch } as YoutubeTemplateRow
    clearTimeout(timers.current.get(id))
    timers.current.delete(id)
    pending.current.delete(id)
    // Only a whole template goes out: a name, and every section with its name and, for fixed words, its words.
    if (!next.name.trim() || next.sections.some((section) => sectionProblem(section))) return
    const save = () => {
      dismissErrorToast()
      saveYoutubeTemplate({ id, name: next.name, sections: next.sections }).then(
        () => void onChanged(),
        (failure: unknown) => showErrorToast(getYoutubeErrorMessage(failure))
      )
    }
    pending.current.set(id, save)
    timers.current.set(
      id,
      setTimeout(() => {
        timers.current.delete(id)
        pending.current.delete(id)
        save()
      }, SAVE_DELAY_MS)
    )
  }

  function close() {
    flush()
    onClose()
  }

  async function add() {
    setAdding(true)
    try {
      const made = await newYoutubeTemplate({ projectId, name: `Template ${rows.length + 1}`, sections: STARTING_SECTIONS })
      setRows((current) => [...current, made])
      await onChanged()
    } catch (failure) {
      showErrorToast(getYoutubeErrorMessage(failure))
    } finally {
      setAdding(false)
    }
  }

  async function arrange(event: DragEndEvent) {
    const next = reorderByDrag(rows, rows.map((row) => row.id), event)
    if (!next) return
    const before = rows
    setRows(next)
    try {
      await arrangeYoutubeTemplateOrder(projectId, next.map((row) => row.id))
      await onChanged()
    } catch (failure) {
      setRows(before)
      showErrorToast(getYoutubeErrorMessage(failure))
    }
  }

  async function confirmDelete() {
    if (!deleting) return
    setBusy(true)
    try {
      clearTimeout(timers.current.get(deleting.id))
      timers.current.delete(deleting.id)
      pending.current.delete(deleting.id)
      await removeYoutubeTemplate(deleting.id)
      setRows((current) => current.filter((row) => row.id !== deleting.id))
      setDeleting(null)
      await onChanged()
    } catch (failure) {
      showErrorToast(getYoutubeErrorMessage(failure))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>Description templates</DialogTitle>
          <DialogDescription>
            A layout for the description of a kind of video. Write copies Fixed words as typed and has the AI write the other sections, in this order.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          {rows.length ? (
            <DndContext id="promo-youtube-templates" sensors={sensors} collisionDetection={closestCenter} onDragEnd={(event) => void arrange(event)}>
              <SortableContext items={rows.map((row) => row.id)} strategy={verticalListSortingStrategy}>
                {rows.map((row) => (
                  <TemplateCard key={row.id} row={row} onChange={(patch) => change(row.id, patch)} onDelete={() => setDeleting(row)} />
                ))}
              </SortableContext>
            </DndContext>
          ) : (
            <Card size="sm">
              <CardContent>
                <p className="text-sm text-muted-foreground">This project has no templates yet. Press New template to make one from a starting layout.</p>
              </CardContent>
            </Card>
          )}
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={adding} onClick={() => void add()}>
            {adding ? <Loader2Icon className="animate-spin" /> : <PlusIcon />}
            New template
          </Button>
          <Button type="button" onClick={close}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(next) => (next ? null : setDeleting(null))}
        title={`Delete ${deleting?.name ?? "this template"}?`}
        description="It can't be brought back. Videos already written with it keep their descriptions."
        confirmLabel="Delete template"
        loading={busy}
        onConfirm={() => void confirmDelete()}
      />
    </Dialog>
  )
}

/** One template: its handle, name and Delete, then its sections. */
function TemplateCard({
  row,
  onChange,
  onDelete,
}: {
  row: YoutubeTemplateRow
  onChange: (patch: Partial<Pick<YoutubeTemplateRow, "name" | "sections">>) => void
  onDelete: () => void
}) {
  const { attributes, listeners, setNodeRef, style } = useSortableRow(row.id, true)
  const sensors = useNavSensors()
  const sectionIds = row.sections.map((_, index) => `${row.id}:${index}`)

  function changeSection(index: number, patch: Partial<TemplateSection>) {
    onChange({ sections: row.sections.map((section, at) => (at === index ? { ...section, ...patch } : section)) })
  }

  return (
    <div ref={setNodeRef} style={style}>
      <Card size="sm">
        <CardHeader>
          <CardTitle className="flex min-w-0 items-center gap-1">
            <button type="button" {...attributes} {...listeners} className={DRAG_HANDLE_CLASS} aria-label={`Reorder ${row.name || "this template"}`}>
              <GripVertical className="size-4" />
            </button>
            <span className="truncate">{row.name || "A template with no name"}</span>
          </CardTitle>
          <CardAction>
            <Hint label={`Delete ${row.name || "this template"}`}>
              <Button type="button" variant="ghost" size="icon" aria-label={`Delete ${row.name || "this template"}`} onClick={onDelete}>
                <Trash2Icon className="size-4" />
              </Button>
            </Hint>
          </CardAction>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor={`template-name-${row.id}`}>Name</Label>
            <Input
              id={`template-name-${row.id}`}
              value={row.name}
              maxLength={TEMPLATE_NAME_MAX}
              aria-invalid={row.name.trim() ? undefined : true}
              placeholder="Tutorial"
              onChange={(event) => onChange({ name: event.target.value })}
            />
          </div>
          <DndContext
            id={`promo-youtube-template-${row.id}`}
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={(event) => {
              const next = reorderByDrag(row.sections, sectionIds, event)
              if (next) onChange({ sections: next })
            }}
          >
            <SortableContext items={sectionIds} strategy={verticalListSortingStrategy}>
              <div className="grid gap-2">
                {row.sections.map((section, index) => (
                  <SectionRow
                    key={sectionIds[index]}
                    id={sectionIds[index] ?? String(index)}
                    position={index + 1}
                    section={section}
                    onChange={(patch) => changeSection(index, patch)}
                    onDelete={() => onChange({ sections: row.sections.filter((_, at) => at !== index) })}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
          <div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={row.sections.length >= TEMPLATE_SECTIONS_MAX}
              onClick={() => onChange({ sections: [...row.sections, { name: `Section ${row.sections.length + 1}`, kind: "ai", text: "" }] })}
            >
              <PlusIcon className="size-4" />
              Add section
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

/** One section: its handle, name, kind, words or note, and Delete. */
function SectionRow({
  id,
  position,
  section,
  onChange,
  onDelete,
}: {
  id: string
  position: number
  section: TemplateSection
  onChange: (patch: Partial<TemplateSection>) => void
  onDelete: () => void
}) {
  const { attributes, listeners, setNodeRef, style } = useSortableRow(id, true)
  const problem = sectionProblem(section)
  const label = section.name.trim() || `section ${position}`
  return (
    <div ref={setNodeRef} style={style} data-slot="card-row" className="grid gap-2 rounded-md border p-2">
      <div className="flex min-w-0 items-center gap-2">
        <button type="button" {...attributes} {...listeners} className={DRAG_HANDLE_CLASS} aria-label={`Reorder ${label}`}>
          <GripVertical className="size-4" />
        </button>
        <Input
          aria-label={`Name of section ${position}`}
          value={section.name}
          maxLength={TEMPLATE_SECTION_NAME_MAX}
          aria-invalid={section.name.trim() ? undefined : true}
          onChange={(event) => onChange({ name: event.target.value })}
          className="min-w-0 flex-1"
        />
        <Select value={section.kind} onValueChange={(kind) => onChange({ kind: kind as TemplateSectionKind })}>
          <SelectTrigger aria-label={`What fills ${label}`} className="w-36 shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ai">{TEMPLATE_SECTION_KIND_WORDS.ai}</SelectItem>
            <SelectItem value="fixed">{TEMPLATE_SECTION_KIND_WORDS.fixed}</SelectItem>
          </SelectContent>
        </Select>
        <Hint label={`Delete ${label}`}>
          <Button type="button" variant="ghost" size="icon" aria-label={`Delete ${label}`} onClick={onDelete}>
            <Trash2Icon className="size-4" />
          </Button>
        </Hint>
      </div>
      <Textarea
        aria-label={section.kind === "fixed" ? `The words of ${label}` : `What the AI writes in ${label}`}
        value={section.text}
        aria-invalid={problem && section.kind === "fixed" && !section.text.trim() ? true : undefined}
        placeholder={section.kind === "fixed" ? "The words, exactly as they go in every description" : "A note for the AI on what goes here. It is never posted."}
        onChange={(event) => onChange({ text: event.target.value })}
      />
      {problem ? <p className="text-xs text-destructive">{problem}</p> : null}
    </div>
  )
}
