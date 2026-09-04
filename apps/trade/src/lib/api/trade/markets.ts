import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import {
  KNOWN_PROTOCOLS,
  parseMarketKey,
  type MarketRow,
  type NetworkId,
  type ProtocolId,
} from "@/lib/protocols/contracts"
import {
  filterMarketsByVolume,
  type FilteredMarketCatalog,
} from "@/lib/trade/market-volume"
import { userGet, userPost } from "@/server/guards"
import { loadRawMarketCatalog } from "@/server/protocols/market-catalog"
import { getProtocol } from "@/server/protocols/registry"
import {
  loadLastMarketKey,
  loadMinimumMarketVolume,
  saveLastMarketKey,
} from "@/server/trade/prefs"

import { createErrorMessage } from "../error-message"

/**
 * The market list and the last market this account opened.
 *
 * Reads go through the protocol registry, so this file never knows which
 * exchange it is talking to: every protocol that can list markets is asked
 * for its catalog, and the screen gets them all, labels included. One
 * catalog today; a second exchange makes this an array of two without a
 * word of this file changing.
 */

/**
 * Which exchange and which network to list. One choice each for the whole
 * read: every dashboard belongs to exactly one exchange (the route says
 * which), and the screens show one network at a time, clearly labelled — the
 * labelling rule ("a pretend dollar must never be readable as a real one")
 * is easiest to keep when the two never share a list.
 */
const marketsSchema = z.object({
  protocol: z.enum(KNOWN_PROTOCOLS),
  network: z.enum(["mainnet", "testnet"]),
})

const loadMarketsFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(marketsSchema)
  .handler(
    async ({
      data,
      context,
    }): Promise<{
      catalogs: FilteredMarketCatalog[]
    }> => {
      const protocol = getProtocol(data.protocol)
      // A network the exchange does not run is refused, not answered with an
      // empty list that reads as "no markets today".
      if (!protocol.networks.includes(data.network)) {
        throw new Error(`PROTOCOL_NO_NETWORK:${data.protocol}:${data.network}`)
      }
      const [catalog, minimumVolumeUsd] = await Promise.all([
        loadRawMarketCatalog(data.protocol, data.network),
        loadMinimumMarketVolume(context.user.id),
      ])
      return {
        catalogs: [filterMarketsByVolume(catalog, minimumVolumeUsd)],
      }
    }
  )

/**
 * Fresh prices for markets the screen is showing, on a venue that has no
 * pushed feed.
 *
 * **Refused for any venue that HAS a feed.** Asking an exchange for prices on
 * a timer is the thing `rules/trading-rules.md` forbids, and a socket is the
 * answer wherever one exists. The refusal is here rather than left to the
 * screen's good manners, so the rule is enforced by the server and not by
 * whoever writes the next dashboard.
 *
 * **A venue must have said it may be asked**, and its own number bounds how
 * many markets one call may carry. Both live on the catalogue, so a browser
 * asking for more than the venue offers is trimmed rather than trusted: the
 * cost of a refresh is the venue's decision, not the caller's.
 *
 * Prices come from the same rationed, paged, briefly-shared read the engine
 * uses, so a refresh and a settle in the same second cost one request
 * between them.
 */
const refreshPricesSchema = z.object({
  protocol: z.enum(KNOWN_PROTOCOLS),
  network: z.enum(["mainnet", "testnet"]),
  // A loose ceiling that keeps an absurd payload out before any work starts.
  // The real limit is the venue's own, applied below.
  marketIds: z.array(z.string().trim().min(1).max(64)).min(1).max(500),
})

const refreshMarketPricesFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(refreshPricesSchema)
  .handler(
    async ({ data }): Promise<{ prices: Array<[string, number]> }> => {
      const protocol = getProtocol(data.protocol)
      if (!protocol.networks.includes(data.network)) {
        throw new Error(`PROTOCOL_NO_NETWORK:${data.protocol}:${data.network}`)
      }
      // The rule, stated where it cannot be forgotten: a venue that pushes
      // its prices is never asked for them on a timer.
      if (protocol.livePrices) {
        throw new Error(`PROTOCOL_HAS_LIVE_FEED:${data.protocol}`)
      }
      const catalog = await loadRawMarketCatalog(data.protocol, data.network)
      const most = catalog.priceRefresh?.mostMarkets
      if (!most) {
        throw new Error(`PROTOCOL_NO_PRICE_REFRESH:${data.protocol}`)
      }
      const prices = await protocol.markets.prices(
        data.network,
        // Busiest first is the browser's order; trimming from the end keeps
        // the markets the venue would have chosen itself.
        data.marketIds.slice(0, most)
      )
      return { prices: [...prices] }
    }
  )

