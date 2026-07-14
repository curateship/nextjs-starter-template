import { z } from "zod"

export const HYPERLIQUID_MARKET_NAME_MAX_LENGTH = 64

export const hyperliquidMarketSchema = z
  .string()
  .min(1)
  .max(HYPERLIQUID_MARKET_NAME_MAX_LENGTH)
  .refine(
    (market) =>
      [...market].every((character) => {
        const code = character.charCodeAt(0)
        return code >= 32 && code !== 127
      }),
    { message: "Market name contains control characters" }
  )
