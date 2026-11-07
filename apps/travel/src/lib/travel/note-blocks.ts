import { z } from "zod"

import {
  cleanWrittenPageBody,
  emptyWrittenPageBody,
  type WrittenPageMark,
} from "@/lib/pages/written-page-body"
import { id, photoCreditSchema, type PhotoCredit } from "@/lib/travel/rules"
import { readVideoLink } from "@/lib/travel/video-links"

/**
 * What a Travel note may hold: everything a shell written page may (words,
 * headings, lists, quotes, links), plus the "/" blocks (Travel features 3,
 * part 1; Tyler, 5 Nov 2026: "I want to enter "/" and it list a list of
 * blocks. FIrst block is an image block to add images"; the Link block from
 * Travel features 4, part 5). A block carries only
 * the few plain values below, each checked here; anything else is dropped,
 * the same way the shell's `cleanWrittenPageBody` drops what it doesn't know.
 * This runs in the editor on every change and on the server on every save.
 */

/**
 * Blocks with no writing inside, each a few plain values. Links and the
 * Divider (`horizontalRule`) came from Project's basic blocks on 6 Nov 2026
 * (Tyler: "travel is missing some basic blocks").
 */
export const NOTE_BLOCK_TYPES = [
  "noteImage",
  "notePlace",
  "noteVideo",
  "noteMap",
  "noteLink",
  "noteLinks",
  "noteBudget",
  "horizontalRule",
] as const
export type NoteBlockType = (typeof NOTE_BLOCK_TYPES)[number]

/**
 * Blocks that hold writing, from Project's basic blocks (6 Nov 2026): a
 * Callout's words, a Checklist's lines, a Fold section's heading.
 */
export const NOTE_HOLDER_TYPES = ["noteCallout", "taskList", "taskItem", "noteFold"] as const
export type NoteHolderType = (typeof NOTE_HOLDER_TYPES)[number]

export const CALLOUT_KINDS = ["note", "warning", "decision"] as const
export type CalloutKind = (typeof CALLOUT_KINDS)[number]

/** One line of a Links block: its words, or "" to show the address, and an `https://` address. */
export type NoteLink = { label: string; url: string }
/** The most lines one Links block holds, and the longest a line's words may be. */
export const LINKS_BLOCK_MAX = 30
export const LINK_LABEL_MAX = 80


/** A picture: uploaded, from Unsplash with its credit, or a pasted web address. */
export type NoteImageAttrs = { src: string; alt: string; credit: PhotoCredit | null }
/** A link to one of the trip's own cards, drawn as a small card. */
export type NotePlaceAttrs = { activityId: string }
/** A YouTube, TikTok or Instagram video, by its plain address. */
export type NoteVideoAttrs = { url: string }
/** A small map of the cards ticked for it. */
export type NoteMapAttrs = { activityIds: string[] }
/** A web page as a small card: its address, the title and picture it gives, and its site's name. */
export type NoteLinkAttrs = { url: string; title: string | null; image: string | null; site: string }

export type NoteNode = {
  type: string
  attrs?: Record<string, unknown>
  content?: NoteNode[]
  text?: string
  marks?: WrittenPageMark[]
}

/** The most cards one Map block draws. */
export const MAP_BLOCK_MAX_CARDS = 25
const MAX_DEPTH = 20
const MAX_SRC = 1000
const MAX_ALT = 200
const UNSPLASH_IMAGE = /^https:\/\/images\.unsplash\.com\//

const srcSchema = z
  .string()
  .max(MAX_SRC)
  .refine((value) => {
    try {
      return new URL(value).protocol === "https:"
    } catch {
      return false
    }
  })

function cleanImage(attrs: Record<string, unknown>): NoteImageAttrs | null {
  const src = srcSchema.safeParse(attrs.src)
  if (!src.success) return null
  const credit = attrs.credit ? photoCreditSchema.safeParse(attrs.credit) : null
  // An Unsplash photo is only ever shown with its credit, as Unsplash's rules ask.
  if (UNSPLASH_IMAGE.test(src.data) && !credit?.success) return null
  const alt = typeof attrs.alt === "string" ? attrs.alt.trim().slice(0, MAX_ALT) : ""
  return { src: src.data, alt, credit: credit?.success ? credit.data : null }
}

function cleanPlace(attrs: Record<string, unknown>): NotePlaceAttrs | null {
  const activityId = id.safeParse(attrs.activityId)
  return activityId.success ? { activityId: activityId.data } : null
}

function cleanVideo(attrs: Record<string, unknown>): NoteVideoAttrs | null {
  const video = typeof attrs.url === "string" ? readVideoLink(attrs.url) : null
  return video ? { url: video.url } : null
}

