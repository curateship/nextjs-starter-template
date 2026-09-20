import * as React from "react"
import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core"
import {
  SortableContext,
  arrayMove,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import {
  GripVerticalIcon,
  PlusIcon,
  SettingsIcon,
  Trash2Icon,
} from "lucide-react"

import { FrontPageRowDialog } from "@/components/settings/front-page-row-dialog"
import { CollapsibleSettingsCard } from "@/components/settings/collapsible-settings-card"
import {
  DRAG_HANDLE_CLASS,
  createShellId,
  useNavSensors,
  useSortableRow,
} from "@/components/settings/nav-editor-shared"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { DisabledReason } from "@/components/ui/disabled-reason"
import {
  FRONT_PAGE_ROW_KIND_LABELS,
  FRONT_PAGE_ROW_LAYOUT_LABELS,
  FRONT_PAGE_ROWS_FULL_MESSAGE,
  MAX_FRONT_PAGE_ROWS,
  type FrontPageRow,
  type FrontPageRowDraft,
} from "@/lib/pages/front-page"

export function FrontPageRowsSettings({
  rows,
  onRowsChange,
}: {
  rows: FrontPageRow[]
  onRowsChange: (rows: FrontPageRow[]) => void
}) {
  const sensors = useNavSensors()
  const [editing, setEditing] = React.useState<FrontPageRow | null | undefined>(
    undefined
  )
  const [pendingDelete, setPendingDelete] =
    React.useState<FrontPageRow | null>(null)
  const ids = rows.map((row) => row.id)
  const full = rows.length >= MAX_FRONT_PAGE_ROWS

  const handleDragEnd = (event: DragEndEvent) => {
    if (!event.over || event.active.id === event.over.id) return
    const from = ids.indexOf(String(event.active.id))
    const to = ids.indexOf(String(event.over.id))
    if (from === -1 || to === -1) return
    onRowsChange(arrayMove(rows, from, to))
  }

  const saveRow = (draft: FrontPageRowDraft) => {
    if (editing) {
      onRowsChange(
        rows.map((row) =>
          row.id === editing.id ? { ...draft, id: editing.id } : row
        )
      )
    } else {
      onRowsChange([
        ...rows,
        { ...draft, id: createShellId("front-page-row") },
      ])
    }
    setEditing(undefined)
  }

  return (
    <>
      <CollapsibleSettingsCard
        storageId="public-front-page-rows"
        title="Front page rows"
        description="Build the public front page from fixed rows. Drag rows to change their order."
        contentClassName="grid gap-4"
      >
        {rows.length ? (
          <DndContext
            id="custom-shell-front-page-rows"
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={ids}
              strategy={verticalListSortingStrategy}
            >
              <ul className="grid gap-2">
                {rows.map((row) => (
                  <FrontPageSettingsRow
                    key={row.id}
                    row={row}
                    onEdit={() => setEditing(row)}
                    onDelete={() => setPendingDelete(row)}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        ) : (
          <p className="text-sm text-muted-foreground">
            No rows yet. The existing pricing front page stays in place until
            you add one.
          </p>
        )}

        <div>
          <DisabledReason disabled={full} reason={FRONT_PAGE_ROWS_FULL_MESSAGE}>
            <Button
              type="button"
              variant="outline"
              disabled={full}
              onClick={() => setEditing(null)}
            >
              <PlusIcon className="size-4" />
              Add row
            </Button>
          </DisabledReason>
        </div>
      </CollapsibleSettingsCard>

      <FrontPageRowDialog
        open={editing !== undefined}
        row={editing ?? null}
        onClose={() => setEditing(undefined)}
        onSaved={saveRow}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null)
        }}
        title="Delete this row?"
        description={
          pendingDelete
            ? `${pendingDelete.heading} will come off the public front page.`
            : null
        }
        confirmLabel="Delete row"
        onConfirm={() => {
          if (!pendingDelete) return
          onRowsChange(rows.filter((row) => row.id !== pendingDelete.id))
          setPendingDelete(null)
        }}
      />
    </>
  )
}

function FrontPageSettingsRow({
  row,
  onEdit,
  onDelete,
}: {
  row: FrontPageRow
  onEdit: () => void
  onDelete: () => void
}) {
  const { attributes, listeners, setNodeRef, style } = useSortableRow(
    row.id,
    true
  )

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="flex min-w-0 items-center gap-2 rounded-md border bg-background p-2"
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className={DRAG_HANDLE_CLASS}
        aria-label={`Reorder ${row.heading}`}
      >
        <GripVerticalIcon className="size-4" />
      </button>
      <button
        type="button"
        className="grid min-w-0 flex-1 gap-1 rounded-md px-2 py-1 text-left hover:bg-muted"
        onClick={onEdit}
      >
        <span className="truncate text-sm font-medium">{row.heading}</span>
        <span className="truncate text-xs text-muted-foreground">
          {FRONT_PAGE_ROW_KIND_LABELS[row.kind]} ·{" "}
          {FRONT_PAGE_ROW_LAYOUT_LABELS[row.layout]}
        </span>
      </button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="shrink-0"
        aria-label={`Edit ${row.heading}`}
        onClick={onEdit}
      >
        <SettingsIcon className="size-4" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="shrink-0"
        aria-label={`Delete ${row.heading}`}
        onClick={onDelete}
      >
        <Trash2Icon className="size-4" />
      </Button>
    </li>
  )
}
