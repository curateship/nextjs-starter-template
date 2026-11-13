import { PHONE_KIND_WORDS, PHONE_KINDS, PHONE_STATUS_WORDS, type PhoneKind, type PhoneStatus } from "@/lib/phones/options"
import { isNetwork, NETWORK_NAMES, type Network } from "@/lib/social/networks"

/**
 * What the phones list reads (Racks dashboard, parts 84 and 96): the open
 * phone, the Wall or Jobs tab, the search box and the filters. Since 12 Nov
 * 2026 the list is the Anti Detect dashboard's Phones, whose address holds
 * them (`src/lib/anti-detect/search.ts`); a saved view keeps the filters. A link opens the same view, the back button undoes a filter, and
 * a saved view is the filters below. Anything unusable
 * is left out rather than guessed at, so a filter's value never changes
 * silently. The filters came from the Phones dashboard (phone farm part 59).
 */
export type RackSearch = {
  /** The phone open in the right panel. */
  open?: string
  /** The middle panel's tab; the list when left out. */
  list?: RackListTab
  /** The search box, over the name, serial and the rest of the row. */
  q?: string
} & RackFilters

export type RackFilters = {
  status?: PhoneStatus
  kind?: PhoneKind
  /** The carrier's name as it is seen on the phone. */
  carrier?: string
  /** A project's id. */
  project?: string
  /** "needed": only phones that need wiping before another account goes on. */
  wipe?: "needed"
  /** Only phones an app has banned an account on, by the app (Bans task, part 4). */
  banned?: Network
  /** A folder's id, or "none" for phones in no folder. */
  folder?: string
  /** A label's id, or "none" for phones with no label. */
  label?: string
  tag?: string
  /** Rows under a heading per status or per kind (part 98). */
  group?: RackGroup
}

/** A picked rack's own tabs beside Phones: its shelf, its live wall, its job queue and its program's log. */
export const RACK_LIST_TABS = ["shelf", "wall", "jobs", "log"] as const
export type RackListTab = (typeof RACK_LIST_TABS)[number]

export const RACK_GROUPS = ["status", "kind"] as const
export type RackGroup = (typeof RACK_GROUPS)[number]

export const PHONE_STATUS_FILTERS: PhoneStatus[] = ["connected", "busy", "held", "offline"]

/** "none" in `folder` or `label`: the phones in no folder, or with no label. */
export const NO_GROUP = "none"

/** The keys a saved view keeps (part 96). The tabs and the open phone are where you are, not what you see. */
export const RACK_FILTER_KEYS = [
  "q",
  "status",
  "kind",
  "carrier",
  "project",
  "wipe",
  "banned",
  "folder",
  "label",
  "tag",
  "group",
] as const

const ID = /^[A-Za-z0-9-]{1,36}$/

const word = (value: unknown, max: number): string | undefined =>
  typeof value === "string" && value.trim() && value.length <= max ? value : undefined

const oneOf = <T extends string>(value: unknown, allowed: readonly T[]): T | undefined =>
  typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : undefined

const idOrNone = (value: unknown): string | undefined =>
  value === NO_GROUP || (typeof value === "string" && ID.test(value)) ? (value as string) : undefined

export function readRackFilters(search: Record<string, unknown>): RackFilters & { q?: string } {
  return {
    q: word(search.q, 200),
    status: oneOf(search.status, PHONE_STATUS_FILTERS),
    kind: oneOf(search.kind, PHONE_KINDS),
    carrier: word(search.carrier, 120),
    project: typeof search.project === "string" && ID.test(search.project) ? search.project : undefined,
    wipe: search.wipe === "needed" ? "needed" : undefined,
    banned: isNetwork(search.banned) ? search.banned : undefined,
    folder: idOrNone(search.folder),
    label: idOrNone(search.label),
    tag: word(search.tag, 50),
    group: oneOf(search.group, RACK_GROUPS),
  }
}

/** The filters a saved view keeps: only the ones set. */
export function keptRackFilters(filters: Record<string, unknown>): Record<string, string> {
  const read = readRackFilters(filters)
  return Object.fromEntries(RACK_FILTER_KEYS.flatMap((key) => (read[key] ? [[key, read[key] as string]] : [])))
}

/** How many filters the Filter button counts. The search box has its own control. */
export function rackFilterCount(search: RackFilters): number {
  return [
    search.status,
    search.kind,
    search.carrier,
    search.project,
    search.wipe,
    search.banned,
    search.folder,
    search.label,
    search.tag,
    search.group,
  ].filter(Boolean).length
}

/** "Offline · Android · Mint Mobile": what a view shows, said before it is opened. */
export function describeRackFilters(filters: Record<string, unknown>, names: Record<string, string> = {}): string {
  const read = readRackFilters(filters)
  const named = (id: string | undefined, what: string) =>
    id === NO_GROUP ? `No ${what}` : id ? names[id] || `A ${what} no longer here` : ""
  const parts = [
    read.q ? `"${read.q}"` : "",
    read.status ? PHONE_STATUS_WORDS[read.status] : "",
    read.kind ? PHONE_KIND_WORDS[read.kind] : "",
    read.carrier ?? "",
    read.project ? names[read.project] || "A project" : "",
    read.wipe ? "Needs wiping" : "",
    read.banned ? `Banned on ${NETWORK_NAMES[read.banned]}` : "",
    named(read.folder, "folder"),
    named(read.label, "label"),
    read.tag ? `#${read.tag}` : "",
    read.group ? `By ${read.group}` : "",
  ].filter(Boolean)
  return parts.join(" · ") || "Every phone"
}

/** The saved views' kind: a view belongs to one rack's page. */
export const RACK_VIEW_KIND = "rack"
