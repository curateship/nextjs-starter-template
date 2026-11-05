import type { ShellSection } from "@/lib/custom-shell"

/**
 * Viral's screens in the left menu: Today, Projects and Vault. The members' and
 * admins' menus get the section from a background job
 * (`src/server/viral/navigation.ts`), once per menu.
 */

export const VIRAL_NAV_SECTION_ID = "section-viral"
export const VIRAL_TODAY_ITEM_ID = "item-viral-today"
export const VIRAL_PROJECTS_ITEM_ID = "item-viral-projects"
export const VIRAL_VAULT_ITEM_ID = "item-viral-vault"
export const VIRAL_LIBRARY_ITEM_ID = "item-viral-library"

/** Today, Viral's home page (`workspace/docs/today-page.md`). */
export const VIRAL_TODAY_PATH = "/admin/today"
export const VIRAL_PROJECTS_PATH = "/admin/projects"
export const VIRAL_VAULT_PATH = "/admin/vault"
/** Hooks and Formats (`workspace/docs/library.md`). */
export const VIRAL_LIBRARY_PATH = "/admin/library"

export function viralNavSection(): ShellSection {
  return {
    id: VIRAL_NAV_SECTION_ID,
    title: "Viral",
    entries: [
      viralTodayItem(),
      { type: "item", id: VIRAL_PROJECTS_ITEM_ID, label: "Projects", href: VIRAL_PROJECTS_PATH, icon: "flame", visible: true },
      { type: "item", id: VIRAL_VAULT_ITEM_ID, label: "Vault", href: VIRAL_VAULT_PATH, icon: "vault", visible: true },
      viralLibraryItem(),
    ],
  }
}

/** Today, first in Viral's section. Added to menus made before it existed by `navigation.ts`. */
export function viralTodayItem(): ShellSection["entries"][number] {
  return { type: "item", id: VIRAL_TODAY_ITEM_ID, label: "Today", href: VIRAL_TODAY_PATH, icon: "sun", visible: true }
}

/** Library, after Vault. Added to menus made before it existed by `navigation.ts`. */
export function viralLibraryItem(): ShellSection["entries"][number] {
  return { type: "item", id: VIRAL_LIBRARY_ITEM_ID, label: "Library", href: VIRAL_LIBRARY_PATH, icon: "library-big", visible: true }
}
