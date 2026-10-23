/**
 * The groups of tick boxes down the left of the browse page.
 *
 * **A group is a parent category.** "Cuisine" and "Neighbourhood" are not
 * settings an admin fills in twice; they are categories that have children,
 * and their children are the boxes. Nothing new is stored, and a site that
 * adds a third parent gets a third group on its next page load.
 *
 * Pure, and it takes the smallest shape it can rather than the server's
 * `PublicCategory`, so the browse page, the category page and a test can all
 * hand it the same thing.
 */

/** The three fields it takes to say which group a ticked slug belongs in. */
export type CategoryPlacement = {
  id: string
  slug: string
  parentId: string | null
}

export type FilterGroupCategory = CategoryPlacement & {
  name: string
  /** Published listings in this category itself, never its children's. */
  listingCount: number
}

export type DirectoryFilterOption = {
  slug: string
  name: string
  count: number
}

export type DirectoryFilterGroup = {
  /** The parent category's id, so a page can leave its own group out. */
  id: string
  name: string
  options: DirectoryFilterOption[]
}

/**
 * One group per parent that has something published under it.
 *
 * A child with nothing in it is left out, because a box that can only ever
 * return an empty page is a dead end. A parent left with no children after
 * that is dropped whole, so there is never a heading over nothing.
 *
 * Both the groups and the boxes inside them keep the order the categories
 * arrive in, which is the admin's display order followed by name. The parents
 * are walked first, so "Cuisine" comes before "Neighbourhood" because that is
 * where the admin put it — not because one of its children happens to sort
 * first alphabetically.
 */
export function directoryFilterGroups(
  categories: readonly FilterGroupCategory[]
): DirectoryFilterGroup[] {
  const groups = new Map<string, DirectoryFilterGroup>()
  for (const category of categories) {
    if (category.parentId) continue
    groups.set(category.id, {
      id: category.id,
      name: category.name,
      options: [],
    })
  }

  for (const category of categories) {
    if (!category.parentId || category.listingCount <= 0) continue
    groups.get(category.parentId)?.options.push({
      slug: category.slug,
      name: category.name,
      count: category.listingCount,
    })
  }

  return [...groups.values()].filter((group) => group.options.length > 0)
}

/**
 * The ticked slugs, gathered into one list per parent.
 *
 * Grouping happens here rather than in the address because the address should
 * stay something a person can read and edit. A slug naming a category that no
 * longer exists is dropped, the same way a stale single-category address has
 * always been treated: a dead link still shows the directory.
 *
 * Two categories that share no parent are two groups, so a site with a flat
 * category list still gets "and" between two ticks, which is what the boxes
 * look like they promise.
 */
export function groupCategorySlugs(
  categories: readonly CategoryPlacement[],
  slugs: readonly string[]
): string[][] {
  const bySlug = new Map(categories.map((row) => [row.slug, row]))
  const groups = new Map<string, string[]>()

  for (const slug of slugs) {
    const category = bySlug.get(slug)
    if (!category) continue
    const key = category.parentId ?? `self:${category.id}`
    groups.set(key, [...(groups.get(key) ?? []), category.id])
  }

  return [...groups.values()]
}
