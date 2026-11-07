import * as React from "react"
import type { Editor, Extensions } from "@tiptap/core"
import { TextSelection } from "@tiptap/pm/state"

import { BLOCK_NODE_NAMES, BLOCK_NODES, BLOCKS, matchingBlocks, type BlockKey } from "@/components/travel/note-block-nodes"
import { newFoldId } from "@/lib/travel/note-blocks"
import { dismissSlash, noteSlashExtension, type SlashBridge, type SlashMatch } from "@/components/travel/note-slash"

/**
 * The "/" list while it's open: what was typed, the note's editor, and where
 * on the page the "/" is. Opened by a right-click instead (`byPointer`), the
 * match is the empty spot clicked and the list hangs from the pointer, as in
 * Project's notes.
 */
export type OpenSlash = { match: SlashMatch; editor: Editor; x: number; y: number; byPointer?: boolean }

/** Place and Map pick their cards in a window first, then the block goes where the "/" was. */
export type PickingCards = { mode: "place" | "map"; match: SlashMatch; editor: Editor }

type Listener = { onChange: SlashBridge["onChange"]; onKey: SlashBridge["onKey"] }

/** Hands what the editor reports to whichever listener the note set last. Made once per note. */
class SlashRelay implements SlashBridge {
  private listener: Listener | null = null
  listen(listener: Listener) {
    this.listener = listener
  }
  onChange: SlashBridge["onChange"] = (match, editor) => this.listener?.onChange(match, editor)
  onKey: SlashBridge["onKey"] = (event) => this.listener?.onKey(event) ?? false
}

/** Blocks with no writing inside, put in whole where the "/" was. A Divider is the editor's own line. */
const ATOMS: Partial<Record<BlockKey, string>> = {
  image: "noteImage",
  video: "noteVideo",
  link: "noteLink",
  links: "noteLinks",
  divider: "horizontalRule",
}

/**
 * Puts the picked block where the "/" was typed, as Project's notes do. A
 * block with no writing inside goes in whole, with the cursor on the line under
 * it. A Checklist, Callout or Fold section takes over the line, keeping the
 * cursor in it.
 */
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
  if (key === "checklist") chain.toggleTaskList().run()
  else if (key === "callout") chain.wrapIn("noteCallout", { kind: "note" }).run()
  else if (key === "fold") chain.setNode("noteFold", { id: newFoldId() }).run()
  // A Callout or Fold heading is drawn by React a moment later, so the browser's cursor is put
  // inside it again once it's there. Without this the next letters typed land on the line below.
  if (key === "callout" || key === "fold") {
    window.requestAnimationFrame(() => {
      if (!editor.isDestroyed) editor.view.focus()
    })
  }
}

/**
 * The "/" blocks for one note (Travel features 3, part 1): the pieces to hand
 * the shell's editor, and the state `NoteBlocksMenu` draws the list and the
 * card picker from. The extensions are made once, since the shell's editor
 * asks for the same ones every render. With `cards` off, for a note that
 * belongs to no trip (a saved place's, Travel features 4, part 11), Place and
 * Map aren't offered and aren't known to the editor at all, so one pasted in
 * from a trip's note is dropped rather than drawn without its trip.
 */
export function useNoteBlocks({ cards = true }: { cards?: boolean } = {}) {
  const [relay] = React.useState(() => new SlashRelay())
  // The blocks this note offers: a note away from a trip has no card blocks.
  const [keys] = React.useState(() =>
    BLOCKS.map((block) => block.key).filter((key) => cards || (key !== "place" && key !== "map"))
  )
  const [extensions] = React.useState<Extensions>(() => {
    const names = new Set(keys.flatMap((key) => BLOCK_NODE_NAMES[key]))
    return [noteSlashExtension(relay), ...BLOCK_NODES.filter((node) => names.has(node.name))]
  })
  const [open, setOpen] = React.useState<OpenSlash | null>(null)
  const [active, setActive] = React.useState(0)
  const [picking, setPicking] = React.useState<PickingCards | null>(null)
  const items = open ? matchingBlocks(open.match.query).filter((block) => keys.includes(block.key)) : []

  function choose(key: BlockKey) {
    if (!open) return
    const { editor, match } = open
    if (open.byPointer) setOpen(null)
    if (key !== "place" && key !== "map") {
      place(editor, match, key)
      return
    }
    // The "/" stays as typed if the window is closed without picking.
    dismissSlash(editor)
    setPicking({ mode: key, match, editor })
  }

  function placePicked(activityIds: string[]) {
    const was = picking
    setPicking(null)
    if (!was || was.editor.isDestroyed || !activityIds.length) return
    was.editor
      .chain()
      .focus()
      .insertContentAt(
        { from: was.match.from, to: was.match.to },
        was.mode === "place"
          ? { type: "notePlace", attrs: { activityId: activityIds[0] } }
          : { type: "noteMap", attrs: { activityIds } }
      )
      .run()
  }

  /**
   * Opens the blocks at the pointer, from a right-click in the note (the Admin
   * 3 panel design, 6 Nov 2026: right-click opens the blocks, as in Project).
   * The cursor is already where it was clicked, and the picked block goes
   * there.
   */
  function openAt(editor: Editor, x: number, y: number) {
    const at = editor.state.selection.from
    setActive(0)
    setOpen({ match: { from: at, to: at, query: "" }, editor, x, y, byPointer: true })
  }

  React.useEffect(() => {
    relay.listen({
      onChange(match, editor) {
        if (!match || !editor || editor.isDestroyed) {
          // A list a right-click opened has no "/" behind it, so the editor's own
          // updates (the cursor placed, the focus) leave it open; a pick, Escape or a
          // click elsewhere closes it.
          setOpen((was) => (was?.byPointer && editor && !editor.isDestroyed ? was : null))
          return
        }
        let at: { left: number; bottom: number }
        try {
          at = editor.view.coordsAtPos(match.from)
        } catch {
          // A browser that can't measure the "/" hangs the list from the note's own top edge.
          at = editor.view.dom.getBoundingClientRect()
        }
        setOpen((was) => {
          if (was?.match.query !== match.query) setActive(0)
          return was && was.match.from === match.from && was.match.to === match.to && was.match.query === match.query && was.x === at.left && was.y === at.bottom
            ? was
            : { match, editor, x: at.left, y: at.bottom }
        })
      },
      onKey(event) {
        if (!items.length) return false
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          const step = event.key === "ArrowDown" ? 1 : -1
          setActive((active + step + items.length) % items.length)
          return true
        }
        if (event.key === "Enter" || event.key === "Tab") {
          choose(items[Math.min(active, items.length - 1)].key)
          return true
        }
        return false
      },
    })
  })

  return {
    cards,
    extensions,
    open: items.length ? open : null,
    items,
    active,
    setActive,
    choose,
    close: () => {
      if (!open) return
      if (open.byPointer) setOpen(null)
      else dismissSlash(open.editor)
    },
    openAt,
    picking,
    cancelPicking: () => setPicking(null),
    placePicked,
  }
}

export type NoteBlocks = ReturnType<typeof useNoteBlocks>
