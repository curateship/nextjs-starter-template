/**
 * The four banner gradients a room card can wear, ported from the old app's
 * stylesheet by value rather than by class.
 */
const ROOM_VIBES = [
  "linear-gradient(135deg,#55313b,#ff775e,#4b272e)",
  "linear-gradient(135deg,#2c285b,#7454af,#2b234c)",
  "linear-gradient(135deg,#bd6532,#e5b04f,#4a301f)",
  "linear-gradient(135deg,#17333d,#5d8da4,#172f38)",
] as const

/**
 * Which gradient a room gets. Taken from the room's own id rather than its
 * place in the list, so a card keeps its colour when a room above it closes
 * and the list shuffles up.
 */
export function vibeFor(id: string) {
  let hash = 0
  for (const char of id) hash = (hash * 31 + (char.codePointAt(0) ?? 0)) % 997
  return ROOM_VIBES[hash % ROOM_VIBES.length]
}
