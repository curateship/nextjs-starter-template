import {
  cleanWrittenPageBody,
  emptyWrittenPageBody,
  writtenPageBodyIsEmpty,
  type WrittenPageNode,
} from "@/lib/pages/written-page-body"

/**
 * A task's notes. Since 10 Oct 2026 they are the shared editor's document
 * (bold, lists, links), saved as JSON text in `project_tasks.notes`. Notes
 * written before then are plain text and still show exactly as they were
 * typed, until someone edits them.
 *
 * The document is never HTML: it is drawn by turning named nodes into React
 * elements (`lib/pages/written-page-body.ts`), so nothing typed can run.
 */
export type TaskNotes =
  | { kind: "doc"; body: WrittenPageNode }
  | { kind: "text"; text: string }

const DOC_START = '{"type":"doc"'

export function readTaskNotes(stored: string): TaskNotes {
  if (stored.startsWith(DOC_START)) {
    try {
      return { kind: "doc", body: cleanWrittenPageBody(JSON.parse(stored)) }
    } catch {
      // Not a document after all, so it shows as the words that were saved.
    }
  }
  return { kind: "text", text: stored }
}

export function taskNotesAreEmpty(notes: TaskNotes) {
  return notes.kind === "doc" ? writtenPageBodyIsEmpty(notes.body) : !notes.text.trim()
}

/** Where the editor starts: plain notes become one paragraph per line. */
export function notesForEditor(notes: TaskNotes): WrittenPageNode {
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
  const walk = (node: WrittenPageNode) => {
    const taskLink =
      !withTaskLinks &&
      node.marks?.some((mark) => mark.type === "link" && mark.attrs && linkedTaskOf(mark.attrs.href))
    if (node.text && !taskLink) words.push(node.text)
    node.content?.forEach(walk)
    // Blocks end a line, so words from two paragraphs don't run together.
    if (node.type !== "text") words.push("\n")
  }
  walk(notes.body)
  return words.join("").replace(/\n+/g, "\n").trim()
}

/**
 * The notes as drawn for reading: a # link to a task this reader can't open
 * ("a task you can't see", "deleted task") loses its link and keeps its words.
 */
export function notesForDisplay(body: WrittenPageNode, openable: Record<string, string>): WrittenPageNode {
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
