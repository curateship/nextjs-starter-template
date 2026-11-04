import {
  cleanWrittenPageBody,
  emptyWrittenPageBody,
  writtenPageBodyIsEmpty,
  type WrittenPageNode,
} from "@/lib/pages/written-page-body"

/**
 * An activity's notes are the shell's editor document, kept as JSON text, the
 * way Project keeps a task's notes (Tyler, 2 Nov 2026: "the tiptap editor like
 * in project task"). The document holds only what the shell's written-page
 * rules allow, so the page draws it as nodes and never as stored markup.
 */
export function readNotes(stored: string): WrittenPageNode {
  if (!stored.startsWith("{")) return emptyWrittenPageBody()
  try {
    return cleanWrittenPageBody(JSON.parse(stored))
  } catch {
    return emptyWrittenPageBody()
  }
}

/** What is saved: "" when nothing is written, otherwise the cleaned document. */
export function storedNotes(text: string): string {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return ""
  }
  const body = cleanWrittenPageBody(parsed)
  return writtenPageBodyIsEmpty(body) ? "" : JSON.stringify(body)
}
