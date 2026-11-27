import type * as React from "react"
import { Node, mergeAttributes, type Extensions } from "@tiptap/core"
import { TextSelection } from "@tiptap/pm/state"
import { ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react"
import { ChevronsDownUpIcon, ImageIcon, InfoIcon, LinkIcon, MinusIcon, PlayIcon, type LucideIcon } from "lucide-react"

import { RackNoteFolds } from "@/components/phones/rack-note-folds"
import { CalloutBlockView, FoldBlockView, ImageBlockView, LinksBlockView, VideoBlockView } from "@/components/phones/rack-note-views"

/**
 * The "/" blocks in a rack's notes (Racks dashboard, part 90), copied from
 * Project's (`apps/project/src/components/project/notes/note-block-nodes.ts`
 * and `note-block-views.tsx`) and trimmed to what a rack has. Each block is
 * one editor node holding a few plain values, drawn by its view here. What
 * saved notes may hold, and the checks on each value, are in
 * `src/lib/phones/rack-notes.ts`; the shell's editor takes these through its
 * `extensions` and `clean` props.
 */

export type BlockKey = "image" | "video" | "callout" | "divider" | "fold" | "links"

export type BlockChoice = { key: BlockKey; label: string; hint: string; icon: LucideIcon }

/** In the "/" list's order: Image first, as in Travel and Project. */
export const BLOCKS: BlockChoice[] = [
  { key: "image", label: "Image", hint: "Upload or a web address", icon: ImageIcon },
  { key: "video", label: "Video", hint: "YouTube, TikTok, Instagram or Loom", icon: PlayIcon },
  { key: "callout", label: "Callout", hint: "A Note, Warning or Decision box", icon: InfoIcon },
  { key: "divider", label: "Divider", hint: "A line across the notes", icon: MinusIcon },
  { key: "fold", label: "Fold section", hint: "A heading that hides what's under it", icon: ChevronsDownUpIcon },
  { key: "links", label: "Links", hint: "A list of web addresses", icon: LinkIcon },
]

/** The blocks whose name starts with what was typed after the "/". */
export function matchingBlocks(query: string) {
  const words = query.toLowerCase()
  return BLOCKS.filter((block) => block.label.toLowerCase().startsWith(words))
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
      // Enter on an empty last line leaves the box, as it leaves a list, so a callout at the end isn't a trap.
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

/** A Fold section's heading line. What sits under it, up to the next one, is hidden while folded. */
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

/** Every block's node, handed to the shell's editor. Made once, because the editor asks for the same array every render. */
export const BLOCK_NODES: Extensions = [
  atomNode("noteImage", { src: null, alt: "" }, ImageBlockView),
  atomNode("noteVideo", { url: null }, VideoBlockView),
  atomNode("noteLinks", { links: [] }, LinksBlockView),
  Callout,
  Fold,
  RackNoteFolds,
]
