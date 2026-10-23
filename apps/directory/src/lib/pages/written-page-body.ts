/**
 * What an admin-written page's body is, and the only shapes it may hold.
 *
 * **This is the app's main injection surface and the reason the body is not
 * HTML.** The editor can hand back either a string of markup or its own
 * document. Markup would mean storing a string that ends up inside
 * `dangerouslySetInnerHTML` on a page open to the whole internet, guarded only
 * by a sanitiser that has to be right every time. The document is a tree of
 * named nodes, so the page is drawn by turning nodes into React elements and
 * there is never a string of markup in the path at all. Nothing to escape,
 * nothing to sanitise, and a `<script>` an admin pastes in is text in a
 * paragraph because text is the only thing a text node can be.
 *
 * The rule that keeps it that way: **this file names every node and mark that
 * is allowed, and anything else is dropped.** Adding to these lists is the
 * only way to widen what a written page can contain, which is exactly the
 * "no page builder" boundary this feature is not allowed to cross.
 */

/** Block-level nodes an admin may produce. Nothing here can carry markup. */
export const WRITTEN_PAGE_NODES = [
  "doc",
  "paragraph",
  "heading",
  "bulletList",
  "orderedList",
  "listItem",
  "blockquote",
  "hardBreak",
  "text",
] as const

export type WrittenPageNodeType = (typeof WRITTEN_PAGE_NODES)[number]

/** Inline formatting a piece of text may carry. */
export const WRITTEN_PAGE_MARKS = ["bold", "italic", "strike", "link"] as const

export type WrittenPageMarkType = (typeof WRITTEN_PAGE_MARKS)[number]

export type WrittenPageMark = {
  type: WrittenPageMarkType
  /** Only a link has one, and only its address. */
  attrs?: { href: string }
}

export type WrittenPageNode = {
  type: WrittenPageNodeType
  /** Only a heading has one, and only its level. */
  attrs?: { level: number }
  content?: WrittenPageNode[]
  text?: string
  marks?: WrittenPageMark[]
}

/** The body of a page nobody has written anything into yet. */
export function emptyWrittenPageBody(): WrittenPageNode {
  return { type: "doc", content: [] }
}

/** Headings an admin may use. `h1` is the page's title, so the body starts at 2. */
const HEADING_LEVELS = [2, 3, 4] as const

/**
 * The link schemes a written page may point at.
 *
 * `javascript:` is the whole reason this list exists — a link is the one place
 * in a document tree where an admin still gets to hand the browser something
 * it will execute, so the address is checked rather than trusted.
 */
const SAFE_LINK_PATTERN = /^(https?:\/\/|mailto:|tel:|\/)/i

export function isSafeWrittenPageLink(href: string) {
  return SAFE_LINK_PATTERN.test(href.trim())
}

/** Longest a single run of text may be, so one paste cannot fill the database. */
const MAX_TEXT_LENGTH = 20_000

/** Deepest the tree may nest, so a hand-made document cannot exhaust the stack. */
const MAX_DEPTH = 12

function cleanMarks(value: unknown): WrittenPageMark[] | undefined {
  if (!Array.isArray(value)) return undefined

  const marks: WrittenPageMark[] = []
  for (const mark of value) {
    if (!mark || typeof mark !== "object") continue
    const type = (mark as { type?: unknown }).type
    if (!WRITTEN_PAGE_MARKS.includes(type as WrittenPageMarkType)) continue

    if (type === "link") {
      const href = (mark as { attrs?: { href?: unknown } }).attrs?.href
      // A link whose address is not one we allow loses the link, not the
      // words: the sentence still reads, it simply stops being clickable.
      if (typeof href !== "string" || !isSafeWrittenPageLink(href)) continue
      marks.push({ type: "link", attrs: { href: href.trim() } })
      continue
    }

    marks.push({ type: type as WrittenPageMarkType })
  }

  return marks.length ? marks : undefined
}

/**
 * Takes whatever arrived — from the editor, from an old row, from somebody
 * posting straight at the endpoint — and returns only what this file allows.
 *
 * Dropping rather than rejecting is deliberate. A body that came back slightly
 * different is a paragraph an admin can see is missing and write again; a save
 * refused with "invalid document" tells them nothing they can act on.
 */
export function cleanWrittenPageBody(value: unknown): WrittenPageNode {
  const node = cleanNode(value, 0)
  if (!node || node.type !== "doc") return emptyWrittenPageBody()
  return node
}

function cleanNode(value: unknown, depth: number): WrittenPageNode | null {
  if (depth > MAX_DEPTH) return null
  if (!value || typeof value !== "object" || Array.isArray(value)) return null

  const raw = value as {
    type?: unknown
    attrs?: { level?: unknown }
    content?: unknown
    text?: unknown
    marks?: unknown
  }
  if (!WRITTEN_PAGE_NODES.includes(raw.type as WrittenPageNodeType)) return null
  const type = raw.type as WrittenPageNodeType

  if (type === "text") {
    // A text node with no text is nothing to draw.
    if (typeof raw.text !== "string" || !raw.text) return null
    return {
      type,
      text: raw.text.slice(0, MAX_TEXT_LENGTH),
      marks: cleanMarks(raw.marks),
    }
  }

  const node: WrittenPageNode = { type }

  if (type === "heading") {
    const level = raw.attrs?.level
    node.attrs = {
      level: HEADING_LEVELS.includes(level as (typeof HEADING_LEVELS)[number])
        ? (level as number)
        : 2,
    }
  }

  if (Array.isArray(raw.content)) {
    const content = raw.content
      .map((child) => cleanNode(child, depth + 1))
      .filter((child): child is WrittenPageNode => child !== null)
    if (content.length) node.content = content
  }

  return node
}

/** Whether anything has actually been written, for "this page is empty" checks. */
export function writtenPageBodyIsEmpty(body: WrittenPageNode): boolean {
  return writtenPageText(body).trim().length === 0
}

/**
 * The body as plain words. Used for the search on the dashboard and for the
 * one-line summary a page shows in a list — never for drawing the page.
 */
export function writtenPageText(node: WrittenPageNode): string {
  if (node.type === "text") return node.text ?? ""
  const inner = (node.content ?? []).map(writtenPageText).join(" ")
  return inner
}
