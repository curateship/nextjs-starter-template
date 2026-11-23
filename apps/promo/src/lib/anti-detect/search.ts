import { isBanKind, type BanKind } from "@/lib/bans/options"
import { readOpenSearch } from "@/lib/hooks/use-open-from-link"
import { readOneOf, readSearchText } from "@/lib/nav/list-search"
import { isNetwork, type Network } from "@/lib/social/networks"
import { PHONE_KINDS, type PhoneKind, type PhoneStatus } from "@/lib/phones/options"
import { NO_GROUP, PHONE_STATUS_FILTERS, RACK_GROUPS, RACK_LIST_TABS, type RackGroup, type RackListTab } from "@/lib/phones/rack-search"
import { PROXY_KINDS, type ProxyKind } from "@/lib/social/options"

/**
 * What the Anti Detect dashboard's address holds (Tyler, 12 Nov 2026: "now
 * comebine the 4 antidect dashboard into one 3 panel dashboard like we did
 * here"), so a reload, Back, a bell notice or a pasted link opens the same
 * section, project, filters and open row. A first visit lands on Profiles;
 * after that the bare `/admin/anti-detect` goes back to where it was.
 */

export const ANTI_DETECT_SECTIONS = ["overview", "profiles", "proxies", "phones", "bans"] as const
export type AntiDetectSection = (typeof ANTI_DETECT_SECTIONS)[number]

/** A section the Dashboards block can hide or move: every one but Overview. */
export type AntiDetectListSection = Exclude<AntiDetectSection, "overview">
export const ANTI_DETECT_LIST_SECTIONS: readonly AntiDetectListSection[] = ["profiles", "proxies", "phones", "bans"]

export const ANTI_DETECT_SECTION_LABELS: Record<AntiDetectSection, string> = {
  overview: "Overview",
  profiles: "Profiles",
  proxies: "Proxies",
  phones: "Phones",
  bans: "Bans",
}

/** Proxies' Filter: how the last test went. */
const PROXY_TESTS = ["working", "failed", "untested"] as const
export type ProxyTest = (typeof PROXY_TESTS)[number]

/** Bans' When: only bans this many days old or newer. */
export const BAN_SINCE = [7, 30, 90] as const
export type BanSince = (typeof BAN_SINCE)[number]

/** A Folder, Label or Rack filter's value for "none of them", the same the phones' filters use. */
export { NO_GROUP }

export type AntiDetectSearch = {
  /**
   * The section showing. Absent only on the bare address, which goes back
   * to the last section and row; every link names its section, Profiles
   * too, so a link never lands wherever the dashboard was left.
   */
  section?: AntiDetectSection
  /** One project, picked in the Projects block: every section shows only what its accounts use. */
  project?: string
  /** The row open on the right. */
  open?: string
  /** Words to find, in the section showing. */
  q?: string
  /** Profiles: one folder's id, or `NO_GROUP`. */
  folder?: string
  /** Profiles: one label's id, or `NO_GROUP`. */
  label?: string
  /** Profiles: one tag. */
  tag?: string
  /** Proxies: how the last test went. */
  test?: ProxyTest
  /** Proxies: one kind. */
  proxyKind?: ProxyKind
  /**
   * Phones: one rack's phones, or `NO_GROUP` for the phones on no rack
   * (Tyler, 12 Nov 2026: "in phones dashboard can be filtered by racks").
   */
  rack?: string
  /** Phones: the Wall or Jobs tab, a picked rack's own. */
  list?: RackListTab
  /** Phones: one status, kind, carrier; only phones needing a wipe; or only phones an app banned an account on. */
  status?: PhoneStatus
  phoneKind?: PhoneKind
  carrier?: string
  wipe?: "needed"
  banned?: Network
  /** Phones: rows under a heading per status or per kind. */
  group?: RackGroup
  /** Bans: one app. */
  app?: Network
  /** Bans: one kind, as bell notices and old links name it. */
  kind?: BanKind
  /** Bans: one phone, one proxy or one seller. */
  phone?: string
  proxy?: string
  seller?: string
  /** Bans: the last 7, 30 or 90 days. */
  since?: BanSince
}

const ID = /^[A-Za-z0-9-]{1,36}$/

const id = (value: unknown) => (typeof value === "string" && ID.test(value) ? value : undefined)

/** The address read safely: anything unknown falls back to the default. */
export function readAntiDetectSearch(search: Record<string, unknown>): AntiDetectSearch {
  const out: AntiDetectSearch = {}
  const section = readOneOf(search.section, ANTI_DETECT_SECTIONS)
  if (section) out.section = section
  const project = id(search.project)
  if (project) out.project = project
  const { open } = readOpenSearch(search)
  if (open && ID.test(open)) out.open = open
  const q = readSearchText(search.q)
  if (q) out.q = q
  const folder = search.folder === NO_GROUP ? NO_GROUP : id(search.folder)
  if (folder) out.folder = folder
  const label = search.label === NO_GROUP ? NO_GROUP : id(search.label)
  if (label) out.label = label
  const tag = readSearchText(search.tag)
  if (tag) out.tag = tag
  const test = readOneOf(search.test, PROXY_TESTS)
  if (test) out.test = test
  const proxyKind = readOneOf(search.proxyKind, PROXY_KINDS)
  if (proxyKind) out.proxyKind = proxyKind
  const rack = search.rack === NO_GROUP ? NO_GROUP : id(search.rack)
  if (rack) out.rack = rack
  const list = readOneOf(search.list, RACK_LIST_TABS)
  if (list) out.list = list
  const status = readOneOf(search.status, PHONE_STATUS_FILTERS)
  if (status) out.status = status
  const phoneKind = readOneOf(search.phoneKind, PHONE_KINDS)
  if (phoneKind) out.phoneKind = phoneKind
  const carrier = readSearchText(search.carrier)
  if (carrier && carrier.length <= 120) out.carrier = carrier
  if (search.wipe === "needed") out.wipe = "needed"
  if (isNetwork(search.banned)) out.banned = search.banned
  const group = readOneOf(search.group, RACK_GROUPS)
  if (group) out.group = group
  if (isNetwork(search.app)) out.app = search.app
  if (isBanKind(search.kind)) out.kind = search.kind
  const phone = id(search.phone)
  if (phone) out.phone = phone
  const proxy = id(search.proxy)
  if (proxy) out.proxy = proxy
  const seller = readSearchText(search.seller)
  if (seller && seller.length <= 120) out.seller = seller
  const since = Number(search.since)
  if ((BAN_SINCE as readonly number[]).includes(since)) out.since = since as BanSince
  return out
}

export function antiDetectSectionOf(search: AntiDetectSearch): AntiDetectSection {
  return search.section ?? "profiles"
}

/**
 * The address for a section picked in the Dashboards block: a fresh start in
 * that section, keeping only the project picked in the Projects block.
 */
export function antiDetectSectionSearch(section: AntiDetectSection, keep: Partial<AntiDetectSearch> = {}): AntiDetectSearch {
  return { section, ...keep }
}
