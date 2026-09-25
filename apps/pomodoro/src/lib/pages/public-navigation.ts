import {
  normalizePublicDevice,
  showsOnDevice,
  type PublicDevice,
} from "@/lib/pages/public-device"
import { isSafeWrittenPageLink } from "@/lib/pages/written-page-body"

export type PublicNavigationLink = {
  label: string
  href: string
  /**
   * Which screens a header menu item is drawn on. Only the header reads it;
   * footer links never carry it, because the footer is one list at every
   * width.
   */
  device?: PublicDevice
}

export type PublicNavigationSearchItem = {
  type: "search"
  visible: boolean
}

export type PublicNavigationGroup = {
  type: "group"
  label: string
  links: PublicNavigationLink[]
  /** Applies to the whole group; its own links follow it. */
  device?: PublicDevice
}

export type PublicNavigationItem =
  | PublicNavigationLink
  | PublicNavigationSearchItem
  | PublicNavigationGroup

export const MAX_PUBLIC_FOOTER_LINKS = 20
export const MAX_PUBLIC_NAVIGATION_LABEL_LENGTH = 120
export const MAX_PUBLIC_NAVIGATION_HREF_LENGTH = 2_048
export const MAX_PUBLIC_FOOTER_COPYRIGHT_LENGTH = 300

export function createDefaultPublicNavigation(): PublicNavigationItem[] {
  return [{ type: "search", visible: true }]
}

export function isPublicNavigationSearchItem(
  item: PublicNavigationItem
): item is PublicNavigationSearchItem {
  return "type" in item && item.type === "search"
}

export function isPublicNavigationLink(
  item: PublicNavigationItem
): item is PublicNavigationLink {
  return !("type" in item)
}

export function isPublicNavigationGroup(
  item: PublicNavigationItem
): item is PublicNavigationGroup {
  return "type" in item && item.type === "group"
}

/**
 * Keeps only complete, safe public links. This runs on reads as well as writes,
 * so a hand-edited row can never put an executable address into the page.
 */
export function cleanPublicNavigationLinks(
  value: unknown
): PublicNavigationLink[] {
  if (!Array.isArray(value)) return []

  return value
    .slice(0, MAX_PUBLIC_FOOTER_LINKS)
    .flatMap((item) => cleanPublicNavigationLink(item) ?? [])
}

/** Keeps safe links and exactly one draggable search item. */
export function cleanPublicNavigationItems(
  value: unknown
): PublicNavigationItem[] {
  if (!Array.isArray(value)) return createDefaultPublicNavigation()

  let hasSearch = false
  const items: PublicNavigationItem[] = []

  for (const item of value) {
    if (
      item &&
      typeof item === "object" &&
      !Array.isArray(item) &&
      (item as { type?: unknown }).type === "search"
    ) {
      if (!hasSearch) {
        items.push({
          type: "search",
          visible: (item as { visible?: unknown }).visible !== false,
        })
        hasSearch = true
      }
      continue
    }

    if (
      item &&
      typeof item === "object" &&
      !Array.isArray(item) &&
      (item as { type?: unknown }).type === "group"
    ) {
      const group = item as {
        label?: unknown
        links?: unknown
        device?: unknown
      }
      const label = cleanPublicNavigationLabel(group.label)
      const links = Array.isArray(group.links)
        ? group.links.flatMap((link) => cleanPublicNavigationLink(link) ?? [])
        : []
      if (label && links.length) {
        items.push({ type: "group", label, links, ...savedDevice(group.device) })
      }
      continue
    }

    const link = cleanPublicNavigationLink(item)
    if (link) {
      items.push({
        ...link,
        ...savedDevice((item as { device?: unknown }).device),
      })
    }
  }

  if (!hasSearch) items.unshift({ type: "search", visible: true })
  return items
}

/**
 * The menu items to draw in one of the header's two lists.
 *
 * The header already builds its desktop row and its phone panel separately, so
 * the choice is a filter on each list rather than a class on each item. Both
 * lists are still in the page at every width, hidden from the wrong one by the
 * header's own `lg` classes, so this does not keep a menu item's words out of
 * the page source. The Hidden switch on a front page row is the only thing
 * here that does that.
 */
export function publicNavigationForDevice(
  items: PublicNavigationItem[],
  drawing: "desktop" | "phone"
): PublicNavigationItem[] {
  return items.filter(
    (item) =>
      isPublicNavigationSearchItem(item) ||
      showsOnDevice(normalizePublicDevice(item.device), drawing)
  )
}

/** Direct links and each group's links in menu order, with Search left out. */
export function flattenPublicNavigationLinks(
  items: PublicNavigationItem[]
): PublicNavigationLink[] {
  return items.flatMap((item) => {
    if (isPublicNavigationLink(item)) return [item]
    return isPublicNavigationGroup(item) ? item.links : []
  })
}

/**
 * The device choice, or nothing when it is the everyday answer. Writing
 * "everywhere" onto every menu item would grow every saved menu to say what
 * its absence already says, so only a real choice is kept.
 */
function savedDevice(value: unknown): { device?: PublicDevice } {
  const device = normalizePublicDevice(value)
  return device === "all" ? {} : { device }
}

function cleanPublicNavigationLink(
  value: unknown
): PublicNavigationLink | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null

  const { label, href } = value as { label?: unknown; href?: unknown }
  const cleanLabel = cleanPublicNavigationLabel(label)
  if (typeof href !== "string") return null

  const cleanHref = href.trim().slice(0, MAX_PUBLIC_NAVIGATION_HREF_LENGTH)
  if (!cleanLabel || !cleanHref || !isSafeWrittenPageLink(cleanHref)) {
    return null
  }

  return { label: cleanLabel, href: cleanHref }
}

function cleanPublicNavigationLabel(value: unknown) {
  return typeof value === "string"
    ? value.trim().slice(0, MAX_PUBLIC_NAVIGATION_LABEL_LENGTH)
    : ""
}

export function cleanPublicFooterCopyright(value: unknown) {
  return typeof value === "string"
    ? value.trim().slice(0, MAX_PUBLIC_FOOTER_COPYRIGHT_LENGTH)
    : ""
}
