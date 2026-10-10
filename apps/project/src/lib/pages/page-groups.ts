import type { PublicPageRow } from "@/lib/api/content/pages"

/**
 * The two halves of the Pages screen.
 *
 * **`yours`** is every page an admin builds here: one made of blocks, and one
 * they wrote the words of. **`system`** is the rest, which is the shell's own
 * machinery — the sign-in family, the not-found and maintenance pages, and any
 * other page whose markup is written in code. They are two different jobs, and
 * the second one is a list you read rather than a list you work in.
 */
export const PAGE_GROUPS = ["yours", "system"] as const

export type PageGroup = (typeof PAGE_GROUPS)[number]

export const PAGE_GROUP_LABELS: Record<PageGroup, string> = {
  yours: "Pages",
  system: "System pages",
}

/**
 * Which half a page belongs to.
 *
 * Asked of the page itself rather than of a list of addresses, so an app that
 * gives a second page blocks, or an admin who writes one, lands in the right
 * half with nothing here to edit.
 */
export function pageGroup(page: PublicPageRow): PageGroup {
  return page.blocks || page.writtenPageId ? "yours" : "system"
}
