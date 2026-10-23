const SPONSOR_ID_PATTERN = '[0-9a-fA-F-]{36}'

function createSponsorEmbedRegex() {
  return new RegExp(
    `<hub-sponsor\\b[^>]*\\bdata-sponsor-id=(["'])(${SPONSOR_ID_PATTERN})\\1[^>]*>[\\s\\S]*?<\\/hub-sponsor>`,
    'gi'
  )
}

export type SponsorEmbedPart =
  | { type: 'html'; html: string }
  | { type: 'sponsor'; sponsorId: string }

export function extractSponsorIdsFromHtml(html?: string | null) {
  if (!html) return []

  const ids = new Set<string>()
  const regex = createSponsorEmbedRegex()
  let match: RegExpExecArray | null

  while ((match = regex.exec(html)) !== null) {
    if (match[2]) ids.add(match[2])
  }

  return Array.from(ids)
}

export function splitSponsorEmbeds(html?: string | null): SponsorEmbedPart[] {
  if (!html) return []

  const parts: SponsorEmbedPart[] = []
  const regex = createSponsorEmbedRegex()
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(html)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'html', html: html.slice(lastIndex, match.index) })
    }

    if (match[2]) {
      parts.push({ type: 'sponsor', sponsorId: match[2] })
    }

    lastIndex = match.index + match[0].length
  }

  if (lastIndex < html.length) {
    parts.push({ type: 'html', html: html.slice(lastIndex) })
  }

  return parts
}
