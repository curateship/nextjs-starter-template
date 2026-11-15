import * as React from "react"
import type { Editor } from "@tiptap/core"
import { TextSelection } from "@tiptap/pm/state"

import { NoteBlocksMenu } from "@/components/travel/note-blocks-menu"
import { useNoteBlocks } from "@/components/travel/use-note-blocks"
import { DocumentEditor } from "@/components/shared/rich-text-editor"
import { cleanNoteBody, type NoteNode } from "@/lib/travel/note-blocks"
import { readNotes } from "@/lib/travel/notes"
import { cn } from "@/lib/utils"

/**
 * The basic blocks' look inside the editor, copied from Project's
 * `note-editor.tsx` (6 Nov 2026): a Checklist's tick boxes, the Divider's
 * line, and what a folded section hides.
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
`

/** A pause in typing this long saves (UI standard, "Settings"). */
const TYPING_SAVE_MS = 700

/**
 * Writing that saves itself, in the shell's editor with its toolbar over
 * selected words, as a task's notes are in Project. Used for an activity's
 * notes, a trip's description and a trip's notes. It saves 700ms after the
 * last letter, when the editor is left, and when it closes. `focus` puts the
 * blinking cursor at the end as soon as it shows. Typing "/" opens the list of
 * blocks: Image, Place, Video and Map (Travel features 3, `note-block-nodes.ts`).
 */
export function SavingDocument({
  value,
  onSave,
  placeholder = "Write something",
  focus = false,
  readOnly: noSignal = false,
  locked = false,
  cards = true,
  className,
}: {
  /** The saved document as JSON text, or "". Read once, when it first shows. */
  value: string
  onSave: (json: string) => Promise<unknown>
  placeholder?: string
  focus?: boolean
  /** Shown faded, not written in: with no signal nothing could be saved. */
  readOnly?: boolean
  /**
   * Shown, not written in, at full strength: Lock blocks on the trip's
   * description. The shell's editor fades whatever it can't write in, which
   * read as a shade over the locked panel (Tyler, 7 Nov 2026: "Why is there a
   * shade overlay when the left panel is locked?").
   */
  locked?: boolean
  /** Offer the Place and Map blocks, which point at the open trip's cards. Off for a note that belongs to no trip. */
  cards?: boolean
  className?: string
}) {
  const readOnly = noSignal || locked
  const [start] = React.useState(() => readNotes(value))
  // What was last saved, so the editor reporting the same words again (as it does when it is
  // locked and unlocked) sends nothing.
  const saved = React.useRef(JSON.stringify(start))
  const draft = React.useRef<NoteNode | null>(null)
  const blocks = useNoteBlocks({ cards })
  const timer = React.useRef(0)
  const box = React.useRef<HTMLDivElement>(null)
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

  // The editor draws a beat after mounting, so the cursor waits for it.
  React.useEffect(() => {
    if (!focus) return
    let tries = 0
    const timer = window.setInterval(() => {
      const editable = box.current?.querySelector<HTMLElement>(".tiptap")
      tries += 1
      if (editable || tries > 40) window.clearInterval(timer)
      if (!editable) return
      // The editor's own focus, at the end: a plain DOM focus on an empty note
      // left the editor with everything selected, and its text toolbar popped
      // up on open (Tyler, 3 Nov 2026).
      // An empty note gets a text cursor in its first line: focusing it any
      // other way kept the editor's starting select-all, which showed the toolbar.
      const editor = (
        editable as HTMLElement & {
          editor?: {
            isEmpty: boolean
            commands: { focus: (at: "end") => void }
            chain: () => { focus: () => { setTextSelection: (at: number) => { run: () => void } } }
          }
        }
      ).editor
      if (editor?.isEmpty) editor.chain().focus().setTextSelection(1).run()
      else if (editor) editor.commands.focus("end")
      else editable.focus()
    }, 50)
    return () => window.clearInterval(timer)
  }, [focus])

  return (
    <div
      ref={box}
      data-notes-editor=""
      className={cn(
        // A plain writing area, no box: the panel around it is the page.
        "[&>div:first-of-type]:rounded-none [&>div:first-of-type]:border-0 [&>div:first-of-type]:bg-transparent",
        // Nothing above a block that opens the page, so it sits straight under
        // the panel's header as on the shell's pages (UI standard, "A side
        // panel's body").
        "[&_.page-rte_.tiptap]:!min-h-[calc(3.3em+1.25rem)] [&_.page-rte_.tiptap]:!px-1 [&_.page-rte_.tiptap]:!pt-1 [&_.page-rte_.tiptap]:!pb-4",
        "[&_.page-rte_.tiptap:has(>.react-renderer:first-child)]:!pt-0",
        "[&_.page-rte_.tiptap]:!text-[0.9375rem] [&_.page-rte_.tiptap]:!leading-[1.65]",
        locked && !noSignal && "[&>div:first-of-type]:opacity-100",
        className
      )}
      // A right-click opens the "/" blocks at the pointer, putting the block where the click was. With words
      // selected, the browser's own menu stays, for Copy (the Admin 3 panel design, as in Project's notes).
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
          // Locked with no signal, nothing typed could be saved.
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
