/**
 * The folder tree laid out as rows, top to bottom, the way the folders panel
 * and every folder picker draw it: each folder under its parent, siblings in
 * the order they were dragged. A folder whose parent is not in the list (in
 * Trash, or gone) sits at the top level rather than vanishing.
 */

type TreeFolder = { id: string; parentId: string | null; position: number; name: string }

type TreeRow<T extends TreeFolder> = { folder: T; depth: number; hasChildren: boolean }

export function folderRows<T extends TreeFolder>(folders: T[], collapsed: ReadonlySet<string> = new Set()): TreeRow<T>[] {
  const ids = new Set(folders.map((folder) => folder.id))
  const children = new Map<string | null, T[]>()
  for (const folder of folders) {
    const parent = folder.parentId && ids.has(folder.parentId) ? folder.parentId : null
    const list = children.get(parent) ?? []
    list.push(folder)
    children.set(parent, list)
  }
  for (const list of children.values()) list.sort((a, b) => a.position - b.position)

  const rows: TreeRow<T>[] = []
  const seen = new Set<string>()
  function walk(parent: string | null, depth: number) {
    for (const folder of children.get(parent) ?? []) {
      if (seen.has(folder.id)) continue
      seen.add(folder.id)
      const kids = children.get(folder.id) ?? []
      rows.push({ folder, depth, hasChildren: kids.length > 0 })
      if (!collapsed.has(folder.id)) walk(folder.id, depth + 1)
    }
  }
  walk(null, 0)
  return rows
}

/** "Books / Fiction": a folder's name with the folders it sits in. */
export function folderPath<T extends TreeFolder>(folders: T[], id: string | null): string {
  if (!id) return ""
  const byId = new Map(folders.map((folder) => [folder.id, folder]))
  const names: string[] = []
  const seen = new Set<string>()
  let at: string | null = id
  while (at && !seen.has(at)) {
    seen.add(at)
    const folder = byId.get(at)
    if (!folder) break
    names.unshift(folder.name)
    at = folder.parentId
  }
  return names.join(" / ")
}

type FlatRow = { id: string; parentId: string | null; depth: number }

/**
 * Where a dragged folder lands, from dnd-kit's sortable tree example: the row
 * it is over sets its place in the list, and how far it was dragged sideways
 * sets how deep it goes, kept between what the rows above and below allow.
 * The dragged folder's own children are already out of `rows`.
 */
export function dropProjection(
  rows: FlatRow[],
  activeId: string,
  overId: string,
  offsetLeft: number,
  indent: number
): { depth: number; parentId: string | null; orderedIds: string[] } {
  const from = rows.findIndex((row) => row.id === activeId)
  const to = rows.findIndex((row) => row.id === overId)
  const moved = [...rows]
  const [active] = moved.splice(from, 1)
  moved.splice(to, 0, active)

  const previous = moved[to - 1]
  const next = moved[to + 1]
  const wanted = active.depth + Math.round(offsetLeft / indent)
  const most = previous ? previous.depth + 1 : 0
  const least = next ? next.depth : 0
  const depth = Math.min(Math.max(wanted, least), most)

  let parentId: string | null = null
  if (depth > 0 && previous) {
    if (depth === previous.depth) parentId = previous.parentId
    else if (depth > previous.depth) parentId = previous.id
    else {
      parentId =
        moved
          .slice(0, to)
          .reverse()
          .find((row) => row.depth === depth)?.parentId ?? null
    }
  }

  const orderedIds = moved
    .filter((row, index) => (index === to ? true : row.parentId === parentId && row.id !== activeId))
    .map((row) => row.id)
  return { depth, parentId, orderedIds }
}
