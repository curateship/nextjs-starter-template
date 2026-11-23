import type { JSONContent } from "@tiptap/core"
import { MarkdownManager } from "@tiptap/markdown"

import { EMPTY_BODY, noteBodyExtensions } from "@/lib/note/notes/body"
import { NOTE_PRIORITIES, PRIORITY_LABEL, TAG_MAX, TAGS_PER_NOTE, type NotePriority } from "@/lib/note/library/notes"

/**
 * A note as a Markdown file, and a Markdown file as a note.
 *
 * The title, tags, priority and the link it was imported from go at the top
 * between `---` lines, one `name: value` a line, which is the header Obsidian
 * and most Markdown tools read. Values are written as JSON (strings in quotes,
 * lists in brackets), which those tools also read, so a file exported here
 * comes back in unchanged.
 *
 * Checklists become `- [ ]`, tables become Markdown tables, toggles and
 * callouts become quotes, a link to another note becomes `[[Title]]`, and
 * colours are left out because Markdown has none.
 */

let manager: MarkdownManager | null = null
function markdown() {
  manager ??= new MarkdownManager({ extensions: noteBodyExtensions() })
  return manager
}

export function noteToMarkdown(note: {
  title: string
  body: JSONContent
  tags: string[]
  priority: NotePriority
  sourceUrl: string | null
}) {
  const lines = [`title: ${JSON.stringify(note.title)}`]
  if (note.tags.length) lines.push(`tags: ${JSON.stringify(note.tags)}`)
  if (note.priority !== "normal") lines.push(`priority: ${JSON.stringify(PRIORITY_LABEL[note.priority])}`)
  if (note.sourceUrl) lines.push(`source: ${JSON.stringify(note.sourceUrl)}`)
  const body = markdown().serialize(note.body).trim()
  return `---\n${lines.join("\n")}\n---\n\n${body}\n`
}

/** A file name a computer accepts: the title, without the characters some refuse. */
export function markdownFileName(title: string) {
  const safe = title.replace(/[\\/:*?"<>|]+/g, " ").replace(/\p{Cc}+/gu, " ").replace(/\s+/g, " ").trim()
  return `${(safe || "Untitled").slice(0, 120)}.md`
}

type ImportedNote = {
  title: string
  body: JSONContent
  tags: string[]
  priority: NotePriority
  /** Every header line that was not kept, said in plain words. */
  problems: string[]
}

/**
 * One file read back into a note. A header name a note does not keep, or a
 * value that does not fit, is named in `problems` so the screen can list it,
 * never dropped silently. The source link is read as plain text in the file
 * and not imported again.
 */
export function markdownToNote(fileName: string, text: string): ImportedNote {
  const { header, rest } = splitHeader(text.replace(/^\u{FEFF}/u, "").replace(/\r\n?/g, "\n"))
  const problems: string[] = []
  let title = fileName.replace(/\.(md|markdown)$/i, "").trim()
  let tags: string[] = []
  let priority: NotePriority = "normal"

  for (const [name, raw] of header) {
    const key = name.trim().toLowerCase()
    if (key === "title") {
      if (typeof raw === "string" && raw.trim()) title = raw.trim()
    } else if (key === "tags") {
      const list = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(",") : []
      tags = [...new Set(list.map((tag) => tag.replace(/\s+/g, " ").trim().toLowerCase().slice(0, TAG_MAX)).filter(Boolean))]
      if (tags.length > TAGS_PER_NOTE) {
        problems.push(`Only the first ${TAGS_PER_NOTE} tags were kept`)
        tags = tags.slice(0, TAGS_PER_NOTE)
      }
    } else if (key === "priority") {
      const found = NOTE_PRIORITIES.find((each) => PRIORITY_LABEL[each].toLowerCase() === String(raw).trim().toLowerCase())
      if (found) priority = found
      else problems.push(`“${name}” did not fit High, Normal or Low`)
    } else if (key !== "source") {
      problems.push(`“${name}” is not something a note keeps`)
    }
  }

  let body: JSONContent
  try {
    body = rest.trim() ? markdown().parse(rest) : EMPTY_BODY
  } catch {
    problems.push("The text could not be read, so the note is empty")
    body = EMPTY_BODY
  }
  return { title: title.slice(0, 200) || "Untitled", body, tags, priority, problems }
}

type HeaderValue = string | number | boolean | string[] | null

function splitHeader(text: string): { header: [string, HeaderValue][]; rest: string } {
  if (!text.startsWith("---\n")) return { header: [], rest: text }
  // From 3, so an empty header ("---" straight after "---") is found too.
  const end = text.indexOf("\n---", 3)
  if (end < 0) return { header: [], rest: text }
  const header: [string, HeaderValue][] = []
  for (const line of text.slice(4, end).split("\n")) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue
    const match = /^\s*("(?:[^"\\]|\\.)*"|[^:]+?)\s*:\s*(.*)$/.exec(line)
    if (!match) continue
    const name = match[1].startsWith('"') ? readJson(match[1]) : match[1]
    if (typeof name !== "string" || !name.trim()) continue
    header.push([name.trim(), readHeaderValue(match[2].trim())])
  }
  const after = text.indexOf("\n", end + 4)
  return { header, rest: after < 0 ? "" : text.slice(after + 1) }
}

function readJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

function readHeaderValue(text: string): HeaderValue {
  if (!text || text === "null" || text === "~") return null
  if (text === "true" || text === "false") return text === "true"
  if (text.startsWith('"')) {
    const parsed = readJson(text)
    return typeof parsed === "string" ? parsed : text
  }
  if (text.startsWith("'") && text.endsWith("'") && text.length > 1) return text.slice(1, -1).replace(/''/g, "'")
  if (text.startsWith("[") && text.endsWith("]")) {
    const parsed = readJson(text)
    if (Array.isArray(parsed)) return parsed.map(String)
    return text
      .slice(1, -1)
      .split(",")
      .map((part) => part.trim().replace(/^["']|["']$/g, ""))
      .filter(Boolean)
  }
  if (/^-?\d+(\.\d+)?$/.test(text)) return Number(text)
  return text
}
