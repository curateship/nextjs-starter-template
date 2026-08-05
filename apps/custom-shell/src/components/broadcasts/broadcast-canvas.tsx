import {
  DndContext,
  closestCenter,
  type DragEndEvent,
  type DraggableAttributes,
} from "@dnd-kit/core"
import type { SyntheticListenerMap } from "@dnd-kit/core/dist/hooks/utilities"
import {
  SortableContext,
  arrayMove,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import {
  CopyIcon,
  GripVerticalIcon,
  ImageIcon,
  MailIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react"
import * as React from "react"

import {
  DRAG_HANDLE_CLASS,
  useNavSensors,
  useSortableRow,
} from "@/components/settings/nav-editor-shared"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  BROADCAST_BLOCK_KINDS,
  BROADCAST_BLOCK_META,
  type BroadcastBlock,
  type BroadcastBlockKind,
} from "@/lib/broadcasts/blocks"
import {
  PREVIEW_WIDTHS,
  type PreviewWidth,
} from "@/lib/broadcasts/preview-width"
import { renderBroadcastBlockHtml } from "@/lib/broadcasts/render"
import { cn } from "@/lib/utils"

/**
 * Whether this block would show a reader nothing at all.
 *
 * An empty block renders to no height, so without this the sheet would have
 * invisible rows in it — impossible to see, click or drag, and a brand new
 * email would look like a blank page with nothing on it to start from.
 */
function blockIsEmpty(block: BroadcastBlock): boolean {
  switch (block.kind) {
    case "header":
      return !block.content.logoUrl.trim()
    case "richText":
      // Tags with nothing between them still count as nothing.
      return !block.content.htmlContent.replace(/<[^>]*>|&nbsp;|\s/g, "")
    case "button":
      return !block.content.label.trim()
    case "divider":
      return false
    case "footer":
      return (
        !block.content.companyName.trim() &&
        !block.content.companyAddress.trim() &&
        !block.content.showUnsubscribe
      )
  }
}

/**
 * The middle panel — the email itself, drawn the way it will arrive.
 *
 * One column, top to bottom. Nothing sits side by side, because a single column
 * is the only shape every inbox renders the same way.
 *
 * Hovering a block outlines it, names it in the corner, and puts move / copy /
 * remove in the top right. Between every two blocks there is a small plus for
 * dropping a new one exactly there rather than only at the end.
 */
export function BroadcastCanvas({
  blocks,
  subject,
  preheader,
  width,
  selectedBlockId,
  disabled,
  onSelect,
  onOpenSettings,
  onReorder,
  onInsert,
  onDuplicate,
  onDelete,
}: {
  blocks: BroadcastBlock[]
  subject: string
  preheader: string
  width: PreviewWidth
  selectedBlockId: string | null
  disabled?: boolean
  onSelect: (blockId: string | null) => void
  /** Clears the selection, which puts the email's settings in the right panel. */
  onOpenSettings: () => void
  onReorder: (blocks: BroadcastBlock[]) => void
  onInsert: (kind: BroadcastBlockKind, index: number) => void
  onDuplicate: (blockId: string) => void
  onDelete: (blockId: string) => void
}) {
  const sensors = useNavSensors()

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const from = blocks.findIndex((block) => block.id === active.id)
    const to = blocks.findIndex((block) => block.id === over.id)
    if (from === -1 || to === -1) return
    onReorder(arrayMove(blocks, from, to))
  }

  /**
   * Clicking anywhere that is not a block puts the selection down.
   *
   * Nothing else clears it, so before this the only way out of a block's
   * options was to click a different block. The check is "did this land inside
   * a block", not "did it land exactly on the background", because the paper,
   * the padding around it and the grey behind it are all the same "nothing" to
   * whoever is clicking. The subject card is left alone: it has its own click,
   * which opens the email's settings.
   */
  const handleBackgroundClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement
    if (target.closest("[data-block]") || target.closest("[data-subject-card]")) {
      return
    }
    onSelect(null)
  }

  return (
    <ScrollArea className="h-full min-h-0 flex-1 bg-muted/30">
      <div
        className="flex w-full flex-col items-center px-6 py-8"
        onClick={handleBackgroundClick}
      >
        <div
          className="w-full max-w-full transition-[width] duration-200"
          style={{ width: PREVIEW_WIDTHS[width] }}
        >
          {/* Subject, preview line and the blocks are one sheet of paper. No
              `overflow-hidden`: the corner tag and the hover toolbar sit
              slightly outside their block and would be clipped away. */}
          <div className="rounded-xl bg-white ring-1 ring-black/10">
            <SubjectCard
              subject={subject}
              preheader={preheader}
              onOpenSettings={onOpenSettings}
            />

            {blocks.length === 0 ? (
              <EmptyEmail disabled={disabled} onInsert={onInsert} />
            ) : (
              <DndContext
                // A fixed id keeps the accessibility ids dnd-kit generates the
                // same on the server and in the browser, so hydration is quiet.
                id="broadcast-canvas"
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={blocks.map((block) => block.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {blocks.map((block, index) => (
                    <SortableBlock
                      key={block.id}
                      block={block}
                      last={index === blocks.length - 1}
                      selected={block.id === selectedBlockId}
                      disabled={disabled}
                      onSelect={() => onSelect(block.id)}
                      onClearSelection={() => onSelect(null)}
                      onInsertAfter={(kind) => onInsert(kind, index + 1)}
                      onDuplicate={() => onDuplicate(block.id)}
                      onDelete={() => onDelete(block.id)}
                    />
                  ))}
                </SortableContext>
              </DndContext>
            )}
          </div>
        </div>
      </div>
    </ScrollArea>
  )
}

/**
 * The subject and preview line, at the top of the sheet where a reader meets
 * them. Not editable here — clicking either puts the email's own settings in
 * the right panel, so there is one place fields are typed into.
 */
function SubjectCard({
  subject,
  preheader,
  onOpenSettings,
}: {
  subject: string
  preheader: string
  onOpenSettings: () => void
}) {
  return (
    <button
      type="button"
      data-subject-card=""
      onClick={onOpenSettings}
      // Named outright: without this its name would be read out as the whole
      // block of text inside it, labels and values run together.
      aria-label="Edit the subject and preview line"
      title="Edit the subject and preview line"
      className="grid w-full grid-cols-[auto_1fr] items-baseline gap-x-4 gap-y-1.5 rounded-t-xl border-b border-black/10 px-5 py-4 text-left hover:bg-neutral-50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <PreviewFieldLabel>Subject</PreviewFieldLabel>
      <FieldValue value={subject} placeholder="What this email is about" />
      <PreviewFieldLabel>Preview</PreviewFieldLabel>
      <FieldValue
        value={preheader}
        placeholder="The grey line the inbox shows next to it"
        muted
      />
    </button>
  )
}

function PreviewFieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[10px] font-semibold tracking-[0.08em] text-neutral-400 uppercase">
      {children}
    </span>
  )
}

