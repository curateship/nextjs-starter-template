import {
  cleanWrittenPageBody,
  writtenPageText,
  type WrittenPageNode,
} from "@/lib/pages/written-page-body"

/**
 * What a chapter's text may hold: everything a written page may, plus the
 * blocks a guide needs.
 *
 * The written-page rules belong to the shell and stay closed, so this file
 * does not widen them. It walks the top level of the document itself, keeps
 * each course block in the one shape below, and hands every other block to
 * `cleanWrittenPageBody`, the way CMS posts add their listing card. Course
 * blocks sit at the top level only, never inside a list or another block.
 *
 * Dropping rather than rejecting, for the same reason written pages do: a
 * missing block is something an admin can see and put back, and a refused
 * save is not.
 */

export type ImageNode = {
  type: "image"
  attrs: { src: string; alt: string }
}

/** A file from the media library, or a YouTube video kept as its id alone. */
export type VideoNode = {
  type: "video"
  attrs: { source: "file" | "youtube"; src: string }
}

export type CalloutTone = "tip" | "warning"

/** A coloured box marked Tip or Watch out, holding ordinary paragraphs. */
export type CalloutNode = {
  type: "callout"
  attrs: { tone: CalloutTone }
  content: WrittenPageNode[]
}

/** A grey box with a Copy button. Plain text, kept exactly as typed. */
export type PromptNode = {
  type: "codeBlock"
  content?: [{ type: "text"; text: string }]
}

/** A "Show more" box: a one-line summary, and paragraphs that open under it. */
export type FoldoutNode = {
  type: "foldout"
  attrs: { summary: string }
  content: WrittenPageNode[]
}

/** A plain grid of words. The first row is the heading row when `header`. */
export type TableNode = {
  type: "simpleTable"
  attrs: { header: boolean; rows: string[][] }
}

export type ChecklistItem = { id: string; text: string }

export type ChecklistNode = {
  type: "checklist"
  attrs: { items: ChecklistItem[] }
}

export type QuizChoice = { id: string; text: string }

export type QuizQuestion = {
  id: string
  prompt: string
  choices: QuizChoice[]
  /** The right choice. Taken out before the chapter reaches a reader. */
  answerId: string
}

export type QuizNode = {
  type: "quiz"
  attrs: { questions: QuizQuestion[] }
}

export type ChapterBlock =
  | WrittenPageNode
  | ImageNode
  | VideoNode
  | CalloutNode
  | PromptNode
  | FoldoutNode
  | TableNode
  | ChecklistNode
  | QuizNode

export type ChapterBody = { type: "doc"; content?: ChapterBlock[] }

export const COURSE_BLOCK_TYPES = [
  "image",
  "video",
  "callout",
  "codeBlock",
  "foldout",
  "simpleTable",
  "checklist",
  "quiz",
] as const

type CourseBlockType = (typeof COURSE_BLOCK_TYPES)[number]

/** What may sit inside a Tip box or a fold-out: ordinary text, not more blocks. */
const INNER_BLOCK_TYPES = new Set([
  "paragraph",
  "heading",
  "bulletList",
  "orderedList",
  "blockquote",
])

const MAX_TEXT = 20_000
const MAX_LINE = 500
const MAX_URL = 600
const MAX_TABLE_ROWS = 100
const MAX_TABLE_COLUMNS = 12
const MAX_CHECKLIST_ITEMS = 50
const MAX_QUIZ_QUESTIONS = 20
const MAX_QUIZ_CHOICES = 8
/** How many course blocks one chapter may hold, so one paste cannot fill a row. */
const MAX_COURSE_BLOCKS = 200
/** How many blocks of any kind, paragraphs included, for the same reason. */
const MAX_BLOCKS = 2_000

/** The ids the editor gives checklist items and quiz parts. */
const ITEM_ID = /^[A-Za-z0-9_-]{1,32}$/
/** A YouTube video id. Anything else cannot be one. */
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/
/** A picture or video address: one of ours, or a web address. Never a script. */
const MEDIA_URL = /^(https:\/\/|\/(?!\/))/i

export function emptyChapterBody(): ChapterBody {
  return { type: "doc", content: [] }
}

function isCourseBlockType(type: unknown): type is CourseBlockType {
  return COURSE_BLOCK_TYPES.includes(type as CourseBlockType)
}

function line(value: unknown, max = MAX_LINE): string {
  return typeof value === "string" ? value.slice(0, max) : ""
}

function mediaUrl(value: unknown): string | null {
  if (typeof value !== "string") return null
  const url = value.trim()
  if (!url || url.length > MAX_URL || !MEDIA_URL.test(url)) return null
  return url
}

function itemId(value: unknown): string | null {
  return typeof value === "string" && ITEM_ID.test(value) ? value : null
}

/** Ordinary text blocks for inside a box, cleaned by the shell's own rules. */
function innerBlocks(value: unknown): WrittenPageNode[] {
  const children = Array.isArray(value)
    ? value.filter(
        (child) =>
          child &&
          typeof child === "object" &&
          INNER_BLOCK_TYPES.has((child as { type?: unknown }).type as string)
      )
    : []
  return cleanWrittenPageBody({ type: "doc", content: children }).content ?? []
}

