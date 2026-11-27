import * as React from "react"
import { createPortal } from "react-dom"
import type { Editor, Extensions } from "@tiptap/core"
import { TextSelection } from "@tiptap/pm/state"

import { BLOCK_NODES, matchingBlocks, type BlockKey } from "@/components/phones/rack-note-nodes"
import { dismissSlash, noteSlashExtension, type SlashBridge, type SlashMatch } from "@/components/phones/rack-note-slash"
import { usePromoSaveStatus } from "@/components/social/guest/guest-mode"
import { DocumentEditor } from "@/components/shared/rich-text-editor"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { getPhoneErrorMessage, saveRack } from "@/lib/api/phones/phones"
import { cleanRackNoteBody, newFoldId, readRackNotes, type RackNoteNode } from "@/lib/phones/rack-notes"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

/** The notes save this long after the last letter, as every setting does. */
const SAVE_AFTER_MS = 700

/** The blocks' look inside the editor, as in Project. */
const BLOCK_STYLES = `
  .page-rte .tiptap hr { border: 0; border-top: 1px solid var(--border); margin: 1em 0; }
  .page-rte .tiptap hr.ProseMirror-selectednode { border-top-color: var(--ring); }
  .page-rte .tiptap .note-folded-away { display: none; }
  .page-rte .tiptap [data-note-atom] ul, .page-rte .tiptap [data-note-atom] ol { list-style: none; padding-left: 0; margin: 0; }
  .page-rte .tiptap [data-note-atom] li { margin: 0; }
  .page-rte .tiptap [data-note-atom] p { margin: 0; }
`

/**
 * A rack's notes, in place of its left panel's body while the notes icon is
 * pressed (Racks dashboard, part 90; Tyler, 5 Nov 2026: "Need tiptap editor
 * with blocks ability too"). The shell's editor with "/" blocks copied from
 * Project: typing "/" at the start of a line or after a space lists Image,
 * Video, Callout, Divider, Fold section and Links. The notes save themselves
 * 700ms after the last letter and when they are left, with Saving… and Saved
 * in the page header. While open they are never drawn again from what was
 * saved, so a late save can't take back what was just written.
 */
export function RackNotes({ rackId, stored }: { rackId: string; stored: string }) {
  const [start] = React.useState(() => readRackNotes(stored))
  const setSaveStatus = usePromoSaveStatus()
  const draft = React.useRef<RackNoteNode | null>(null)
  const timer = React.useRef(0)
  const blocks = useNoteBlocks()

  const flush = React.useCallback(() => {
    window.clearTimeout(timer.current)
    const next = draft.current
    if (!next) return
    draft.current = null
    setSaveStatus("saving")
    saveRack({ rackId, notes: next })
      .then(() => setSaveStatus("saved"))
      .catch((error: unknown) => {
        // Kept to try again with the next letter or when the notes are left.
        draft.current ??= next
        setSaveStatus("idle")
        showErrorToast(getPhoneErrorMessage(error))
      })
  }, [rackId, setSaveStatus])

  // Closing the notes, or leaving the rack, saves what was typed.
  React.useEffect(() => flush, [flush])

  return (
    <ScrollArea className="relative min-h-0 flex-1">
      <style>{BLOCK_STYLES}</style>
      <div
        className={cn(
          "p-3",
          // A plain writing area, no box: the panel around it is the page.
          "[&_[data-note-box]>div]:rounded-none [&_[data-note-box]>div]:border-0 [&_[data-note-box]>div]:bg-transparent",
          "[&_.page-rte_.tiptap]:!min-h-64 [&_.page-rte_.tiptap]:!px-0 [&_.page-rte_.tiptap]:!pt-0",
          "[&_.page-rte_.tiptap]:!text-[0.9375rem] [&_.page-rte_.tiptap]:!leading-[1.65]"
        )}
        onBlur={(event) => {
          const next = event.relatedTarget
          // A block's own boxes, the "/" list and the media library sit outside the writing area.
          if (
            next instanceof Element &&
            (event.currentTarget.contains(next) || next.closest("[data-radix-popper-content-wrapper], [data-slot=popover-content], [role=dialog]"))
          ) {
            return
          }
          flush()
        }}
      >
        <div data-note-box="">
          <DocumentEditor<RackNoteNode>
            value={start}
            extensions={blocks.extensions}
            clean={cleanRackNoteBody}
            placeholder="Notes about this rack. Type / for a picture, a video, a callout, a fold section or links."
            onChange={(body) => {
              draft.current = body
              dismissErrorToast()
              window.clearTimeout(timer.current)
              timer.current = window.setTimeout(flush, SAVE_AFTER_MS)
            }}
          />
        </div>
        <NoteBlocksMenu blocks={blocks} />
      </div>
    </ScrollArea>
  )
}

/** The "/" list while it's open: what was typed, the notes' editor, and where on the page the "/" is. */
type OpenSlash = { match: SlashMatch; editor: Editor; x: number; y: number }

type Listener = { onChange: SlashBridge["onChange"]; onKey: SlashBridge["onKey"] }

/** Hands what the editor reports to whichever listener the notes set last. Made once per notes box. */
class SlashRelay implements SlashBridge {
  private listener: Listener | null = null
  listen(listener: Listener) {
    this.listener = listener
  }
  onChange: SlashBridge["onChange"] = (match, editor) => this.listener?.onChange(match, editor)
  onKey: SlashBridge["onKey"] = (event, match, editor) => this.listener?.onKey(event, match, editor) ?? false
}

const ATOMS: Partial<Record<BlockKey, string>> = {
  image: "noteImage",
  video: "noteVideo",
  links: "noteLinks",
  divider: "horizontalRule",
}

