import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { parseMarketKey } from "@/lib/protocols/contracts"

import type { LiveFillMark } from "@/lib/trade/live-trades"
import type { SmartOrder } from "@/lib/trade/smart-plan"
import { userGet, userPost } from "@/server/guards"
import {
  deleteFlowRuns,
  listFlowRuns,
  readFlowRun,
  readFlowRunCoin,
  type FlowRunListRow,
  type FlowRunReport,
} from "@/server/trade/flow-run-report"

import { createErrorMessage } from "./error-message"

/**
 * The doors onto live runs: the list of every flow that has been switched on,
 * and one run in full.
 *
 * **Read-only, and user-scoped.** Switching a flow on and off belongs to the
 * canvas, where the drawing is — `flow-trading.ts` owns those, and a second set
 * of buttons here would be a second answer about somebody's money. What this
 * screen is about is the reader's own wallets, so it is scoped the way the
 * backtest screens are: to the person, not to the workspace.
 */

const runSchema = z.object({ runId: z.string().max(36) })

const listFlowRunsFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async ({ context }): Promise<FlowRunListRow[]> => {
    return await listFlowRuns(context.user.id)
  })

const readFlowRunFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(runSchema)
  .handler(async ({ context, data }): Promise<FlowRunReport> => {
    const report = await readFlowRun(context.user.id, data.runId)
    if (!report) throw new Error("FLOW_RUN_NOT_FOUND")
    return report
  })

const coinSchema = z.object({
  runId: z.string().max(36),
  // Refused rather than guessed at, the same way every other door that takes
  // a market does it.
  marketKey: z
    .string()
    .max(120)
    .refine((key) => parseMarketKey(key) !== null, { message: "PAPER_MARKET" }),
})

const deleteSchema = z.object({
  runIds: z.array(z.string().max(36)).max(200),
})

const deleteFlowRunsFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(deleteSchema)
  .handler(async ({ context, data }): Promise<{ deleted: string[] }> => {
    return await deleteFlowRuns(context.user.id, data.runIds)
  })

const readFlowRunCoinFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(coinSchema)
  .handler(
    async ({
      context,
      data,
    }): Promise<{ marks: LiveFillMark[]; ladders: SmartOrder[] }> => {
      const coin = await readFlowRunCoin(
        context.user.id,
        data.runId,
        data.marketKey
      )
      if (!coin) throw new Error("FLOW_RUN_NOT_FOUND")
      return coin
    }
  )

export function loadFlowRuns() {
  return listFlowRunsFn()
}

export function loadFlowRun(runId: string) {
  return readFlowRunFn({ data: { runId } })
}

export function removeFlowRuns(runIds: string[]) {
  return deleteFlowRunsFn({ data: { runIds } })
}

export function loadFlowRunCoin(runId: string, marketKey: string) {
  return readFlowRunCoinFn({ data: { runId, marketKey } })
}

export const getFlowRunErrorMessage = createErrorMessage(
  {
    PAPER_MARKET: "That is not a market this app knows.",
    FLOW_RUN_NOT_FOUND:
      "That run is not here any more. Switching a flow on writes a new one, so this may have been on a wallet that has since been deleted.",
  },
  "That did not work. Try it again in a moment."
)

export type { FlowRunListRow, FlowRunReport }
