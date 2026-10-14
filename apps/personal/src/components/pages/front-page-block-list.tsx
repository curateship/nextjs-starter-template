import * as React from "react"
import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core"
import {
  SortableContext,
  arrayMove,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import {
  ExternalLinkIcon,
  GripVerticalIcon,
  LayersIcon,
  Trash2Icon,
} from "lucide-react"

import {
  DRAG_HANDLE_CLASS,
  useNavSensors,
  useSortableRow,
} from "@/components/settings/nav-editor-shared"
import { DashboardCardTitleHeader } from "@/components/shared/dashboard-card-header"
import { EmptyRow } from "@/components/shared/feed-card"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
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
import {
  BLOCK_KIND_MEDIA_TYPE,
  FRONT_PAGE_BLOCK_FALLBACK_ICON,
  FRONT_PAGE_BLOCK_ICONS,
} from "@/components/pages/front-page-block-kinds"
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
  page,
  rows,
  selectedId,
  pending,
  draggingKind,
  pendingAt,
  onSelect,
  onReorder,
  onAddKindAt,
  onDelete,
}: {
  /** The page being built, for its name and its public address. */
  page: { path: string; name: string }
  rows: FrontPageRow[]
  /** The saved block being edited, if the inspector is on one. */
  selectedId: string | null
  /**
   * A block made from the left panel that has not been added yet. It is drawn
   * at the end, where it will land, so the list never silently omits the thing
   * the inspector is filling in.
   */
  pending: FrontPageRowDraft | null
  /** What is being carried in from the left panel, by name, or null. */
  draggingKind: string | null
  /**
   * Where the block in `pending` was dropped, so it waits there rather than at
   * the end. Null when it was added with the plus, which puts it at the end
   * anyway.
   */
  pendingAt: number | null
  onSelect: (id: string) => void
  onReorder: (rows: FrontPageRow[]) => void
  /**
   * A kind card dropped in from the left panel. `at` is the block it landed
   * on, or the end of the list when it landed on neither.
   */
  onAddKindAt: (choice: string, at?: number) => void
  onDelete: (row: FrontPageRow) => void
}) {
  const sensors = useNavSensors()
  const ids = rows.map((row) => row.id)
  // Where a card dragged in from the left would land, so the list can open the
  // space before it is let go. Null while nothing is being dragged over it.
  const [dropAt, setDropAt] = React.useState<number | null>(null)
  const listRef = React.useRef<HTMLDivElement | null>(null)
  /**
   * Where each block sat when the drag arrived, as a list of midpoints.
   *
   * **Measured once, and not again until the drag leaves.** The space the list
   * opens pushes every block below it down, so a drop worked out from where
   * the blocks are *now* is worked out from positions the space itself moved:
   * the pointer ends up over the space, the space jumps to the end, the blocks
   * come back, the pointer is over a block again, and the space comes back
   * too. That loop is what made the list skip around while it was being
   * dragged over.
   */
  const midpoints = React.useRef<number[]>([])

  /** The gap a drop at `y` belongs in, against where the blocks started. */
  const dropIndexFor = (y: number) => {
    const found = midpoints.current.findIndex((middle) => y < middle)
    return found === -1 ? midpoints.current.length : found
  }

  /** Reads the blocks' own positions, with no space open among them. */
  const measureRows = () => {
    const list = listRef.current
    if (!list) return
    midpoints.current = [...list.querySelectorAll("[data-block-row]")].map(
      (row) => {
        const box = row.getBoundingClientRect()
        return box.top + box.height / 2
      }
    )
  }

  const handleDragEnd = (event: DragEndEvent) => {
    if (!event.over || event.active.id === event.over.id) return
    const from = ids.indexOf(String(event.active.id))
    const to = ids.indexOf(String(event.over.id))
    if (from === -1 || to === -1) return
    onReorder(arrayMove(rows, from, to))
  }

  /** True when what is being dragged is one of the left panel's cards. */
  const carriesKind = (event: React.DragEvent) =>
    event.dataTransfer.types.includes(BLOCK_KIND_MEDIA_TYPE)

  const dropKind = (event: React.DragEvent, at: number) => {
    if (!carriesKind(event)) return
    event.preventDefault()
    event.stopPropagation()
    setDropAt(null)
    const choice = event.dataTransfer.getData(BLOCK_KIND_MEDIA_TYPE)
    if (choice) onAddKindAt(choice, at)
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-card">
      <DashboardCardTitleHeader
        icon={<LayersIcon className="size-4" />}
        back={{ to: "/admin/pages", label: "Back to pages" }}
        // Left as it was. The page's own name is "Home" for the front page, so
        // swapping it in renames this header rather than fixing anything, and
        // what a second page's header should say is Tyler's call.
        title="Front page"
        meta={rows.length === 1 ? "1 block" : `${rows.length} blocks`}
        action={
          /* Straight to the page as a visitor sees it, which is the question
             somebody building it asks constantly. The address is the page's
             own path on this host, the same link the Pages list uses. */
          <Tooltip>
            <TooltipTrigger asChild>
              <Button asChild variant="ghost" size="icon" className="size-8">
                <a
                  href={page.path}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`Open ${page.name} in a new tab`}
                >
                  <ExternalLinkIcon className="size-4" />
                </a>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Open the page in a new tab</TooltipContent>
          </Tooltip>
        }
      />
      <ScrollArea className="min-h-0 flex-1">
        <div
          ref={listRef}
          className={cn(
            "grid min-h-full content-start gap-2 rounded-lg p-3 transition-colors",
            // A page with no blocks has no block to open a space beside, so
            // the panel itself says the drop will land.
            dropAt !== null && rows.length === 0 && "bg-primary/5"
          )}
          // One handler for the whole panel, not one per block. A block that
          // answered for itself would be answering from under a space that had
          // just moved it.
          onDragEnter={(event) => {
            if (!carriesKind(event)) return
            if (dropAt === null) measureRows()
          }}
          onDragOver={(event) => {
            if (!carriesKind(event)) return
            event.preventDefault()
            event.dataTransfer.dropEffect = "copy"
            // The first `dragover` can arrive before any `dragenter` this
            // handler saw, so the measuring is tried here too. It costs one
            // read of the blocks already on screen.
            if (dropAt === null) measureRows()
            setDropAt(dropIndexFor(event.clientY))
          }}
          onDragLeave={(event) => {
            // Only when the pointer has left the panel itself, not when it has
            // crossed onto something inside it.
            if (event.currentTarget.contains(event.relatedTarget as Node)) return
            setDropAt(null)
          }}
          onDrop={(event) => dropKind(event, dropIndexFor(event.clientY))}
        >
          {rows.length === 0 && !pending ? (
            <EmptyRow>
              No blocks yet. Pick one on the left, or drag it over here.
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
                {rows.map((row, index) => (
                  <React.Fragment key={row.id}>
                    {dropAt === index ? (
                      <BlockDropGap label={draggingKind} />
                    ) : null}
                    {pending && pendingAt === index ? (
                      <PendingBlockRow draft={pending} />
                    ) : null}
                    <FrontPageBlockRow
                      row={row}
                      selected={row.id === selectedId}
                      onSelect={() => onSelect(row.id)}
                      onDelete={() => onDelete(row)}
                    />
                  </React.Fragment>
                ))}
                {dropAt === rows.length && rows.length > 0 ? (
                  <BlockDropGap label={draggingKind} />
                ) : null}
                {/* A block that has been dropped but whose write has not come
                    back yet. Drawn where it was dropped rather than at the
                    end: the write appends and the order follows it, and a
                    block that appeared at the bottom and then jumped into
                    place is a block somebody has to watch move. */}
                {pending && pendingAt !== null && pendingAt >= rows.length ? (
                  <PendingBlockRow draft={pending} />
                ) : null}
              </ul>
            </SortableContext>
          </DndContext>
          {/* One that was added without a drop, so it has no place of its own
              to wait in. It goes where a click puts a block: the end. */}
          {pending && pendingAt === null ? (
            <ul className="grid">
              <PendingBlockRow draft={pending} />
            </ul>
          ) : null}
        </div>
      </ScrollArea>
    </div>
  )
}

/**
 * A block that has been added and whose write has not come back yet.
 *
 * Not in the sortable list: it has no id the server knows, and its place is
 * decided by where it was dropped rather than by being dragged.
 */
function PendingBlockRow({ draft }: { draft: FrontPageRowDraft }) {
  return (
    <li
      className="grid min-w-0 gap-1 rounded-md border border-primary/50 bg-muted p-2 pl-4"
      aria-current="true"
    >
      <span className="truncate text-sm font-medium">
        {draft.heading.trim() || blockKindLabel(draft)}
      </span>
      <span className="truncate text-xs text-muted-foreground">
        {blockKindLabel(draft)} · Not added yet
      </span>
    </li>
  )
}

/**
 * The space the list opens for the block being carried over it.
 *
 * A space the shape of a block, not a line between two: the question somebody
 * dragging is asking is "where does this go", and a gap the size of the thing
 * in their hand answers it without them having to read anything. 66px is what
 * a row measures, so the blocks below move exactly as far as they will stay.
 *
 * It grows rather than appearing, through the `0fr`/`1fr` trick, because a
 * list that jumps 66px in one frame reads as the page breaking rather than as
 * the page making room.
 */
function BlockDropGap({ label }: { label: string | null }) {
  const [open, setOpen] = React.useState(false)

  // On the frame after this is first drawn, so the browser has a closed state
  // to animate away from. Set during the render it would have no start.
  React.useEffect(() => {
    const frame = requestAnimationFrame(() => setOpen(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  return (
    <li
      aria-hidden
      className="pointer-events-none grid transition-[grid-template-rows] duration-150 ease-out"
      style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
    >
      <div className="overflow-hidden">
        <div className="flex h-[66px] items-center justify-center rounded-md border border-dashed border-primary/50 bg-primary/5 text-xs font-medium text-muted-foreground">
          {label ? `${label} lands here` : "It lands here"}
        </div>
      </div>
    </li>
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
  // Read as a property, never returned from a function. A helper that handed
  // back a component counts as building one during render, which would remount
  // the icon on every keystroke and is a lint error besides.
  const KindIcon =
    row.kind === APP_FRONT_PAGE_ROW_KIND
      ? (appFrontPageRowKind(row.appKind)?.icon ??
        FRONT_PAGE_BLOCK_FALLBACK_ICON)
      : (FRONT_PAGE_BLOCK_ICONS[row.kind] ?? FRONT_PAGE_BLOCK_FALLBACK_ICON)

  return (
    <li
      ref={setNodeRef}
      style={style}
      // Named so the panel can measure where the blocks sit without counting
      // the space it opens among them.
      data-block-row=""
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
      {/* The same picture the block was picked by on the left, so a long list
          can be read by its shapes rather than by reading every heading. It is
          decorative: the kind is already written underneath in words, and a
          screen reader saying it twice helps nobody. */}
      <KindIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
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
