/**
 * A project's tasks have one order, set by dragging. Reordering some of them
 * (one Board column, one List section) swaps them among the places they
 * already held, so every other task keeps its place. The server and the
 * screen both work it out here, so what is drawn at once is what is saved.
 */
export function placesAfterReorder(
  current: readonly { id: string; position: number }[],
  orderedIds: readonly string[]
): Map<string, number> {
  const byId = new Map(current.map((task) => [task.id, task.position]))
  const places = orderedIds.map((id) => byId.get(id) ?? 0).sort((a, b) => a - b)
  // Two tasks made at the same moment can share a place; they are spread out
  // so the new order holds.
  for (let i = 1; i < places.length; i++) {
    if (places[i] <= places[i - 1]) places[i] = places[i - 1] + 1
  }
  return new Map(orderedIds.map((id, index) => [id, places[index]]))
}

/** The project's order, then the oldest first for two in one place. */
export function byPosition<T extends { position: number }>(a: T, b: T) {
  return a.position - b.position
}
