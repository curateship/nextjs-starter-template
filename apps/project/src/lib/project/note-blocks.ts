import { z } from "zod"

import {
  cleanWrittenPageBody,
  emptyWrittenPageBody,
  type WrittenPageMark,
} from "@/lib/pages/written-page-body"
import { readVideoLink } from "@/lib/project/video-links"

/**
 * What a Project note may hold: everything a shell written page may (words,
 * headings, lists, quotes, links), plus the "/" blocks (Project note blocks
 * task, 5 Nov 2026; Tyler: "Add the same feature from travel app that added
 * blocks to the tiptap editor to this app"). A block carries only the few
 * plain values below, each checked here; anything else is dropped, the way
 * the shell's `cleanWrittenPageBody` drops what it doesn't know. This runs in
 * the editor on every change, when notes are read, and on the server before
 * every save. Meeting notes never take blocks (`notes.ts`, `storedPlainNotes`).
 */

/** Blocks with no writing inside, each one value or two. */
export const NOTE_ATOM_TYPES = [
  "noteImage",
  "noteVideo",
  "noteTask",
  "noteFile",
  "noteRecord",
  "noteWebPage",
  "noteLinks",
  "horizontalRule",
] as const
export type NoteAtomType = (typeof NOTE_ATOM_TYPES)[number]

/** Blocks that hold writing: a Callout's words, a Checklist's lines, a Fold section's heading. */
export const NOTE_HOLDER_TYPES = ["noteCallout", "taskList", "taskItem", "noteFold"] as const
export type NoteHolderType = (typeof NOTE_HOLDER_TYPES)[number]

export const CALLOUT_KINDS = ["note", "warning", "decision"] as const
export type CalloutKind = (typeof CALLOUT_KINDS)[number]

/**
 * A picture: one of the task's own private files (Tyler, 5 Nov 2026: "Task's
 * private files"), from Unsplash with its credit, or a pasted web address.
 */
export type NoteImageAttrs = {
  src: string | null
  fileId: string | null
  alt: string
  credit: PhotoCredit | null
}
export type NoteVideoAttrs = { url: string }
export type NoteTaskAttrs = { taskId: string }
export type NoteFileAttrs = { fileId: string }
export type NoteWebPageAttrs = { url: string }
/** One line of a Links block: its words, or "" to show the address, and an `https://` address. */
export type NoteLink = { label: string; url: string }
export type NoteLinksAttrs = { links: NoteLink[] }

/** The most lines one Links block holds, and the longest a line's words may be. */
export const LINKS_BLOCK_MAX = 30
export const LINK_LABEL_MAX = 80
export type NoteCalloutAttrs = { kind: CalloutKind }
export type NoteFoldAttrs = { id: string }

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
const MAX_WEB_ADDRESS = 2000
const UNSPLASH_IMAGE = /^https:\/\/images\.unsplash\.com\//

export const noteId = z.string().regex(/^[A-Za-z0-9-]{1,36}$/)

/** Credit links only ever point at Unsplash itself, so a saved credit can't carry a `javascript:` link onto the page. */
const creditLink = z
  .string()
  .max(500)
  .refine((value) => value.startsWith("https://unsplash.com/"), "That credit link isn't an Unsplash address.")

/** Who took an Unsplash photo, shown under it as Unsplash's rules ask. */
export const photoCreditSchema = z.object({
  name: z.string().max(200),
  profileUrl: creditLink,
  photoPageUrl: creditLink,
})
export type PhotoCredit = z.infer<typeof photoCreditSchema>

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

function cleanImage(attrs: Record<string, unknown>): NoteImageAttrs | null {
  const alt = typeof attrs.alt === "string" ? attrs.alt.trim().slice(0, MAX_ALT) : ""
  const fileId = noteId.safeParse(attrs.fileId)
  if (fileId.success) return { src: null, fileId: fileId.data, alt, credit: null }
  const src = httpsAddress(attrs.src, MAX_SRC)
  if (!src) return null
  const credit = attrs.credit ? photoCreditSchema.safeParse(attrs.credit) : null
  // An Unsplash photo is only ever shown with its credit, as Unsplash's rules ask.
  if (UNSPLASH_IMAGE.test(src) && !credit?.success) return null
  return { src, fileId: null, alt, credit: credit?.success ? credit.data : null }
}

function cleanVideo(attrs: Record<string, unknown>): NoteVideoAttrs | null {
  const video = typeof attrs.url === "string" ? readVideoLink(attrs.url) : null
  return video ? { url: video.url } : null
}

function cleanTask(attrs: Record<string, unknown>): NoteTaskAttrs | null {
  const taskId = noteId.safeParse(attrs.taskId)
  return taskId.success ? { taskId: taskId.data } : null
}

function cleanFile(attrs: Record<string, unknown>): NoteFileAttrs | null {
  const fileId = noteId.safeParse(attrs.fileId)
  return fileId.success ? { fileId: fileId.data } : null
}

