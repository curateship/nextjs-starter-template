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
 * headings, lists, quotes, links), plus the four "/" blocks (Travel features
 * 3, part 1; Tyler, 5 Nov 2026: "I want to enter "/" and it list a list of
 * blocks. FIrst block is an image block to add images"). A block carries only
 * the few plain values below, each checked here; anything else is dropped,
 * the same way the shell's `cleanWrittenPageBody` drops what it doesn't know.
 * This runs in the editor on every change and on the server on every save.
 */

export const NOTE_BLOCK_TYPES = ["noteImage", "notePlace", "noteVideo", "noteMap"] as const
export type NoteBlockType = (typeof NOTE_BLOCK_TYPES)[number]

/** A picture: uploaded, from Unsplash with its credit, or a pasted web address. */
export type NoteImageAttrs = { src: string; alt: string; credit: PhotoCredit | null }
/** A link to one of the trip's own cards, drawn as a small card. */
export type NotePlaceAttrs = { activityId: string }
/** A YouTube, TikTok or Instagram video, by its plain address. */
export type NoteVideoAttrs = { url: string }
/** A small map of the cards ticked for it. */
export type NoteMapAttrs = { activityIds: string[] }

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

const BLOCK_CLEANERS: Record<NoteBlockType, (attrs: Record<string, unknown>) => Record<string, unknown> | null> = {
  noteImage: cleanImage,
  notePlace: cleanPlace,
  noteVideo: cleanVideo,
  noteMap: cleanMap,
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
    return kept ? { type: raw.type, attrs: kept } : null
  }
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