function cleanCourseBlock(raw: {
  type: CourseBlockType
  attrs?: Record<string, unknown>
  content?: unknown
}): ChapterBlock | null {
  const attrs = raw.attrs ?? {}

  switch (raw.type) {
    case "image": {
      const src = mediaUrl(attrs.src)
      return src ? { type: "image", attrs: { src, alt: line(attrs.alt, 300) } } : null
    }

    case "video": {
      if (attrs.source === "youtube") {
        return typeof attrs.src === "string" && YOUTUBE_ID.test(attrs.src)
          ? { type: "video", attrs: { source: "youtube", src: attrs.src } }
          : null
      }
      const src = mediaUrl(attrs.src)
      return src ? { type: "video", attrs: { source: "file", src } } : null
    }

    case "callout": {
      const content = innerBlocks(raw.content)
      if (content.length === 0) return null
      return {
        type: "callout",
        attrs: { tone: attrs.tone === "warning" ? "warning" : "tip" },
        content,
      }
    }

    case "codeBlock": {
      const text = (Array.isArray(raw.content) ? raw.content : [])
        .map((child) =>
          child && typeof child === "object" && typeof child.text === "string"
            ? child.text
            : ""
        )
        .join("")
        .slice(0, MAX_TEXT)
      // An empty box is kept, so a prompt being typed is not thrown away.
      return text
        ? { type: "codeBlock", content: [{ type: "text", text }] }
        : { type: "codeBlock" }
    }

    case "foldout": {
      return {
        type: "foldout",
        attrs: { summary: line(attrs.summary, 200) },
        content: innerBlocks(raw.content),
      }
    }

    case "simpleTable": {
      const rows = (Array.isArray(attrs.rows) ? attrs.rows : [])
        .slice(0, MAX_TABLE_ROWS)
        .map((row) =>
          (Array.isArray(row) ? row : [])
            .slice(0, MAX_TABLE_COLUMNS)
            .map((cell) => line(cell))
        )
        .filter((row) => row.length > 0)
      if (rows.length === 0) return null
      // Every row as wide as the widest, so the grid never has a ragged edge.
      const width = Math.max(...rows.map((row) => row.length))
      return {
        type: "simpleTable",
        attrs: {
          header: attrs.header !== false,
          rows: rows.map((row) => [
            ...row,
            ...Array.from({ length: width - row.length }, () => ""),
          ]),
        },
      }
    }

    case "checklist": {
      const seen = new Set<string>()
      const items = (Array.isArray(attrs.items) ? attrs.items : [])
        .slice(0, MAX_CHECKLIST_ITEMS)
        .flatMap((item: { id?: unknown; text?: unknown }) => {
          const id = itemId(item?.id)
          if (!id || seen.has(id)) return []
          seen.add(id)
          return [{ id, text: line(item.text) }]
        })
      return items.length ? { type: "checklist", attrs: { items } } : null
    }

    case "quiz": {
      const seen = new Set<string>()
      const questions = (Array.isArray(attrs.questions) ? attrs.questions : [])
        .slice(0, MAX_QUIZ_QUESTIONS)
        .flatMap(
          (question: {
            id?: unknown
            prompt?: unknown
            choices?: unknown
            answerId?: unknown
          }) => {
            const id = itemId(question?.id)
            if (!id || seen.has(id)) return []
            seen.add(id)
            const choiceIds = new Set<string>()
            const choices = (
              Array.isArray(question.choices) ? question.choices : []
            )
              .slice(0, MAX_QUIZ_CHOICES)
              .flatMap((choice: { id?: unknown; text?: unknown }) => {
                const choiceId = itemId(choice?.id)
                if (!choiceId || choiceIds.has(choiceId)) return []
                choiceIds.add(choiceId)
                return [{ id: choiceId, text: line(choice.text) }]
              })
            const answerId =
              typeof question.answerId === "string" &&
              choiceIds.has(question.answerId)
                ? question.answerId
                : (choices[0]?.id ?? "")
            return [{ id, prompt: line(question.prompt), choices, answerId }]
          }
        )
      return questions.length ? { type: "quiz", attrs: { questions } } : null
    }
  }
}

/** Takes whatever arrived and returns only the shapes a chapter allows. */
export function cleanChapterBody(value: unknown): ChapterBody {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return emptyChapterBody()
  }
  const raw = value as { type?: unknown; content?: unknown }
  if (raw.type !== "doc") return emptyChapterBody()

  const content: ChapterBlock[] = []
  let courseBlocks = 0
  for (const child of Array.isArray(raw.content) ? raw.content.slice(0, MAX_BLOCKS) : []) {
    if (!child || typeof child !== "object") continue
    const type = (child as { type?: unknown }).type
    if (isCourseBlockType(type)) {
      if (courseBlocks >= MAX_COURSE_BLOCKS) continue
      const block = cleanCourseBlock(child as Parameters<typeof cleanCourseBlock>[0])
      if (!block) continue
      courseBlocks += 1
      content.push(block)
      continue
    }
    const [block] =
      cleanWrittenPageBody({ type: "doc", content: [child] }).content ?? []
    if (block) content.push(block)
  }
  return { type: "doc", content }
}

