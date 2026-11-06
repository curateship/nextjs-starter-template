/**
 * Hook types on the Library (`workspace/docs/library.md`, more-features task
 * part 7). Tyler, 6 Nov 2026: "Fixed + my own", and "Label old ones too".
 * Seven fixed types every person has, plus the person's own, added on
 * Settings → Hook types. Client-safe: the Library and the settings tab draw
 * these lists.
 */

export const FIXED_HOOK_TYPES = [
  { id: "question", label: "Question" },
  { id: "mistake", label: "Mistake" },
  { id: "list", label: "List" },
  { id: "bold-claim", label: "Bold claim" },
  { id: "story", label: "Story" },
  { id: "shocking-number", label: "Shocking number" },
  { id: "how-to", label: "How-to" },
] as const

export type FixedHookTypeId = (typeof FIXED_HOOK_TYPES)[number]["id"]

export const FIXED_HOOK_TYPE_IDS = FIXED_HOOK_TYPES.map((one) => one.id) as [FixedHookTypeId, ...FixedHookTypeId[]]

/** One of the person's own types, as Settings → Hook types lists it. */
export type OwnHookType = { id: string; name: string }

/** A type as a list or a picker draws it. A fixed type's id is its key; an own type's is its row id. */
export type HookTypeChoice = { id: string; label: string; own: boolean }

export const HOOK_TYPE_NAME_MAX = 40
/** Enough for anyone's own words, and short enough for the prompt that lists them. */
export const OWN_HOOK_TYPES_MAX = 30

export function isFixedHookType(value: string): value is FixedHookTypeId {
  return (FIXED_HOOK_TYPE_IDS as string[]).includes(value)
}

/** The fixed types first, in their order, then the person's own by name. */
export function hookTypeChoices(own: OwnHookType[]): HookTypeChoice[] {
  return [
    ...FIXED_HOOK_TYPES.map((one) => ({ id: one.id, label: one.label, own: false })),
    ...[...own].sort((left, right) => left.name.localeCompare(right.name)).map((one) => ({ id: one.id, label: one.name, own: true })),
  ]
}

/** A type's name, or null when it is unknown (an own type since deleted). */
export function hookTypeLabel(id: string | null, choices: HookTypeChoice[]): string | null {
  if (!id) return null
  return choices.find((one) => one.id === id)?.label ?? null
}

/** Trims and squeezes the spaces in an own type's name. */
export function cleanHookTypeName(value: string): string {
  return value.trim().replace(/\s+/g, " ").slice(0, HOOK_TYPE_NAME_MAX)
}

/**
 * The type an AI named, matched to the list ignoring case and spaces, or null
 * for anything not on it. The AI is asked for a name from the list, so an
 * answer off the list is never stored.
 */
export function hookTypeFromName(name: string | null | undefined, choices: HookTypeChoice[]): HookTypeChoice | null {
  const wanted = (name ?? "").trim().toLowerCase().replace(/[\s_-]+/g, " ")
  if (!wanted) return null
  return choices.find((one) => one.label.toLowerCase().replace(/[\s_-]+/g, " ") === wanted) ?? null
}

/** How many winners each type has, by type id. A hook with no type counts nowhere. */
export function winnersByType(hooks: { typeId: string | null; winner: boolean }[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const hook of hooks) {
    if (!hook.typeId || !hook.winner) continue
    counts.set(hook.typeId, (counts.get(hook.typeId) ?? 0) + 1)
  }
  return counts
}
