import { getSchema, Mark, mergeAttributes, Node, type AnyExtension, type JSONContent } from "@tiptap/core"
import { Details, DetailsContent, DetailsSummary } from "@tiptap/extension-details"
import Highlight from "@tiptap/extension-highlight"
import Image from "@tiptap/extension-image"
import { TaskItem, TaskList } from "@tiptap/extension-list"
import { TableKit } from "@tiptap/extension-table"
import { Node as ProseMirrorNode, type Schema } from "@tiptap/pm/model"
import StarterKit from "@tiptap/starter-kit"

import { formatTimecode } from "@/lib/note/library/notes"
import {
  CALLOUT_CLASS,
  CALLOUT_TONES,
  HIGHLIGHT_CLASS,
  HIGHLIGHT_COLOURS,
  isOneOf,
  TEXT_COLOUR_CLASS,
  TEXT_COLOURS,
  type CalloutTone,
} from "@/lib/note/notes/colours"

/**
 * What a note's body may hold, and the one place that checks it.
 *
 * The body is the editor's own JSON document, never HTML. The same list of
 * blocks builds the editor, reads and writes Markdown, and checks every save
 * on the server, so a block the editor cannot draw can never be stored.
 *
 * Browser-safe and free of React: the editor adds its drawn parts (the
 * link to another note, the callout's tone picker) on top of these with
 * `.extend`, and the server builds its schema straight from them.
 */

export const EMPTY_BODY: JSONContent = { type: "doc", content: [{ type: "paragraph" }] }

/** About 400,000 characters of stored JSON. A long book chapter is well under. */
const NOTE_BODY_MAX_CHARS = 400_000

/** A box with a tone around one or more blocks, for a tip or a warning. */
export const Callout = Node.create({
  name: "callout",
  group: "block",
  content: "block+",
  defining: true,
  addAttributes() {
    return {
      tone: {
        default: "grey" satisfies CalloutTone,
        parseHTML: (element) => {
          const tone = element.getAttribute("data-tone")
          return isOneOf(CALLOUT_TONES, tone) ? tone : "grey"
        },
        renderHTML: (attributes) => ({ "data-tone": attributes.tone }),
      },
    }
  },
  parseHTML() {
    return [{ tag: "div[data-callout]" }]
  },
  renderHTML({ HTMLAttributes, node }) {
    const tone = isOneOf(CALLOUT_TONES, node.attrs.tone) ? node.attrs.tone : "grey"
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-callout": "",
        class: `my-2 rounded-md border px-3 py-2 ${CALLOUT_CLASS[tone]}`,
      }),
      0,
    ]
  },
  renderMarkdown: (node, helpers) => helpers.wrapInBlock("> ", helpers.renderChildren(node.content ?? [], "\n\n")),
})

/**
 * A link to another of the person's notes, typed with "[[". It keeps the
 * note's id and the title it had when it was put in; the editor draws the
 * note's title as it is now, so a rename shows everywhere.
 */
export const NoteLink = Node.create({
  name: "noteLink",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      id: { default: null, renderHTML: (attributes) => ({ "data-note-id": attributes.id }) },
      label: { default: "", renderHTML: (attributes) => ({ "data-label": attributes.label }) },
    }
  },
  parseHTML() {
    return [
      {
        tag: "span[data-note-id]",
        getAttrs: (element) => ({
          id: element.getAttribute("data-note-id"),
          label: element.getAttribute("data-label") ?? element.textContent ?? "",
        }),
      },
    ]
  },
  renderHTML({ HTMLAttributes, node }) {
    return ["span", mergeAttributes(HTMLAttributes, { class: "underline" }), `${node.attrs.label}`]
  },
  renderText: ({ node }) => `[[${node.attrs.label}]]`,
  renderMarkdown: (node) => `[[${String(node.attrs?.label ?? "")}]]`,
})

/** The longest time a video-time chip may hold: a day, far past the 30-minute download limit. */
const VIDEO_TIME_MAX_MS = 24 * 60 * 60 * 1000

/** Whether a stored time is a whole number of milliseconds from 0 to a day. */
export function isVideoTime(ms: unknown): ms is number {
  return typeof ms === "number" && Number.isInteger(ms) && ms >= 0 && ms <= VIDEO_TIME_MAX_MS
}

/**
 * A moment in the note's own video, such as "4:12", put in from the player
 * (Tyler's task 02, part 3). Clicking it plays the video from there. Only the
 * time is stored; the editor draws it.
 */
export const VideoTime = Node.create({
  name: "videoTime",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      ms: {
        default: 0,
        parseHTML: (element) => Number(element.getAttribute("data-ms") ?? 0),
        renderHTML: (attributes) => ({ "data-ms": attributes.ms }),
      },
    }
  },
  parseHTML() {
    return [{ tag: "span[data-video-time]" }]
  },
  renderHTML({ HTMLAttributes, node }) {
    return ["span", mergeAttributes(HTMLAttributes, { "data-video-time": "" }), formatTimecode(Number(node.attrs.ms))]
  },
  renderText: ({ node }) => `[${formatTimecode(Number(node.attrs.ms))}]`,
  renderMarkdown: (node) => `[${formatTimecode(Number(node.attrs?.ms ?? 0))}]`,
})

