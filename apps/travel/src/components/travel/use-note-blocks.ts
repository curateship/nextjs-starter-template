import * as React from "react"
import type { Editor, Extensions } from "@tiptap/core"

import { BLOCK_NODES, matchingBlocks, type BlockKey } from "@/components/travel/note-block-nodes"
import { dismissSlash, noteSlashExtension, type SlashBridge, type SlashMatch } from "@/components/travel/note-slash"

/** The "/" list while it's open: what was typed, the note's editor, and where on the page the "/" is. */
export type OpenSlash = { match: SlashMatch; editor: Editor; x: number; y: number }

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
  const [extensions] = React.useState<Extensions>(() => [
    noteSlashExtension(relay),
    ...(cards ? BLOCK_NODES : BLOCK_NODES.filter((node) => node.name !== "notePlace" && node.name !== "noteMap")),
  ])
  const [open, setOpen] = React.useState<OpenSlash | null>(null)
  const [active, setActive] = React.useState(0)
  const [picking, setPicking] = React.useState<PickingCards | null>(null)
  const items = open ? matchingBlocks(open.match.query).filter((block) => cards || (block.key !== "place" && block.key !== "map")) : []

  function choose(key: BlockKey) {
    if (!open) return
    const { editor, match } = open
    if (key === "image" || key === "video" || key === "link") {
      const type = key === "image" ? "noteImage" : key === "video" ? "noteVideo" : "noteLink"
      editor.chain().focus().insertContentAt({ from: match.from, to: match.to }, { type }).run()
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
    close: () => (open ? dismissSlash(open.editor) : undefined),
    picking,
    cancelPicking: () => setPicking(null),
    placePicked,
  }
}

export type NoteBlocks = ReturnType<typeof useNoteBlocks>
