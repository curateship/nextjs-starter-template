import type { ShellSection } from "@/lib/custom-shell"

/**
 * Content's one section in the left menu (`workspace/docs/content-app.md`,
 * "One left menu"; Tyler, 26 Nov 2026, task Part 10): every screen of Video,
 * Promo and Viral that is not folded into a project or the Projects
 * dashboard. Projects comes first.
 * Networks, commenting and a project's research and videos have no entry:
 * they live inside a project, as in Promo. Nothing in it sets up a link
 * between the three, since inside one app there is nothing to connect.
 */

export const CONTENT_NAV_SECTION_ID = "section-content"

/** Where an admin lands: the Projects dashboard. */
export const CONTENT_HOME_PATH = "/admin/projects"

const ITEMS = [
  // Promo's Projects dashboard: Overview, Projects, Voices, Accounts, Archive and Messages.
  { id: "item-content-projects", label: "Projects", href: "/admin/projects", icon: "folderOpen" },
  // Promo's Anti Detect dashboard: browser profiles, proxies, phones and bans.
  { id: "item-content-anti-detect", label: "Anti Detect", href: "/admin/anti-detect", icon: "shieldCheck" },
  // Video's own dashboards, which are not a project's.
  { id: "item-content-carousels", label: "Carousels", href: "/admin/video-carousels", icon: "image" },
  { id: "item-content-actors", label: "Actors", href: "/admin/video-editor/actors", icon: "users" },
  { id: "item-content-flow", label: "Flow", href: "/admin/video-flow", icon: "workflow" },
] as const

/**
 * Links an earlier Content menu had and took away, each taken out of every
 * menu once (`navigation.ts`). Research's own dashboard went on 27 Nov 2026:
 * a project's research is on its page, and Research's Vault, Hooks and
 * Formats are sections of the Projects dashboard (Tyler: "I thought we merge
 * that into the project itself").
 */
export const CONTENT_OLD_ITEM_IDS = ["item-content-research"] as const

export function contentNavSection(): ShellSection {
  return {
    id: CONTENT_NAV_SECTION_ID,
    title: "Content",
    entries: ITEMS.map((item) => ({ type: "item" as const, ...item, visible: true })),
  }
}
