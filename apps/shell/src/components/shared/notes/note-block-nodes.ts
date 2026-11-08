import type * as React from "react"
import { Extension, Node, mergeAttributes, type Editor, type Extensions } from "@tiptap/core"
import { Plugin, TextSelection } from "@tiptap/pm/state"
import type { Node as PmNode } from "@tiptap/pm/model"
import { TaskItem, TaskList } from "@tiptap/extension-list"
import { ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react"
import {
  ChevronsDownUpIcon,
  GlobeIcon,
  ImageIcon,
  InfoIcon,
  LinkIcon,
  ListChecksIcon,
  MinusIcon,
  PlayIcon,
  type LucideIcon,
} from "lucide-react"

import {
  CalloutBlockView,
  FoldBlockView,
  ImageBlockView,
  LinkBlockView,
  LinksBlockView,
  VideoBlockView,
} from "@/components/shared/notes/note-block-views"
import { NoteFolds } from "@/components/shared/notes/note-folds"
/**
 * The "/" blocks on a page in the Admin 3 panel design, copied from Trade's
 * on 7 Nov 2026 so every app's pages share one set. Each block is one editor
 * node holding a few plain values, drawn by its view in
 * `note-block-views.tsx`. The basic blocks are the same in every app; an app
 * adds its own live ones as `AppBlock`s, drawn in `block-card.tsx`'s card.
 * What a saved page may hold is in `src/lib/notes/note-blocks.ts`.
 */

/** The basic blocks' keys. An app block's key is its own. */
export type BasicBlockKey =
  | "image"
  | "video"
  | "checklist"
  | "callout"
  | "divider"
  | "fold"
  | "link"
  | "links"
export type BlockKey = BasicBlockKey | (string & {})

/**
 * The "/" list's two groups, as Project's. Basic blocks are what the writer
 * types or pastes in; advanced blocks show something live from the
 * screen: its own live panels, drawn in `block-card.tsx`.
 */
export type BlockGroup = "basic" | "advanced"
export const BLOCK_GROUP_LABEL: Record<BlockGroup, string> = { basic: "Basic blocks", advanced: "Advanced blocks" }

export type BlockDef = { key: BlockKey; label: string; icon: LucideIcon; group: BlockGroup }

/**
 * An app's own block: its "/" row, and its editor node (made with
 * `blockNode` and `blockView`). It keeps no values and shows once per page.
 * `offered: false` leaves it out of the "/" list: the page keeps it on its
 * own, as Admin's fixed Dashboards block (`keepOnPage`).
 */
export type AppBlock = {
  key: string
  label: string
  icon: LucideIcon
  node: string
  extension: Node
  offered?: boolean
}

/**
 * In the list's order, Project's basic blocks. The Link card that reads a
 * page's title and picture is what Project calls Web page; its stored name is
 * `noteLink`, as in Travel.
 */
export const BASIC_BLOCKS: BlockDef[] = [
  { key: "image", label: "Image", icon: ImageIcon, group: "basic" },
  { key: "video", label: "Video", icon: PlayIcon, group: "basic" },
  { key: "checklist", label: "Checklist", icon: ListChecksIcon, group: "basic" },
  { key: "callout", label: "Callout", icon: InfoIcon, group: "basic" },
  { key: "divider", label: "Divider", icon: MinusIcon, group: "basic" },
  { key: "fold", label: "Fold section", icon: ChevronsDownUpIcon, group: "basic" },
  { key: "link", label: "Web page", icon: GlobeIcon, group: "basic" },
  { key: "links", label: "Links", icon: LinkIcon, group: "basic" },
]

/** Every block one page offers: the basic ones, then the app's. */
export function pageBlocks(appBlocks: readonly AppBlock[]): BlockDef[] {
  return [
    ...BASIC_BLOCKS,
    ...appBlocks
      .filter((block) => block.offered !== false)
      .map(({ key, label, icon }) => ({ key, label, icon, group: "advanced" as const })),
  ]
}

/** The blocks whose name starts with what was typed after the "/". */
export function matchingBlocks(blocks: readonly BlockDef[], query: string) {
  const words = query.toLowerCase()
  return blocks.filter((block) => block.label.toLowerCase().startsWith(words))
}

export function blockNode(name: string, defaults: Record<string, unknown>, view: (props: NodeViewProps) => React.ReactNode) {
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
      return [{ tag: `div[data-page-block="${name}"]` }]
    },
    renderHTML() {
      return ["div", { "data-page-block": name }]
    },
    addNodeView() {
      return ReactNodeViewRenderer(view)
    },
  })
}