function FieldValue({
  value,
  placeholder,
  muted,
}: {
  value: string
  placeholder: string
  muted?: boolean
}) {
  const empty = !value.trim()
  return (
    <span
      className={cn(
        "truncate text-sm",
        empty
          ? "text-neutral-400 italic"
          : muted
            ? "text-neutral-500"
            : "font-medium text-neutral-900"
      )}
      title={value || undefined}
    >
      {value.trim() || placeholder}
    </span>
  )
}

function EmptyEmail({
  disabled,
  onInsert,
}: {
  disabled?: boolean
  onInsert: (kind: BroadcastBlockKind, index: number) => void
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-b-xl px-6 py-20 text-center">
      <MailIcon className="mb-3 size-9 text-neutral-300" />
      <p className="text-sm font-medium text-neutral-600">This email is empty</p>
      <p className="mb-4 text-xs text-neutral-400">
        Add a block from the left, or start here.
      </p>
      {disabled ? null : (
        <InsertMenu
          label="Add the first block"
          onInsert={(kind) => onInsert(kind, 0)}
        >
          <span className="inline-flex items-center gap-1.5 rounded-md border border-black/10 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 shadow-sm hover:bg-neutral-50">
            <PlusIcon className="size-3.5" />
            Add a block
          </span>
        </InsertMenu>
      )}
    </div>
  )
}