function cleanMap(attrs: Record<string, unknown>): NoteMapAttrs | null {
  if (!Array.isArray(attrs.activityIds)) return null
  const ids = [...new Set(attrs.activityIds.filter((value) => id.safeParse(value).success) as string[])]
  if (!ids.length) return null
  return { activityIds: ids.slice(0, MAP_BLOCK_MAX_CARDS) }
}

const MAX_LINK_TITLE = 200
const MAX_SITE = 100

/** An https address, or null. */
function httpsAddress(value: unknown) {
  const checked = srcSchema.safeParse(value)
  return checked.success ? checked.data : null
}

/** A Link block's values, checked: an https address, and a title, picture and site name that fit. */
export function cleanLinkPreview(attrs: Record<string, unknown>): NoteLinkAttrs | null {
  const url = httpsAddress(attrs.url)
  if (!url) return null
  const title = typeof attrs.title === "string" ? attrs.title.trim().slice(0, MAX_LINK_TITLE) : ""
  const site = typeof attrs.site === "string" ? attrs.site.trim().slice(0, MAX_SITE) : ""
  return {
    url,
    title: title || null,
    image: httpsAddress(attrs.image),
    site: site || new URL(url).hostname.replace(/^www\./, ""),
  }
}

function cleanLinks(attrs: Record<string, unknown>): { links: NoteLink[] } | null {
  if (!Array.isArray(attrs.links)) return null
  const links = attrs.links.flatMap((link): NoteLink[] => {
    if (!link || typeof link !== "object") return []
    const url = httpsAddress((link as { url?: unknown }).url)
    const label = (link as { label?: unknown }).label
    return url ? [{ label: typeof label === "string" ? label.trim().slice(0, LINK_LABEL_MAX) : "", url }] : []
  })
  return links.length ? { links: links.slice(0, LINKS_BLOCK_MAX) } : null
}

