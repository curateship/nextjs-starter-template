import { PHONE_KINDS, type PhoneKind, type PhoneStatus } from "@/lib/phones/options"

/**
 * The Phones dashboard's filters and search box, as they sit in the address
 * (part 59 of the phone farm): `?status=offline&kind=iphone&carrier=Mint
 * Mobile&project=<id>&wipe=needed&q=8a`. A link can open a filtered list,
 * and the back button undoes a filter. Anything unusable is left out rather
 * than guessed at, so a filter's value never changes silently.
 */
export type PhonesSearch = {
  status?: PhoneStatus
  kind?: PhoneKind
  /** The carrier's name as it is seen on the phone. */
  carrier?: string
  /** A project's id. */
  project?: string
  /** "needed": only phones that need wiping before another account goes on. */
  wipe?: "needed"
  /** The search box, over the name, serial and the rest of the row. */
  q?: string
}

export const PHONE_STATUS_FILTERS: PhoneStatus[] = ["connected", "busy", "held", "offline"]

const word = (value: unknown, max: number): string | undefined =>
  typeof value === "string" && value.trim() && value.length <= max ? value : undefined

export function readPhonesSearch(search: Record<string, unknown>): PhonesSearch {
  const status = word(search.status, 20)
  const kind = word(search.kind, 20)
  return {
    status: PHONE_STATUS_FILTERS.includes(status as PhoneStatus) ? (status as PhoneStatus) : undefined,
    kind: PHONE_KINDS.includes(kind as PhoneKind) ? (kind as PhoneKind) : undefined,
    carrier: word(search.carrier, 120),
    project: word(search.project, 36),
    wipe: search.wipe === "needed" ? "needed" : undefined,
    q: word(search.q, 200),
  }
}