function cleanWebPage(attrs: Record<string, unknown>): NoteWebPageAttrs | null {
  const url = httpsAddress(attrs.url, MAX_WEB_ADDRESS)
  return url ? { url } : null
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
  noteTask: cleanTask,
  noteFile: cleanFile,
  // The card is the task's own Video or Promo record, read when it is drawn, so it holds nothing.
  noteRecord: () => ({}),
  noteWebPage: cleanWebPage,
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

function cleanChildren(raw: { content?: unknown }, depth: number, keep: (node: NoteNode) => boolean): NoteNode[] {
  if (!Array.isArray(raw.content)) return []
  return raw.content
    .map((child) => cleanNode(child, depth + 1))
    .filter((child): child is NoteNode => child !== null && keep(child))
}

/** Only words go inside a Callout: paragraphs and lists, never a block inside a block. */
const IN_CALLOUT = new Set(["paragraph", "bulletList", "orderedList"])

function cleanHolder(type: NoteHolderType, raw: { attrs?: unknown; content?: unknown }, depth: number): NoteNode | null {
  const attrs = attrsOf(raw)
  if (type === "noteCallout") {
    const kind = CALLOUT_KINDS.includes(attrs.kind as CalloutKind) ? (attrs.kind as CalloutKind) : "note"
    const content = cleanChildren(raw, depth, (child) => IN_CALLOUT.has(child.type))
    return { type, attrs: { kind }, content: content.length ? content : [{ type: "paragraph" }] }
  }
  if (type === "taskList") {
    const content = cleanChildren(raw, depth, (child) => child.type === "taskItem")
    return content.length ? { type, content } : null
  }
  if (type === "taskItem") {
    // A line's own words first, then any lines tucked under it.
    const content = cleanChildren(raw, depth, (child) => !isAtom(child.type) && child.type !== "noteCallout" && child.type !== "noteFold")
    return { type, attrs: { checked: attrs.checked === true }, content: content.length ? content : [{ type: "paragraph" }] }
  }
  // A Fold section is a heading line: its words and marks only, like a paragraph's.
  const id = noteId.safeParse(attrs.id)
  const content = cleanChildren(raw, depth, (child) => child.type === "text" || child.type === "hardBreak")
  // The editor gives every new section an id. One sent without stays foldable, under a shared name.
  return { type, attrs: { id: id.success ? id.data : "fold" }, ...(content.length ? { content } : {}) }
}

function cleanNode(value: unknown, depth: number): NoteNode | null {
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
  const node: NoteNode = { ...alone }
  const content = cleanChildren(raw, depth, () => true)
  if (content.length) node.content = content
  return node
}

/** A note's document cleaned to what a Project note may hold. Anything else becomes an empty note. */
export function cleanNoteBody(value: unknown): NoteNode {
  if (!value || typeof value !== "object" || (value as { type?: unknown }).type !== "doc") return emptyWrittenPageBody()
  return { type: "doc", content: cleanChildren(value as { content?: unknown }, 0, () => true) }
}

/** A new Fold section's id, which each reader's folds are remembered by. */
export function newFoldId() {
  return crypto.randomUUID()
}

/** Whether a note holds nothing worth saving: no words and no blocks. */
export function noteIsEmpty(node: NoteNode): boolean {
  if (isAtom(node.type)) return false
  if (node.type === "text") return !node.text?.trim()
  return (node.content ?? []).every(noteIsEmpty)
}

function walk(node: NoteNode, visit: (node: NoteNode) => void) {
  visit(node)
  for (const child of node.content ?? []) walk(child, visit)
}

/** The task's own files a note points at: File blocks and uploaded pictures. */
export function noteFileIds(body: NoteNode): string[] {
  const ids = new Set<string>()
  walk(body, (node) => {
    const fileId = node.attrs?.fileId
    if ((node.type === "noteFile" || node.type === "noteImage") && typeof fileId === "string") ids.add(fileId)
  })
  return [...ids]
}

/** The tasks a note's Task cards point at. */
export function noteTaskIds(body: NoteNode): string[] {
  const ids = new Set<string>()
  walk(body, (node) => {
    if (node.type === "noteTask" && typeof node.attrs?.taskId === "string") ids.add(node.attrs.taskId)
  })
  return [...ids]
}

/** The note with every node `drop` answers true for taken out, wherever it sits. */
function without(node: NoteNode, drop: (node: NoteNode) => boolean): NoteNode {
  if (!node.content) return node
  return { ...node, content: node.content.filter((child) => !drop(child)).map((child) => without(child, drop)) }
}

const pointsAtTaskFile = (node: NoteNode) =>
  (node.type === "noteFile" || node.type === "noteImage") && typeof node.attrs?.fileId === "string"

/**
 * The note keeping only File blocks and uploaded pictures whose file is one of
 * `taskFileIds`, the files on the task the note is saved on. A file of another
 * task, or one deleted since, is taken out on save.
 */
export function keepTaskFiles(body: NoteNode, taskFileIds: ReadonlySet<string>): NoteNode {
  return without(body, (node) => pointsAtTaskFile(node) && !taskFileIds.has(String(node.attrs?.fileId)))
}

/**
 * The note as copied onto another task: Duplicate, a repeating task's next
 * copy, Copy project and Save as task template. Files stay with the old task,
 * so File blocks and uploaded pictures go. A template has no task, so its
 * notes lose the Video or Promo card too (`forTemplate`). With `taskIds`
 * (Copy project), each Task card pointing at a copied task points at the copy.
 */
export function noteForCopy(
  body: NoteNode,
  { taskIds, forTemplate = false }: { taskIds?: ReadonlyMap<string, string>; forTemplate?: boolean } = {}
): NoteNode {
  const swap = (node: NoteNode): NoteNode => {
    if (node.type === "noteTask" && taskIds) {
      const next = taskIds.get(String(node.attrs?.taskId))
      return next ? { ...node, attrs: { taskId: next } } : node
    }
    return node.content ? { ...node, content: node.content.map(swap) } : node
  }
  return swap(without(body, (node) => pointsAtTaskFile(node) || (forTemplate && node.type === "noteRecord")))
}
