import { z } from "zod"

import {
  cleanWrittenPageBody,
  emptyWrittenPageBody,
  type WrittenPageMark,
} from "@/lib/pages/written-page-body"
import { readVideoLink } from "@/lib/phones/video-links"

/**
 * What a rack's notes may hold (Racks dashboard, part 90; Tyler, 5 Nov 2026:
 * "Need tiptap editor with blocks ability too"): everything a shell written
 * page may (words, headings, lists, quotes, links), plus the "/" blocks a rack
 * needs. Copied from Project's note blocks (`apps/project/src/lib/project/note-blocks.ts`)
 * and trimmed: a rack has no tasks, task files or Video record, so the Task
 * card, File, Video-or-Promo card and Web page blocks are left out, and a
 * picture is an uploaded one or a pasted web address, with no Unsplash.
 * Checklist is left out too: it needs Tiptap's list extension, which Promo
 * does not carry.
 *
 * A block carries only the few plain values below, each checked here;
 * anything else is dropped, the way the shell's `cleanWrittenPageBody` drops
 * what it doesn't know. This runs in the editor on every change, when the
 * notes are read, and on the server before every save.
 */

/** Blocks with no writing inside, each one value or two. */
export const NOTE_ATOM_TYPES = ["noteImage", "noteVideo", "noteLinks", "horizontalRule"] as const
export type NoteAtomType = (typeof NOTE_ATOM_TYPES)[number]

/** Blocks that hold writing: a Callout's words and a Fold section's heading. */
export const NOTE_HOLDER_TYPES = ["noteCallout", "noteFold"] as const
export type NoteHolderType = (typeof NOTE_HOLDER_TYPES)[number]

export const CALLOUT_KINDS = ["note", "warning", "decision"] as const
export type CalloutKind = (typeof CALLOUT_KINDS)[number]

/** A picture: an `https://` address, one uploaded to the media library or pasted. */
export type NoteImageAttrs = { src: string; alt: string }
export type NoteVideoAttrs = { url: string }
/** One line of a Links block: its words, or "" to show the address, and an `https://` address. */
export type NoteLink = { label: string; url: string }
export type NoteLinksAttrs = { links: NoteLink[] }
export type NoteCalloutAttrs = { kind: CalloutKind }
export type NoteFoldAttrs = { id: string }

/** The most lines one Links block holds, and the longest a line's words may be. */
export const LINKS_BLOCK_MAX = 30
export const LINK_LABEL_MAX = 80

/** The most characters of saved notes. */
export const RACK_NOTES_STORED_MAX = 200_000

export type RackNoteNode = {
  type: string
  attrs?: Record<string, unknown>
  content?: RackNoteNode[]
  text?: string
  marks?: WrittenPageMark[]
}

const MAX_DEPTH = 20
const MAX_SRC = 1000
const MAX_ALT = 200
const MAX_WEB_ADDRESS = 2000

export const noteId = z.string().regex(/^[A-Za-z0-9-]{1,36}$/)

/** An `https://` address with no name or password in it, or null. */
export function httpsAddress(value: unknown, max: number): string | null {
  if (typeof value !== "string" || value.length > max) return null
  try {
    const url = new URL(value.trim())
    if (url.protocol !== "https:" || url.username || url.password) return null
    return url.toString()
  } catch {
    return null
  }
}

/**
 * A picture's address: `https://`, or the app's own media path for a picture
 * uploaded on this server (`/media/…`), which is what the media library hands
 * out on a server without a storage bucket.
 */
export function pictureAddress(value: unknown): string | null {
  if (typeof value === "string" && value.length <= MAX_SRC && /^\/[A-Za-z0-9/_.-]+$/.test(value) && !value.includes("..")) {
    return value
  }
  return httpsAddress(value, MAX_SRC)
}

function cleanImage(attrs: Record<string, unknown>): NoteImageAttrs | null {
  const src = pictureAddress(attrs.src)
  if (!src) return null
  return { src, alt: typeof attrs.alt === "string" ? attrs.alt.trim().slice(0, MAX_ALT) : "" }
}

function cleanVideo(attrs: Record<string, unknown>): NoteVideoAttrs | null {
  const video = typeof attrs.url === "string" ? readVideoLink(attrs.url) : null
  return video ? { url: video.url } : null
}

function cleanLinks(attrs: Record<string, unknown>): NoteLinksAttrs | null {
  if (!Array.isArray(attrs.links)) return null
  const links = attrs.links.flatMap((link): NoteLink[] => {
    if (!link || typeof link !== "object") return []
    const url = httpsAddress((link as { url?: unknown }).url, MAX_WEB_ADDRESS)
    const label = (link as { label?: unknown }).label
    return url ? [{ label: typeof label === "string" ? label.trim().slice(0, LINK_LABEL_MAX) : "", url }] : []
  })
  return links.length ? { links: links.slice(0, LINKS_BLOCK_MAX) } : null
}

