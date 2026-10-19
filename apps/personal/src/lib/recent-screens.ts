import { z } from "zod"

import { parseAppUrl } from "@/lib/menu"

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
