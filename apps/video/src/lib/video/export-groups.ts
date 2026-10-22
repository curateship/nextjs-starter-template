/**
 * The Exports page's groups: a project's own exports and the exports of its
 * language copies, kept together under one heading. Tyler chose heading rows
 * on 21 Oct 2026 (workspace/docs/another-language.md).
 */

type GroupedExport = {
  id: string
  project_id: string | null
  language: string | null
  original_project_id: string | null
}

/** The original a row belongs under, or null when it is in no group. */
export function exportGroupId(
  item: GroupedExport,
  originals: ReadonlySet<string>
): string | null {
  if (item.language && item.original_project_id) return item.original_project_id
  if (item.project_id && originals.has(item.project_id)) return item.project_id
  return null
}

/**
 * The rows in their sorted order, except that every row of a group is pulled
 * up to where the group's first row sits. A row in no group stays exactly
 * where the sort put it. Returns the rows and the original of each group.
 */
export function groupLanguageCopies<Item extends GroupedExport>(
  sorted: Item[]
): { rows: Item[]; originals: ReadonlySet<string> } {
  const originals = new Set(
    sorted.flatMap((item) =>
      item.language && item.original_project_id
        ? [item.original_project_id]
        : []
    )
  )
  if (!originals.size) return { rows: sorted, originals }
  const groups = new Map<string, Item[]>()
  const order: Item[][] = []
  for (const item of sorted) {
    const group = exportGroupId(item, originals)
    if (!group) {
      order.push([item])
      continue
    }
    const members = groups.get(group)
    if (members) {
      members.push(item)
    } else {
      const started = [item]
      groups.set(group, started)
      order.push(started)
    }
  }
  return { rows: order.flat(), originals }
}
