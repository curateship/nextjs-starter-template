import type { ShellSection } from "@/lib/custom-shell"

/**
 * Viral's one entry in the left menu: the Viral dashboard (task features/03;
 * Tyler, 19 Nov 2026: "one entry but dont need forward any links"). It is
 * named "Viral" rather than "Dashboard", because the shell's own Dashboard
 * link sits in the same menu. The members' and admins' menus get it from a
 * background job (`src/server/viral/navigation.ts`), once per menu.
 */

export const VIRAL_NAV_SECTION_ID = "section-viral"
export const VIRAL_DASHBOARD_ITEM_ID = "item-viral-dashboard"

/** The four links the dashboard took the place of, taken out of every menu once. */
export const VIRAL_OLD_ITEM_IDS = ["item-viral-today", "item-viral-projects", "item-viral-vault", "item-viral-library"] as const

/** The Viral dashboard, Viral's home page. */
export const VIRAL_DASHBOARD_PATH = "/admin/viral"
/** Where the home page was before the dashboard, so the job moves it from there only. */
export const VIRAL_OLD_HOME_PATH = "/admin/today"

export function viralDashboardItem(): ShellSection["entries"][number] {
  return { type: "item", id: VIRAL_DASHBOARD_ITEM_ID, label: "Viral", href: VIRAL_DASHBOARD_PATH, icon: "flame", visible: true }
}

export function viralNavSection(): ShellSection {
  return { id: VIRAL_NAV_SECTION_ID, title: "Viral", entries: [viralDashboardItem()] }
}
