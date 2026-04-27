export interface TableOfContentsItem {
  id: string
  text: string
}

interface PostBlockLike {
  id: string
  type: string
  content: Record<string, any>
}

const headingRegex = /<h2([^>]*)>([\s\S]*?)<\/h2>/gi

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

function getHeadingText(value: string): string {
  return decodeHtmlEntities(value.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim()
}

function getIdAttribute(attributes: string): string | null {
  const match = attributes.match(/\sid=(["'])(.*?)\1/i)
  return match?.[2] || null
}

function slugifyHeading(text: string): string {
  const slug = text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")

  return slug || "section"
}

function uniqueHeadingId(text: string, usedIds: Set<string>): string {
  const baseId = slugifyHeading(text)
  let id = baseId
  let index = 2

  while (usedIds.has(id)) {
    id = `${baseId}-${index}`
    index += 1
  }

  usedIds.add(id)
  return id
}

function annotateHeadingHtml(html: string, usedIds: Set<string>) {
  const items: TableOfContentsItem[] = []

  const annotatedHtml = html.replace(headingRegex, (match, attributes = "", innerHtml = "") => {
    const text = getHeadingText(innerHtml)
    if (!text) return match

    const existingId = getIdAttribute(attributes)
    const id = existingId || uniqueHeadingId(text, usedIds)

    if (existingId) {
      usedIds.add(existingId)
      items.push({ id, text })
      return match
    }

    items.push({ id, text })
    return `<h2${attributes} id="${id}">${innerHtml}</h2>`
  })

  return { annotatedHtml, items }
}

export function preparePostTableOfContents(blocks: PostBlockLike[]) {
  const usedIds = new Set<string>()
  const items: TableOfContentsItem[] = []
  const bodyHtmlByBlockId: Record<string, string> = {}

  for (const block of blocks) {
    if (block.type !== "core" || typeof block.content.body !== "string") continue

    const result = annotateHeadingHtml(block.content.body, usedIds)
    bodyHtmlByBlockId[block.id] = result.annotatedHtml
    items.push(...result.items)
  }

  return { items, bodyHtmlByBlockId }
}