function SortableBlock({
  block,
  last,
  selected,
  disabled,
  onSelect,
  onClearSelection,
  onInsertAfter,
  onDuplicate,
  onDelete,
}: {
  block: BroadcastBlock
  last: boolean
  selected: boolean
  disabled?: boolean
  onSelect: () => void
  onClearSelection: () => void
  onInsertAfter: (kind: BroadcastBlockKind) => void
  onDuplicate: () => void
  onDelete: () => void
}) {
  const [escapeDismissed, setEscapeDismissed] = React.useState(false)

  // Translate only. Blocks are nowhere near the same height — a divider next to
  // a paragraph — and dnd-kit's full transform carries a stretch factor so a row
  // can morph into its neighbour's space, which skews the block mid-drag. The
  // sidebar editor takes the same option for the same reason.
  const { attributes, listeners, setNodeRef, style, isDragging } =
    useSortableRow(block.id, true)
  const name = BROADCAST_BLOCK_META[block.kind].name
  const empty = blockIsEmpty(block)

  return (
    <div
      ref={setNodeRef}
      style={style}
      // Marks where a block starts, so a click on the paper around them can
      // tell it landed on nothing and clear the selection.
      data-block=""
      className={cn("group relative", isDragging ? "z-20" : "hover:z-10")}
      onPointerEnter={() => setEscapeDismissed(false)}
    >
      <div
        role="button"
        tabIndex={0}
        aria-label={`Edit the ${name} block`}
        aria-pressed={selected}
        onClick={(event) => {
          // The preview is a picture of an email, not a working page. Without
          // this, clicking the footer to edit it follows the unsubscribe link
          // and throws you out of the editor.
          event.preventDefault()
          setEscapeDismissed(false)
          onSelect()
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault()
            event.stopPropagation()
            setEscapeDismissed(true)
            onClearSelection()
            event.currentTarget.blur()
            return
          }
          if (event.key !== "Enter" && event.key !== " ") return
          event.preventDefault()
          setEscapeDismissed(false)
          onSelect()
        }}
        className={cn(
          "relative cursor-pointer outline-none",
          last && "rounded-b-xl",
          // Drawn over the block rather than around it, so showing it can never
          // nudge the email's layout by a pixel.
          "after:pointer-events-none after:absolute after:-inset-px after:z-10 after:rounded-[inherit] after:border-2 after:border-transparent after:transition-colors",
          !escapeDismissed && "group-hover:after:border-foreground/70",
          "focus-visible:after:border-foreground",
          selected && "after:border-foreground"
        )}
      >
        {empty ? (
          <EmptyBlock kind={block.kind} name={name} />
        ) : (
          <div
            // Links in here are part of the picture, not things to follow, so
            // they take no pointer at all — the click goes to the block behind
            // them and opens its options like anywhere else in the block.
            className="[&_a]:pointer-events-none"
            // The HTML here comes from our own renderer, over content that was
            // cleaned when it was saved — never from raw user markup.
            dangerouslySetInnerHTML={{ __html: renderBroadcastBlockHtml(block) }}
          />
        )}
      </div>

      {/* The block's name, riding on the top edge of its outline, so what you
          are about to edit is named before you click it. */}
      <span
        className={cn(
          "pointer-events-none absolute -top-2.5 left-0 z-20 rounded-md bg-foreground px-1.5 py-0.5 text-[10px] font-semibold tracking-[0.06em] text-background uppercase transition-opacity",
          "opacity-0 group-focus-within:opacity-100 group-hover:opacity-100",
          selected && "opacity-100"
        )}
      >
        {name}
      </span>

      {disabled ? null : (
        <>
          <BlockControls
            name={name}
            selected={selected}
            attributes={attributes}
            listeners={listeners}
            onDuplicate={onDuplicate}
            onDelete={onDelete}
          />
          <InsertHere name={name} onInsert={onInsertAfter} />
        </>
      )}
    </div>
  )
}

