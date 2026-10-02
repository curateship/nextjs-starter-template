import type { MarketMatchKind } from "@/lib/trade/social/coin-matcher"
import type { SocialMarketRow } from "@/lib/trade/social/dashboard"

/**
 * What to call each kind of market on screen, and the order the panels list
 * them in.
 *
 * Coins first because they are what most creators talk about and the only kind
 * a member gets without asking. "Metals and oil" rather than "commodities",
 * because gold, copper and crude are what the venues actually list and
 * "commodities" is a word nobody says out loud.
 */
export const MARKET_KIND_LABELS: Record<MarketMatchKind, string> = {
  coin: "Coins",
  stock: "Stocks",
  commodity: "Metals and oil",
  currency: "Currencies",
}

const ORDER: readonly MarketMatchKind[] = [
  "coin",
  "stock",
  "commodity",
  "currency",
]

export type MarketKindGroup = {
  kind: MarketMatchKind
  label: string
  rows: SocialMarketRow[]
}

/**
 * The panel's rows split by kind, each group keeping the most-named-first
 * order it arrived in.
 *
 * **One group gets no heading.** A member who never switched stocks on sees
 * coins and nothing else, and a lone "Coins" heading over a list of coins in a
 * panel already titled Markets is a line that says nothing. The caller checks
 * `groups.length` for that.
 */
export function groupMarketsByKind(
  rows: readonly SocialMarketRow[]
): MarketKindGroup[] {
  return ORDER.flatMap((kind) => {
    const inKind = rows.filter((row) => row.kind === kind)
    if (inKind.length === 0) return []
    return [{ kind, label: MARKET_KIND_LABELS[kind], rows: inKind }]
  })
}
