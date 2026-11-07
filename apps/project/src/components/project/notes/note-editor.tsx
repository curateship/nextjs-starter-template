import * as React from "react"
import type { Editor, Extensions } from "@tiptap/core"
import { TextSelection } from "@tiptap/pm/state"

import { blocksFor } from "@/components/project/notes/note-block-nodes"
import { NoteBlocksMenu } from "@/components/project/notes/note-blocks-menu"
import { NoteReader } from "@/components/project/notes/note-reader"
import { NoteSetupProvider, type NoteSetup } from "@/components/project/notes/note-setup"
import { useNoteBlocks } from "@/components/project/notes/use-note-blocks"
import { DocumentEditor } from "@/components/shared/rich-text-editor"
import { cleanDashboardBody, cleanNoteBody, type NoteNode } from "@/lib/project/note-blocks"

/**
 * The shell's editor with Project's "/" blocks (Project note blocks task):
 * used by a task's notes, New task's and quick new task's description, and a
 * project's page. Typing "/" opens the list; what this box offers
 * depends on `setup.where` (`blocksFor`). What is saved is cleaned to what a
 * Project note may hold (`cleanNoteBody`).
 */

/**
 * The blocks' look inside the editor. The note's own list and paragraph rules
 * stay out of a block with no writing in it, so a task search's list never
 * grows bullets.
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
  .page-rte .tiptap [data-note-atom] ul, .page-rte .tiptap [data-note-atom] ol { list-style: none; padding-left: 0; margin: 0; }
  .page-rte .tiptap [data-note-atom] li { margin: 0; }
  .page-rte .tiptap [data-note-atom] p { margin: 0; }
`

/** What a notes box wraps its editor and its drawing in: the blocks' setup and their look. */
function NoteFrame({ setup, children }: { setup: NoteSetup; children: React.ReactNode }) {
  return (
    <NoteSetupProvider setup={setup}>
      <style>{BLOCK_STYLES}</style>
      {children}
    </NoteSetupProvider>
  )
}

export function NoteEditor({
  setup,
  value,
  onChange,
  placeholder,
  extensions,
  disabled,
}: {
  setup: NoteSetup
  value: NoteNode
  onChange: (body: NoteNode) => void
  placeholder: string
  disabled?: boolean
  /** More of the note's own behaviour, such as # task links. Pass the same array every render. */
  extensions?: Extensions
}) {
  const blocks = useNoteBlocks(blocksFor(setup.where, Boolean(setup.task?.link)))
  // Made once: the shell's editor is made with the extensions it first gets.
  const [all] = React.useState<Extensions>(() => [...(extensions ?? []), ...blocks.extensions])
  return (
    <NoteFrame setup={setup}>
      <div
        data-note-box=""
        // A right-click in the note opens the "/" list there (Tyler, 6 Nov 2026). Words
        // already selected keep the browser's own menu, for Copy.
        onContextMenu={(event) => {
          if (disabled) return
          const selected = window.getSelection()
          if (selected && !selected.isCollapsed) return
          const area = event.currentTarget.querySelector<HTMLElement & { editor?: Editor }>(".tiptap")
          const editor = area?.editor
          if (!editor || editor.isDestroyed || !editor.isEditable) return
          event.preventDefault()
          // The cursor goes where the click was, or to the end when it was past the words.
          const hit = editor.view.posAtCoords({ left: event.clientX, top: event.clientY })
          const doc = editor.state.doc
          const pos = hit ? hit.pos : doc.content.size
          editor.chain().focus().setTextSelection(TextSelection.near(doc.resolve(Math.min(pos, doc.content.size))).from).run()
          blocks.openAt(editor, event.clientX, event.clientY)
        }}
      >
        <DocumentEditor<NoteNode>
          value={value}
          onChange={onChange}
          disabled={disabled}
          extensions={all}
          // The site admin's own page keeps its dashboard blocks; every other note drops them.
          clean={setup.where === "dashboard" ? cleanDashboardBody : cleanNoteBody}
          placeholder={placeholder}
        />
      </div>
      <NoteBlocksMenu blocks={blocks} />
    </NoteFrame>
  )
}

/** A note drawn for reading, blocks and all. */
export function NoteView({ setup, body }: { setup: NoteSetup; body: NoteNode }) {
  return (
    <NoteFrame setup={setup}>
      <NoteReader body={body} />
    </NoteFrame>
  )
}
