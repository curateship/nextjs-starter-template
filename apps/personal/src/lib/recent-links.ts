import { z } from "zod"

import type { MenuLink } from "@/lib/menu"

/**
 * "Recent" at the top of the left menu: the last three menu links opened,
 * newest first. A link already in the list keeps its place when it is opened
 * again, so the list only moves when a new link comes in: Tyler, 18 Oct 2026,
 * "dont make it move to the top every time i visit it". Kept by this browser
 * only, like the recent screens.
 */

const MAX_RECENT_LINKS = 3
const STORAGE_KEY = "personal-recent-links"

const idsSchema = z.array(z.string().max(100)).max(MAX_RECENT_LINKS)

/**
 * Adds a link at the front and drops the oldest past three, unless the link is
 * already in the list. Links no longer in the menu drop out first.
 */
export function addRecentLink(ids: string[], id: string, inMenu: Set<string>) {
  const kept = ids.filter((entry) => inMenu.has(entry))
  if (kept.includes(id)) return kept.length === ids.length ? ids : kept
  return [id, ...kept].slice(0, MAX_RECENT_LINKS)
}

/**
 * Takes a link out of Recent. The link stays in the menu, and comes back the
 * next time it is opened after another one.
 */
export function removeRecentLink(ids: string[], id: string) {
  return ids.filter((entry) => entry !== id)
}

/** The links behind the saved ids, in order, skipping any since deleted. */
export function recentLinksIn(links: MenuLink[], ids: string[]) {
  return ids.flatMap((id) => links.find((link) => link.id === id) ?? [])
}

/** The saved list. Blocked storage or a list this code can't read starts empty. */
export function readRecentLinks(): string[] {
  try {
    const parsed = idsSchema.safeParse(
      JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]")
    )
    return parsed.success ? parsed.data : []
  } catch {
    return []
  }
}

export function saveRecentLinks(ids: string[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids))
  } catch {
    // Blocked storage: the list lasts until the page reloads.
  }
}
