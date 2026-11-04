import { isBanKind, type BanKind } from "@/lib/bans/options"
import { isNetwork, type Network } from "@/lib/social/networks"

/**
 * The Bans dashboard's filters as they sit in the address (Bans task, part
 * 12): `?app=instagram&kind=suspended&phone=<id>&proxy=<id>&seller=Seller
 * A&project=<id>&since=30&open=<banId>`. A link opens a filtered list, a
 * reload keeps it, and the back button undoes a filter. Anything unusable is
 * left out rather than guessed at.
 */
export type BansSearch = {
  app?: Network
  kind?: BanKind
  phone?: string
  proxy?: string
  seller?: string
  project?: string
  /** Only bans this many days old or newer. */
  since?: BanSince
  /** The ban whose window is open. */
  open?: string
}

export const BAN_SINCE = [7, 30, 90] as const
export type BanSince = (typeof BAN_SINCE)[number]

const word = (value: unknown, max: number): string | undefined =>
  typeof value === "string" && value.trim() && value.length <= max ? value : undefined

export function readBansSearch(search: Record<string, unknown>): BansSearch {
  const since = Number(search.since)
  return {
    app: isNetwork(search.app) ? search.app : undefined,
    kind: isBanKind(search.kind) ? search.kind : undefined,
    phone: word(search.phone, 36),
    proxy: word(search.proxy, 36),
    seller: word(search.seller, 120),
    project: word(search.project, 36),
    since: (BAN_SINCE as readonly number[]).includes(since) ? (since as BanSince) : undefined,
    open: word(search.open, 36),
  }
}
