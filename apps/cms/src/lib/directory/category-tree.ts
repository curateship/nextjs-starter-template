import type { Category } from "@/lib/api/directory/categories"

/**
 * The category tree flattened parent-first, with how deep each row sits. The
 * Categories screen, the listing form and the post form all draw it this way.
 */
export function categoryTreeOrder(
  categories: Category[]
): { category: Category; depth: number }[] {
  const byParent = new Map<string | null, Category[]>()
  for (const category of categories) {
    const key = category.parentId ?? null
    byParent.set(key, [...(byParent.get(key) ?? []), category])
  }
  const rows: { category: Category; depth: number }[] = []
  const walk = (parentId: string | null, depth: number) => {
    // Deeper than the tree can honestly be is a cycle left by hand-edited
    // data; stopping keeps the screen up rather than looping forever.
    if (depth > 10) return
    for (const category of byParent.get(parentId) ?? []) {
      rows.push({ category, depth })
      walk(category.id, depth + 1)
    }
  }
  walk(null, 0)
  return rows
}
