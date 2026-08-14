export const DIRECTORY_FRONT_PAGE_MODES = ["off", "newest", "featured"] as const

export type DirectoryFrontPageMode = (typeof DIRECTORY_FRONT_PAGE_MODES)[number]

export const DIRECTORY_FRONT_PAGE_MODE_LABELS: Record<
  DirectoryFrontPageMode,
  string
> = {
  off: "Off",
  newest: "Newest listings",
  featured: "Featured listings",
}

export const DIRECTORY_FRONT_PAGE_COUNT_MIN = 1
export const DIRECTORY_FRONT_PAGE_COUNT_MAX = 12
export const DIRECTORY_FRONT_PAGE_COUNT_DEFAULT = 8

/** The complete browser-safe answer for an enabled listings home page. */
export type DirectoryFrontPageData = {
  siteName: string
  heading: string
  intro: string
  listings: Array<{
    id: string
    title: string
    slug: string
    metaDescription: string
    rating: number | null
    featuredImage: string
    category: { name: string; slug: string } | null
    claimed: boolean
    featured: boolean
  }>
}

export function isDirectoryFrontPageMode(
  value: unknown
): value is DirectoryFrontPageMode {
  return (DIRECTORY_FRONT_PAGE_MODES as readonly unknown[]).includes(value)
}
