import { z } from "zod"

import { activeLinkId, allLinks, parseAppUrl, type Menu, type MenuLink } from "@/lib/menu"

/**
 * The last screens shown in the middle panel, newest first, deep pages
 * included, so one listing can be found again without a menu link for it.
 * Kept by this browser only: Tyler chose that on 17 Oct 2026, so the menu
 * file isn't rewritten on every move.
 */

export const MAX_RECENT_SCREENS = 10
const STORAGE_KEY = "personal-recent-screens"

export type RecentScreen = { url: string; title: string }

const recentSchema = z
  .array(
    z.object({
      url: z.string().refine((value) => parseAppUrl(value) !== null),
      title: z.string().max(120),
    })
  )
  .max(MAX_RECENT_SCREENS)

/** Puts a screen at the front, dropping an older copy of the same address. */
export function addRecentScreen(list: RecentScreen[], screen: RecentScreen) {
  return [screen, ...list.filter((entry) => entry.url !== screen.url)].slice(
    0,
    MAX_RECENT_SCREENS
  )
}

/** What a screen is called in the list: its page name, or its path when it sent none. */
export function recentScreenLabel(screen: RecentScreen) {
  if (screen.title) return screen.title
  const url = parseAppUrl(screen.url)
  return url ? `${url.pathname}${url.search}` : screen.url
}

/** The saved list. Blocked storage or a list this code can't read starts empty. */
export function readRecentScreens(): RecentScreen[] {
  try {
    const parsed = recentSchema.safeParse(
      JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]")
    )
    return parsed.success ? parsed.data : []
  } catch {
    return []
  }
}

export function saveRecentScreens(list: RecentScreen[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
  } catch {
    // Blocked storage: the list lasts until the page reloads.
  }
}

const MAX_RECENT_LINKS = 3

/**
 * The menu links behind the latest screens, newest first, each once, at most
 * three. A screen counts for the link it belongs to, the same one the menu
 * marks; a screen no link holds, or a link since deleted, is skipped.
 */
export function recentMenuLinks(menu: Menu, recent: RecentScreen[]): MenuLink[] {
  const links: MenuLink[] = []
  for (const screen of recent) {
    const id = activeLinkId(menu, screen.url)
    const link = id ? allLinks(menu).find((entry) => entry.id === id) : undefined
    if (link && !links.includes(link)) links.push(link)
    if (links.length === MAX_RECENT_LINKS) break
  }
  return links
}