/** What a link shows when it has no words of its own: its address without `https://` or a last slash. */
export function linkWords(link: NoteLink) {
  return link.label || link.url.replace(/^https:\/\//, "").replace(/\/$/, "")
}

/** A new Fold section's id, which each reader's folds are remembered by. */
export function newFoldId() {
  return crypto.randomUUID()
}

const BLOCK_CLEANERS: Record<NoteBlockType, (attrs: Record<string, unknown>) => Record<string, unknown> | null> = {
  noteImage: cleanImage,
  notePlace: cleanPlace,
  noteVideo: cleanVideo,
  noteMap: cleanMap,
  noteLink: cleanLinkPreview,
  noteLinks: cleanLinks,
  // The trip's money, drawn from the trip itself, so the block keeps no values of its own.
  noteBudget: () => ({}),
  horizontalRule: () => ({}),
}

function isHolder(type: unknown): type is NoteHolderType {
  return NOTE_HOLDER_TYPES.includes(type as NoteHolderType)
}

function cleanChildren(raw: { content?: unknown }, depth: number, keep: (node: NoteNode) => boolean): NoteNode[] {
  if (!Array.isArray(raw.content)) return []
  return raw.content
    .map((child) => cleanNode(child, depth + 1))
    .filter((child): child is NoteNode => child !== null && keep(child))
}

/** Only words go inside a Callout: paragraphs and lists, never a block inside a block. */
const IN_CALLOUT = new Set(["paragraph", "bulletList", "orderedList"])

/** A Callout, a Checklist and its lines, and a Fold section's heading, as Project keeps them. */
function cleanHolder(type: NoteHolderType, raw: { attrs?: unknown; content?: unknown }, depth: number): NoteNode | null {
  const attrs = raw.attrs && typeof raw.attrs === "object" && !Array.isArray(raw.attrs) ? (raw.attrs as Record<string, unknown>) : {}
  if (type === "noteCallout") {
    const calloutKind = CALLOUT_KINDS.includes(attrs.kind as CalloutKind) ? (attrs.kind as CalloutKind) : "note"
    const content = cleanChildren(raw, depth, (child) => IN_CALLOUT.has(child.type))
    return { type, attrs: { kind: calloutKind }, content: content.length ? content : [{ type: "paragraph" }] }
  }
  if (type === "taskList") {
    const content = cleanChildren(raw, depth, (child) => child.type === "taskItem")
    return content.length ? { type, content } : null
  }
  if (type === "taskItem") {
    // A line's own words first, then any lines tucked under it.
    const content = cleanChildren(
      raw,
      depth,
      (child) => !isBlock(child.type) && child.type !== "noteCallout" && child.type !== "noteFold"
    )
    return { type, attrs: { checked: attrs.checked === true }, content: content.length ? content : [{ type: "paragraph" }] }
  }
  // A Fold section is a heading line: its words and marks only, like a paragraph's.
  const foldId = id.safeParse(attrs.id)
  const content = cleanChildren(raw, depth, (child) => child.type === "text" || child.type === "hardBreak")
  return { type, attrs: { id: foldId.success ? foldId.data : "fold" }, ...(content.length ? { content } : {}) }
}

function isBlock(type: unknown): type is NoteBlockType {
  return NOTE_BLOCK_TYPES.includes(type as NoteBlockType)
}

function cleanNode(value: unknown, depth: number): NoteNode | null {
  if (depth > MAX_DEPTH || !value || typeof value !== "object" || Array.isArray(value)) return null
  const raw = value as { type?: unknown; attrs?: unknown; content?: unknown }
  if (isBlock(raw.type)) {
    const attrs = raw.attrs && typeof raw.attrs === "object" ? (raw.attrs as Record<string, unknown>) : {}
    const kept = BLOCK_CLEANERS[raw.type](attrs)
    if (!kept) return null
    return Object.keys(kept).length ? { type: raw.type, attrs: kept } : { type: raw.type }
  }
  if (isHolder(raw.type)) return cleanHolder(raw.type, raw, depth)
  // Any other node is cleaned alone by the shell's written-page rules, then its children by these.
  const [alone] = cleanWrittenPageBody({ type: "doc", content: [{ ...raw, content: undefined }] }).content ?? []
  if (!alone) return null
  const node: NoteNode = { ...alone }
  if (Array.isArray(raw.content)) {
    const content = raw.content
      .map((child) => cleanNode(child, depth + 1))
      .filter((child): child is NoteNode => child !== null)
    if (content.length) node.content = content
  }
  return node
}

/** A note's document cleaned to what a Travel note may hold. Anything else becomes an empty note. */
export function cleanNoteBody(value: unknown): NoteNode {
  if (!value || typeof value !== "object" || (value as { type?: unknown }).type !== "doc") return emptyWrittenPageBody()
  const content = Array.isArray((value as { content?: unknown }).content)
    ? ((value as { content: unknown[] }).content
        .map((child) => cleanNode(child, 1))
        .filter((child): child is NoteNode => child !== null))
    : []
  return content.length ? { type: "doc", content } : { type: "doc", content: [] }
}

/** Whether a note holds nothing worth saving: no words and no blocks. */
export function noteIsEmpty(node: NoteNode): boolean {
  if (isBlock(node.type)) return false
  if (node.type === "text") return !node.text?.trim()
  return (node.content ?? []).every(noteIsEmpty)
}

/** A note's words, blocks left out, as `writtenPageText` reads a written page. */
export function noteText(node: NoteNode): string {
  if (node.type === "text") return node.text ?? ""
  return (node.content ?? []).map(noteText).filter(Boolean).join(" ")
}

function walk(node: NoteNode, visit: (node: NoteNode) => void) {
  visit(node)
  for (const child of node.content ?? []) walk(child, visit)
}

/** Every picture in a note, in the order they appear, for the trip's Photos tab. */
export function notePictures(node: NoteNode): NoteImageAttrs[] {
  const found: NoteImageAttrs[] = []
  walk(node, (each) => {
    if (each.type === "noteImage" && each.attrs) found.push(each.attrs as NoteImageAttrs)
  })
  return found
}

/**
 * The note with the blocks that only make sense on a trip taken out, for a
 * saved place, which belongs to no trip: the Budget block shows the open
 * trip's money. Place and Map blocks go through `swapNoteCards`.
 */
export function dropTripBlocks(node: NoteNode): NoteNode {
  if (!node.content) return node
  return { ...node, content: node.content.filter((child) => child.type !== "noteBudget").map(dropTripBlocks) }
}

/**
 * The note with every card it points at swapped by `ids`, for Copy trip: a
 * copied trip's notes point at the copies, not at the old trip's cards. A
 * card with no copy is dropped from a Map block, and a Place block for it
 * goes.
 */
export function swapNoteCards(node: NoteNode, ids: ReadonlyMap<string, string>): NoteNode {
  if (node.type === "notePlace") {
    const next = ids.get(String(node.attrs?.activityId))
    return next ? { ...node, attrs: { activityId: next } } : { type: "paragraph" }
  }
  if (node.type === "noteMap") {
    const kept = ((node.attrs?.activityIds as string[] | undefined) ?? []).flatMap((was) => ids.get(was) ?? [])
    return kept.length ? { ...node, attrs: { activityIds: kept } } : { type: "paragraph" }
  }
  return node.content ? { ...node, content: node.content.map((child) => swapNoteCards(child, ids)) } : node
}
