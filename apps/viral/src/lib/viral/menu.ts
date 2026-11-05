import type { ShellSection } from "@/lib/custom-shell"

/**
 * Viral's screens in the left menu: Projects and Vault. The members' and
 * admins' menus get the section from a background job
 * (`src/server/viral/navigation.ts`), once per menu.
 */

export const VIRAL_NAV_SECTION_ID = "section-viral"
export const VIRAL_PROJECTS_ITEM_ID = "item-viral-projects"
export const VIRAL_VAULT_ITEM_ID = "item-viral-vault"

export const VIRAL_PROJECTS_PATH = "/admin/projects"
export const VIRAL_VAULT_PATH = "/admin/vault"

export function viralNavSection(): ShellSection {
  return {
    id: VIRAL_NAV_SECTION_ID,
    title: "Viral",
    entries: [
      { type: "item", id: VIRAL_PROJECTS_ITEM_ID, label: "Projects", href: VIRAL_PROJECTS_PATH, icon: "flame", visible: true },
      { type: "item", id: VIRAL_VAULT_ITEM_ID, label: "Vault", href: VIRAL_VAULT_PATH, icon: "vault", visible: true },
    ],
  }
}
