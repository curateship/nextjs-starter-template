import * as React from "react"
import { BlockInspector } from "@/components/broadcasts/block-inspector"
import { BroadcastCanvas } from "@/components/broadcasts/broadcast-canvas"
import { PointAnchor } from "@/components/crm/point-anchor"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { keepOpenForInnerBoxes } from "@/components/shared/notes/pick-rows"
import { getBroadcastErrorMessage } from "@/lib/api/email/broadcasts"
import {
  BROADCAST_BLOCK_KINDS,
  BROADCAST_BLOCK_META,
  createBroadcastBlock,
  type BroadcastBlock,
  type BroadcastBlockDefaults,
  type BroadcastBlockKind,
} from "@/lib/broadcasts/blocks"
import type { EmailRenderStyle } from "@/lib/broadcasts/render"
import { BROADCAST_BLOCK_ICONS } from "@/lib/broadcasts/block-icons"
import { useAutoSave } from "@/lib/hooks/use-auto-save"

/** Everything about an email that a person types or drags. */
export type EmailEditableFields = {
  subject: string
  preheader: string
  fromName: string
  blocks: BroadcastBlock[]
}

/**
 * One email's words and blocks, kept and saved 700ms after the last change,
 * as every editor in the app saves. Bumping `version` takes the owner's copy
 * instead, as after a send or a reset, when the server's copy is the truth.
 */
export function useEmailDraft({
  incoming,
  version,
  onSave,
}: {
  incoming: EmailEditableFields
  version: number
  onSave: (fields: EmailEditableFields) => Promise<void | boolean>
}) {
  const { value, change, saveNow, reset } = useAutoSave(incoming, {
    save: onSave,
    describeError: getBroadcastErrorMessage,
  })
  const applied = React.useRef(version)
  React.useEffect(() => {
    if (applied.current === version) return
    applied.current = version
    reset(incoming)
  }, [version, incoming, reset])
  return { fields: value, change, saveNow }
}

/**
 * The email itself, on the CRM's right panel (Part C4 of the CRM task;
 * Tyler, 7 Nov 2026: the newsletter editor is "a '/' page in the right
 * panel. Each block's settings are in its own ⋮", then of the first pass:
 * "consolidate this into the CRM dashboard too and not linked it outside").
 *
 * - **The page:** the email drawn as it will arrive (`BroadcastCanvas`), the
 *   subject and preview line at its top. It draws at the panel's width, up
 *   to the 600px it is sent at, the way the old editor's Mobile view did, so
 *   dragging the panel wider shows it wider.
 * - **"/" blocks:** a right-click on the email opens the email blocks at the
 *   pointer, and the one picked goes in under the block that was clicked.
 *   The + between blocks and "Add a block" on an empty email do the same.
 * - **A block's ⋮:** pressing a block opens its own options beside the
 *   pointer, the same fields the old options panel held. Closing it lets the
 *   block go.
 *
 * The blocks are stored as they always were, one list per email, so every
 * newsletter, template and system email opens and sends exactly as before.
 */
