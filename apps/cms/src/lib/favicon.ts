export const FAVICON_IMAGE_FIELDS = [
  { key: "icon16", size: 16, rel: "icon" },
  { key: "icon32", size: 32, rel: "icon" },
  { key: "appleTouchIcon", size: 180, rel: "apple-touch-icon" },
  { key: "icon512", size: 512, rel: "icon" },
] as const

const UUID_PATH_SEGMENT =
  "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"
const GENERATED_FAVICON_STORAGE_PATH = new RegExp(
  `^${UUID_PATH_SEGMENT}/favicons/${UUID_PATH_SEGMENT}/(?:light|dark)-(?:16|32|180|512)\\.png$`,
  "i"
)

export type FaviconImageField = (typeof FAVICON_IMAGE_FIELDS)[number]["key"]

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
  media?: "(prefers-color-scheme: dark)"
}

/** True only for an internal PNG size managed by the favicon save lifecycle. */
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

/** The favicon tags for the first page response and for live settings edits. */
export function publicFaviconLinks({
  favicon,
  faviconDark,
  faviconSet,
}: {
  favicon: string
  faviconDark: string
  faviconSet: PublicFaviconSet | null
}): FaviconLink[] {
  return [
    ...linksForVariant(favicon, faviconSet?.light),
    ...linksForVariant(
      faviconDark,
      faviconSet?.dark,
      "(prefers-color-scheme: dark)"
    ),
  ]
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
  generated: PublicFaviconVariant | undefined,
  media?: FaviconLink["media"]
): FaviconLink[] {
  const source = normalizeWebImageUrl(sourceValue)
  if (!source) return []

  if (generated?.source !== source) {
    return [{ rel: "icon", href: source, ...(media ? { media } : {}) }]
  }

  return FAVICON_IMAGE_FIELDS.map(({ key, size, rel }) => ({
    rel,
    href: generated[key],
    type: "image/png",
    sizes: `${size}x${size}`,
    ...(media ? { media } : {}),
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