function countNodes(doc: PmNode, name: string) {
  let found = 0
  doc.descendants((node) => {
    if (node.type.name === name) found += 1
    return false
  })
  return found
}

/**
 * A block node the page keeps once, whatever the writer does: Backspace,
 * Delete, cut or select-all and type all leave it where it is, and a paste
 * never makes a second (Tyler, 8 Nov 2026, of Admin's Dashboards block: "It
 * can be a fixed block"). It still moves, in one step that takes it out and
 * puts it back (`blockView`'s `fixed`). Only top-level blocks are counted,
 * which is where a block lives.
 */
export function keepOnPage(node: Node) {
  return node.extend({
    addProseMirrorPlugins() {
      const name = this.name
      return [
        new Plugin({
          filterTransaction: (tr, state) => {
            if (!tr.docChanged) return true
            const before = countNodes(state.doc, name)
            const after = countNodes(tr.doc, name)
            return !(after < before && after === 0) && !(after > before && after > 1)
          },
        }),
      ]
    },
  })
}

/** A box of words: a Note, a Warning or a Decision. Only paragraphs and lists go in it (copied from Project). */
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
 * A Fold section's heading line (copied from Project). What sits under it, up
 * to the next Fold section, is hidden while this reader has it folded
 * (`note-folds.ts`).
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
 * An empty line sitting above a block goes with Backspace or Delete, so a
 * block can always be brought to the very top of the page (Tyler, 7 Nov 2026:
 * "The blocks cant go all the way to the top"). Without this, Backspace at the
 * page's first line has nothing to join, and Delete picks the block instead.
 */
function removeEmptyLineAboveBlock(editor: Editor) {
  const { $from, empty } = editor.state.selection
  if (!empty || $from.depth !== 1) return false
  const line = $from.parent
  if (line.type.name !== "paragraph" || line.content.size > 0) return false
  const doc = editor.state.doc
  if (doc.childCount < 2) return false
  const index = $from.index(0)
  const next = index + 1 < doc.childCount ? doc.child(index + 1) : null
  if (!next?.isAtom) return false
  const from = $from.before(1)
  return editor
    .chain()
    .command(({ tr }) => {
      tr.delete(from, from + line.nodeSize)
      tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(from, tr.doc.content.size))))
      return true
    })
    .run()
}

export const EmptyLineAboveBlock = Extension.create({
  name: "pageEmptyLineAboveBlock",
  addKeyboardShortcuts() {
    return {
      Backspace: ({ editor }) => removeEmptyLineAboveBlock(editor),
      Delete: ({ editor }) => removeEmptyLineAboveBlock(editor),
    }
  },
})

export const BASIC_BLOCK_NODES: Extensions = [
  EmptyLineAboveBlock,
  blockNode("noteImage", { src: null, alt: "" }, ImageBlockView),
  blockNode("noteVideo", { url: null }, VideoBlockView),
  blockNode("noteLink", { url: null, title: null, image: null, site: "" }, LinkBlockView),
  blockNode("noteLinks", { links: [] }, LinksBlockView),
  Callout,
  Fold,
  TaskList,
  // A ticked line is only a tick, as in Project ("Tick only").
  TaskItem.configure({ nested: true }),
  NoteFolds,
]

/**
 * The editor's node names for each block, so a note offering a block also
 * knows its nodes. A Divider is the editor's own line, which it always knows.
 */
export const BLOCK_NODE_NAMES: Record<BasicBlockKey, readonly string[]> = {
  image: ["noteImage"],
  video: ["noteVideo"],
  link: ["noteLink"],
  links: ["noteLinks"],
  checklist: ["taskList", "taskItem"],
  callout: ["noteCallout"],
  fold: ["noteFold", "pageNoteFolds"],
  divider: [],
}