export function EmailPage({
  fields,
  change,
  blockDefaults,
  editable,
  lockedButtonUrl,
  renderStyle = "standard",
  onOpenSettings,
}: {
  fields: EmailEditableFields
  change: (update: (current: EmailEditableFields) => EmailEditableFields) => void
  blockDefaults: BroadcastBlockDefaults
  editable: boolean
  /** True in the app's own emails, where the button's target is not editable. */
  lockedButtonUrl?: boolean
  renderStyle?: EmailRenderStyle
  /** The subject and preview line were pressed: open the email's ⋮. */
  onOpenSettings: () => void
}) {
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  // Where the pointer last went down, so a block's ⋮ and the "/" list open
  // beside it rather than at a corner of the panel.
  const pointer = React.useRef({ x: 0, y: 0 })
  const [menuAt, setMenuAt] = React.useState<{ x: number; y: number } | null>(null)
  const [slashAt, setSlashAt] = React.useState<{ x: number; y: number; index: number } | null>(null)

  const selected = fields.blocks.find((block) => block.id === selectedId) ?? null

  // A press anywhere outside the email's blocks lets the picked block go, on
  // this panel or anywhere else on the screen (Tyler, 7 Nov 2026: "clicking
  // away should unselect the block"). Its own options box does not count as
  // away.
  const pageRef = React.useRef<HTMLDivElement | null>(null)
  React.useEffect(() => {
    if (!selectedId) return
    const away = (event: PointerEvent) => {
      const target = event.target as Element | null
      if (!target) return
      if (target.closest("[data-slot=popover-content], [data-slot=dropdown-menu-content], [role=dialog]")) return
      if (pageRef.current?.contains(target) && target.closest("[data-block]")) return
      setSelectedId(null)
      setMenuAt(null)
    }
    document.addEventListener("pointerdown", away)
    return () => document.removeEventListener("pointerdown", away)
  }, [selectedId])

  const insert = (kind: BroadcastBlockKind, index: number) => {
    const block = createBroadcastBlock(kind, blockDefaults)
    change((current) => ({
      ...current,
      blocks: [...current.blocks.slice(0, index), block, ...current.blocks.slice(index)],
    }))
  }

  const remove = (blockId: string) => {
    change((current) => ({ ...current, blocks: current.blocks.filter((block) => block.id !== blockId) }))
    setSelectedId((current) => (current === blockId ? null : current))
    setMenuAt(null)
  }

  /** The copy goes straight under the one it came from. */
  const duplicate = (blockId: string) => {
    const index = fields.blocks.findIndex((block) => block.id === blockId)
    const original = fields.blocks[index]
    if (!original) return
    const copy = { ...original, id: `${original.kind}-${crypto.randomUUID()}` } as BroadcastBlock
    change((current) => ({
      ...current,
      blocks: [...current.blocks.slice(0, index + 1), copy, ...current.blocks.slice(index + 1)],
    }))
  }

  const updateContent = (field: string, value: unknown) => {
    if (!selected) return
    change((current) => ({
      ...current,
      blocks: current.blocks.map((block) =>
        block.id === selected.id
          ? ({ ...block, content: { ...block.content, [field]: value } } as BroadcastBlock)
          : block
      ),
    }))
  }

  return (
    <div
      ref={pageRef}
      className="flex min-h-0 flex-1 flex-col"
      onPointerDownCapture={(event) => {
        pointer.current = { x: event.clientX, y: event.clientY }
      }}
      onContextMenu={(event) => {
        if (!editable) return
        const selection = window.getSelection()
        if (selection && !selection.isCollapsed) return
        event.preventDefault()
        // The new block goes under the one right-clicked, or at the end.
        const target = (event.target as HTMLElement).closest("[data-block]")
        const all = Array.from(event.currentTarget.querySelectorAll("[data-block]"))
        const at = target ? all.indexOf(target) + 1 : fields.blocks.length
        setSlashAt({ x: event.clientX, y: event.clientY, index: at })
      }}
    >
      <BroadcastCanvas
        inPanel
        blocks={fields.blocks}
        subject={fields.subject}
        preheader={fields.preheader}
        width="desktop"
        selectedBlockId={selectedId}
        disabled={!editable}
        renderStyle={renderStyle}
        // Pressing a block only picks it; its cog opens its options (Tyler,
        // 7 Nov 2026: "only clicking it opens the dropdown").
        onSelect={(blockId) => {
          setSelectedId(blockId)
          if (!blockId) setMenuAt(null)
        }}
        onOpenBlockSettings={(blockId, at) => {
          setSelectedId(blockId)
          setMenuAt(at)
        }}
        onRichTextChange={(blockId, html) =>
          change((current) => ({
            ...current,
            blocks: current.blocks.map((block) =>
              block.id === blockId && block.kind === "richText"
                ? { ...block, content: { ...block.content, htmlContent: html } }
                : block
            ),
          }))
        }
        onFieldChange={(field, value) => change((current) => ({ ...current, [field]: value }))}
        onOpenSettings={onOpenSettings}
        onReorder={(blocks) => change((current) => ({ ...current, blocks }))}
        onInsert={insert}
        onDuplicate={duplicate}
        onDelete={remove}
      />

      {/* A block's own ⋮: its options, beside where it was pressed. */}
      <Popover
        open={Boolean(selected && menuAt)}
        onOpenChange={(open) => {
          if (open) return
          setMenuAt(null)
          setSelectedId(null)
        }}
      >
        {menuAt ? (
          <PopoverTrigger asChild>
            <PointAnchor x={menuAt.x} y={menuAt.y} />
          </PopoverTrigger>
        ) : null}
        <PopoverContent
          align="end"
          side="bottom"
          collisionPadding={16}
          onInteractOutside={keepOpenForInnerBoxes}
          // `overflow-hidden` keeps the options' square card inside the box's
          // rounded edge (Tyler, 7 Nov 2026: "border is broken"). The options
          // scroll inside their own scroller, so the box only caps the height.
          // As tall as its options, up to 70% of the screen (Tyler, 7 Nov 2026:
          // "The dropdown is a fixed height thats too tall"). The options'
          // own scroller sizes to them and scrolls past the cap.
          className="flex max-h-[min(70vh,40rem)] w-[min(22rem,calc(100vw-2rem))] flex-col gap-0 overflow-hidden p-0 [&>div]:h-auto [&_[data-slot=scroll-area]]:flex-auto"
        >
          {selected ? (
            // The options' own heading names the block and holds its bin.
            <>
                <BlockInspector
                  inMenu
                  key={selected.id}
                  block={selected}
                  fields={fields}
                  disabled={!editable}
                  lockedButtonUrl={lockedButtonUrl}
                  onContentChange={updateContent}
                  onFieldChange={(field, value) => change((current) => ({ ...current, [field]: value }))}
                  onDelete={() => remove(selected.id)}
                />
            </>
          ) : null}
        </PopoverContent>
      </Popover>

      {/* The "/" list of email blocks, at the pointer. */}
      {slashAt ? (
        <DropdownMenu open onOpenChange={(open) => (open ? undefined : setSlashAt(null))} modal={false}>
          <DropdownMenuTrigger asChild>
            <PointAnchor x={slashAt.x} y={slashAt.y} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-52" onCloseAutoFocus={(event) => event.preventDefault()}>
            <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">Email blocks</DropdownMenuLabel>
            {BROADCAST_BLOCK_KINDS.map((kind) => {
              const Icon = BROADCAST_BLOCK_ICONS[kind]
              return (
                <DropdownMenuItem key={kind} onSelect={() => insert(kind, slashAt.index)}>
                  <Icon className="size-4 text-muted-foreground" />
                  {BROADCAST_BLOCK_META[kind].name}
                </DropdownMenuItem>
              )
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  )
}
