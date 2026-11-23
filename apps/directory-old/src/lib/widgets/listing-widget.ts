// Mirrors DIRECTORY_CORE_BLOCK_TYPE in directory-core.ts, which can't be imported
// here without dragging UI dependencies into this test-runnable module
const DIRECTORY_CORE_BLOCK_TYPE = "directory-core"

export type ListingWidgetVariant = "badge" | "card"
export type ListingWidgetTheme = "light" | "dark"

export interface ListingWidgetData {
  title: string
  slug: string
  rating: number | null
}

const WIDGET_REF_QUERY_PARAM = "ref"
const WIDGET_REF_QUERY_VALUE = "widget"
export const WIDGET_REFERRER_LABEL = "Widget"

const MAX_REF_PATH_LENGTH = 2048

export const LISTING_WIDGET_SIZES: Record<ListingWidgetVariant, { width: number; height: number }> = {
  badge: { width: 260, height: 64 },
  card: { width: 320, height: 160 },
}

const WIDGET_THEMES: Record<ListingWidgetTheme, { background: string; foreground: string; muted: string; border: string; star: string }> = {
  light: { background: "#ffffff", foreground: "#111827", muted: "#6b7280", border: "#e5e7eb", star: "#f59e0b" },
  dark: { background: "#111827", foreground: "#f9fafb", muted: "#9ca3af", border: "#374151", star: "#fbbf24" },
}

export function parseWidgetVariant(value: string | null | undefined): ListingWidgetVariant {
  return value === "card" ? "card" : "badge"
}

export function parseWidgetTheme(value: string | null | undefined): ListingWidgetTheme {
  return value === "dark" ? "dark" : "light"
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

// Rating lives inside the merged directory-core block content, not on the directory row
export function getListingRatingFromContentBlocks(contentBlocks: Record<string, unknown> | null | undefined): number | null {
  if (!contentBlocks || typeof contentBlocks !== "object") return null

  for (const block of Object.values(contentBlocks)) {
    if (!block || typeof block !== "object") continue
    const candidate = block as { type?: unknown; content?: Record<string, unknown> }
    if (candidate.type !== DIRECTORY_CORE_BLOCK_TYPE) continue

    const raw = candidate.content?.rating
    const rating = typeof raw === "number"
      ? raw
      : typeof raw === "string" && raw.trim() !== "" ? Number(raw) : NaN
    return Number.isFinite(rating) && rating > 0 ? Math.min(5, rating) : null
  }

  return null
}

export function pagePathHasWidgetReferral(pagePath: string | undefined): boolean {
  if (typeof pagePath !== "string" || pagePath.length > MAX_REF_PATH_LENGTH) return false

  try {
    return new URL(pagePath, "http://localhost").searchParams.get(WIDGET_REF_QUERY_PARAM) === WIDGET_REF_QUERY_VALUE
  } catch {
    return false
  }
}

export function buildListingWidgetEmbedPath(directoryId: string, variant: ListingWidgetVariant, theme: ListingWidgetTheme) {
  return `/embed/listing/${encodeURIComponent(directoryId)}?variant=${variant}&theme=${theme}`
}

export function buildListingWidgetSnippet(options: {
  origin: string
  directoryId: string
  listingTitle: string
  variant: ListingWidgetVariant
  theme: ListingWidgetTheme
}) {
  const { width, height } = LISTING_WIDGET_SIZES[options.variant]
  const src = `${options.origin}${buildListingWidgetEmbedPath(options.directoryId, options.variant, options.theme)}`
  const title = escapeHtml(`${options.listingTitle} listing widget`)

  return `<iframe src="${escapeHtml(src)}" width="${width}" height="${height}" style="border:0;overflow:hidden" loading="lazy" title="${title}"></iframe>`
}

export function renderListingWidgetHtml(options: {
  siteName: string
  listing: ListingWidgetData | null
  variant: ListingWidgetVariant
  theme: ListingWidgetTheme
}): string {
  const { siteName, listing, variant, theme } = options
  const palette = WIDGET_THEMES[theme]
  const safeSiteName = escapeHtml(siteName)
  const href = listing
    ? `/directory/${encodeURIComponent(listing.slug)}?${WIDGET_REF_QUERY_PARAM}=${WIDGET_REF_QUERY_VALUE}`
    : `/?${WIDGET_REF_QUERY_PARAM}=${WIDGET_REF_QUERY_VALUE}`
  const documentTitle = escapeHtml(listing ? `${listing.title} on ${siteName}` : `Find businesses on ${siteName}`)

  const ratingHtml = listing?.rating
    ? `<span class="rating"><span class="star">&#9733;</span> ${listing.rating.toFixed(1)}</span>`
    : ""

  const body = variant === "card"
    ? `<a class="widget card" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">
        <span class="title">${listing ? escapeHtml(listing.title) : "Find local businesses"}</span>
        ${ratingHtml}
        <span class="cta">View on ${safeSiteName} &rarr;</span>
      </a>`
    : `<a class="widget badge" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">
        <span class="star">&#9733;</span>
        <span class="text"><span class="muted">${listing ? "Find us on" : "Discover businesses on"}</span><br><strong>${safeSiteName}</strong></span>
      </a>`

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${documentTitle}</title>
<style>
html,body{margin:0;padding:0;height:100%;background:transparent}
*{box-sizing:border-box}
.widget{display:flex;width:100%;height:100%;padding:10px 14px;font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;text-decoration:none;border:1px solid ${palette.border};border-radius:10px;background:${palette.background};color:${palette.foreground}}
.widget:hover{border-color:${palette.muted}}
.badge{align-items:center;gap:10px}
.badge .text{font-size:13px;line-height:1.3;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.badge .star{font-size:20px;color:${palette.star}}
.card{flex-direction:column;justify-content:center;gap:4px}
.card .title{font-size:15px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.card .cta{font-size:12px;color:${palette.muted}}
.rating{font-size:13px}
.star{color:${palette.star}}
.muted{color:${palette.muted}}
</style>
</head>
<body>${body}</body>
</html>
`
}