/** Text in one of six colours, stored as the colour's name. */
export const TextColour = Mark.create({
  name: "textColour",
  addAttributes() {
    return {
      colour: {
        default: "grey",
        parseHTML: (element) => element.getAttribute("data-colour"),
        renderHTML: (attributes) => ({ "data-colour": attributes.colour }),
      },
    }
  },
  parseHTML() {
    return [{ tag: "span[data-colour]" }]
  },
  renderHTML({ HTMLAttributes, mark }) {
    const colour = isOneOf(TEXT_COLOURS, mark.attrs.colour) ? mark.attrs.colour : "grey"
    return ["span", mergeAttributes(HTMLAttributes, { class: TEXT_COLOUR_CLASS[colour] }), 0]
  },
  renderMarkdown: (node, helpers) => helpers.renderChildren(node.content ?? []),
})

/** The highlighter, with its colour stored as a name rather than a CSS value. */
const NoteHighlight = Highlight.extend({
  addAttributes() {
    return {
      colour: {
        default: "yellow",
        parseHTML: (element) => element.getAttribute("data-colour") ?? "yellow",
        renderHTML: (attributes) => {
          const colour = isOneOf(HIGHLIGHT_COLOURS, attributes.colour) ? attributes.colour : "yellow"
          return { "data-colour": colour, class: HIGHLIGHT_CLASS[colour] }
        },
      },
    }
  },
})

/** A fold-away block. Open or shut is saved with the note. */
const NoteDetails = Details.configure({ persist: true }).extend({
  renderMarkdown: (node, helpers) => helpers.wrapInBlock("> ", helpers.renderChildren(node.content ?? [], "\n\n")),
})
const NoteDetailsSummary = DetailsSummary.extend({
  renderMarkdown: (node, helpers) => `**${helpers.renderChildren(node.content ?? [])}**`,
})
const NoteDetailsContent = DetailsContent.extend({
  renderMarkdown: (node, helpers) => helpers.renderChildren(node.content ?? [], "\n\n"),
})

/**
 * Every block and style a note may hold. `overrides` swaps in the editor's
 * drawn versions of the same nodes, which never change what is stored.
 */
export function noteBodyExtensions(
  overrides: { callout?: AnyExtension; noteLink?: AnyExtension; videoTime?: AnyExtension } = {}
) {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      link: { openOnClick: false, autolink: true, defaultProtocol: "https" },
      // The editor adds its own placeholder and trailing paragraph; the
      // schema does not need either.
      trailingNode: false,
    }),
    TaskList,
    TaskItem.configure({ nested: true }),
    TableKit.configure({ table: { resizable: false } }),
    NoteDetails,
    NoteDetailsSummary,
    NoteDetailsContent,
    NoteHighlight,
    TextColour,
    Image.configure({ allowBase64: false }),
    overrides.callout ?? Callout,
    overrides.noteLink ?? NoteLink,
    overrides.videoTime ?? VideoTime,
  ]
}

let cachedSchema: Schema | null = null
function noteSchema() {
  cachedSchema ??= getSchema(noteBodyExtensions())
  return cachedSchema
}

export const BODY_SAYS = {
  unreadable: "That note could not be saved as it is. Reload it and try again.",
  tooLong: "That note is too long to save. Split it into two notes.",
} as const

const ID = /^[\w-]{1,36}$/

/** Whether an address may be followed from a note: a web page, an email or a phone. */
function isSafeHref(href: unknown) {
  if (typeof href !== "string" || href.length > 2000) return false
  try {
    const url = new URL(href)
    return ["https:", "http:", "mailto:", "tel:"].includes(url.protocol)
  } catch {
    return false
  }
}

/** Whether a picture's address may be drawn: a web address, or one on this site. */
export function isSafeImageSrc(src: unknown) {
  if (typeof src !== "string" || !src || src.length > 2000) return false
  if (src.startsWith("/") && !src.startsWith("//")) return true
  try {
    const url = new URL(src)
    return url.protocol === "https:" || url.protocol === "http:"
  } catch {
    return false
  }
}

/**
 * Drops anything a browser could be tricked into following or drawing: a
 * link that is not a web, mail or phone address, a picture from anywhere
 * else, a link to a note with a malformed id, a video time that is not a
 * whole number of milliseconds within a day, a colour that is not one of the
 * named ones. What is left is then checked block by block against the
 * schema by `cleanNoteBody`.
 */
