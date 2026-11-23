import { z } from "zod"

import { KNOWN_PROTOCOLS, parseMarketKey } from "@/lib/protocols/contracts"

export const MAX_ARMED_PRICE_ALERTS = 100
export const MAX_RECENT_FIRED_PRICE_ALERTS = 100
export const PRICE_ALERTS_FULL = "PRICE_ALERTS_FULL"

export const priceAlertDirectionSchema = z.enum(["above", "below"])
export type PriceAlertDirection = z.infer<typeof priceAlertDirectionSchema>

export const priceAlertSchema = z.object({
  id: z.string().uuid(),
  protocol: z.enum(KNOWN_PROTOCOLS),
  network: z.enum(["mainnet", "testnet"]),
  marketKey: z.string().min(1).max(180),
  price: z.number().positive().finite(),
  direction: priceAlertDirectionSchema,
  createdAt: z.number().int().nonnegative(),
})

export type PriceAlert = z.infer<typeof priceAlertSchema>

export const firedPriceAlertSchema = priceAlertSchema.extend({
  firedAt: z.number().int().nonnegative(),
})

export type FiredPriceAlert = z.infer<typeof firedPriceAlertSchema>

/** The direction chosen from the live price when a line is placed or dropped. */
export function priceAlertDirection(
  alertPrice: number,
  currentPrice: number
): PriceAlertDirection {
  return alertPrice >= currentPrice ? "above" : "below"
}

/** The browser's immediate copy while the guarded save catches up. */
export function optimisticPriceAlert(input: {
  id: string
  marketKey: string
  price: number
  currentPrice: number
  createdAt?: number
}): PriceAlert | null {
  const market = parseMarketKey(input.marketKey)
  if (!market || input.price <= 0 || input.currentPrice <= 0) return null
  return {
    id: input.id,
    protocol: market.protocol,
    network: market.network,
    marketKey: input.marketKey,
    price: input.price,
    direction: priceAlertDirection(input.price, input.currentPrice),
    createdAt: input.createdAt ?? Date.now(),
  }
}
