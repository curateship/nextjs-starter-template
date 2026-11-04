import type { Place } from "@/lib/travel/rules"

/**
 * Whether two cards are the same place (More Travel features part 3; Tyler:
 * "Skip it, say where"). Two places from Google match on Google's id. When
 * either has no id, the names match, ignoring case and spaces: a card's place
 * name, or its own name when it has no place.
 */
export type PlaceLike = { title: string; place: Pick<Place, "name" | "placeId"> | null }

function nameOf(card: PlaceLike) {
  return (card.place?.name || card.title).toLowerCase().replace(/\s+/g, "")
}

export function samePlace(a: PlaceLike, b: PlaceLike) {
  const aId = a.place?.placeId
  const bId = b.place?.placeId
  if (aId && bId) return aId === bId
  const name = nameOf(a)
  return name.length > 0 && name === nameOf(b)
}

/** The first of `cards` that is the same place as `card`, or undefined. */
export function findSamePlace<T extends PlaceLike>(card: PlaceLike, cards: readonly T[]) {
  return cards.find((other) => samePlace(card, other))
}
