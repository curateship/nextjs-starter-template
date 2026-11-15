import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import type { LiveFill } from "@/lib/trade/live-trades"
import { userGet } from "@/server/guards"
import { loadCoinFills } from "@/server/trade/coin-fills"
import { findWallet } from "@/server/trade/wallets"

/**
 * One wallet's coin, every fill since a moment: what the details panel reads
 * to list every sale a grid or a ladder has made. Only the signed-in person's
 * own wallet answers; anyone else's id reads as not found.
 */
const loadCoinFillsFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(
    z.object({
      walletId: z.string().min(1).max(64),
      marketKey: z.string().min(1).max(120),
      since: z.number().int().min(0),
    })
  )
  .handler(async ({ data, context }): Promise<{ fills: LiveFill[]; capped: boolean }> => {
    const wallet = await findWallet(context.user.id, data.walletId)
    if (!wallet) throw new Error("That wallet was not found.")
    return loadCoinFills(context.user.id, wallet, data.marketKey, data.since)
  })

export function readCoinFills(walletId: string, marketKey: string, since: number) {
  return loadCoinFillsFn({ data: { walletId, marketKey, since } })
}
