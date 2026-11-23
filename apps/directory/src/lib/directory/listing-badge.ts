export type ListingBadgeSize = "badge" | "card"
export type ListingBadgeTheme = "light" | "dark"

export type ListingBadgeData = {
  title: string
  slug: string
  featuredImage: string
}

export const LISTING_BADGE_SIZES: Record<
  ListingBadgeSize,
  { width: number; height: number }
> = {
  badge: { width: 260, height: 64 },
  card: { width: 320, height: 160 },
}

const BADGE_THEMES: Record<
  ListingBadgeTheme,
  {
    background: string
    foreground: string
    muted: string
    border: string
    photo: string
  }
> = {
  light: {
    background: "#ffffff",
    foreground: "#18181b",
    muted: "#71717a",
    border: "#e4e4e7",
    photo: "#f4f4f5",
  },
  dark: {
    background: "#18181b",
    foreground: "#fafafa",
    muted: "#a1a1aa",
    border: "#3f3f46",
    photo: "#27272a",
  },
}

export function parseListingBadgeSize(
  value: string | null | undefined
): ListingBadgeSize {
  return value === "card" ? "card" : "badge"
}

export function parseListingBadgeTheme(
  value: string | null | undefined
): ListingBadgeTheme {
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

export function listingBadgePath(
  listingId: string,
  size: ListingBadgeSize,
  theme: ListingBadgeTheme
) {
  return `/embed/listing/${encodeURIComponent(listingId)}?size=${size}&theme=${theme}`
}

export function buildListingBadgeSnippet(input: {
  origin: string
  listingId: string
  listingTitle: string
  siteName: string
  size: ListingBadgeSize
  theme: ListingBadgeTheme
}) {
  const dimensions = LISTING_BADGE_SIZES[input.size]
  const origin = input.origin.replace(/\/$/, "")
  const src = `${origin}${listingBadgePath(input.listingId, input.size, input.theme)}`

  return `<iframe src="${escapeHtml(src)}" width="${dimensions.width}" height="${dimensions.height}" style="border:0;overflow:hidden" loading="lazy" title="${escapeHtml(`${input.listingTitle} on ${input.siteName}`)}"></iframe>`
}

/**
 * A complete document with no script, font, cookie or tracking request.
 *
 * Ratings are deliberately absent: the ratings task has not shipped in this
 * app, so there is no honest value to show yet.
 */
export function renderListingBadgeHtml(input: {
  siteName: string
  listing: ListingBadgeData
  size: ListingBadgeSize
  theme: ListingBadgeTheme
}) {
  const { listing, siteName, size } = input
  const colours = BADGE_THEMES[input.theme]
  const safeTitle = escapeHtml(listing.title)
  const safeSite = escapeHtml(siteName)
  const href = `/directory/${encodeURIComponent(listing.slug)}`
  const photo = listing.featuredImage
    ? `<img class="photo" src="${escapeHtml(listing.featuredImage)}" alt="">`
    : `<span class="photo placeholder" aria-hidden="true">${escapeHtml(listing.title.slice(0, 1).toUpperCase())}</span>`

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>${safeTitle} on ${safeSite}</title>
<style>
html,body{margin:0;width:100%;height:100%;background:transparent}
*{box-sizing:border-box}
.badge{display:flex;width:100%;height:100%;overflow:hidden;border:1px solid ${colours.border};border-radius:10px;background:${colours.background};color:${colours.foreground};font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;text-decoration:none}
.badge:hover{filter:brightness(.97)}
.photo{display:block;flex:none;object-fit:cover;background:${colours.photo};color:${colours.muted};font-weight:700;text-align:center}
.copy{min-width:0;display:flex;flex:1;flex-direction:column;justify-content:center}
.title,.site{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.title{font-weight:650}.site{color:${colours.muted}}
${size === "card" ? ".badge{padding:12px;gap:14px}.photo{width:134px;height:134px;border-radius:7px}.placeholder{font-size:42px;line-height:134px}.title{font-size:17px;line-height:1.3}.site{margin-top:7px;font-size:12px}" : ".badge{padding:6px;gap:9px}.photo{width:50px;height:50px;border-radius:6px}.placeholder{font-size:20px;line-height:50px}.title{font-size:13px;line-height:1.25}.site{margin-top:3px;font-size:11px}"}
</style>
</head>
<body><a class="badge" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${photo}<span class="copy"><span class="title">${safeTitle}</span><span class="site">View on ${safeSite} &rarr;</span></span></a></body>
</html>`
}
