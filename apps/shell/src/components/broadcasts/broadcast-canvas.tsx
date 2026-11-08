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
  SettingsIcon,
  Trash2Icon,
} from "lucide-react"
import * as React from "react"

import {
  useNavSensors,
  useSortableRow,
} from "@/components/settings/nav-editor-shared"
import { RichTextEditor } from "@/components/shared/rich-text-editor"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
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
import {
  renderBroadcastBlockHtml,
  type EmailRenderStyle,
} from "@/lib/broadcasts/render"
import { BROADCAST_BLOCK_ICONS } from "@/lib/broadcasts/block-icons"
import { cn } from "@/lib/utils"
import { focusRing } from "@/lib/layout/focus-ring"
import { useAppName } from "@/lib/branding"

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
      return false
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
  renderStyle = "standard",
  onSelect,
  onOpenSettings,
  onReorder,
  onInsert,
  onDuplicate,
  onDelete,
  inPanel = false,
  onOpenBlockSettings,
  onRichTextChange,
  onFieldChange,
}: {
  /**
   * A cog in each block's bar; only it opens the block's options (Tyler,
   * 7 Nov 2026: "There should be a setting cog here and only clicking it
   * opens the dropdown"). Handed where the cog is, for the options to open
   * beside it.
   */
  onOpenBlockSettings?: (blockId: string, at: { x: number; y: number }) => void
  /** Rich text is written straight into the block, not in its options. */
  onRichTextChange?: (blockId: string, html: string) => void
  /**
   * The subject and preview line typed straight onto the email rather than
   * in the options (Tyler, 7 Nov 2026: "I should be able to edit the subject
   * inline", then "preview as well").
   */
  onFieldChange?: (field: "subject" | "preheader", value: string) => void
  /**
   * Drawn in the CRM's right panel: the panel stays white and the email sits
   * on it as a faint grey box (Tyler, 7 Nov 2026: "make bg white ... and the
   * email box light gray instead", then "its supposed to be faint light gray"). The full-page editors keep the grey
   * backdrop and the white sheet.
   */
  inPanel?: boolean
  blocks: BroadcastBlock[]
  subject: string
  preheader: string
  width: PreviewWidth
  selectedBlockId: string | null
  disabled?: boolean
  renderStyle?: EmailRenderStyle
  onSelect: (blockId: string | null) => void
  /** Clears the selection, which puts the email's settings in the right panel. */
  onOpenSettings: () => void
  onReorder: (blocks: BroadcastBlock[]) => void
  onInsert: (kind: BroadcastBlockKind, index: number) => void
  onDuplicate: (blockId: string) => void
  onDelete: (blockId: string) => void
}) {
  const sensors = useNavSensors()
  const appName = useAppName()

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
    if (
      target.closest("[data-block]") ||
      target.closest("[data-subject-card]")
    ) {
      return
    }
    onSelect(null)
  }

  return (
    // In the CRM's right panel the space round the email is the panel's own
    // colour. It was the page's, which dark mode draws near black, so the
    // panel went black under the email (Tyler, 7 Nov 2026: "why is this bg
    // black").
    <ScrollArea className={cn("h-full min-h-0 flex-1", inPanel ? "bg-card" : "bg-muted/30")}>
      <div
        // In the CRM's panel the space above the email is the space at its
        // sides (Tyler, 7 Nov 2026: "top padding must match sides").
        className={cn("flex w-full flex-col items-center px-6", inPanel ? "py-6" : "py-8")}
        onClick={handleBackgroundClick}
      >
        <div
          className="w-full max-w-full transition-[width] duration-200"
          style={{ width: PREVIEW_WIDTHS[width] }}
        >
          {/* Subject, preview line and the blocks are one sheet of paper. No
              `overflow-hidden`: the corner tag and the hover toolbar sit
              slightly outside their block and would be clipped away. */}
          <div
            className={cn(
              "rounded-lg",
              // In the CRM the email follows the theme (Tyler, 7 Nov 2026:
              // "this is not theme sensative"): a faint grey of the theme's own,
              // and in dark mode the email's white grounds and dark words give
              // way to the theme's (`crm-email-sheet` below). The full-page
              // editors keep the white sheet a reader receives.
              inPanel ? "crm-email-sheet bg-muted/40 ring-1 ring-border" : "bg-white ring-1 ring-black/10"
            )}
          >
            {inPanel ? (
              <style>{`
                .dark .crm-email-sheet [data-email-html] { color: var(--foreground); }
                .dark .crm-email-sheet [data-email-html] *:not(a) { background-color: transparent !important; color: inherit !important; border-color: var(--border) !important; }
              `}</style>
            ) : null}
            {onFieldChange && !disabled ? (
              <SubjectFields subject={subject} preheader={preheader} onChange={onFieldChange} />
            ) : (
              <SubjectCard
                subject={subject}
                preheader={preheader}
                onOpenSettings={onOpenSettings}
              />
            )}

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
                      appName={appName}
                      renderStyle={renderStyle}
                      last={index === blocks.length - 1}
                      selected={block.id === selectedBlockId}
                      disabled={disabled}
                      onSelect={() => onSelect(block.id)}
                      onClearSelection={() => onSelect(null)}
                      onInsertAfter={(kind) => onInsert(kind, index + 1)}
                      onDuplicate={() => onDuplicate(block.id)}
                      onDelete={() => onDelete(block.id)}
                      onOpenSettings={
                        onOpenBlockSettings ? (at) => onOpenBlockSettings(block.id, at) : undefined
                      }
                      onRichTextChange={
                        onRichTextChange ? (html) => onRichTextChange(block.id, html) : undefined
                      }
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
      className={cn(
        "grid w-full grid-cols-[auto_1fr] items-baseline gap-x-4 gap-y-1.5 rounded-t-lg border-b border-black/10 px-5 py-4 text-left hover:bg-neutral-50",
        focusRing
      )}
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

/**
 * The subject and preview line as boxes typed into in place, laid out as the
 * card above them is: the small label, then the words. They save with the
 * rest of the email, 700ms after the last key.
 */
function SubjectFields({
  subject,
  preheader,
  onChange,
}: {
  subject: string
  preheader: string
  onChange: (field: "subject" | "preheader", value: string) => void
}) {
  const subjectId = React.useId()
  const preheaderId = React.useId()
  const box =
    "min-w-0 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground/70 placeholder:italic focus-visible:ring-0"
  return (
    <div
      data-subject-card=""
      className="grid grid-cols-[auto_1fr] items-baseline gap-x-4 gap-y-1.5 rounded-t-lg border-b px-5 py-4"
    >
      <label htmlFor={subjectId}>
        <PreviewFieldLabel>Subject</PreviewFieldLabel>
      </label>
      <input
        id={subjectId}
        value={subject}
        maxLength={500}
        placeholder="What this email is about"
        className={cn(box, "font-medium text-foreground")}
        onChange={(event) => onChange("subject", event.target.value)}
      />
      <label htmlFor={preheaderId}>
        <PreviewFieldLabel>Preview</PreviewFieldLabel>
      </label>
      <input
        id={preheaderId}
        value={preheader}
        maxLength={500}
        placeholder="The grey line the inbox shows next to it"
        className={cn(box, "text-muted-foreground")}
        onChange={(event) => onChange("preheader", event.target.value)}
      />
    </div>
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
    <div className="flex flex-col items-center justify-center rounded-b-lg px-6 py-20 text-center">
      <MailIcon className="mb-3 size-9 text-neutral-300" />
      <p className="text-sm font-medium text-neutral-600">
        This email is empty
      </p>
      <p className="mb-4 text-xs text-neutral-400">
        Add a block from the left, or start here.
      </p>
      {disabled ? null : (
        <InsertMenu
          label="Add the first block"
          onInsert={(kind) => onInsert(kind, 0)}
        >
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-label="Add the first block"
            onClick={(event) => event.stopPropagation()}
          >
            <PlusIcon className="size-3.5" />
            Add a block
          </Button>
        </InsertMenu>
      )}
    </div>
  )
}

function SortableBlock({
  block,
  appName,
  renderStyle,
  last,
  selected,
  disabled,
  onSelect,
  onClearSelection,
  onInsertAfter,
  onDuplicate,
  onDelete,
  onOpenSettings,
  onRichTextChange,
}: {
  onOpenSettings?: (at: { x: number; y: number }) => void
  onRichTextChange?: (html: string) => void
  block: BroadcastBlock
  appName: string
  renderStyle: EmailRenderStyle
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
          last && "rounded-b-lg",
          // Drawn over the block rather than around it, so showing it can never
          // nudge the email's layout by a pixel.
          "after:pointer-events-none after:absolute after:-inset-px after:z-10 after:rounded-[inherit] after:border-2 after:border-transparent after:transition-colors",
          !escapeDismissed && "group-hover:after:border-foreground/70",
          "focus-visible:after:border-foreground",
          selected && "after:border-foreground"
        )}
      >
        {block.kind === "richText" && onRichTextChange && !disabled ? (
          // Written in place. Its keys and clicks stay inside it, so Enter
          // and Space type rather than pressing the block around it.
          <div
            // In dark mode the block's own ground (white unless changed) gives
            // way to the theme's, or white words would sit on white.
            className="cursor-text text-foreground dark:!bg-transparent"
            style={{ backgroundColor: block.content.backgroundColor, padding: block.content.padding }}
            onKeyDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
          >
            <RichTextEditor
              inline
              mergeTags
              allowImages
              placeholder="Write here"
              value={block.content.htmlContent}
              onChange={onRichTextChange}
            />
          </div>
        ) : empty ? (
          <EmptyBlock kind={block.kind} name={name} />
        ) : (
          <div
            // Links in here are part of the picture, not things to follow, so
            // they take no pointer at all — the click goes to the block behind
            // them and opens its options like anywhere else in the block.
            data-email-html=""
            className="[&_a]:pointer-events-none"
            // The HTML here comes from our own renderer, over content that was
            // cleaned when it was saved — never from raw user markup.
            dangerouslySetInnerHTML={{
              __html: renderBroadcastBlockHtml(block, {
                appName,
                renderStyle,
              }),
            }}
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
            onOpenSettings={onOpenSettings}
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
 *
 * The toolbar changes the app's editor state, not the email a reader receives.
 * It therefore uses app theme tokens even while it floats over the fixed white
 * email sheet below it.
 */
function BlockControls({
  name,
  selected,
  attributes,
  listeners,
  onDuplicate,
  onDelete,
  onOpenSettings,
}: {
  onOpenSettings?: (at: { x: number; y: number }) => void
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
        "absolute -top-4 right-2 z-30 flex items-center gap-0.5 rounded-lg border bg-popover p-0.5 text-popover-foreground shadow-md transition-opacity",
        "opacity-0 group-focus-within:opacity-100 group-hover:opacity-100",
        selected && "opacity-100"
      )}
    >
      {onOpenSettings ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`Options for the ${name} block`}
              onClick={(event) => {
                event.stopPropagation()
                const box = event.currentTarget.getBoundingClientRect()
                onOpenSettings({ x: box.right, y: box.bottom })
              }}
            >
              <SettingsIcon className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Options</TooltipContent>
        </Tooltip>
      ) : null}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Move the ${name} block`}
            className="touch-none cursor-grab active:cursor-grabbing"
            {...attributes}
            {...listeners}
          >
            <GripVerticalIcon className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Drag to move</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Copy the ${name} block`}
            onClick={(event) => {
              event.stopPropagation()
              onDuplicate()
            }}
          >
            <CopyIcon className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Make a copy</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="destructive"
            size="icon-sm"
            aria-label={`Remove the ${name} block`}
            onClick={(event) => {
              event.stopPropagation()
              onDelete()
            }}
          >
            <Trash2Icon className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Remove</TooltipContent>
      </Tooltip>
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
      <InsertMenu
        label={`Add a block after the ${name} block`}
        onInsert={onInsert}
      >
        <Button
          type="button"
          variant="outline"
          size="icon-xs"
          aria-label={`Add a block after the ${name} block`}
          onClick={(event) => event.stopPropagation()}
          className={cn(
            "pointer-events-auto rounded-full shadow-sm transition-opacity",
            "opacity-0 group-focus-within:opacity-100 group-hover:opacity-100"
          )}
        >
          <PlusIcon className="size-3.5" />
        </Button>
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
  children: React.ReactElement
}) {
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="center" className="w-44">
        {BROADCAST_BLOCK_KINDS.map((kind) => {
          const Icon = BROADCAST_BLOCK_ICONS[kind]
          return (
            <DropdownMenuItem key={kind} onSelect={() => onInsert(kind)}>
              <Icon className="size-4 text-muted-foreground" />
              {BROADCAST_BLOCK_META[kind].name}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
