import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { parseMarketKey } from "@/lib/protocols/contracts"
import { getLiveErrorMessage } from "@/lib/api/trade/live"
import {
  MAX_LEFTOVER_LIMIT_USD,
  type DustSweepPreview,
  type DustSweepResult,
} from "@/lib/trade/dust-sweep"
import { userGet, userPost } from "@/server/guards"
import { previewDustSweep, sweepDustCoin } from "@/server/trade/dust-sweep"
import { runLiveOrderAction } from "@/server/trade/order-rate-limit"

const limitSchema = z.number().int().min(1).max(MAX_LEFTOVER_LIMIT_USD)

const previewSchema = z.object({
  walletId: z.string().max(36),
  limitUsd: limitSchema,
})

const sweepSchema = z.object({
  walletId: z.string().max(36),
  marketKey: z
    .string()
    .max(120)
    .refine((key) => parseMarketKey(key) !== null, { message: "LIVE_MARKET" }),
  limitUsd: limitSchema,
})

function describe(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  if (message.includes("DUST_SWEEP_UNSUPPORTED"))
    return "Only a real Solana or BNB Chain wallet can sweep leftovers."
  // The shared sentence for a busy exchange is about a close. A sentence the
  // venue wrote itself is kept; otherwise this window says it in its own words.
  const busy = message.match(/EXCHANGE_BUSY(?::(.+))?$/s)?.[1]?.trim()
  if (message.includes("EXCHANGE_BUSY") && !(busy && /^[A-Z].*[.!]$/s.test(busy)))
    return "The exchange was busy and did not answer, so nothing was sent. Wait a minute, then try again."
  return getLiveErrorMessage(error)
}

const loadDustSweepPreviewFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(previewSchema)
  .handler(async ({ data, context }): Promise<DustSweepPreview> => {
    try {
      return await previewDustSweep(
        context.user.id,
        data.walletId,
        data.limitUsd,
        describe
      )
    } catch (error) {
      throw new Error(describe(error))
    }
  })

/**
 * One coin per request, so the window can show each coin's result the moment
 * it finishes, and so one refused coin never stops the next one.
 */
const sweepDustCoinFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(sweepSchema)
  .handler(
    async ({
      data,
      context,
    }): Promise<DustSweepResult | { status: "refused"; reason: string }> => {
      try {
        return await runLiveOrderAction(context.user.id, "order", () =>
          sweepDustCoin(context.user.id, data, describe)
        )
      } catch (error) {
        return { status: "refused", reason: describe(error) }
      }
    }
  )

export function loadDustSweepPreview(input: z.infer<typeof previewSchema>) {
  return loadDustSweepPreviewFn({ data: input })
}

export function sweepDustCoinApi(input: z.infer<typeof sweepSchema>) {
  return sweepDustCoinFn({ data: input })
}
