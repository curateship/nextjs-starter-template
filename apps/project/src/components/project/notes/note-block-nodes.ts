import type * as React from "react"
import { Node, mergeAttributes, type Extensions } from "@tiptap/core"
import { TextSelection } from "@tiptap/pm/state"
import { TaskItem, TaskList } from "@tiptap/extension-list"
import { ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react"
import {
  ChevronsDownUpIcon,
  ClapperboardIcon,
  FileIcon,
  GlobeIcon,
  ImageIcon,
  LinkIcon,
  InfoIcon,
  ListChecksIcon,
  ListTodoIcon,
  MessagesSquareIcon,
  MinusIcon,
  PlayIcon,
  type LucideIcon,
} from "lucide-react"

import {
  CalloutBlockView,
  CommentsBlockView,
  FileBlockView,
  FoldBlockView,
  ImageBlockView,
  LinksBlockView,
  RecordBlockView,
  TaskBlockView,
  VideoBlockView,
  WebPageBlockView,
} from "@/components/project/notes/note-block-views"
import { NoteFolds } from "@/components/project/notes/note-folds"
import type { NoteWhere } from "@/components/project/notes/note-setup"

/**
 * The "/" blocks in a Project note (Project note blocks task), copied from
 * Travel's (`apps/travel/src/components/travel/note-block-nodes.ts`) with
 * Project's own added. Each block is one editor node holding a few plain
 * values, drawn by its view in `note-block-views.tsx`. What a saved note may
 * hold, and the checks on each value, are in `src/lib/project/note-blocks.ts`;
 * the shell's editor takes these through its `extensions` and `clean` props.
 */

export type BlockKey =
  | "image"
  | "video"
  | "task"
  | "file"
  | "comments"
  | "checklist"
  | "callout"
  | "divider"
  | "fold"
  | "record"
  | "webpage"
  | "links"

export type BlockChoice = { key: BlockKey; label: string; icon: LucideIcon }

/** In the "/" list's order: Image first, as in Travel (Tyler, 5 Nov 2026: "FIrst block is an image block"). */
const BLOCKS: BlockChoice[] = [
  { key: "image", label: "Image", icon: ImageIcon },
  { key: "video", label: "Video", icon: PlayIcon },
  { key: "task", label: "Task card", icon: ListTodoIcon },
  { key: "file", label: "File", icon: FileIcon },
  { key: "comments", label: "Comments", icon: MessagesSquareIcon },
  { key: "checklist", label: "Checklist", icon: ListChecksIcon },
  { key: "callout", label: "Callout", icon: InfoIcon },
  { key: "divider", label: "Divider", icon: MinusIcon },
  { key: "fold", label: "Fold section", icon: ChevronsDownUpIcon },
  { key: "record", label: "Video or Promo", icon: ClapperboardIcon },
  { key: "webpage", label: "Web page", icon: GlobeIcon },
  { key: "links", label: "Links", icon: LinkIcon },
]

/**
 * The blocks a notes box offers. A File block and the Video or Promo card
 * belong to a task, so New task and quick new task leave them out
 * (Tyler, 5 Nov 2026: "Leave File out there"); the Video or Promo card shows
 * only on a task that points at a record.
 */
export function blocksFor(where: NoteWhere, hasRecord: boolean): BlockChoice[] {
  return BLOCKS.filter((block) => {
    if (block.key === "file" || block.key === "comments") return where === "task"
    if (block.key === "record") return where === "task" && hasRecord
    return true
  })
}

/** The blocks whose name starts with what was typed after the "/". */
export function matchingBlocks(choices: BlockChoice[], query: string) {
  const words = query.toLowerCase()
  return choices.filter((block) => block.label.toLowerCase().startsWith(words))
}

function atomNode(name: string, defaults: Record<string, unknown>, view: (props: NodeViewProps) => React.ReactNode) {
  return Node.create({
    name,
    group: "block",
    atom: true,
    selectable: true,
    draggable: false,
    addAttributes() {
      // Kept in the document only: none of these is ever written into markup.
      return Object.fromEntries(Object.entries(defaults).map(([key, value]) => [key, { default: value, rendered: false }]))
    },
    parseHTML() {
      return [{ tag: `div[data-note-block="${name}"]` }]
    },
    renderHTML() {
      return ["div", { "data-note-block": name }]
    },
    addNodeView() {
      return ReactNodeViewRenderer(view)
    },
  })
}

/** A box of words: a Note, a Warning or a Decision. Only paragraphs and lists go in it. */
const Callout = Node.create({
  name: "noteCallout",
  group: "block",
  content: "(paragraph | bulletList | orderedList)+",
  defining: true,
  addAttributes() {
    return { kind: { default: "note", rendered: false } }
  },
  parseHTML() {
    return [{ tag: "div[data-note-callout]" }]
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-note-callout": "" }), 0]
  },
  addNodeView() {
    return ReactNodeViewRenderer(CalloutBlockView)
  },
  addKeyboardShortcuts() {
    return {
      // Enter on an empty last line leaves the box, as it leaves a list, so a callout at the end of a note isn't a trap.
      Enter: ({ editor }) => {
        const { $from, empty } = editor.state.selection
        if (!empty || $from.depth < 2) return false
        const callout = $from.node(-1)
        const line = $from.parent
        if (callout.type.name !== "noteCallout" || line.type.name !== "paragraph" || line.content.size > 0) return false
        if ($from.index(-1) !== callout.childCount - 1 || callout.childCount < 2) return false
        const lineStart = $from.before()
        const after = $from.after(-1)
        return editor
          .chain()
          .command(({ tr }) => {
            tr.delete(lineStart, lineStart + line.nodeSize)
            const at = after - line.nodeSize
            tr.insert(at, editor.schema.nodes.paragraph.create())
            tr.setSelection(TextSelection.create(tr.doc, at + 1))
            return true
          })
          .run()
      },
    }
  },
})

/**
 * A Fold section's heading line. What sits under it, up to the next Fold
 * section, is hidden while this reader has it folded (`note-folds.ts`).
 */
const Fold = Node.create({
  name: "noteFold",
  group: "block",
  content: "inline*",
  defining: true,
  addAttributes() {
    return { id: { default: "fold", rendered: false } }
  },
  parseHTML() {
    return [{ tag: "div[data-note-fold]" }]
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-note-fold": "" }), 0]
  },
  addNodeView() {
    return ReactNodeViewRenderer(FoldBlockView)
  },
  addKeyboardShortcuts() {
    return {
      // Enter at the end of the heading starts the words under it, as a heading does, not a second heading.
      Enter: ({ editor }) => {
        const { $from, empty } = editor.state.selection
        if (!empty || $from.parent.type.name !== "noteFold" || $from.parentOffset !== $from.parent.content.size) return false
        const after = $from.after()
        return editor
          .chain()
          .command(({ tr }) => {
            tr.insert(after, editor.schema.nodes.paragraph.create())
            tr.setSelection(TextSelection.create(tr.doc, after + 1))
            return true
          })
          .run()
      },
    }
  },
})

/**
 * Every block's node, handed to the shell's editor. Made once, at the top of
 * the module, because the editor asks for the same array every render.
 */
export const BLOCK_NODES: Extensions = [
  atomNode("noteImage", { src: null, fileId: null, alt: "", credit: null }, ImageBlockView),
  atomNode("noteVideo", { url: null }, VideoBlockView),
  atomNode("noteTask", { taskId: null }, TaskBlockView),
  atomNode("noteFile", { fileId: null }, FileBlockView),
  atomNode("noteComments", {}, CommentsBlockView),
  atomNode("noteRecord", {}, RecordBlockView),
  atomNode("noteWebPage", { url: null }, WebPageBlockView),
  atomNode("noteLinks", { links: [] }, LinksBlockView),
  Callout,
  Fold,
  TaskList,
  // A ticked line is only a tick; it is never a task or a step (Tyler, 5 Nov 2026: "Tick only").
  TaskItem.configure({ nested: true }),
  NoteFolds,
]
