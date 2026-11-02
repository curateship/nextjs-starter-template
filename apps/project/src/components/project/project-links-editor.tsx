import * as React from "react"
import { useRouter } from "@tanstack/react-router"
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { GripVerticalIcon, PlusIcon, Trash2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import { saveProject } from "@/lib/api/project/projects"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { focusRingInset } from "@/lib/layout/focus-ring"
import { getProjectErrorMessage } from "@/lib/project/errors"
import { PROJECT_LINK_LIMITS, readWebAddress, type ProjectLink } from "@/lib/project/project-links"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

/** A row being edited: a link's address is what was typed until it is left. */
type Row = { id: string; kind: "link" | "divider"; label: string; url: string }

function rowsOf(links: ProjectLink[]): Row[] {
  return links.map((link) => ({ ...link, url: link.kind === "link" ? link.url : "" }))
}

/**
 * The rows worth saving: a link with a web address, a divider with a label.
 * A row still being filled in stays on screen and is saved once it is whole.
 */
function savedLinks(rows: Row[]): ProjectLink[] {
  return rows.flatMap((row): ProjectLink[] => {
    if (row.kind === "divider") {
      const label = row.label.trim()
      return label ? [{ id: row.id, kind: "divider", label }] : []
    }
    const url = readWebAddress(row.url)
    return url ? [{ id: row.id, kind: "link", label: row.label.trim(), url }] : []
  })
}

/**
 * The project's links in Project settings, under Description (Misc 5, Tyler,
 * 2 Nov 2026): each a label and an address, with divider labels between
 * them, dragged into order by the handle. A row saves when it is left, a drop
 * or a bin at once. An address that isn't a web address stays in its box,
 * marked, until it is fixed; "acme.com" is taken as "https://acme.com". The
 * window is opened afresh each time, so the rows start from what is saved.
 */
export function ProjectLinksEditor({
  projectId,
  links,
  disabled,
}: {
  projectId: string
  links: ProjectLink[]
  disabled: boolean
}) {
  const router = useRouter()
  const [rows, setRows] = React.useState(() => rowsOf(links))
  const [invalid, setInvalid] = React.useState<string[]>([])
  const [run] = useAsyncAction(getProjectErrorMessage)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )
  const dndId = React.useId()
  // Built the way a save builds it, so passing through a row unchanged saves nothing.
  const lastSaved = React.useRef(JSON.stringify(savedLinks(rowsOf(links))))
  const full = rows.length >= PROJECT_LINK_LIMITS.count

  async function save(next: Row[]) {
    const list = savedLinks(next)
    const text = JSON.stringify(list)
    if (text === lastSaved.current) return
    if (await run(() => saveProject({ projectId, links: list }), "Saved.")) {
      lastSaved.current = text
      await router.invalidate()
    }
  }

  function change(id: string, patch: Partial<Row>) {
    setRows((was) => was.map((row) => (row.id === id ? { ...row, ...patch } : row)))
    if ("url" in patch) setInvalid((was) => was.filter((other) => other !== id))
  }

  /** Leaving a row: its address is checked and tidied, then the list saves. */
  function leave(row: Row) {
    let next = rows
    if (row.kind === "link" && row.url.trim()) {
      const url = readWebAddress(row.url)
      if (!url) {
        setInvalid((was) => (was.includes(row.id) ? was : [...was, row.id]))
        showErrorToast("Type a web address, such as https://example.com.")
        return
      }
      next = rows.map((other) => (other.id === row.id ? { ...other, url } : other))
      setRows(next)
    }
    void save(next)
  }

  function add(kind: Row["kind"]) {
    setRows((was) => [...was, { id: crypto.randomUUID(), kind, label: "", url: "" }])
  }

  function remove(id: string) {
    const next = rows.filter((row) => row.id !== id)
    setRows(next)
    setInvalid((was) => was.filter((other) => other !== id))
    void save(next)
  }

  function drop(event: DragEndEvent) {
    const overId = event.over?.id
    if (overId === undefined || overId === event.active.id) return
    const ids = rows.map((row) => row.id)
    const next = arrayMove(rows, ids.indexOf(String(event.active.id)), ids.indexOf(String(overId)))
    setRows(next)
    void save(next)
  }

  return (
    <div className="grid gap-2">
      <FieldLabel hint="Shown under the description on the project's page. A divider label starts a new group of links. Drag by the handle to change the order.">
        Links
      </FieldLabel>
      {rows.length ? (
        <DndContext id={dndId} sensors={sensors} collisionDetection={closestCenter} onDragEnd={drop}>
          <SortableContext items={rows.map((row) => row.id)} strategy={verticalListSortingStrategy}>
            <ul className="grid gap-2" aria-label="Links and dividers">
              {rows.map((row) => (
                <LinkRow
                  key={row.id}
                  row={row}
                  invalid={invalid.includes(row.id)}
                  disabled={disabled}
                  dragDisabled={disabled || rows.length < 2}
                  onChange={(patch) => change(row.id, patch)}
                  onLeave={() => leave(row)}
                  onRemove={() => remove(row.id)}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      ) : null}
      {disabled ? null : (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" disabled={full} onClick={() => add("link")}>
            <PlusIcon className="size-4" />
            Add link
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={full} onClick={() => add("divider")}>
            <PlusIcon className="size-4" />
            Add divider
          </Button>
        </div>
      )}
    </div>
  )
}

function LinkRow({
  row,
  invalid,
  disabled,
  dragDisabled,
  onChange,
  onLeave,
  onRemove,
}: {
  row: Row
  invalid: boolean
  disabled: boolean
  dragDisabled: boolean
  onChange: (patch: Partial<Row>) => void
  onLeave: () => void
  onRemove: () => void
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: row.id,
    disabled: dragDisabled,
  })
  const style: React.CSSProperties | undefined = transform
    ? { transform: `translate3d(0, ${transform.y}px, 0)`, transition }
    : undefined
  const divider = row.kind === "divider"
  const name = row.label.trim() || (divider ? "divider" : "link")
  const enter = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") event.currentTarget.blur()
  }
  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn("flex min-w-0 items-center gap-2 bg-background", isDragging && "relative z-10")}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        {...listeners}
        {...attributes}
        disabled={dragDisabled}
        aria-label={`Drag ${name} to change the order`}
        className={cn(
          "flex size-6 shrink-0 cursor-grab items-center justify-center rounded text-muted-foreground hover:text-foreground disabled:cursor-default disabled:opacity-50",
          focusRingInset
        )}
      >
        <GripVerticalIcon className="size-4" aria-hidden />
      </button>
      {divider ? (
        <Input
          value={row.label}
          maxLength={PROJECT_LINK_LIMITS.label}
          disabled={disabled}
          placeholder="Divider label"
          aria-label="Divider label"
          className="min-w-0 flex-1 font-medium"
          onChange={(event) => onChange({ label: event.target.value })}
          onBlur={onLeave}
          onKeyDown={enter}
        />
      ) : (
        <>
          <Input
            value={row.label}
            maxLength={PROJECT_LINK_LIMITS.label}
            disabled={disabled}
            placeholder="Label"
            aria-label="Link label"
            className="w-28 min-w-0 shrink-0 sm:w-36"
            onChange={(event) => onChange({ label: event.target.value })}
            onBlur={onLeave}
            onKeyDown={enter}
          />
          <Input
            value={row.url}
            maxLength={PROJECT_LINK_LIMITS.url}
            disabled={disabled}
            inputMode="url"
            placeholder="https://"
            aria-label="Link address"
            aria-invalid={invalid || undefined}
            className="min-w-0 flex-1"
            onChange={(event) => onChange({ url: event.target.value })}
            onBlur={onLeave}
            onKeyDown={enter}
          />
        </>
      )}
      {disabled ? null : (
        <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${name}`} onClick={onRemove}>
          <Trash2Icon className="size-4" />
        </Button>
      )}
    </li>
  )
}
