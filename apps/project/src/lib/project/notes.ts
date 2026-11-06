import {
  cleanWrittenPageBody,
  emptyWrittenPageBody,
  writtenPageBodyIsEmpty,
  type WrittenPageNode,
} from "@/lib/pages/written-page-body"
import { cleanNoteBody, noteForCopy, noteIsEmpty, type NoteNode } from "@/lib/project/note-blocks"

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
 * Since 5 Nov 2026 a task's notes, New task's description and a template's
 * starting notes may hold the "/" blocks (`note-blocks.ts`). A meeting's notes
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

export function readTaskNotes(stored: string): TaskNotes {
  return readStored(stored, cleanNoteBody)
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
export function storedTaskNotes(value: unknown): string {
  const body = cleanNoteBody(value)
  return noteIsEmpty(body) ? "" : JSON.stringify(body)
}

/**
 * A task's saved notes as copied onto another task or a template
 * (`noteForCopy`): Duplicate, a repeating task's next copy, Copy project and
 * Save as task template. Plain-text notes copy as they are.
 */
export function storedNotesForCopy(stored: string, options: Parameters<typeof noteForCopy>[1] = {}): string {
  const notes = readTaskNotes(stored)
  if (notes.kind === "text") return stored
  return storedTaskNotes(noteForCopy(notes.body, options))
}

/** A meeting's notes as saved, cleaned to a written page's rules so no block gets in. */
export function storedPlainNotes(value: unknown): string {
  const body = cleanWrittenPageBody(value)
  return writtenPageBodyIsEmpty(body) ? "" : JSON.stringify(body)
}

const TASK_ADDRESS = /^\/projects\/[\w-]{1,36}\?task=([\w-]{1,36})$/

/** The task a notes link points at, when the link is a task's address (a # link). */
export function linkedTaskOf(href: string): string | null {
  return TASK_ADDRESS.exec(href)?.[1] ?? null
}

/**
 * The notes' words alone, for searching. A # task link's words are left out,
 * because they are the title as it was written, which not every reader may
 * see. `withTaskLinks` keeps them, for notes already named for one reader.
 */
export function taskNotesText(stored: string, { withTaskLinks = false } = {}): string {
  const notes = readTaskNotes(stored)
  if (notes.kind === "text") return notes.text
  const words: string[] = []
  const walk = (node: NoteNode) => {
    const taskLink =
      !withTaskLinks &&
      node.marks?.some((mark) => mark.type === "link" && mark.attrs && linkedTaskOf(mark.attrs.href))
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
 * The notes as drawn for reading: a # link to a task this reader can't open
 * ("a task you can't see", "deleted task") loses its link and keeps its words.
 */
export function notesForDisplay<Body extends NoteNode>(body: Body, openable: Record<string, string>): Body {
  const marks = body.marks?.filter((mark) => {
    const taskId = mark.type === "link" && mark.attrs ? linkedTaskOf(mark.attrs.href) : null
    return !taskId || Boolean(openable[taskId])
  })
  return {
    ...body,
    marks: marks?.length ? marks : undefined,
    content: body.content?.map((child) => notesForDisplay(child, openable)),
  }
}
