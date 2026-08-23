import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import {
  KNOWN_PROTOCOLS,
  parseMarketKey,
  type NetworkId,
  type ProtocolId,
} from "@/lib/protocols/contracts"
import {
  filterMarketsByVolume,
  type FilteredMarketCatalog,
} from "@/lib/trade/market-volume"
import { userGet, userPost } from "@/server/guards"
import { getProtocol } from "@/server/protocols/registry"
import {
  loadLastMarketKey,
  loadMinimumMarketVolume,
  saveLastMarketKey,
} from "@/server/trade/prefs"

import { createErrorMessage } from "./error-message"

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
        protocol.markets.fetch(data.network),
        loadMinimumMarketVolume(context.user.id),
      ])
      return {
        catalogs: [filterMarketsByVolume(catalog, minimumVolumeUsd)],
      }
    }
  )

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

export function loadLastMarket(protocol: ProtocolId) {
  return loadLastMarketFn({ data: { protocol } })
}

export function saveLastMarket(marketKey: string) {
  return saveLastMarketFn({ data: { marketKey } })
}

export const getMarketsErrorMessage = createErrorMessage(
  {
    ASTER_IP_BANNED:
      "Aster has blocked this internet address. Trade has stopped asking Aster. Check Aster before restarting the app.",
  },
  "The exchange did not answer. Nothing is wrong on your side — try again in a moment."
)
