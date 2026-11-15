import type * as React from "react"
import { Node, mergeAttributes, type Extensions } from "@tiptap/core"
import { TextSelection } from "@tiptap/pm/state"
import { TaskItem, TaskList } from "@tiptap/extension-list"
import { ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react"
import {
  ChevronsDownUpIcon,
  GlobeIcon,
  ImageIcon,
  InfoIcon,
  LinkIcon,
  ListChecksIcon,
  MapIcon,
  MapPinIcon,
  MinusIcon,
  PlayIcon,
  WalletIcon,
  type LucideIcon,
} from "lucide-react"

import {
  BudgetBlockView,
  CalloutBlockView,
  FoldBlockView,
  ImageBlockView,
  LinkBlockView,
  LinksBlockView,
  MapBlockView,
  PlaceBlockView,
  VideoBlockView,
} from "@/components/travel/note-block-views"
import { NoteFolds } from "@/components/travel/note-folds"

/**
 * The "/" blocks in a Travel note (Travel features 3, parts 1 to 4): Image
 * first, then Place, Video and Map (Tyler, 5 Nov 2026: "FIrst block is an
 * image block to add images"), and Link (Travel features 4, part 5). Each block is one editor node holding a few
 * plain values, drawn by its view in `note-block-views.tsx`. What a saved note
 * may hold, and the checks on each value, are in `src/lib/travel/note-blocks.ts`;
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
  | "place"
  | "map"
  | "budget"

/**
 * The "/" list's two groups, as Project's (Tyler, 6 Nov 2026: "travel is
 * missing some basic blocks. This is project blocks"). Basic blocks are what
 * the writer types or pastes in; advanced blocks show something live from
 * Travel: a trip's cards, or its money.
 */
export type BlockGroup = "basic" | "advanced"
export const BLOCK_GROUP_LABEL: Record<BlockGroup, string> = { basic: "Basic blocks", advanced: "Advanced blocks" }

/**
 * In the list's order, Project's basic blocks first. The Link card that reads
 * a page's title and picture is what Project calls Web page, so it is named
 * that here; its stored name stays `noteLink`.
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
  { key: "place", label: "Place", icon: MapPinIcon, group: "advanced" },
  { key: "map", label: "Map", icon: MapIcon, group: "advanced" },
  // The Money card from the left panel's footer, as a block (Tyler, 7 Nov 2026: "turn this bottom card into a budget block").
  { key: "budget", label: "Budget", icon: WalletIcon, group: "advanced" },
]

/** The blocks whose name starts with what was typed after the "/". */
export function matchingBlocks(query: string) {
  const words = query.toLowerCase()
  return BLOCKS.filter((block) => block.label.toLowerCase().startsWith(words))
}

/** The blocks that only make sense on a trip: Place and Map point at its cards, Budget shows its money. */
export const TRIP_BLOCKS: readonly BlockKey[] = ["place", "map", "budget"]

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
      return [{ tag: `div[data-travel-block="${name}"]` }]
    },
    renderHTML() {
      return ["div", { "data-travel-block": name }]
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

export const BLOCK_NODES: Extensions = [
  blockNode("noteImage", { src: null, alt: "", credit: null }, ImageBlockView),
  blockNode("notePlace", { activityId: null }, PlaceBlockView),
  blockNode("noteVideo", { url: null }, VideoBlockView),
  blockNode("noteMap", { activityIds: [] }, MapBlockView),
  blockNode("noteLink", { url: null, title: null, image: null, site: "" }, LinkBlockView),
  blockNode("noteLinks", { links: [] }, LinksBlockView),
  blockNode("noteBudget", {}, BudgetBlockView),
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
  place: ["notePlace"],
  video: ["noteVideo"],
  map: ["noteMap"],
  link: ["noteLink"],
  links: ["noteLinks"],
  budget: ["noteBudget"],
  checklist: ["taskList", "taskItem"],
  callout: ["noteCallout"],
  fold: ["noteFold", "travelNoteFolds"],
  divider: [],
}
