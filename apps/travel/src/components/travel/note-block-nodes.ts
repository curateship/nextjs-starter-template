import type * as React from "react"
import { Node, type Extensions } from "@tiptap/core"
import { ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react"
import { ImageIcon, LinkIcon, MapIcon, MapPinIcon, PlayIcon, type LucideIcon } from "lucide-react"

import { ImageBlockView, LinkBlockView, MapBlockView, PlaceBlockView, VideoBlockView } from "@/components/travel/note-block-views"

/**
 * The "/" blocks in a Travel note (Travel features 3, parts 1 to 4): Image
 * first, then Place, Video and Map (Tyler, 5 Nov 2026: "FIrst block is an
 * image block to add images"), and Link (Travel features 4, part 5). Each block is one editor node holding a few
 * plain values, drawn by its view in `note-block-views.tsx`. What a saved note
 * may hold, and the checks on each value, are in `src/lib/travel/note-blocks.ts`;
 * the shell's editor takes these through its `extensions` and `clean` props.
 */

export type BlockKey = "image" | "place" | "video" | "map" | "link"

export const BLOCKS: { key: BlockKey; label: string; hint: string; icon: LucideIcon }[] = [
  { key: "image", label: "Image", hint: "Upload, Unsplash or a web address", icon: ImageIcon },
  { key: "place", label: "Place", hint: "One of the trip's cards", icon: MapPinIcon },
  { key: "video", label: "Video", hint: "YouTube, TikTok or Instagram", icon: PlayIcon },
  { key: "map", label: "Map", hint: "A map of cards you pick", icon: MapIcon },
  { key: "link", label: "Link", hint: "A web page as a small card", icon: LinkIcon },
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

export const BLOCK_NODES: Extensions = [
  blockNode("noteImage", { src: null, alt: "", credit: null }, ImageBlockView),
  blockNode("notePlace", { activityId: null }, PlaceBlockView),
  blockNode("noteVideo", { url: null }, VideoBlockView),
  blockNode("noteMap", { activityIds: [] }, MapBlockView),
  blockNode("noteLink", { url: null, title: null, image: null, site: "" }, LinkBlockView),
]
