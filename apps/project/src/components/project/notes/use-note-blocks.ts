import * as React from "react"
import type { Editor, Extensions } from "@tiptap/core"
import { TextSelection } from "@tiptap/pm/state"

import { BLOCK_NODES, matchingBlocks, type BlockChoice, type BlockKey } from "@/components/project/notes/note-block-nodes"
import { dismissSlash, noteSlashExtension, type SlashBridge, type SlashMatch } from "@/components/project/notes/note-slash"
import { newFoldId } from "@/lib/project/note-blocks"

/**
 * The "/" list while it's open: what was typed, the note's editor, and where
 * on the page the "/" is. Opened by a right-click instead (`byPointer`), the
 * match is the empty spot clicked and the list hangs from the pointer.
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
  onKey: SlashBridge["onKey"] = (event, match, editor) => this.listener?.onKey(event, match, editor) ?? false
}

const ATOMS: Partial<Record<BlockKey, string>> = {
  image: "noteImage",
  video: "noteVideo",
  task: "noteTask",
  file: "noteFile",
  comments: "noteComments",
  record: "noteRecord",
  webpage: "noteWebPage",
  links: "noteLinks",
  divider: "horizontalRule",
  project: "noteProject",
  habit: "noteHabit",
  ratingMonth: "noteRatingMonth",
  ratingTrend: "noteRatingTrend",
  teamCheckins: "noteTeamCheckins",
  teamWorkload: "noteTeamWorkload",
  teamAttention: "noteTeamAttention",
  teamWeek: "noteTeamWeek",
  teamMembers: "noteTeamMembers",
  milestones: "noteMilestones",
}

/** Blocks a note holds once at most. */
const ONE_PER_NOTE: Partial<Record<BlockKey, string>> = {
  comments: "noteComments",
  habit: "noteHabit",
  // Each team block shows the whole team, so a second would only repeat it.
  teamCheckins: "noteTeamCheckins",
  teamWorkload: "noteTeamWorkload",
  teamAttention: "noteTeamAttention",
  teamWeek: "noteTeamWeek",
  teamMembers: "noteTeamMembers",
  // The project's milestones, all of them, so a second would only repeat it.
  milestones: "noteMilestones",
}

function hasNode(editor: Editor, type: string) {
  let found = false
  editor.state.doc.descendants((node) => {
    if (node.type.name === type) found = true
    return !found
  })
  return found
}

/** Puts the picked block where the "/" was typed. Blocks of words take over the line, keeping the cursor in it. */
function place(editor: Editor, match: SlashMatch, key: BlockKey) {
  const range = { from: match.from, to: match.to }
  // One Comments block per task, and one Daily card per page: picking it again takes away the
  // "/" and shows the one already there.
  const single = ONE_PER_NOTE[key]
  if (single && hasNode(editor, single)) {
    editor.chain().focus().deleteRange(range).run()
    editor.view.dom.querySelector(`[data-note-block="${single}"]`)?.scrollIntoView({ block: "nearest" })
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
 * The "/" blocks for one note, copied from Travel's
 * (`apps/travel/src/components/travel/use-note-blocks.ts`): the pieces to
 * hand the shell's editor, and the state `NoteBlocksMenu` draws the list
 * from. `choices` are the blocks this notes box offers (`blocksFor`). The
 * extensions are made once, since the shell's editor asks for the same ones
 * every render.
 */
export function useNoteBlocks(choices: BlockChoice[]) {
  const [relay] = React.useState(() => new SlashRelay())
  const [extensions] = React.useState<Extensions>(() => [noteSlashExtension(relay), ...BLOCK_NODES])
  const [open, setOpen] = React.useState<OpenSlash | null>(null)
  const [active, setActive] = React.useState(0)
  const items = open ? matchingBlocks(choices, open.match.query) : []

  function choose(key: BlockKey) {
    if (!open) return
    place(open.editor, open.match, key)
    if (open.byPointer) setOpen(null)
  }

  React.useEffect(() => {
    relay.listen({
      onChange(match, editor) {
        if (!match || !editor || editor.isDestroyed) {
          // A list opened by a right-click has no "/" to lose, so the editor's own
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
        // Read from what is typed now, not from the list on screen, so "/vid" and Enter typed
        // faster than the list draws still makes a Video block.
        const typed = matchingBlocks(choices, match.query)
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

  /**
   * A right-click in the note opens the same list at the pointer, with no "/"
   * typed (Tyler, 6 Nov 2026: "enable right click on left and right panel to
   * open the blocks"). The cursor is already where it was clicked, and the
   * picked block goes there.
   */
  function openAt(editor: Editor, x: number, y: number) {
    const at = editor.state.selection.from
    setActive(0)
    setOpen({ match: { from: at, to: at, query: "" }, editor, x, y, byPointer: true })
  }

  return {
    extensions,
    open: items.length ? open : null,
    items,
    active,
    setActive,
    choose,
    openAt,
    close: () => {
      if (!open) return
      if (open.byPointer) setOpen(null)
      else dismissSlash(open.editor)
    },
  }
}

export type NoteBlocks = ReturnType<typeof useNoteBlocks>
