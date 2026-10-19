import type { JSONContent } from "@tiptap/core"
import { MarkdownManager } from "@tiptap/markdown"

import { EMPTY_BODY, noteBodyExtensions } from "@/lib/note/notes/body"
import {
  fieldValueText,
  hasValue,
  isNoteDate,
  parseFieldValue,
  sameName,
  type NoteField,
  type NoteFieldValue,
  type NoteFieldValues,
} from "@/lib/note/notes/fields"

/**
 * A note as a Markdown file, and a Markdown file as a note.
 *
 * The fields go at the top between `---` lines, one `Name: value` a line,
 * which is the header Obsidian and most Markdown tools read. Values are
 * written as JSON (strings in quotes, lists in brackets), which those tools
 * also read, so a file exported here comes back in unchanged.
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
  fields: NoteField[]
  values: NoteFieldValues
}) {
  const lines = [`title: ${JSON.stringify(note.title)}`]
  for (const field of note.fields) {
    const value = note.values[field.key]
    if (!hasValue(value)) continue
    lines.push(`${headerKey(field.name)}: ${headerValue(field, value)}`)
  }
  const body = markdown().serialize(note.body).trim()
  return `---\n${lines.join("\n")}\n---\n\n${body}\n`
}

/** A file name a computer accepts: the title, without the characters some refuse. */
export function markdownFileName(title: string) {
  const safe = title.replace(/[\\/:*?"<>|]+/g, " ").replace(/\p{Cc}+/gu, " ").replace(/\s+/g, " ").trim()
  return `${(safe || "Untitled").slice(0, 120)}.md`
}

function headerKey(name: string) {
  return /^[\p{L}\p{N} _-]+$/u.test(name) ? name : JSON.stringify(name)
}

function headerValue(field: NoteField, value: NoteFieldValue) {
  switch (field.type) {
    case "number":
      return String(value)
    case "checkbox":
      return "true"
    case "multi_select":
      return JSON.stringify(
        (value as string[])
          .map((id) => field.options.find((option) => option.id === id)?.label)
          .filter(Boolean)
      )
    default:
      return JSON.stringify(fieldValueText(field, value))
  }
}

type ImportedNote = {
  title: string
  body: JSONContent
  values: NoteFieldValues
  /** Every header line that did not become a field value, said in plain words. */
  problems: string[]
}

/**
 * One file read back into a note for a folder with these fields. A header
 * name that matches no field, or a value that does not fit its field, is
 * named in `problems` so the screen can list it, never dropped silently.
 */
export function markdownToNote(fileName: string, text: string, fields: NoteField[]): ImportedNote {
  const { header, rest } = splitHeader(text.replace(/^\u{FEFF}/u, "").replace(/\r\n?/g, "\n"))
  const problems: string[] = []
  const values: NoteFieldValues = {}
  let title = fileName.replace(/\.(md|markdown)$/i, "").trim()

  for (const [name, raw] of header) {
    if (sameName(name, "title")) {
      if (typeof raw === "string" && raw.trim()) title = raw.trim()
      continue
    }
    const field = fields.find((each) => sameName(each.name, name))
    if (!field) {
      problems.push(`“${name}” is not a field in this folder`)
      continue
    }
    const value = importValue(field, raw)
    if (value === undefined) {
      problems.push(`“${name}” did not fit the ${field.name} field`)
      continue
    }
    if (value !== null) values[field.key] = value
  }

  let body: JSONContent
  try {
    body = rest.trim() ? markdown().parse(rest) : EMPTY_BODY
  } catch {
    problems.push("The text could not be read, so the note is empty")
    body = EMPTY_BODY
  }
  return { title: title.slice(0, 200) || "Untitled", body, values, problems }
}

type HeaderValue = string | number | boolean | string[] | null

function splitHeader(text: string): { header: [string, HeaderValue][]; rest: string } {
  if (!text.startsWith("---\n")) return { header: [], rest: text }
  const end = text.indexOf("\n---", 4)
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

/** A header value turned into a field value; undefined when it does not fit. */
function importValue(field: NoteField, raw: HeaderValue): NoteFieldValue | null | undefined {
  let candidate: unknown = raw
  switch (field.type) {
    case "checkbox":
      candidate =
        raw === true || (typeof raw === "string" && /^(yes|y|true|1|x)$/i.test(raw.trim()))
          ? true
          : raw === false || raw === null || (typeof raw === "string" && /^(no|n|false|0)$/i.test(raw.trim()))
            ? null
            : "?"
      break
    case "select": {
      if (raw === null) return null
      const option = field.options.find((each) => sameName(each.label, String(raw)))
      if (!option) return undefined
      candidate = option.id
      break
    }
    case "multi_select": {
      if (raw === null) return null
      const labels = Array.isArray(raw) ? raw : String(raw).split(",").map((part) => part.trim())
      const ids = labels.map((label) => field.options.find((each) => sameName(each.label, label))?.id)
      if (ids.some((id) => !id)) return undefined
      candidate = ids
      break
    }
    case "date": {
      if (raw === null) return null
      const text = String(raw).trim().replace(" ", "T")
      candidate = isNoteDate(text) ? text : isNoteDate(text.slice(0, 16)) ? text.slice(0, 16) : text
      break
    }
    default:
      candidate = raw === null ? null : String(raw)
  }
  const parsed = parseFieldValue(field, candidate)
  return parsed.ok ? parsed.value : undefined
}
