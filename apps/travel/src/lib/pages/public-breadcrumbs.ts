import type { PageDescriptor } from "./page-descriptor"

/**
 * The small trail under the public header: "Home / Pricing".
 *
 * It is switched on per kind of page rather than per page. The shell's public
 * pages are flat — one level under the front page — so a per-page switch would
 * be dozens of rows all saying the same thing, and a deeper trail would be
 * invented rather than real.
 *
 * Everything here is off until an admin turns it on, so an app that never
 * opens this card looks exactly as it did before the trail existed.
 */

/**
 * The three kinds of page a trail can appear on.
 *
 * The front page is not one of them: a trail there would read "Home" and point
 * at the page the visitor is already on. Sign-in, password and email pages are
 * not either — they are steps in a job, not places in a site, and their
 * card-shaped frame has no room for a trail.
 */
export const PUBLIC_BREADCRUMB_KINDS = ["written", "search", "pricing"] as const

export type PublicBreadcrumbKind = (typeof PUBLIC_BREADCRUMB_KINDS)[number]

/** Which kinds of page show the trail. */
export type PublicBreadcrumbs = Record<PublicBreadcrumbKind, boolean>

export const PUBLIC_BREADCRUMB_LABELS: Record<PublicBreadcrumbKind, string> = {
  written: "Written pages",
  search: "Search",
  pricing: "Pricing",
}

export const PUBLIC_BREADCRUMB_HINTS: Record<PublicBreadcrumbKind, string> = {
  written: "Every page an admin wrote in the Pages dashboard.",
  search: "The site search page and its results.",
  pricing: "The public plans page.",
}

/** One step in the trail. The last step is the page itself and has no address. */
export type PublicBreadcrumbItem = {
  label: string
  /** Where the step goes, or undefined for the page the visitor is on. */
  href?: string
}

export function createDefaultPublicBreadcrumbs(): PublicBreadcrumbs {
  return { written: false, search: false, pricing: false }
}

export function normalizePublicBreadcrumbs(value: unknown): PublicBreadcrumbs {
  const fallback = createDefaultPublicBreadcrumbs()
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return fallback
  }

  const saved = value as Partial<Record<PublicBreadcrumbKind, unknown>>
  for (const kind of PUBLIC_BREADCRUMB_KINDS) {
    if (typeof saved[kind] === "boolean") fallback[kind] = saved[kind]
  }
  return fallback
}

/**
 * Which kind of page an address is, or null when no trail belongs there.
 *
 * A written page is recognised by having no coded declaration: the addresses
 * live in a table an admin edits, so the registry cannot know them. That also
 * covers a dead link, which reaches the not-found page with no title — and a
 * trail with nothing to name is no trail, which `publicBreadcrumbTrail` below
 * settles by refusing to build one.
 */
export function publicBreadcrumbKind(
  path: string,
  page: PageDescriptor | null
): PublicBreadcrumbKind | null {
  if (page) {
    if (page.path === "/search") return "search"
    if (page.path === "/pricing") return "pricing"
    return null
  }
  return path === "/" ? null : "written"
}

/**
 * The finished trail, or an empty list when this page shows none.
 *
 * Two levels, always: the front page and the page the visitor is on. The
 * shell's public pages have no hierarchy above them, so anything deeper would
 * be made up.
 */
export function publicBreadcrumbTrail({
  path,
  page,
  writtenPageTitle,
  homeLabel,
  breadcrumbs,
}: {
  path: string
  page: PageDescriptor | null
  /** The title of the page an admin wrote, when this address is one. */
  writtenPageTitle?: string | null
  /** What the front page is called, so a renamed front page reads correctly. */
  homeLabel?: string | null
  breadcrumbs: PublicBreadcrumbs
}): PublicBreadcrumbItem[] {
  const kind = publicBreadcrumbKind(path, page)
  if (!kind || !breadcrumbs[kind]) return []

  const label = (kind === "written" ? writtenPageTitle : page?.name)
    ?.replace(/\s+/g, " ")
    .trim()
  if (!label) return []

  const home = homeLabel?.trim() || "Home"
  return [{ label: home, href: "/" }, { label }]
}
