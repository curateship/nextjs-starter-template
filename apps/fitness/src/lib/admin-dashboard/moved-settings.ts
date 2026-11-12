import type { AdminSearch } from "@/lib/admin-dashboard/admin-search"

/**
 * Where a Settings row that moved into the Admin dashboard lives now (Tyler,
 * 9 Nov 2026: "consolidate the pages, navigation and styling into the admin
 * dashboard ... We'll pull the styling from settings here"). Its old address
 * forwards there, so a bookmark or a link in an older doc still lands.
 *
 * Null for a row that is still in Settings. A row an app has claimed with a
 * screen of its own (`REPLACEABLE_SETTINGS_TAB_IDS`) stays in Settings too;
 * the caller checks that, because only the screen knows the app's tabs.
 */
export function movedSettingsTab(tab: string): AdminSearch | null {
  if (tab === "navigation" || tab === "sidebar") return { tab: "navigation" }
  if (tab === "member-navigation") return { tab: "navigation", nav: "members" }
  if (tab === "public-navigation") return { tab: "navigation", nav: "public" }
  if (tab.startsWith("role-navigation-")) {
    return { tab: "navigation", nav: `role-${tab.slice("role-navigation-".length)}` }
  }
  if (tab === "styling") return { tab: "styling" }
  if (tab === "public-styling") return { tab: "styling", side: "public" }
  return null
}

/** The Settings row ids that moved, for the ones an app may still claim. */
export const MOVED_SETTINGS_TAB_IDS = ["navigation", "styling", "member-navigation", "public-navigation", "public-styling"] as const
