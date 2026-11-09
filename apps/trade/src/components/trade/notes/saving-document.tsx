import * as React from "react"
import type { Editor } from "@tiptap/core"
import { TextSelection } from "@tiptap/pm/state"

import { NoteBlocksMenu } from "@/components/trade/notes/note-blocks-menu"
import { useNoteBlocks } from "@/components/trade/notes/use-note-blocks"
import { DocumentEditor } from "@/components/shared/rich-text-editor"
import { cleanNoteBody, type NoteNode } from "@/lib/trade/note-blocks"
import { readPageBody } from "@/lib/trade/trade-pages"
import { cn } from "@/lib/utils"

/**
 * The basic blocks' look inside the editor, copied from Project's
 * `note-editor.tsx` (6 Nov 2026): a Checklist's tick boxes, the Divider's
 * line, and what a folded section hides.
 */
/*
 * Blocks sit 15px apart, the panel's own gutter, the same space as from the
 * panel's edge (Tyler, 7 Nov 2026, pointing at the gap between two cards on
 * Project's page: "This should be the gutter size for the blocks"). Project's
 * pattern: each block (`data-note-block`) takes 15px above and below, and the
 * two margins between blocks meet in one 15px gap. A block that opens the page
 * takes none above, so it sits right under the panel's 15px edge. The writing
 * area adds no padding of its own.
 */
const BLOCK_STYLES = `
  .page-rte .tiptap ul[data-type="taskList"] { list-style: none; padding-left: 0; }
  .page-rte .tiptap ul[data-type="taskList"] li { display: flex; align-items: flex-start; gap: 0.5em; }
  .page-rte .tiptap ul[data-type="taskList"] li > label { flex: none; display: flex; align-items: center; height: 1.65em; user-select: none; }
  .page-rte .tiptap ul[data-type="taskList"] li > label input { width: 1em; height: 1em; margin: 0; accent-color: var(--primary); cursor: pointer; }
  .page-rte .tiptap ul[data-type="taskList"] li > div { flex: 1; min-width: 0; }
  .page-rte .tiptap ul[data-type="taskList"] li > div > p { margin-bottom: 0.2em; }
  .page-rte .tiptap ul[data-type="taskList"] li[data-checked="true"] > div { color: var(--muted-foreground); text-decoration: line-through; }
  .page-rte .tiptap hr { border: 0; border-top: 1px solid var(--border); margin: 1em 0; }
  .page-rte .tiptap hr.ProseMirror-selectednode { border-top-color: var(--ring); }
  .page-rte .tiptap .note-folded-away { display: none; }
  .page-rte .tiptap [data-note-block] { margin-top: 15px; margin-bottom: 15px; }
  .page-rte .tiptap > .react-renderer:first-child [data-note-block] { margin-top: 0; }
  .page-rte .tiptap [data-note-block]:has(.trade-block-fills) { margin-bottom: 0; }
  .page-rte .tiptap:has(.trade-block-fills) > p:last-child:has(> br.ProseMirror-trailingBreak:only-child) { height: 0; margin: 0; overflow: hidden; }
`

/*
 * While the last block fills the panel (`useFillHeight` in
 * `trade-block-views.tsx`), nothing under it may push the page past the
 * panel, or the page scrolls as well as the block's list: two scrollbars
 * side by side (Tyler, 8 Nov 2026: "theres 2 areascroll here"). So the
 * writing area's bottom padding (the `:has(.trade-block-fills)` rule on its
 * class below), the block's bottom margin and the page's empty last line
 * take no room. The line is still there to write in, and
 * once it holds words it shows again and the block stops filling.
 */

/**
 * Where a click at height `y` in the writing area falls, when that is above
 * the first block or between two blocks with no line of writing there: the
 * place to start a new line. Null when the click is beside writing already.
 */
function lineBetweenBlocks(editor: Editor, y: number): number | null {
  const doc = editor.state.doc
  let pos = 0
  for (let index = 0; index < doc.childCount; index += 1) {
    const node = doc.child(index)
    const dom = editor.view.nodeDOM(pos)
    if (dom instanceof HTMLElement && y < dom.getBoundingClientRect().top) {
      const before = index > 0 ? doc.child(index - 1) : null
      return !node.isTextblock && (!before || !before.isTextblock) ? pos : null
    }
    pos += node.nodeSize
  }
  return null
}

/** A pause in typing this long saves (UI standard, "Settings"). */
const TYPING_SAVE_MS = 700

/**
 * A Trade page that saves itself, copied from Travel's `saving-document.tsx`
 * (7 Nov 2026): the shell's editor with its toolbar over selected words. It
 * saves 700ms after the last letter, when the editor is left, and when it
 * closes. Typing "/" or a right-click opens the list of blocks
 * (`note-block-nodes.ts`). Used for the exchange's page on the dashboard's
 * left and the All markets page on its right.
 */
