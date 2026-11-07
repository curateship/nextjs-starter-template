import { z } from "zod"

import {
  cleanWrittenPageBody,
  emptyWrittenPageBody,
  type WrittenPageMark,
} from "@/lib/pages/written-page-body"
import { readVideoLink } from "@/lib/trade/video-links"

/** A Fold section's id: a short plain string, as Travel's ids. */
const id = z.string().min(1).max(36)

/**
 * What a Trade page may hold (the Admin 3 panel design, 7 Nov 2026): the
 * exchange's own page on the dashboard's left, and the All markets page on
 * its right. Everything a shell written page may hold (words, headings, lists,
 * quotes, links), plus the "/" blocks. The basic blocks and this file's rules
 * are copied from Travel's `note-blocks.ts`. The advanced blocks draw what the
 * dashboard already knows (Tyler, 7 Nov 2026: "we turn rules, folders,
 * scanners, alerts, grid trades, dca trades and manual trades into blocks"),
 * so they keep no values of their own. A block this build no longer has,
 * such as the Market info block that became a tooltip on 7 Nov 2026, is
 * dropped. This runs in the editor on every change
 * and on the server on every save.
 */

/**
 * Blocks with no writing inside, each a few plain values. Links and the
 * Divider (`horizontalRule`) came from Project's basic blocks on 6 Nov 2026
 * (Tyler: "travel is missing some basic blocks").
 */
export const NOTE_BLOCK_TYPES = [
  "noteImage",
  "noteVideo",
  "noteLink",
  "noteLinks",
  "horizontalRule",
  "noteRules",
  "noteManualTrades",
  "noteGridTrades",
  "noteDcaTrades",
  "noteAlerts",
  "noteScanner",
  "noteFolders",
] as const
export type NoteBlockType = (typeof NOTE_BLOCK_TYPES)[number]

/**
 * Which of the dashboard's two pages a document is: the exchange's own page
 * on the left, or the "All markets" page on the right, which every market on
 * the exchange shows (Tyler, 7 Nov 2026: "We should make both left and right
 * panel all protocol wide"). Both hold the same blocks; they differ only in
 * how a new one starts.
 */
export type TradePageKind = "exchange" | "shared"

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


/** A picture: uploaded, or a pasted web address. Trade has no Unsplash, so there is no credit. */
export type NoteImageAttrs = { src: string; alt: string }
/** A YouTube, TikTok or Instagram video, by its plain address. */
export type NoteVideoAttrs = { url: string }
/** A web page as a small card: its address, the title and picture it gives, and its site's name. */
export type NoteLinkAttrs = { url: string; title: string | null; image: string | null; site: string }

export type NoteNode = {
  type: string
  attrs?: Record<string, unknown>
  content?: NoteNode[]
  text?: string
  marks?: WrittenPageMark[]
}

const MAX_DEPTH = 20
const MAX_SRC = 1000
const MAX_ALT = 200

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
  const alt = typeof attrs.alt === "string" ? attrs.alt.trim().slice(0, MAX_ALT) : ""
  return { src: src.data, alt }
}

function cleanVideo(attrs: Record<string, unknown>): NoteVideoAttrs | null {
  const video = typeof attrs.url === "string" ? readVideoLink(attrs.url) : null
  return video ? { url: video.url } : null
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
  noteVideo: cleanVideo,
  noteLink: cleanLinkPreview,
  noteLinks: cleanLinks,
  horizontalRule: () => ({}),
  // Trade's own blocks draw the dashboard's live figures, so none keeps values of its own.
  noteRules: () => ({}),
  noteManualTrades: () => ({}),
  noteGridTrades: () => ({}),
  noteDcaTrades: () => ({}),
  noteAlerts: () => ({}),
  noteScanner: () => ({}),
  noteFolders: () => ({}),
}

function isHolder(type: unknown): type is NoteHolderType {
  return NOTE_HOLDER_TYPES.includes(type as NoteHolderType)
}

function cleanChildren(
  raw: { content?: unknown },
  depth: number,
  keep: (node: NoteNode) => boolean
): NoteNode[] {
  if (!Array.isArray(raw.content)) return []
  return raw.content
    .map((child) => cleanNode(child, depth + 1))
    .filter((child): child is NoteNode => child !== null && keep(child))
}

/** Only words go inside a Callout: paragraphs and lists, never a block inside a block. */
const IN_CALLOUT = new Set(["paragraph", "bulletList", "orderedList"])

/** A Callout, a Checklist and its lines, and a Fold section's heading, as Project keeps them. */
function cleanHolder(
  type: NoteHolderType,
  raw: { attrs?: unknown; content?: unknown },
  depth: number
): NoteNode | null {
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

/** A page's document cleaned to what a Trade page may hold. Anything else becomes an empty page. */
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