/**
 * A market that is not in the loaded list, looked up on the venue by name or
 * address. Only a venue that says it can (`markets.search`) is asked; the
 * picker offers the lookup only where the catalogue's `picker.search` is
 * true, so a refusal here is a bug rather than a person's mistake.
 */
const searchMarketsSchema = z.object({
  protocol: z.enum(KNOWN_PROTOCOLS),
  network: z.enum(["mainnet", "testnet"]),
  query: z.string().trim().min(2).max(64),
})

const searchMarketsFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(searchMarketsSchema)
  .handler(async ({ data }): Promise<{ rows: MarketRow[] }> => {
    const protocol = getProtocol(data.protocol)
    if (!protocol.networks.includes(data.network)) {
      throw new Error(`PROTOCOL_NO_NETWORK:${data.protocol}:${data.network}`)
    }
    if (!protocol.markets.search) {
      throw new Error(`PROTOCOL_NO_SEARCH:${data.protocol}`)
    }
    return { rows: await protocol.markets.search(data.network, data.query) }
  })

/**
 * The market this account was last looking at. Saved best-effort on every
 * selection; a failed save loses the memory, never the current view.
 */
const lastMarketSchema = z.object({
  marketKey: z
    .string()
    .max(120)
    .refine((key) => parseMarketKey(key) !== null, {
      message: "Not a market key.",
    }),
})

const loadLastMarketFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(z.object({ protocol: z.enum(KNOWN_PROTOCOLS) }))
  .handler(async ({ data, context }): Promise<{ marketKey: string | null }> => {
    return {
      marketKey: await loadLastMarketKey(context.user.id, data.protocol),
    }
  })

const saveLastMarketFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(lastMarketSchema)
  .handler(async ({ data, context }): Promise<{ saved: true }> => {
    await saveLastMarketKey(context.user.id, data.marketKey)
    return { saved: true }
  })

export function loadMarkets(protocol: ProtocolId, network: NetworkId) {
  return loadMarketsFn({ data: { protocol, network } })
}

export function searchMarkets(
  protocol: ProtocolId,
  network: NetworkId,
  query: string
) {
  return searchMarketsFn({ data: { protocol, network, query } })
}

export function refreshMarketPrices(
  protocol: ProtocolId,
  network: NetworkId,
  marketIds: readonly string[]
) {
  return refreshMarketPricesFn({
    data: { protocol, network, marketIds: [...marketIds] },
  })
}

export function loadLastMarket(protocol: ProtocolId) {
  return loadLastMarketFn({ data: { protocol } })
}

export function saveLastMarket(marketKey: string) {
  return saveLastMarketFn({ data: { marketKey } })
}

const baseMarketsErrorMessage = createErrorMessage(
  {
    ASTER_IP_BANNED:
      "Aster has blocked this internet address. Trade has stopped asking Aster. Check Aster before restarting the app.",
    EXCHANGE_BUSY:
      "The exchange is asking Trade to slow down. Wait a moment and try again.",
  },
  "The exchange did not answer. Nothing is wrong on your side — try again in a moment."
)

/**
 * The sentence the market list shows when the exchange would not answer.
 *
 * An exchange that KNOWS why it has no list — a key missing from `.env`, a
 * list not built yet — throws `MARKETS_UNAVAILABLE:` with its own sentence
 * after the code, and that sentence is shown as it is. It says what to do;
 * the generic "try again in a moment" would be wrong for both. This file
 * never learns which exchange wrote it.
 */
export function getMarketsErrorMessage(error: unknown): string {
  const message =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? error.message
        : ""
  const explained = /^MARKETS_UNAVAILABLE:([^]+)/.exec(message.trim())
  const detail = explained?.[1]?.trim()
  return detail ? detail : baseMarketsErrorMessage(error)
}
