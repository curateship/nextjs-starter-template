import {
  parseMarketKey,
  type NetworkId,
  type ProtocolId,
} from "@/lib/protocols/contracts"

/**
 * `?market=<key>` is which market the middle panel shows — a full market key
 * (`hyperliquid:mainnet:BTC`), so the address stays honest about the exchange
 * and a link keeps meaning the same market on every dashboard. Checked before
 * use and dropped when it is not usable.
 *
 * `?network=testnet` is the practice-network door when nothing is charted.
 * A market key already names its network, so with a market on screen the key
 * is the truth and this param only matters on a bare page — the one rule in
 * `resolveTradeNetwork`. There is no switch on screen any more (paper
 * wallets are the everyday practice path); the address, and any testnet
 * market's link, are how the door is opened when it is wanted.
 *
 * Shared here because every exchange's dashboard route reads the same two
 * params the same way.
 */
export type TradeSearch = { market?: string; network?: "testnet" | "mainnet" }

/**
 * The search params of a single-network dashboard: the market alone. There
 * is no `?network` to read because there is no network to choose — and no
 * silent clamp either: a network typed into the address is not a key this
 * page has, so the validator drops it from the address instead of holding a
 * value the page would quietly override.
 */
export function readMarketSearch(search: Record<string, unknown>): {
  market?: string
  /**
   * Never a value — declared so the type itself says "this page has no
   * network", and so the route's strip-from-the-address middleware may name
   * the key it removes.
   */
  network?: undefined
} {
  return {
    market:
      typeof search.market === "string" && search.market.length <= 120
        ? search.market
        : undefined,
  }
}

export function readTradeSearch(search: Record<string, unknown>): TradeSearch {
  return {
    market:
      typeof search.market === "string" && search.market.length <= 120
        ? search.market
        : undefined,
    // "mainnet" is kept, not dropped as the default.
    //
    // **Because it is the only way home.** With neither a market nor a network
    // in the address, the page falls back to the remembered last market — and
    // if that is a testnet coin it lands on testnet again. Saying mainnet out
    // loud is what lets somebody leave the practice network deliberately.
    network:
      search.network === "testnet"
        ? "testnet"
        : search.network === "mainnet"
          ? "mainnet"
          : undefined,
  }
}

/**
 * Which network the Trade page is on. One rule, applied in the route's loader
 * and nowhere else:
 *
 * - **The market wins.** A market key names its network, so a link to a
 *   testnet market puts the whole page on testnet — the address stays the one
 *   honest description of what is on screen.
 * - **Otherwise the `?network` choice**, written by the picker on the market
 *   list.
 * - **Otherwise mainnet**, the default the app has always had.
 *
 * A remembered last market carries its own network through the first rule,
 * which is what makes "leave on testnet, come back on testnet" work without
 * a second stored preference that could disagree with the first.
 */
export function resolveTradeNetwork(
  marketKey: string | undefined,
  networkChoice: string | undefined
): NetworkId {
  const fromMarket = marketKey ? parseMarketKey(marketKey)?.network : undefined
  if (fromMarket) return fromMarket
  // Either choice is honoured now, not just testnet. Mainnet used to be the
  // silent default, which meant there was no way to ASK for it — and with the
  // switch gone from the screen, "no market and no network" fell back to the
  // remembered coin and carried you straight back to testnet.
  return networkChoice === "testnet" ? "testnet" : "mainnet"
}

/**
 * Whether this saved market key belongs on the dashboard showing it — the
 * right exchange AND the right network. A remembered mainnet market must not
 * be "selected" while the page lists testnet, and a market remembered on one
 * exchange's dashboard must not be "selected" on another's — either would
 * render as missing and read like a delisting.
 */
export function marketKeyOnDashboard(
  marketKey: string,
  protocol: ProtocolId,
  network: NetworkId
): boolean {
  const ref = parseMarketKey(marketKey)
  return ref !== null && ref.protocol === protocol && ref.network === network
}