/** What a link shows when it has no words of its own: its address without `https://` or a last slash. */
export function linkWords(link: NoteLink) {
  return link.label || link.url.replace(/^https:\/\//, "").replace(/\/$/, "")
}

const ATOM_CLEANERS: Record<NoteAtomType, (attrs: Record<string, unknown>) => Record<string, unknown> | null> = {
  noteImage: cleanImage,
  noteVideo: cleanVideo,
  noteLinks: cleanLinks,
  horizontalRule: () => ({}),
}

function isAtom(type: unknown): type is NoteAtomType {
  return NOTE_ATOM_TYPES.includes(type as NoteAtomType)
}

function isHolder(type: unknown): type is NoteHolderType {
  return NOTE_HOLDER_TYPES.includes(type as NoteHolderType)
}

function attrsOf(raw: { attrs?: unknown }): Record<string, unknown> {
  return raw.attrs && typeof raw.attrs === "object" && !Array.isArray(raw.attrs) ? (raw.attrs as Record<string, unknown>) : {}
}

function cleanChildren(raw: { content?: unknown }, depth: number, keep: (node: RackNoteNode) => boolean): RackNoteNode[] {
  if (!Array.isArray(raw.content)) return []
  return raw.content
    .map((child) => cleanNode(child, depth + 1))
    .filter((child): child is RackNoteNode => child !== null && keep(child))
}

/** Only words go inside a Callout: paragraphs and lists, never a block inside a block. */
const IN_CALLOUT = new Set(["paragraph", "bulletList", "orderedList"])

function cleanHolder(type: NoteHolderType, raw: { attrs?: unknown; content?: unknown }, depth: number): RackNoteNode | null {
  const attrs = attrsOf(raw)
  if (type === "noteCallout") {
    const kind = CALLOUT_KINDS.includes(attrs.kind as CalloutKind) ? (attrs.kind as CalloutKind) : "note"
    const content = cleanChildren(raw, depth, (child) => IN_CALLOUT.has(child.type))
    return { type, attrs: { kind }, content: content.length ? content : [{ type: "paragraph" }] }
  }
  // A Fold section is a heading line: its words and marks only, like a paragraph's.
  const id = noteId.safeParse(attrs.id)
  const content = cleanChildren(raw, depth, (child) => child.type === "text" || child.type === "hardBreak")
  // The editor gives every new section an id. One sent without stays foldable, under a shared name.
  return { type, attrs: { id: id.success ? id.data : "fold" }, ...(content.length ? { content } : {}) }
}

function cleanNode(value: unknown, depth: number): RackNoteNode | null {
  if (depth > MAX_DEPTH || !value || typeof value !== "object" || Array.isArray(value)) return null
  const raw = value as { type?: unknown; attrs?: unknown; content?: unknown }
  if (isAtom(raw.type)) {
    const kept = ATOM_CLEANERS[raw.type](attrsOf(raw))
    if (!kept) return null
    return Object.keys(kept).length ? { type: raw.type, attrs: kept } : { type: raw.type }
  }
  if (isHolder(raw.type)) return cleanHolder(raw.type, raw, depth)
  // Any other node is cleaned alone by the shell's written-page rules, then its children by these.
  const [alone] = cleanWrittenPageBody({ type: "doc", content: [{ ...raw, content: undefined }] }).content ?? []
  if (!alone) return null
  const node: RackNoteNode = { ...alone }
  const content = cleanChildren(raw, depth, () => true)
  if (content.length) node.content = content
  return node
}

/** Notes cleaned to what a rack's notes may hold. Anything else becomes empty notes. */
export function cleanRackNoteBody(value: unknown): RackNoteNode {
  if (!value || typeof value !== "object" || (value as { type?: unknown }).type !== "doc") return emptyWrittenPageBody()
  return { type: "doc", content: cleanChildren(value as { content?: unknown }, 0, () => true) }
}

/** Whether the notes hold nothing worth saving: no words and no blocks. */
export function rackNotesAreEmpty(node: RackNoteNode): boolean {
  if (isAtom(node.type)) return false
  if (node.type === "text") return !node.text?.trim()
  return (node.content ?? []).every(rackNotesAreEmpty)
}

/** What is saved: "" for empty notes, so empty notes read as none. */
export function storedRackNotes(body: RackNoteNode): string {
  return rackNotesAreEmpty(body) ? "" : JSON.stringify(body)
}

/** The saved notes as the editor's document; "" is empty notes. */
export function readRackNotes(stored: string): RackNoteNode {
  if (!stored) return emptyWrittenPageBody()
  try {
    return cleanRackNoteBody(JSON.parse(stored))
  } catch {
    return emptyWrittenPageBody()
  }
}

/** A new Fold section's id, which each reader's folds are remembered by. */
export function newFoldId() {
  return crypto.randomUUID()
}
