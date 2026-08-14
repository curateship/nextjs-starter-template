import { parseMarketKey, type NetworkId } from "@/lib/protocols/contracts"

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
 * Whether this saved market key belongs on the network the page is showing.
 * A remembered mainnet market must not be "selected" while the page lists
 * testnet — it would render as missing and read like a delisting.
 */
export function marketKeyOnNetwork(
  marketKey: string,
  network: NetworkId
): boolean {
  return parseMarketKey(marketKey)?.network === network
}