function scrub(node: JSONContent): JSONContent | null {
  if (!node || typeof node !== "object" || typeof node.type !== "string") return null
  const out: JSONContent = { type: node.type }
  if (node.attrs && typeof node.attrs === "object") out.attrs = { ...node.attrs }
  if (typeof node.text === "string") out.text = node.text

  if (node.type === "image" && !isSafeImageSrc(out.attrs?.src)) return null
  if (node.type === "noteLink") {
    if (!ID.test(String(out.attrs?.id ?? ""))) return null
    out.attrs = { id: out.attrs?.id, label: String(out.attrs?.label ?? "").slice(0, 200) }
  }
  if (node.type === "videoTime") {
    if (!isVideoTime(out.attrs?.ms)) return null
    out.attrs = { ms: out.attrs?.ms }
  }
  if (node.type === "callout" && !isOneOf(CALLOUT_TONES, out.attrs?.tone)) {
    out.attrs = { ...out.attrs, tone: "grey" }
  }

  if (Array.isArray(node.marks)) {
    out.marks = node.marks.filter((mark) => {
      if (!mark || typeof mark.type !== "string") return false
      if (mark.type === "link") return isSafeHref(mark.attrs?.href)
      if (mark.type === "highlight") return isOneOf(HIGHLIGHT_COLOURS, mark.attrs?.colour ?? "yellow")
      if (mark.type === "textColour") return isOneOf(TEXT_COLOURS, mark.attrs?.colour)
      return true
    })
    if (!out.marks.length) delete out.marks
  }
  if (Array.isArray(node.content)) {
    out.content = node.content.map(scrub).filter((child): child is JSONContent => child !== null)
  }
  return out
}

/**
 * A body checked and tidied, ready to store. Throws `BODY_SAYS.unreadable`
 * for anything the schema does not allow, which only a hand-made request or a
 * bug can produce, since the editor builds from the same list.
 */
export function cleanNoteBody(body: unknown): JSONContent {
  if (JSON.stringify(body ?? null).length > NOTE_BODY_MAX_CHARS) throw new Error(BODY_SAYS.tooLong)
  const scrubbed = scrub(body as JSONContent)
  if (!scrubbed || scrubbed.type !== "doc") throw new Error(BODY_SAYS.unreadable)
  let node: ProseMirrorNode
  try {
    node = ProseMirrorNode.fromJSON(noteSchema(), scrubbed)
    node.check()
  } catch {
    throw new Error(BODY_SAYS.unreadable)
  }
  return node.toJSON() as JSONContent
}

type NoteBodyFacts = {
  /** Every word, one block per line, for search and the word count. */
  text: string
  /** The first line with words in it, for the card. */
  firstLine: string
  checklist: { done: number; total: number }
  /** The notes this one links to, each once. */
  linkedIds: string[]
  words: number
}

/** What the list and the server need to know about a body, read in one walk. */
export function noteBodyFacts(body: JSONContent): NoteBodyFacts {
  const blocks: string[] = []
  const linked = new Set<string>()
  let done = 0
  let total = 0

  function inline(node: JSONContent): string {
    if (node.type === "text") return node.text ?? ""
    if (node.type === "noteLink") {
      if (typeof node.attrs?.id === "string") linked.add(node.attrs.id)
      return String(node.attrs?.label ?? "")
    }
    if (node.type === "hardBreak") return " "
    if (node.type === "videoTime") return formatTimecode(Number(node.attrs?.ms ?? 0))
    return (node.content ?? []).map(inline).join("")
  }

  function walk(node: JSONContent) {
    if (node.type === "taskItem") {
      total += 1
      if (node.attrs?.checked === true) done += 1
    }
    const children = node.content ?? []
    const isTextBlock = children.length > 0 && children.every((child) => isInline(child))
    if (isTextBlock || node.type === "image") {
      const line = node.type === "image" ? String(node.attrs?.alt ?? "") : children.map(inline).join("")
      if (line.trim()) blocks.push(line.trim())
      return
    }
    children.forEach(walk)
  }
  walk(body)

  const text = blocks.join("\n")
  return {
    text,
    firstLine: (blocks[0] ?? "").slice(0, 200),
    checklist: { done, total },
    linkedIds: [...linked],
    words: countWords(text),
  }
}

function isInline(node: JSONContent) {
  return node.type === "text" || node.type === "noteLink" || node.type === "hardBreak" || node.type === "videoTime"
}

export function countWords(text: string) {
  const words = text.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu)
  return words ? words.length : 0
}

/** Minutes to read, at 200 words a minute, never less than one once there is a word. */
export function readingMinutes(words: number) {
  return words ? Math.max(1, Math.round(words / 200)) : 0
}

/** The headings in order, for the outline. */
export function noteHeadings(body: JSONContent): { level: number; text: string; index: number }[] {
  const out: { level: number; text: string; index: number }[] = []
  let index = 0
  function walk(node: JSONContent) {
    if (node.type === "heading") {
      const text = (node.content ?? []).map((child) => child.text ?? child.attrs?.label ?? "").join("")
      out.push({ level: Number(node.attrs?.level ?? 1), text: text.trim(), index })
      index += 1
      return
    }
    ;(node.content ?? []).forEach(walk)
  }
  walk(body)
  return out
}
