export const FAVICON_IMAGE_FIELDS = [
  { key: "icon16", size: 16, rel: "icon" },
  { key: "icon32", size: 32, rel: "icon" },
  { key: "appleTouchIcon", size: 180, rel: "apple-touch-icon" },
  { key: "icon512", size: 512, rel: "icon" },
] as const

const UUID_PATH_SEGMENT =
  "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"
const GENERATED_FAVICON_STORAGE_PATH = new RegExp(
  `^${UUID_PATH_SEGMENT}/favicons/${UUID_PATH_SEGMENT}/(?:` +
    `(?:light|dark)-(?:16|32|180|512)\\.png` +
    // The dark-mode twin of the brand image lives beside the sizes cut from it,
    // so one folder is the whole generated set and one sweep removes it.
    `|dark-source\\.(?:png|svg)` +
    `)$`,
  "i"
)

export type FaviconImageField = (typeof FAVICON_IMAGE_FIELDS)[number]["key"]

/** Which version of the one logo the browser tab shows. */
export const FAVICON_MODES = ["dark", "light"] as const

export type FaviconMode = (typeof FAVICON_MODES)[number]

/**
 * The tab shows the dark-mode mark unless an admin says otherwise, because tab
 * strips are dark or grey far more often than they are white and a logo drawn
 * in near-black disappears on them.
 */
export const DEFAULT_FAVICON_MODE: FaviconMode = "dark"

export function normalizeFaviconMode(value: unknown): FaviconMode {
  return value === "light" ? "light" : DEFAULT_FAVICON_MODE
}

export type PublicFaviconVariant = {
  source: string
} & Record<FaviconImageField, string>

export type PublicFaviconSet = {
  light?: PublicFaviconVariant
  dark?: PublicFaviconVariant
}

export type FaviconLink = {
  rel: "icon" | "apple-touch-icon"
  href: string
  type?: "image/png"
  sizes?: string
}

/** True only for an internal file managed by the favicon save lifecycle. */
export function isGeneratedFaviconStoragePath(storagePath: string) {
  return GENERATED_FAVICON_STORAGE_PATH.test(storagePath)
}

/** Keeps only complete server-generated sets with web-safe addresses. */
export function normalizePublicFaviconSet(
  value: unknown
): PublicFaviconSet | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null

  const saved = value as Record<string, unknown>
  const light = normalizePublicFaviconVariant(saved.light)
  const dark = normalizePublicFaviconVariant(saved.dark)
  return light || dark
    ? { ...(light ? { light } : {}), ...(dark ? { dark } : {}) }
    : null
}

/**
 * The favicon tags for the first page response and for live settings edits.
 *
 * **One version is shown, and the admin picks which.** Both are generated from
 * the one uploaded logo, and `faviconMode` says which one the tab gets.
 *
 * Handing the browser both and letting it choose was tried first and does not
 * work. Marking the everyday mark `(prefers-color-scheme: light)` sounds like
 * "only on a light browser", but that query also matches a browser that states
 * no preference at all, so the everyday mark won for nearly everybody and the
 * tab looked unchanged. Measured in Chrome on 11 Sep 2026. One unconditioned
 * set is the only honest way to say which mark the tab shows.
 *
 * Whichever version is not chosen is still generated and still stored. That is
 * what lets the choice be flipped without redrawing anything, and what lets the
 * replacement sweep delete both when the logo changes.
 */
export function publicFaviconLinks({
  favicon,
  faviconDark,
  faviconSet,
  faviconMode = DEFAULT_FAVICON_MODE,
}: {
  favicon: string
  faviconDark: string
  faviconSet: PublicFaviconSet | null
  faviconMode?: FaviconMode
}): FaviconLink[] {
  const light = linksForVariant(favicon, faviconSet?.light)
  const dark = linksForVariant(faviconDark, faviconSet?.dark)
  const chosen = faviconMode === "light" ? light : dark
  // The other version stands in when the chosen one has nothing behind it, so
  // flipping the choice on an app whose logo predates one of the two still
  // leaves a tab icon rather than none.
  return chosen.length ? chosen : faviconMode === "light" ? dark : light
}

function normalizePublicFaviconVariant(
  value: unknown
): PublicFaviconVariant | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null

  const saved = value as Record<string, unknown>
  const source = normalizeWebImageUrl(saved.source)
  if (!source) return null

  const images = Object.fromEntries(
    FAVICON_IMAGE_FIELDS.map(({ key }) => [
      key,
      normalizeWebImageUrl(saved[key]),
    ])
  ) as Record<FaviconImageField, string>
  if (Object.values(images).some((url) => !url)) return null

  return { source, ...images }
}

function linksForVariant(
  sourceValue: string,
  generated: PublicFaviconVariant | undefined
): FaviconLink[] {
  const source = normalizeWebImageUrl(sourceValue)
  if (!source) return []

  if (generated?.source !== source) {
    return [{ rel: "icon", href: source }]
  }

  return FAVICON_IMAGE_FIELDS.map(({ key, size, rel }) => ({
    rel,
    href: generated[key],
    type: "image/png",
    sizes: `${size}x${size}`,
  }))
}

function normalizeWebImageUrl(value: unknown) {
  if (typeof value !== "string") return ""
  const url = value.trim()
  if (!url) return ""

  try {
    const parsed = new URL(url)
    return parsed.protocol === "http:" || parsed.protocol === "https:"
      ? url
      : ""
  } catch {
    return ""
  }
}
