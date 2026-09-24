import { z } from "zod"

import type { NetworkId } from "@/lib/protocols/contracts"
import { num } from "@/lib/protocols/aster/translate"
import {
  asterSigned,
  parseAsterCredential,
} from "@/server/protocols/aster/client"

const bracketSchema = z.object({
  initialLeverage: z.union([z.string(), z.number()]),
})

const marketSchema = z.object({
  symbol: z.string(),
  brackets: z.array(z.unknown()).default([]),
})

/**
 * Each market's highest leverage, read from Aster's bracket answer.
 *
 * The first bracket is the smallest position and carries the highest number,
 * but the highest of all brackets is taken rather than trusting the order. A
 * market whose brackets hold no readable whole number is left out, so it keeps
 * the catalogue's unknown instead of a guess.
 */
export function toAsterLeverageCeilings(answer: unknown): Map<string, number> {
  const ceilings = new Map<string, number>()
  if (!Array.isArray(answer)) return ceilings
  for (const raw of answer) {
    const market = marketSchema.safeParse(raw)
    if (!market.success) continue
    let highest = 0
    for (const bracket of market.data.brackets) {
      const parsed = bracketSchema.safeParse(bracket)
      const leverage = parsed.success ? num(parsed.data.initialLeverage) : null
      if (leverage !== null && leverage > highest) highest = leverage
    }
    const whole = Math.floor(highest)
    if (whole >= 1) ceilings.set(market.data.symbol, whole)
  }
  return ceilings
}

/**
 * Every Aster market's leverage ceiling for this account, in one signed read.
 *
 * Asking without a market name returns the whole list for one request unit,
 * per Aster's V3 reference, so this never walks the markets one by one.
 */
export async function fetchAsterLeverageCeilings(
  network: NetworkId,
  address: string,
  credential: () => string | null
): Promise<Map<string, number>> {
  const blob = credential()
  if (!blob) throw new Error("LIVE_WALLET_KEY")
  const answer = await asterSigned(
    network,
    address,
    parseAsterCredential(blob),
    "GET",
    "/fapi/v3/leverageBrackets",
    1
  )
  return toAsterLeverageCeilings(answer)
}
