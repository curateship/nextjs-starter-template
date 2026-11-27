import { matchesFindSearch } from "@/lib/social/find-search"
import type { FindsTab } from "@/lib/social/reddit/options"
import type { FindRow } from "@/server/social/keywords"
import { FIT_BANDS } from "@/server/social/reddit/rank"

/**
 * The post at the top of a tab as the list draws it in its best-fit order,
 * or null when the tab is empty. The Commenting opens it when no
 * post is picked, so the right column is never empty (part 14 of
 * `workspace/tasks/Projects/commenting-dashboard.md`).
 */
export function firstFindInTab(finds: FindRow[], tab: FindsTab, searchText: string): string | null {
  const shown = finds.filter(
    (find) =>
      (tab === "commented"
        ? find.status === "commented"
        : tab === "skipped"
          ? find.status === "skipped"
          : find.status !== "commented" && find.status !== "skipped") && matchesFindSearch(find, searchText)
  )
  for (const band of FIT_BANDS) {
    const first = shown.find((find) => find.fit === band)
    if (first) return first.id
  }
  return null
}