export function SavingDocument({
  value,
  onSave,
  placeholder = "Write something",
  locked = false,
  className,
  flushRef,
}: {
  /** The page's document as JSON text, or "". Read once, when it first shows. */
  value: string
  onSave: (json: string) => Promise<unknown>
  /**
   * Handed the save-now, so the dashboard can save what was just typed
   * before it moves to another exchange, which draws this page again.
   */
  flushRef?: React.MutableRefObject<(() => void) | null>
  placeholder?: string
  /**
   * Shown, not written in, at full strength: Lock the notes. The shell's editor fades whatever it can't write in, which
   * read as a shade over the locked panel (Tyler, 7 Nov 2026: "Why is there a
   * shade overlay when the left panel is locked?").
   */
  locked?: boolean
  className?: string
}) {
  const readOnly = locked
  const [start] = React.useState(() => readPageBody(value))
  // What was last saved, so the editor reporting the same words again (as it does when it is
  // locked and unlocked) sends nothing.
  const saved = React.useRef(JSON.stringify(start))
  const draft = React.useRef<NoteNode | null>(null)
  const blocks = useNoteBlocks()
  const timer = React.useRef(0)
  const saveRef = React.useRef(onSave)
  React.useEffect(() => {
    saveRef.current = onSave
  })

  const flush = React.useCallback(() => {
    window.clearTimeout(timer.current)
    const next = draft.current
    if (!next) return
    draft.current = null
    const json = JSON.stringify(next)
    if (json === saved.current) return
    saved.current = json
    void saveRef.current(json)
  }, [])

  // Closing, or opening another, saves what was typed.
  React.useEffect(() => flush, [flush])
  React.useEffect(() => {
    if (!flushRef) return
    flushRef.current = flush
    return () => {
      if (flushRef.current === flush) flushRef.current = null
    }
  }, [flush, flushRef])


  return (
    <div
      data-notes-editor=""
      className={cn(
        // A plain writing area, no box: the panel around it is the page.
        "[&>div:first-of-type]:rounded-none [&>div:first-of-type]:border-0 [&>div:first-of-type]:bg-transparent",
        // The panel's 15px top edge is the writing area's own, so a click there
        // lands in the page (Tyler, 7 Nov 2026: "cant click here").
        "[&_.page-rte_.tiptap]:!min-h-[calc(3.3em+1.25rem)] [&_.page-rte_.tiptap]:!px-0 [&_.page-rte_.tiptap]:!pt-3.75 [&_.page-rte_.tiptap]:!pb-4 [&_.page-rte_.tiptap:has(.trade-block-fills)]:!pb-0",
        "[&_.page-rte_.tiptap]:!text-[0.9375rem] [&_.page-rte_.tiptap]:!leading-[1.65]",
        locked && "[&>div:first-of-type]:opacity-100",
        className
      )}
      // A right-click opens the "/" blocks at the pointer, putting the block where the click was. With words
      // selected, the browser's own menu stays, for Copy (the Admin 3 panel design, as in Project's notes).
      // A click in the space above the first block, or between two blocks,
      // starts a line there to write on. The writing area itself has no line
      // in those places, so the click used to do nothing (Tyler, 7 Nov 2026:
      // "cant click here").
      onMouseDown={(event) => {
        if (readOnly || event.button !== 0) return
        const area = event.currentTarget.querySelector<HTMLElement & { editor?: Editor }>(".tiptap")
        const editor = area?.editor
        if (!editor || editor.isDestroyed || !editor.isEditable || event.target !== area) return
        const at = lineBetweenBlocks(editor, event.clientY)
        if (at === null) return
        event.preventDefault()
        editor
          .chain()
          .command(({ tr }) => {
            tr.insert(at, editor.schema.nodes.paragraph.create())
            tr.setSelection(TextSelection.create(tr.doc, at + 1))
            return true
          })
          .focus()
          .run()
      }}
      onContextMenu={(event) => {
        if (readOnly) return
        const selected = window.getSelection()
        if (selected && !selected.isCollapsed) return
        const area = event.currentTarget.querySelector<HTMLElement & { editor?: Editor }>(".tiptap")
        const editor = area?.editor
        if (!editor || editor.isDestroyed || !editor.isEditable) return
        // A block's own right-click (a card's, a picture's) is left alone.
        const target = event.target
        if (!(target instanceof Element) || !area.contains(target) || target.closest(".react-renderer")) return
        event.preventDefault()
        // The cursor goes where the click was, or to the end when it was past the words.
        const hit = editor.view.posAtCoords({ left: event.clientX, top: event.clientY })
        const doc = editor.state.doc
        const pos = hit ? hit.pos : doc.content.size
        editor.chain().focus().setTextSelection(TextSelection.near(doc.resolve(Math.min(pos, doc.content.size))).from).run()
        blocks.openAt(editor, event.clientX, event.clientY)
      }}
      onBlur={(event) => {
        const next = event.relatedTarget
        // The link box sits outside the writing area, so moving into it isn't leaving.
        if (next instanceof Element && (event.currentTarget.contains(next) || next.closest("[data-slot=popover-content]"))) {
          return
        }
        flush()
      }}
    >
      <style>{BLOCK_STYLES}</style>
      <DocumentEditor<NoteNode>
        value={start}
        disabled={readOnly}
        placeholder={placeholder}
        extensions={blocks.extensions}
        clean={cleanNoteBody}
        onChange={(body) => {
          if (readOnly) return
          draft.current = body
          window.clearTimeout(timer.current)
          timer.current = window.setTimeout(flush, TYPING_SAVE_MS)
        }}
      />
      <NoteBlocksMenu blocks={blocks} />
    </div>
  )
}
