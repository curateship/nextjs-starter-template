import * as React from "react"
import type { Editor, Extensions } from "@tiptap/core"
import { TextSelection } from "@tiptap/pm/state"

import { BLOCK_NODE_NAMES, BLOCK_NODES, blocksFor, EmptyLineAboveBlock, matchingBlocks, type BlockKey } from "@/components/trade/notes/note-block-nodes"
import { newFoldId, type TradePageKind } from "@/lib/trade/note-blocks"
import { dismissSlash, noteSlashExtension, type SlashBridge, type SlashMatch } from "@/components/trade/notes/note-slash"

/**
 * The "/" list while it's open: what was typed, the note's editor, and where
 * on the page the "/" is. Opened by a right-click instead (`byPointer`), the
 * match is the empty spot clicked and the list hangs from the pointer, as in
 * Project's notes.
 */
export type OpenSlash = { match: SlashMatch; editor: Editor; x: number; y: number; byPointer?: boolean }

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
  rules: "noteRules",
  manualTrades: "noteManualTrades",
  gridTrades: "noteGridTrades",
  dcaTrades: "noteDcaTrades",
  alerts: "noteAlerts",
  scanner: "noteScanner",
  folders: "noteFolders",
  marketInfo: "noteMarketInfo",
}

/**
 * Blocks a page holds once at most: each draws the one live panel the
 * dashboard has, and the Rules box can only be drawn in one place.
 */
const ONE_PER_NOTE: Partial<Record<BlockKey, string>> = {
  rules: "noteRules",
  manualTrades: "noteManualTrades",
  gridTrades: "noteGridTrades",
  dcaTrades: "noteDcaTrades",
  alerts: "noteAlerts",
  scanner: "noteScanner",
  folders: "noteFolders",
  marketInfo: "noteMarketInfo",
}

function hasNode(editor: Editor, type: string) {
  let found = false
  editor.state.doc.descendants((node) => {
    if (node.type.name === type) found = true
    return !found
  })
  return found
}

/**
 * Puts the picked block where the "/" was typed, as Project's notes do. A
 * block with no writing inside goes in whole, with the cursor on the line under
 * it. A Checklist, Callout or Fold section takes over the line, keeping the
 * cursor in it.
 */
function place(editor: Editor, match: SlashMatch, key: BlockKey) {
  const range = { from: match.from, to: match.to }
  // Picking a block the page already holds takes away the "/" and shows the one already there.
  const single = ONE_PER_NOTE[key]
  if (single && hasNode(editor, single)) {
    editor.chain().focus().deleteRange(range).run()
    editor.view.dom.querySelector(`[data-trade-block="${single}"]`)?.scrollIntoView({ block: "nearest" })
    return
  }
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
 * The "/" blocks for one page: the pieces to hand the shell's editor, and the
 * state `NoteBlocksMenu` draws the list from. The extensions are made once,
 * since the shell's editor asks for the same ones every render. A market's
 * page offers the Market info block and not the exchange's blocks, and the
 * exchange's page the other way round, so a block pasted onto the wrong page
 * is dropped rather than drawn.
 */
export function useNoteBlocks({ page }: { page: TradePageKind }) {
  const [relay] = React.useState(() => new SlashRelay())
  const [keys] = React.useState(() => blocksFor(page))
  const [extensions] = React.useState<Extensions>(() => {
    const names = new Set(keys.flatMap((key) => BLOCK_NODE_NAMES[key]))
    return [noteSlashExtension(relay), ...BLOCK_NODES.filter((node) => node === EmptyLineAboveBlock || names.has(node.name))]
  })
  const [open, setOpen] = React.useState<OpenSlash | null>(null)
  const [active, setActive] = React.useState(0)
  const items = open ? matchingBlocks(open.match.query).filter((block) => keys.includes(block.key)) : []

  function choose(key: BlockKey) {
    if (!open) return
    const { editor, match } = open
    if (open.byPointer) setOpen(null)
    place(editor, match, key)
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
  }
}

export type NoteBlocks = ReturnType<typeof useNoteBlocks>
