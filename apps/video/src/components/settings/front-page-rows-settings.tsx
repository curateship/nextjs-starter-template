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
import { FrontPageRowPicker } from "@/components/settings/front-page-row-picker"
import { CollapsibleSettingsCard } from "@/components/settings/collapsible-settings-card"
import {
  DRAG_HANDLE_CLASS,
  createShellId,
  useNavSensors,
  useSortableRow,
} from "@/components/settings/nav-editor-shared"
import { SettingsSliderRow } from "@/components/settings/settings-slider-row"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { PUBLIC_DEVICE_LABELS } from "@/lib/pages/public-device"
import {
  DEFAULT_PUBLIC_FRONT_PAGE_ROW_GAP,
  MAX_PUBLIC_FRONT_PAGE_ROW_GAP,
  PUBLIC_FRONT_PAGE_ROW_GAP_PHONE_SHARE,
} from "@/lib/public-theme"
import { appFrontPageRowKind } from "@/lib/app-options"
import {
  APP_FRONT_PAGE_ROW_KIND,
  FRONT_PAGE_ROW_ALIGNMENT_LABELS,
  FRONT_PAGE_ROW_KIND_LABELS,
  FRONT_PAGE_ROW_LAYOUT_LABELS,
  type FrontPageRow,
  type FrontPageRowDraft,
} from "@/lib/pages/front-page"

export function FrontPageRowsSettings({
  rows,
  onRowsChange,
  rowGap,
  onRowGapChange,
}: {
  rows: FrontPageRow[]
  onRowsChange: (rows: FrontPageRow[]) => void
  /** The space between two blocks on the page, as a desktop draws it. */
  rowGap: number
  onRowGapChange: (rowGap: number) => void
}) {
  const sensors = useNavSensors()
  const [editing, setEditing] = React.useState<FrontPageRow | null | undefined>(
    undefined
  )
  const [pendingDelete, setPendingDelete] =
    React.useState<FrontPageRow | null>(null)
  // The kind a new row was picked as, held while its window is open. A row's
  // kind is chosen once, in the picker, so this is the only place a new row's
  // kind ever comes from.
  const [newKind, setNewKind] = React.useState<string | null>(null)
  const [picking, setPicking] = React.useState(false)
  const ids = rows.map((row) => row.id)

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
    setNewKind(null)
  }

  const closeRowWindow = () => {
    setEditing(undefined)
    setNewKind(null)
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
          <Button
            type="button"
            variant="outline"
            onClick={() => setPicking(true)}
          >
            <PlusIcon className="size-4" />
            Add row
          </Button>
        </div>

        <SettingsSliderRow
          label="Space between rows"
          value={rowGap}
          min={0}
          max={MAX_PUBLIC_FRONT_PAGE_ROW_GAP}
          step={4}
          valueLabel={
            rowGap === DEFAULT_PUBLIC_FRONT_PAGE_ROW_GAP
              ? `${rowGap}px · Default`
              : `${rowGap}px`
          }
          onChange={onRowGapChange}
          help={`The gap between two blocks on the public front page. A phone draws ${Math.round(
            PUBLIC_FRONT_PAGE_ROW_GAP_PHONE_SHARE * 100
          )}% of it, because a gap that separates two blocks on a desktop is most of a phone screen. Flat mode collapses both.`}
        />
      </CollapsibleSettingsCard>

      <FrontPageRowPicker
        open={picking}
        onOpenChange={setPicking}
        onPick={(choice) => {
          setPicking(false)
          setNewKind(choice)
          setEditing(null)
        }}
      />

      <FrontPageRowDialog
        open={editing !== undefined}
        row={editing ?? null}
        newKind={newKind}
        // A new row joins the end of the list, so it is the top row only when
        // there is nothing above it yet.
        first={editing ? rows[0]?.id === editing.id : rows.length === 0}
        onClose={closeRowWindow}
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
      // The hover tint belongs to the whole row, not to the middle button, so
      // pointing at the handle, the words or the icons at the end all light the
      // same strip.
      className="flex min-w-0 items-center gap-2 rounded-md border bg-background p-2 hover:bg-muted"
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
        className="grid min-w-0 flex-1 gap-1 rounded-md px-2 py-1 text-left"
        onClick={onEdit}
      >
        <span className="truncate text-sm font-medium">{row.heading}</span>
        <span className="truncate text-xs text-muted-foreground">
          {[
            // An app's own kinds are named by the app, and a kind the app has
            // since stopped offering still has to read as something rather
            // than as nothing at all.
            row.kind === APP_FRONT_PAGE_ROW_KIND
              ? (appFrontPageRowKind(row.appKind)?.label ?? row.appKind)
              : FRONT_PAGE_ROW_KIND_LABELS[row.kind],
            FRONT_PAGE_ROW_LAYOUT_LABELS[row.layout],
            row.alignment === "inherit"
              ? null
              : FRONT_PAGE_ROW_ALIGNMENT_LABELS[row.alignment],
            // Only worth a word when it is not the everyday answer, so the
            // line stays short on the rows that behave normally.
            row.device === "all" ? null : PUBLIC_DEVICE_LABELS[row.device],
            row.hidden ? "Hidden" : null,
          ]
            .filter(Boolean)
            .join(" · ")}
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
