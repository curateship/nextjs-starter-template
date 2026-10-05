import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core"
import {
  SortableContext,
  arrayMove,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { GripVerticalIcon, LayersIcon, Trash2Icon } from "lucide-react"

import {
  DRAG_HANDLE_CLASS,
  useNavSensors,
  useSortableRow,
} from "@/components/settings/nav-editor-shared"
import { DashboardCardTitleHeader } from "@/components/shared/dashboard-card-header"
import { EmptyRow } from "@/components/shared/feed-card"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { appFrontPageRowKind } from "@/lib/app-options"
import { PUBLIC_DEVICE_LABELS } from "@/lib/pages/public-device"
import {
  APP_FRONT_PAGE_ROW_KIND,
  FRONT_PAGE_ROW_ALIGNMENT_LABELS,
  FRONT_PAGE_ROW_KIND_LABELS,
  FRONT_PAGE_ROW_LAYOUT_LABELS,
  type FrontPageRow,
  type FrontPageRowDraft,
} from "@/lib/pages/front-page"
import { cn } from "@/lib/utils"

/**
 * The middle panel of the front page editor: this page's blocks, top to
 * bottom, in the order a visitor reads them.
 *
 * It is the page rather than a picture of the page. A second, rendered copy
 * beside the real website would be the same page twice, and the one on the
 * website is the one that counts.
 */
export function FrontPageBlockList({
  rows,
  selectedId,
  pending,
  onSelect,
  onReorder,
  onDelete,
}: {
  rows: FrontPageRow[]
  /** The saved block being edited, if the inspector is on one. */
  selectedId: string | null
  /**
   * A block made from the left panel that has not been added yet. It is drawn
   * at the end, where it will land, so the list never silently omits the thing
   * the inspector is filling in.
   */
  pending: FrontPageRowDraft | null
  onSelect: (id: string) => void
  onReorder: (rows: FrontPageRow[]) => void
  onDelete: (row: FrontPageRow) => void
}) {
  const sensors = useNavSensors()
  const ids = rows.map((row) => row.id)

  const handleDragEnd = (event: DragEndEvent) => {
    if (!event.over || event.active.id === event.over.id) return
    const from = ids.indexOf(String(event.active.id))
    const to = ids.indexOf(String(event.over.id))
    if (from === -1 || to === -1) return
    onReorder(arrayMove(rows, from, to))
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-card">
      <DashboardCardTitleHeader
        icon={<LayersIcon className="size-4" />}
        back={{ to: "/admin/pages", label: "Back to pages" }}
        title="Front page"
        meta={rows.length === 1 ? "1 block" : `${rows.length} blocks`}
      />
      <ScrollArea className="min-h-0 flex-1">
        <div className="grid gap-2 p-3">
          {rows.length === 0 && !pending ? (
            <EmptyRow>
              No blocks yet. Pick one on the left and it lands here.
            </EmptyRow>
          ) : null}
          <DndContext
            id="custom-shell-front-page-blocks"
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={ids} strategy={verticalListSortingStrategy}>
              <ul className="grid gap-2">
                {rows.map((row) => (
                  <FrontPageBlockRow
                    key={row.id}
                    row={row}
                    selected={row.id === selectedId}
                    onSelect={() => onSelect(row.id)}
                    onDelete={() => onDelete(row)}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
          {/* Not in the sortable list: it has no id to drag by yet, and its
              place is decided by being added rather than by being moved. */}
          {pending ? (
            <div
              className="grid min-w-0 gap-1 rounded-md border border-primary/50 bg-muted p-2 pl-4"
              aria-current="true"
            >
              <span className="truncate text-sm font-medium">
                {pending.heading.trim() || blockKindLabel(pending)}
              </span>
              <span className="truncate text-xs text-muted-foreground">
                {blockKindLabel(pending)} · Not added yet
              </span>
            </div>
          ) : null}
        </div>
      </ScrollArea>
    </div>
  )
}

/**
 * What kind of block this is, in words. An app's own kinds are named by the
 * app, and a kind the app has since stopped offering still has to read as
 * something rather than as nothing at all.
 */
function blockKindLabel(row: FrontPageRow | FrontPageRowDraft) {
  if (row.kind !== APP_FRONT_PAGE_ROW_KIND) {
    return FRONT_PAGE_ROW_KIND_LABELS[row.kind]
  }
  return appFrontPageRowKind(row.appKind)?.label ?? row.appKind
}

function FrontPageBlockRow({
  row,
  selected,
  onSelect,
  onDelete,
}: {
  row: FrontPageRow
  selected: boolean
  onSelect: () => void
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
      // pointing at the handle, the words or the icon at the end all light the
      // same strip.
      className={cn(
        "flex min-w-0 items-center gap-2 rounded-md border p-2",
        selected
          ? "border-primary/50 bg-muted"
          : "bg-background hover:bg-muted"
      )}
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
        aria-current={selected ? "true" : undefined}
        onClick={onSelect}
      >
        <span className="truncate text-sm font-medium">{row.heading}</span>
        <span className="truncate text-xs text-muted-foreground">
          {[
            blockKindLabel(row),
            FRONT_PAGE_ROW_LAYOUT_LABELS[row.layout],
            row.alignment === "inherit"
              ? null
              : FRONT_PAGE_ROW_ALIGNMENT_LABELS[row.alignment],
            // Only worth a word when it is not the everyday answer, so the
            // line stays short on the blocks that behave normally.
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
        aria-label={`Delete ${row.heading}`}
        onClick={onDelete}
      >
        <Trash2Icon className="size-4" />
      </Button>
    </li>
  )
}
