/**
 * The controls at the right-hand end of the public header, in the order an
 * admin drags them into.
 *
 * Three things live there and none of them is a link an admin typed: the
 * account corner, the light and dark switch, and search. They used to be
 * fixed in code, with search sitting over in the menu beside the page links.
 * This is the same idea as the directory app's Action Items, which is where
 * the shape comes from.
 *
 * The saved value is an order, not a list of things. An id this app no longer
 * has is dropped on read, and an item missing from the saved order is added to
 * the end, so a site saved before an item existed still draws all of them and
 * a site saved with an item that has since gone does not draw a hole.
 */
export const PUBLIC_HEADER_ACTION_IDS = [
  "search",
  "theme",
  "user-panel",
] as const

export type PublicHeaderActionId = (typeof PUBLIC_HEADER_ACTION_IDS)[number]

export const PUBLIC_HEADER_ACTION_LABELS: Record<PublicHeaderActionId, string> =
  {
    search: "Search",
    theme: "Light and dark switch",
    "user-panel": "Account corner",
  }

export const PUBLIC_HEADER_ACTION_HINTS: Record<PublicHeaderActionId, string> =
  {
    search: "The search box, or the button that opens the search page.",
    theme: "Only ever drawn when Colour mode lets a visitor choose.",
    "user-panel": "Sign in and Create an account, or the photo of whoever is signed in.",
  }

export type PublicHeaderAction = {
  id: PublicHeaderActionId
  /** Kept out of the header. The account corner cannot be hidden. */
  hidden: boolean
}

/** The order the header has always drawn: search, switch, then the account. */
export function createDefaultPublicHeaderActions(): PublicHeaderAction[] {
  return PUBLIC_HEADER_ACTION_IDS.map((id) => ({ id, hidden: false }))
}

export function normalizePublicHeaderActions(
  value: unknown
): PublicHeaderAction[] {
  const actions: PublicHeaderAction[] = []
  const seen = new Set<PublicHeaderActionId>()

  if (Array.isArray(value)) {
    for (const raw of value) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue
      const source = raw as Record<string, unknown>
      const id = typeof source.id === "string" ? source.id : ""
      if (!PUBLIC_HEADER_ACTION_IDS.includes(id as PublicHeaderActionId)) {
        continue
      }
      if (seen.has(id as PublicHeaderActionId)) continue

      seen.add(id as PublicHeaderActionId)
      actions.push({
        id: id as PublicHeaderActionId,
        // The account corner is how somebody signs in, so it is always drawn.
        hidden: id === "user-panel" ? false : source.hidden === true,
      })
    }
  }

  for (const id of PUBLIC_HEADER_ACTION_IDS) {
    if (seen.has(id)) continue
    actions.push({ id, hidden: false })
  }

  return actions
}

/** The ids to draw, in order, with the hidden ones left out. */
export function visiblePublicHeaderActions(
  actions: readonly PublicHeaderAction[]
): PublicHeaderActionId[] {
  return actions.filter((action) => !action.hidden).map((action) => action.id)
}