/** Puts the picked block where the "/" was typed. Blocks of words take over the line, keeping the cursor in it. */
function place(editor: Editor, match: SlashMatch, key: BlockKey) {
  const range = { from: match.from, to: match.to }
  const atom = ATOMS[key]
  if (atom) {
    editor.chain().focus().insertContentAt(range, { type: atom }).run()
    // The cursor goes to the line under the block, made if there is none, so typing on never replaces it.
    const { selection, doc } = editor.state
    if (!selection.$from.parent.isTextblock) {
      const after = selection.to
      const next = doc.nodeAt(after)
      editor
        .chain()
        .command(({ tr }) => {
          if (!next?.isTextblock) tr.insert(after, editor.schema.nodes.paragraph.create())
          tr.setSelection(TextSelection.create(tr.doc, after + 1))
          return true
        })
        .run()
    }
    return
  }
  editor.chain().focus().deleteRange(range).run()
  // Words already on the line stay where they are, and the new block starts on the next line.
  if (editor.state.selection.$from.parent.textContent.trim()) editor.chain().splitBlock().run()
  const chain = editor.chain().focus()
  if (key === "callout") chain.wrapIn("noteCallout", { kind: "note" }).run()
  else if (key === "fold") chain.setNode("noteFold", { id: newFoldId() }).run()
  // A Callout or Fold heading is drawn by React a moment later, so the cursor is put inside it again once it's there.
  window.requestAnimationFrame(() => {
    if (!editor.isDestroyed) editor.view.focus()
  })
}

/**
 * The "/" blocks for one notes box, copied from Project's
 * (`apps/project/src/components/project/notes/use-note-blocks.ts`): the pieces
 * to hand the shell's editor, and the state the list is drawn from. The
 * extensions are made once, since the shell's editor asks for the same ones
 * every render.
 */
function useNoteBlocks() {
  const [relay] = React.useState(() => new SlashRelay())
  const [extensions] = React.useState<Extensions>(() => [noteSlashExtension(relay), ...BLOCK_NODES])
  const [open, setOpen] = React.useState<OpenSlash | null>(null)
  const [active, setActive] = React.useState(0)
  const items = open ? matchingBlocks(open.match.query) : []

  React.useEffect(() => {
    relay.listen({
      onChange(match, editor) {
        if (!match || !editor || editor.isDestroyed) {
          setOpen(null)
          return
        }
        let at: { left: number; bottom: number }
        try {
          at = editor.view.coordsAtPos(match.from)
        } catch {
          // A browser that can't measure the "/" hangs the list from the notes' own top edge.
          at = editor.view.dom.getBoundingClientRect()
        }
        setOpen((was) => {
          if (was?.match.query !== match.query) setActive(0)
          return was &&
            was.match.from === match.from &&
            was.match.to === match.to &&
            was.match.query === match.query &&
            was.x === at.left &&
            was.y === at.bottom
            ? was
            : { match, editor, x: at.left, y: at.bottom }
        })
      },
      onKey(event, match, editor) {
        // Read from what is typed now, so "/vid" and Enter typed faster than the list draws still makes a Video block.
        const typed = matchingBlocks(match.query)
        if (!typed.length) return false
        const current = open?.match.query === match.query ? Math.min(active, typed.length - 1) : 0
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          const step = event.key === "ArrowDown" ? 1 : -1
          setActive((current + step + typed.length) % typed.length)
          return true
        }
        if (event.key === "Enter" || event.key === "Tab") {
          place(editor, match, typed[current].key)
          return true
        }
        return false
      },
    })
  })

  return {
    extensions,
    open: items.length ? open : null,
    items,
    active,
    setActive,
    choose: (key: BlockKey) => (open ? place(open.editor, open.match, key) : undefined),
    close: () => (open ? dismissSlash(open.editor) : undefined),
  }
}

type NoteBlocks = ReturnType<typeof useNoteBlocks>

/** A point on the page for the list to hang from: the "/" just typed. */
const CaretAnchor = React.forwardRef<HTMLSpanElement, { x: number; y: number }>(function CaretAnchor({ x, y, ...props }, ref) {
  return createPortal(
    <span ref={ref} aria-hidden {...props} className="pointer-events-none fixed size-0" style={{ left: x, top: y }} />,
    document.body
  )
})

/**
 * The list "/" opens, copied from Project. The cursor stays in the notes:
 * the arrow keys move through the list, Enter or a click picks, and Esc or a
 * click away closes it, leaving the "/" as typed.
 */
function NoteBlocksMenu({ blocks }: { blocks: NoteBlocks }) {
  const { open, items, active } = blocks
  if (!open) return null
  return (
    <Popover open modal={false} onOpenChange={(next) => (next ? undefined : blocks.close())}>
      <PopoverTrigger asChild>
        <CaretAnchor x={open.x} y={open.y} />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        aria-label="Blocks"
        className="w-max min-w-56 gap-0 p-2 text-[13px]"
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
        // The cursor lives in the notes, outside the list, so focus there isn't leaving it.
        onFocusOutside={(event) => event.preventDefault()}
      >
        <div role="listbox" aria-label="Blocks" className="grid">
          {items.map((item, index) => {
            const Icon = item.icon
            return (
              <button
                key={item.key}
                type="button"
                role="option"
                aria-selected={index === active}
                className={cn("flex min-h-8 items-center gap-2 rounded-md px-2.5 py-1.5 text-left hover:bg-accent", index === active && "bg-accent")}
                // Pressing the list must not take the cursor out of the notes.
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => blocks.setActive(index)}
                onClick={() => blocks.choose(item.key)}
              >
                <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="grid">
                  <span>{item.label}</span>
                  <span className="text-xs text-muted-foreground">{item.hint}</span>
                </span>
              </button>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}
