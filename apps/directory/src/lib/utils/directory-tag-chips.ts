/**
 * Tag chips for a listing's rich-text body.
 *
 * A listing's tags are not structured data — they are written into the body as
 * plain paragraphs under a "Tags" heading, e.g.
 * `<p><strong>Popular For:</strong> Dessert, Solo dining</p>`. This turns each
 * comma-separated value in that section into a chip while leaving the bold label
 * inline, and leaves every other part of the body untouched.
 */

/** The shared chip look, so the rich-text chips match the custom-block chips. */
export const TAG_CHIP_CLASS =
  "inline-flex items-center rounded-full border bg-muted/50 font-medium text-foreground"

/** Size/spacing for a standalone (not-small) chip. */
export const TAG_CHIP_SIZE_CLASS = "gap-1.5 px-3 py-1 text-sm"

const CHIP_ROW_CLASS = "inline-flex flex-wrap items-center gap-2 align-middle"

const HEADING_PATTERN = /<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]\s*>/gi
// The paragraph's and label's own opening tags are captured whole and re-emitted
// unchanged, so a class or id the sanitizer allowed through survives the rewrite.
// Only the value list is replaced, and it must be plain text (no < or >).
const TAG_PARAGRAPH_PATTERN =
  /(<p\b[^>]*>)\s*(<strong\b[^>]*>[^<>]*?<\/strong\s*>)([^<>]*?)<\/p\s*>/gi

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
 * Rewrite the tag paragraphs of a sanitized rich-text body so each value renders
 * as a chip. Input must already be sanitized: paragraphs whose value list holds
 * any markup are left exactly as they were, so nothing new can be injected here.
 */
export function renderTagChips(html: string): string {
  const section = findTagsSection(html)
  if (!section) return html

  const body = html.slice(section.start, section.end)
  TAG_PARAGRAPH_PATTERN.lastIndex = 0

  const rewritten = body.replace(
    TAG_PARAGRAPH_PATTERN,
    (paragraph, paragraphTag: string, label: string, values: string) => {
      const tags = values
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean)

      if (tags.length === 0) return paragraph

      const chips = tags
        .map((tag) => `<span class="${TAG_CHIP_CLASS} ${TAG_CHIP_SIZE_CLASS}">${tag}</span>`)
        .join("")

      return `${paragraphTag}${label} <span class="${CHIP_ROW_CLASS}">${chips}</span></p>`
    }
  )

  return html.slice(0, section.start) + rewritten + html.slice(section.end)
}
