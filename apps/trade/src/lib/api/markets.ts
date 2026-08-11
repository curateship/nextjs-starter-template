import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { parseMarketKey, type MarketCatalog } from "@/lib/protocols/contracts"
import { userGet, userPost } from "@/server/guards"
import { tradeDashboardProtocol } from "@/server/protocols/registry"
import {
  loadMarketFavoriteKeys,
  saveMarketFavoriteKeys,
} from "@/server/trade/market-favorites"
import { loadLastMarketKey, saveLastMarketKey } from "@/server/trade/prefs"

import { createErrorMessage } from "./error-message"

/**
 * The market list, and the stars people put on it.
 *
 * Reads go through the protocol registry, so this file never knows which
 * exchange it is talking to: every protocol that can list markets is asked
 * for its catalog, and the screen gets them all, labels included. One
 * catalog today; a second exchange makes this an array of two without a
 * word of this file changing.
 */

/**
 * Which network to list. One choice for the whole read: the screens show one
 * network at a time, clearly labelled, and the labelling rule ("a pretend
 * dollar must never be readable as a real one") is easiest to keep when the
 * two never share a list.
 */
const networkSchema = z.object({ network: z.enum(["mainnet", "testnet"]) })

const loadMarketsFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(networkSchema)
  .handler(async ({ data }): Promise<{ catalogs: MarketCatalog[] }> => {
    const protocol = tradeDashboardProtocol()
    return { catalogs: [await protocol.markets.fetch(data.network)] }
  })

/**
 * A favourite is a market key, and only a well-formed one gets saved — a
 * junk entry would sit in the row forever, matching nothing. Capped because
 * this is the only door into that row: favourites are hand-picked, so a
 * hundred is generosity, not a limit anyone hits.
 */
const favoriteKeysSchema = z.object({
  marketKeys: z
    .array(
      z
        .string()
        .max(120)
        .refine((key) => parseMarketKey(key) !== null, {
          message: "Not a market key.",
        })
    )
    .max(100),
})

const loadMarketFavoritesFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async ({ context }): Promise<{ marketKeys: string[] }> => {
    return { marketKeys: await loadMarketFavoriteKeys(context.user.id) }
  })

const saveMarketFavoritesFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(favoriteKeysSchema)
  .handler(async ({ data, context }): Promise<{ marketKeys: string[] }> => {
    return {
      marketKeys: await saveMarketFavoriteKeys(
        context.user.id,
        data.marketKeys
      ),
    }
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
  .handler(async ({ context }): Promise<{ marketKey: string | null }> => {
    return { marketKey: await loadLastMarketKey(context.user.id) }
  })

const saveLastMarketFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(lastMarketSchema)
  .handler(async ({ data, context }): Promise<{ saved: true }> => {
    await saveLastMarketKey(context.user.id, data.marketKey)
    return { saved: true }
  })

export function loadMarkets(network: "mainnet" | "testnet") {
  return loadMarketsFn({ data: { network } })
}

export function loadLastMarket() {
  return loadLastMarketFn()
}

export function saveLastMarket(marketKey: string) {
  return saveLastMarketFn({ data: { marketKey } })
}

export function loadMarketFavorites() {
  return loadMarketFavoritesFn()
}

export function saveMarketFavorites(marketKeys: string[]) {
  return saveMarketFavoritesFn({ data: { marketKeys } })
}

export const getMarketsErrorMessage = createErrorMessage(
  {},
  "The exchange did not answer. Nothing is wrong on your side — try again in a moment."
)

export const getMarketFavoritesErrorMessage = createErrorMessage(
  {},
  "That star did not save. Try it again."
)
