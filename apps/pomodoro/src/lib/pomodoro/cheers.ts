/**
 * The cheers somebody can send, as a fixed list.
 *
 * Nothing is typed. That is the whole design rather than a limitation: a
 * canned line has nothing to moderate, cannot carry a link or an insult, and
 * is the reason this feature needs no report queue of its own. Room reactions
 * are five fixed emoji for exactly the same reason.
 *
 * The stored id never changes even when the wording does.
 */
export const CHEERS = [
  { id: "keep-going", label: "Keep going!" },
  { id: "nice-streak", label: "Nice streak." },
  { id: "strong-week", label: "Strong week." },
  { id: "proud", label: "That is impressive." },
  { id: "welcome-back", label: "Good to see you back." },
] as const

export type Cheer = (typeof CHEERS)[number]
export type CheerId = Cheer["id"]

export const CHEER_IDS = CHEERS.map((cheer) => cheer.id) as [
  CheerId,
  ...CheerId[],
]

export function findCheer(id: string): Cheer | undefined {
  return CHEERS.find((cheer) => cheer.id === id)
}

/**
 * How many cheers one person may send another in a day.
 *
 * Three is enough to be encouraging and far too few to be a way to pester
 * somebody. The cap is per pair, so following many people is never limited by
 * how much you cheered one of them.
 */
export const CHEERS_PER_DAY = 3

export const CHEER_CAP_MESSAGE =
  "You have sent this person your cheers for today. Try again tomorrow."

export function cheerErrorMessage(cause: unknown) {
  const text = cause instanceof Error ? cause.message : String(cause)
  if (text.includes("CHEER_CAP_REACHED")) return CHEER_CAP_MESSAGE
  if (text.includes("NOT_FOLLOWING"))
    return "Follow somebody before cheering them on."
  if (text.includes("CANNOT_CHEER_SELF")) return "That one is for other people."
  return "That cheer could not be sent. Try again."
}