/** A block that would show nothing, drawn so it can still be seen and grabbed. */
function EmptyBlock({
  kind,
  name,
}: {
  kind: BroadcastBlock["kind"]
  name: string
}) {
  if (kind === "header") {
    return (
      <div className="px-5 py-6">
        <div className="flex h-14 w-40 items-center justify-center rounded-md bg-neutral-100 text-xs text-neutral-400">
          Logo
        </div>
      </div>
    )
  }

  if (kind === "richText") {
    return (
      <div className="px-5 py-5">
        <div className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-neutral-300 px-6 py-10 text-center">
          <ImageIcon className="size-5 text-neutral-300" />
          <span className="text-xs text-neutral-400">
            Click to write, or paste an image address in the options
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="px-5 py-5">
      <div className="flex min-h-16 flex-col items-center justify-center gap-0.5 rounded-lg border border-dashed border-neutral-300 px-6 py-6 text-center">
        <span className="text-xs font-medium text-neutral-500">{name}</span>
        <span className="text-xs text-neutral-400">
          {kind === "button"
            ? "Click to give the button its words"
            : "Click to add your company details"}
        </span>
      </div>
    </div>
  )
}

/**
 * Move, copy and remove, in a floating bar on the block's top-right corner.
 * Hidden until you hover or tab to the block, and kept on screen while that
 * block is the selected one, so the controls for what you are editing do not
 * disappear the moment the pointer leaves.
 */
function BlockControls({
  name,
  selected,
  attributes,
  listeners,
  onDuplicate,
  onDelete,
}: {
  name: string
  selected: boolean
  attributes: DraggableAttributes
  listeners: SyntheticListenerMap | undefined
  onDuplicate: () => void
  onDelete: () => void
}) {
  return (
    <div
      className={cn(
        "absolute -top-4 right-2 z-30 flex items-center gap-0.5 rounded-lg border border-black/10 bg-white p-0.5 shadow-md transition-opacity",
        "opacity-0 group-focus-within:opacity-100 group-hover:opacity-100",
        selected && "opacity-100"
      )}
    >
      <button
        type="button"
        aria-label={`Move the ${name} block`}
        title="Drag to move"
        className={cn(DRAG_HANDLE_CLASS, "size-7 touch-none hover:bg-neutral-100")}
        {...attributes}
        {...listeners}
      >
        <GripVerticalIcon className="size-4" />
      </button>
      <button
        type="button"
        aria-label={`Copy the ${name} block`}
        title="Make a copy"
        className="flex size-7 items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        onClick={(event) => {
          event.stopPropagation()
          onDuplicate()
        }}
      >
        <CopyIcon className="size-4" />
      </button>
      <button
        type="button"
        aria-label={`Remove the ${name} block`}
        title="Remove"
        className="flex size-7 items-center justify-center rounded-md text-neutral-500 hover:bg-red-50 hover:text-red-600 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        onClick={(event) => {
          event.stopPropagation()
          onDelete()
        }}
      >
        <Trash2Icon className="size-4" />
      </button>
    </div>
  )
}

/**
 * The small plus sitting on the seam under a block. Without it, everything new
 * lands at the bottom and has to be dragged up to where it was wanted.
 */
function InsertHere({
  name,
  onInsert,
}: {
  name: string
  onInsert: (kind: BroadcastBlockKind) => void
}) {
  return (
    <div className="pointer-events-none absolute inset-x-0 -bottom-3 z-30 flex justify-center">
      <InsertMenu label={`Add a block after the ${name} block`} onInsert={onInsert}>
        <span
          className={cn(
            "pointer-events-auto flex size-6 items-center justify-center rounded-full border border-black/10 bg-white text-neutral-500 shadow-sm transition-opacity",
            "opacity-0 group-focus-within:opacity-100 group-hover:opacity-100",
            "hover:bg-foreground hover:text-background"
          )}
        >
          <PlusIcon className="size-3.5" />
        </span>
      </InsertMenu>
    </div>
  )
}

function InsertMenu({
  label,
  onInsert,
  children,
}: {
  label: string
  onInsert: (kind: BroadcastBlockKind) => void
  children: React.ReactNode
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={label}
          title={label}
          onClick={(event) => event.stopPropagation()}
          className="pointer-events-auto focus-visible:outline-none"
        >
          {children}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center" className="w-44">
        {BROADCAST_BLOCK_KINDS.map((kind) => (
          <DropdownMenuItem key={kind} onSelect={() => onInsert(kind)}>
            {BROADCAST_BLOCK_META[kind].name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