/**
 * The chapter as a reader receives it: every quiz loses its right answers,
 * which the server checks instead, so reading the page's source does not
 * give the quiz away.
 */
export function publicChapterBody(body: ChapterBody): ChapterBody {
  return {
    type: "doc",
    content: (body.content ?? []).map((block) =>
      block.type === "quiz"
        ? {
            type: "quiz",
            attrs: {
              questions: (block as QuizNode).attrs.questions.map(
                (question) => ({ ...question, answerId: "" })
              ),
            },
          }
        : block
    ),
  }
}

export function isQuiz(block: ChapterBlock): block is QuizNode {
  return block.type === "quiz"
}

export function isChecklist(block: ChapterBlock): block is ChecklistNode {
  return block.type === "checklist"
}

/** Every quiz question in the chapter, by its id. */
export function chapterQuizQuestions(body: ChapterBody): Map<string, QuizQuestion> {
  const questions = new Map<string, QuizQuestion>()
  for (const block of body.content ?? []) {
    if (!isQuiz(block)) continue
    for (const question of block.attrs.questions) questions.set(question.id, question)
  }
  return questions
}

/** Every checklist item id in the chapter. */
export function chapterChecklistItemIds(body: ChapterBody): Set<string> {
  const ids = new Set<string>()
  for (const block of body.content ?? []) {
    if (!isChecklist(block)) continue
    for (const item of block.attrs.items) ids.add(item.id)
  }
  return ids
}

function blockText(block: ChapterBlock): string {
  switch (block.type) {
    case "image":
    case "video":
      return ""
    case "callout":
      return (block as CalloutNode).content.map(writtenPageText).join(" ")
    case "codeBlock":
      return (block as PromptNode).content?.[0]?.text ?? ""
    case "foldout": {
      const foldout = block as FoldoutNode
      return [foldout.attrs.summary, ...foldout.content.map(writtenPageText)].join(
        " "
      )
    }
    case "simpleTable":
      return (block as TableNode).attrs.rows.map((row) => row.join(" ")).join(" ")
    case "checklist":
      return (block as ChecklistNode).attrs.items.map((item) => item.text).join(" ")
    case "quiz":
      return (block as QuizNode).attrs.questions
        .map((question) =>
          [question.prompt, ...question.choices.map((choice) => choice.text)].join(" ")
        )
        .join(" ")
    default:
      return writtenPageText(block as WrittenPageNode)
  }
}

/** The chapter's words as plain text, for read time and for reading aloud. */
export function chapterBodyText(body: ChapterBody): string {
  return (body.content ?? []).map(blockText).join(" ")
}

/** 200 words a minute, rounded, never under one: the same rule CMS posts use. */
const WORDS_A_MINUTE = 200

export function chapterReadMinutes(body: ChapterBody): number {
  const words = chapterBodyText(body).split(/\s+/).filter(Boolean).length
  return Math.max(1, Math.round(words / WORDS_A_MINUTE))
}

export type ChapterHeading = { id: string; text: string; index: number }

function slugify(text: string): string {
  const slug = text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return slug || "section"
}

/**
 * The chapter's top-level headings, for the "On this page" list, with the
 * anchor id each one is drawn with. Both sides read this, so the link and the
 * heading can never disagree. The id comes from the heading's words, so a
 * copied address still lands after a paragraph is added above it.
 */
export function chapterHeadings(body: ChapterBody): ChapterHeading[] {
  const used = new Set<string>()
  const headings: ChapterHeading[] = []
  for (const [index, block] of (body.content ?? []).entries()) {
    if (block.type !== "heading") continue
    const node = block as WrittenPageNode
    const level = node.attrs?.level === 4 ? 4 : node.attrs?.level === 3 ? 3 : 2
    if (level !== 2) continue
    const text = writtenPageText(node).replace(/\s+/g, " ").trim()
    if (!text) continue
    const base = slugify(text)
    let id = base
    let next = 2
    while (used.has(id)) {
      id = `${base}-${next}`
      next += 1
    }
    used.add(id)
    headings.push({ id, text, index })
  }
  return headings
}

/**
 * The YouTube id in a link somebody pasted, or null when it is not one.
 * Takes the watch page, the short youtu.be link, an embed link and a Shorts
 * link, and a bare id.
 */
export function youtubeIdFrom(input: string): string | null {
  const text = input.trim()
  if (YOUTUBE_ID.test(text)) return text
  let url: URL
  try {
    url = new URL(text)
  } catch {
    return null
  }
  const host = url.hostname.replace(/^www\.|^m\./, "")
  let id: string | null = null
  if (host === "youtu.be") id = url.pathname.slice(1)
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    id =
      url.searchParams.get("v") ??
      url.pathname.match(/^\/(?:embed|shorts|live)\/([^/?#]+)/)?.[1] ??
      null
  }
  return id && YOUTUBE_ID.test(id) ? id : null
}
