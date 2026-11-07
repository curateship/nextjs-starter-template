import {
  cleanWrittenPageBody,
  emptyWrittenPageBody,
  writtenPageBodyIsEmpty,
  type WrittenPageNode,
} from "@/lib/pages/written-page-body"
import { cleanNoteBody, noteForCopy, noteIsEmpty, type NoteNode, type NoteRules } from "@/lib/project/note-blocks"

/**
 * A task's notes. Since 10 Oct 2026 they are the shared editor's document
 * (bold, lists, links), saved as JSON text in `project_tasks.notes`. Notes
 * written before then are plain text and still show exactly as they were
 * typed, until someone edits them.
 *
 * The document is never HTML: it is drawn by turning named nodes into React
 * elements (`lib/pages/written-page-body.ts`, and `note-reader.tsx` for the
 * "/" blocks), so nothing typed can run.
 *
 * Since 5 Nov 2026 a task's notes, New task's description and a project's
 * page may hold the "/" blocks (`note-blocks.ts`). A meeting's notes
 * never do: each of their lines can become a task, and a picture can't, so
 * they keep a written page's rules (`readPlainNotes`, `storedPlainNotes`).
 */
export type TaskNotes =
  | { kind: "doc"; body: NoteNode }
  | { kind: "text"; text: string }

export type PlainNotes =
  | { kind: "doc"; body: WrittenPageNode }
  | { kind: "text"; text: string }

const DOC_START = '{"type":"doc"'

function readStored<Body>(stored: string, clean: (value: unknown) => Body): { kind: "doc"; body: Body } | { kind: "text"; text: string } {
  if (stored.startsWith(DOC_START)) {
    try {
      return { kind: "doc", body: clean(JSON.parse(stored)) }
    } catch {
      // Not a document after all, so it shows as the words that were saved.
    }
  }
  return { kind: "text", text: stored }
}

/** A task's notes, a project's page, or with `dashboard` the site admin's own page and with `team` a team's page. */
export function readTaskNotes(stored: string, rules: NoteRules = {}): TaskNotes {
  return readStored(stored, (value) => cleanNoteBody(value, rules))
}

/** A meeting's notes: words, lists and links, never a block. */
export function readPlainNotes(stored: string): PlainNotes {
  return readStored(stored, cleanWrittenPageBody)
}

export function taskNotesAreEmpty(notes: TaskNotes | PlainNotes) {
  return notes.kind === "doc" ? noteIsEmpty(notes.body) : !notes.text.trim()
}

/** Where the editor starts: plain notes become one paragraph per line. */
export function notesForEditor(notes: TaskNotes): NoteNode {
  if (notes.kind === "doc") return notes.body
  if (!notes.text.trim()) return emptyWrittenPageBody()
  return {
    type: "doc",
    content: notes.text.split("\n").map((line) =>
      line ? { type: "paragraph", content: [{ type: "text", text: line }] } : { type: "paragraph" }
    ),
  }
}

/** What is saved: "" when nothing is written, otherwise the cleaned document. */
export function storedTaskNotes(value: unknown, rules: NoteRules = {}): string {
  const body = cleanNoteBody(value, rules)
  return noteIsEmpty(body) ? "" : JSON.stringify(body)
}

/**
 * A task's saved notes as copied onto another task or a page with no task
 * (`noteForCopy`): Duplicate, a repeating task's next copy and Copy project.
 * Plain-text notes copy as they are.
 */
export function storedNotesForCopy(
  stored: string,
  { dashboard, team, ...options }: NonNullable<Parameters<typeof noteForCopy>[1]> & NoteRules = {}
): string {
  const notes = readTaskNotes(stored, { dashboard, team })
  if (notes.kind === "text") return stored
  return storedTaskNotes(noteForCopy(notes.body, options), { dashboard, team })
}

/** A meeting's notes as saved, cleaned to a written page's rules so no block gets in. */
export function storedPlainNotes(value: unknown): string {
  const body = cleanWrittenPageBody(value)
  return writtenPageBodyIsEmpty(body) ? "" : JSON.stringify(body)
}

const TASK_ADDRESS = /^\/projects\/[\w-]{1,36}\?task=([\w-]{1,36})$/
const NOTE_ADDRESS = /^\/projects\/[\w-]{1,36}\?note=([\w-]{1,36})$/

/** The task a notes link points at, when the link is a task's address (a # link). */
export function linkedTaskOf(href: string): string | null {
  return TASK_ADDRESS.exec(href)?.[1] ?? null
}

/**
 * A # link to a project's note is kept under its id with this in front, in
 * chat (`#[Title](note:<id>)`) and in every map of links, so it is never
 * mistaken for a task's.
 */
export const NOTE_LINK = "note:"

export function isNoteLink(linkId: string) {
  return linkId.startsWith(NOTE_LINK)
}

/** A project note's address: the project page with that note open in its left panel. */
export function noteHref(projectId: string, noteId: string) {
  return `/projects/${encodeURIComponent(projectId)}?note=${encodeURIComponent(noteId)}`
}

/** The note a notes link points at, when the link is a note's address (a # link). */
function linkedNoteOf(href: string): string | null {
  return NOTE_ADDRESS.exec(href)?.[1] ?? null
}

/** What a # link in the notes is kept under: the task's id, or `note:` and the note's. */
export function linkIdOf(href: string): string | null {
  const taskId = linkedTaskOf(href)
  if (taskId) return taskId
  const noteId = linkedNoteOf(href)
  return noteId ? NOTE_LINK + noteId : null
}

/**
 * The notes' words alone, for searching. A # link's words are left out,
 * because they are the task's title or the note's first line as it was
 * written, which not every reader may see. `withTaskLinks` keeps them, for
 * notes already named for one reader.
 */
export function taskNotesText(stored: string, { withTaskLinks = false } = {}): string {
  const notes = readTaskNotes(stored)
  if (notes.kind === "text") return notes.text
  const words: string[] = []
  const walk = (node: NoteNode) => {
    const taskLink =
      !withTaskLinks &&
      node.marks?.some((mark) => mark.type === "link" && mark.attrs && linkIdOf(mark.attrs.href))
    if (node.text && !taskLink) words.push(node.text)
    node.content?.forEach(walk)
    // Blocks end a line, so words from two paragraphs don't run together. A
    // block's own values (addresses, ids) are never words, so search skips them.
    if (node.type !== "text") words.push("\n")
  }
  walk(notes.body)
  return words.join("").replace(/\n+/g, "\n").trim()
}

/**
 * The notes as drawn for reading: a # link to a task or note this reader
 * can't open ("a task you can't see", "deleted note") loses its link and
 * keeps its words.
 */
export function notesForDisplay<Body extends NoteNode>(body: Body, openable: Record<string, string>): Body {
  const marks = body.marks?.filter((mark) => {
    const linkId = mark.type === "link" && mark.attrs ? linkIdOf(mark.attrs.href) : null
    return !linkId || Boolean(openable[linkId])
  })
  return {
    ...body,
    marks: marks?.length ? marks : undefined,
    content: body.content?.map((child) => notesForDisplay(child, openable)),
  }
}
