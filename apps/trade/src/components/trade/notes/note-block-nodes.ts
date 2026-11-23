import type * as React from "react"
import { Extension, Node, mergeAttributes, type Editor, type Extensions } from "@tiptap/core"
import { TextSelection } from "@tiptap/pm/state"
import { TaskItem, TaskList } from "@tiptap/extension-list"
import { ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react"
import {
  ChevronsDownUpIcon,
  FolderIcon,
  GlobeIcon,
  Grid2x2Icon,
  ImageIcon,
  InfoIcon,
  LayersIcon,
  LinkIcon,
  ListChecksIcon,
  ListOrderedIcon,
  MinusIcon,
  PlayIcon,
  RadarIcon,
  ShieldCheckIcon,
  type LucideIcon,
} from "lucide-react"

import {
  CalloutBlockView,
  FoldBlockView,
  ImageBlockView,
  LinkBlockView,
  LinksBlockView,
  VideoBlockView,
} from "@/components/trade/notes/note-block-views"
import { NoteFolds } from "@/components/trade/notes/note-folds"
import {
  DcaTradesBlockView,
  FoldersBlockView,
  GridTradesBlockView,
  ManualTradesBlockView,
  ProtocolsBlockView,
  RulesBlockView,
  ScannerBlockView,
} from "@/components/trade/notes/trade-block-views"
import { keepOnPage } from "@/components/shared/notes/note-block-nodes"
import { PROTOCOLS_BLOCK_NODE } from "@/lib/trade/trade-pages"

/**
 * The "/" blocks on a Trade page (the Admin 3 panel design, 7 Nov 2026),
 * copied from Travel's with its basic blocks. Each block is one editor node
 * holding a few plain values, drawn by its view in `note-block-views.tsx`, or
 * for Trade's own blocks in `trade-block-views.tsx`. What a saved page may
 * hold, and the checks on each value, are in `src/lib/trade/note-blocks.ts`;
 * the shell's editor takes these through its `extensions` and `clean` props.
 */

export type BlockKey =
  | "image"
  | "video"
  | "checklist"
  | "callout"
  | "divider"
  | "fold"
  | "link"
  | "links"
  | "rules"
  | "manualTrades"
  | "gridTrades"
  | "dcaTrades"
  | "scanner"
  | "folders"

/**
 * The "/" list's two groups, as Project's. Basic blocks are what the writer
 * types or pastes in; advanced blocks show something live from the
 * dashboard: the exchange's trades, scanner and folders. Alerts are not a
 * block since 8 Nov 2026: they are a tab of the page's ⋮ and the bell's tray.
 */
export type BlockGroup = "basic" | "advanced"
export const BLOCK_GROUP_LABEL: Record<BlockGroup, string> = { basic: "Basic blocks", advanced: "Advanced blocks" }

/**
 * In the list's order, Project's basic blocks first. The Link card that reads
 * a page's title and picture is what Project calls Web page; its stored name
 * is `noteLink`, as in Travel.
 */
export const BLOCKS: { key: BlockKey; label: string; icon: LucideIcon; group: BlockGroup }[] = [
  { key: "image", label: "Image", icon: ImageIcon, group: "basic" },
  { key: "video", label: "Video", icon: PlayIcon, group: "basic" },
  { key: "checklist", label: "Checklist", icon: ListChecksIcon, group: "basic" },
  { key: "callout", label: "Callout", icon: InfoIcon, group: "basic" },
  { key: "divider", label: "Divider", icon: MinusIcon, group: "basic" },
  { key: "fold", label: "Fold section", icon: ChevronsDownUpIcon, group: "basic" },
  { key: "link", label: "Web page", icon: GlobeIcon, group: "basic" },
  { key: "links", label: "Links", icon: LinkIcon, group: "basic" },
  { key: "rules", label: "Rules", icon: ShieldCheckIcon, group: "advanced" },
  { key: "manualTrades", label: "Manual trades", icon: ListOrderedIcon, group: "advanced" },
  { key: "gridTrades", label: "Grid trades", icon: Grid2x2Icon, group: "advanced" },
  { key: "dcaTrades", label: "DCA trades", icon: LayersIcon, group: "advanced" },
  { key: "scanner", label: "Scanner", icon: RadarIcon, group: "advanced" },
  { key: "folders", label: "Folders", icon: FolderIcon, group: "advanced" },
]

/** The blocks whose name starts with what was typed after the "/". */
export function matchingBlocks(query: string) {
  const words = query.toLowerCase()
  return BLOCKS.filter((block) => block.label.toLowerCase().startsWith(words))
}

function blockNode(name: string, defaults: Record<string, unknown>, view: (props: NodeViewProps) => React.ReactNode) {
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
      return [{ tag: `div[data-trade-block="${name}"]` }]
    },
    renderHTML() {
      return ["div", { "data-trade-block": name }]
    },
    addNodeView() {
      return ReactNodeViewRenderer(view)
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
  name: "tradeEmptyLineAboveBlock",
  addKeyboardShortcuts() {
    return {
      Backspace: ({ editor }) => removeEmptyLineAboveBlock(editor),
      Delete: ({ editor }) => removeEmptyLineAboveBlock(editor),
    }
  },
})

export const BLOCK_NODES: Extensions = [
  EmptyLineAboveBlock,
  blockNode("noteImage", { src: null, alt: "" }, ImageBlockView),
  blockNode("noteVideo", { url: null }, VideoBlockView),
  blockNode("noteLink", { url: null, title: null, image: null, site: "" }, LinkBlockView),
  blockNode("noteLinks", { links: [] }, LinksBlockView),
  blockNode("noteRules", {}, RulesBlockView),
  blockNode("noteManualTrades", {}, ManualTradesBlockView),
  blockNode("noteGridTrades", {}, GridTradesBlockView),
  blockNode("noteDcaTrades", {}, DcaTradesBlockView),
  blockNode("noteScanner", {}, ScannerBlockView),
  blockNode("noteFolders", {}, FoldersBlockView),
  // The Protocols block is fixed, as Admin's Dashboards block is (8 Nov
  // 2026): never offered in the "/" list, never deleted, only moved.
  keepOnPage(blockNode(PROTOCOLS_BLOCK_NODE, {}, ProtocolsBlockView)),
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
export const BLOCK_NODE_NAMES: Record<BlockKey, readonly string[]> = {
  image: ["noteImage"],
  video: ["noteVideo"],
  link: ["noteLink"],
  links: ["noteLinks"],
  rules: ["noteRules"],
  manualTrades: ["noteManualTrades"],
  gridTrades: ["noteGridTrades"],
  dcaTrades: ["noteDcaTrades"],
  scanner: ["noteScanner"],
  folders: ["noteFolders"],
  checklist: ["taskList", "taskItem"],
  callout: ["noteCallout"],
  fold: ["noteFold", "tradeNoteFolds"],
  divider: [],
}
