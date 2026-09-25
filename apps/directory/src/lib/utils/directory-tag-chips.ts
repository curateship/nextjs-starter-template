/**
 * Tag chips for a listing's rich-text body.
 *
 * A listing's tags can arrive two ways. Imported listings get a proper "Tags"
 * custom block, one field per group, drawn by `DirectoryCustomBlockSection`.
 * Hand-written listings instead have them typed into the body as plain
 * paragraphs under a "Tags" heading, e.g.
 * `<p><strong>Popular For:</strong> Dessert, Solo dining</p>`. This turns that
 * second form into the same thing the first one renders — the group name as a
 * muted uppercase label with the comma-separated values as chips beneath it —
 * so a listing looks the same however its tags were entered. Every other part
 * of the body is left untouched.
 */

import {
  CHIP_CLASS,
  CHIP_GROUP_LABEL_CLASS,
  CHIP_ROW_CLASS,
  CHIP_SIZE_CLASS,
} from "./chip"

/**
 * Lucide's `Check` at `size-3.5`, the same icon `DirectoryCustomBlockSection`
 * renders as a React component. Keep the two in step.
 */
const CHECK_ICON_MARKUP =
  '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none"' +
  ' stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"' +
  ' class="lucide lucide-check size-3.5" aria-hidden="true"><path d="M20 6 9 17l-5-5"></path></svg>'

// A group is built from divs, not paragraphs: `.prose p` adds its own 16px
// bottom margin, which would double up on the gap set here.
const TAG_GROUP_CLASS = "mb-4 space-y-3"

const HEADING_PATTERN = /<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]\s*>/gi
// Only plain text is ever re-emitted: the label and the value list are both
// matched as `[^<>]*?`, so neither can carry markup, and a paragraph that does
// not fit this exact shape is left precisely as it was.
const TAG_PARAGRAPH_PATTERN =
  /<p\b[^>]*>\s*<strong\b[^>]*>([^<>]*?)<\/strong\s*>([^<>]*?)<\/p\s*>/gi

function headingText(heading: string) {
  return heading.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().toLowerCase()
}

/**
 * The character range covered by the first "Tags" heading's section: everything
 * between the end of that heading and the start of the next heading. Returns
 * null when the body has no Tags heading.
 */
function findTagsSection(html: string): { start: number; end: number } | null {
  HEADING_PATTERN.lastIndex = 0
  let start: number | null = null

  for (let match = HEADING_PATTERN.exec(html); match; match = HEADING_PATTERN.exec(html)) {
    if (start !== null) return { start, end: match.index }
    if (headingText(match[1]) === "tags") start = match.index + match[0].length
  }

  return start === null ? null : { start, end: html.length }
}

/**
 * Rewrite the tag paragraphs of a sanitized rich-text body so each group renders
 * as a label plus chips. Input must already be sanitized: paragraphs whose label
 * or value list holds any markup are left exactly as they were, so nothing new
 * can be injected here.
 */
export function renderTagChips(html: string): string {
  const section = findTagsSection(html)
  if (!section) return html

  const body = html.slice(section.start, section.end)
  TAG_PARAGRAPH_PATTERN.lastIndex = 0

  const rewritten = body.replace(
    TAG_PARAGRAPH_PATTERN,
    (paragraph, label: string, values: string) => {
      const tags = values
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean)

      if (tags.length === 0) return paragraph

      // "Popular For:" is written with a colon because it used to read inline.
      const groupLabel = label.trim().replace(/:$/, "").trim()
      const chips = tags
        .map(
          (tag) =>
            `<span class="${CHIP_CLASS} ${CHIP_SIZE_CLASS}">${CHECK_ICON_MARKUP}${tag}</span>`
        )
        .join("")
      const labelMarkup = groupLabel
        ? `<div class="${CHIP_GROUP_LABEL_CLASS}">${groupLabel}</div>`
        : ""

      return `<div class="${TAG_GROUP_CLASS}">${labelMarkup}<div class="${CHIP_ROW_CLASS}">${chips}</div></div>`
    }
  )

  return html.slice(0, section.start) + rewritten + html.slice(section.end)
}
