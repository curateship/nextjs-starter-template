import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { automationGraphSchema } from "@/lib/automations/graph"
import {
  tradeMarketsNode,
  tradeMarketsSettingsSchema,
} from "@/lib/automations/nodes/trade-markets"
import { chosenWallet } from "@/lib/automations/nodes/trade-wallet"
import { getWorkspaceAutomation } from "@/server/automations/flows"
import { adminGet } from "@/server/guards"
import { findWallet } from "@/server/trade/wallets"
import { workspaceIdForRequest } from "@/server/workspaces/for-request"

import { createErrorMessage } from "./error-message"

/**
 * What a flow is set up to do, asked from the canvas.
 *
 * **Why this exists.** A step's card on the canvas is drawn from that step's
 * own settings and nothing else, so no single step can say what the flow as a
 * whole is for. The panel under the Run button can, because it is handed the
 * flow's id — and that is exactly where somebody is looking when they press
 * Run and wonder what just happened.
 *
 * Read-only. Nothing here starts, stops or changes anything.
 */

/** What one flow is for, and whether it could actually do it. */
export type FlowTrading =
  | { mode: "backtest" }
  | {
      mode: "trades"
      walletLabel: string
      /** True for real money, false for a practice wallet. */
      real: boolean
      capUsd: number | null
      coins: number
      /** Why it could not run as it stands, in plain words, or null. */
      problem: string | null
    }

const flowSchema = z.object({ automationId: z.string().max(36) })

const loadFlowTradingFn = createServerFn({ method: "GET" })
  // Scoped exactly like the screen it serves.
  //
  // The editor reads a flow through `adminGet` and the workspace it belongs to
  // — not by who happened to draw it. Matching that matters: a flow somebody
  // else in the workspace set up to spend real money would otherwise come back
  // as "backtest" here, and this panel is the one place that says out loud that
  // Run will not test it.
  .middleware([adminGet])
  .inputValidator(flowSchema)
  .handler(async ({ data, context }): Promise<FlowTrading> => {
    const row = await getWorkspaceAutomation(
      await workspaceIdForRequest(context.user.id),
      data.automationId
    )

    // The drawing, not the compiled copy.
    //
    // A flow only compiles when every step is complete, and the compiled copy
    // is simply left behind when it is not — so a flow somebody has just moved
    // onto a wallet, which clears the coin list, stops compiling and would
    // report its OLD mode here for as long as it stayed that way. That is the
    // exact moment this panel most needs to be right.
    const parsed = automationGraphSchema.safeParse(row?.graph)
    if (!parsed.success) return { mode: "backtest" }

    const steps = parsed.data.nodes
    const walletStep = steps.find((one) => one.kind === "tradeWallet")
    const named = walletStep ? chosenWallet(walletStep.settings) : null
    if (!named) return { mode: "backtest" }

    const marketStep = steps.find((one) => one.kind === tradeMarketsNode.kind)
    const markets = marketStep
      ? tradeMarketsSettingsSchema.safeParse(marketStep.settings)
      : null
    const coins = markets?.success ? markets.data.marketKeys.length : 0

    // Checked against the database rather than against the copy on the step,
    // because the copy is only ever for drawing and this answer is about
    // whether the flow could really run.
    //
    // Wallets belong to a person, not to the workspace, so this is the one
    // thing still asked as "mine": somebody else's flow may name a wallet this
    // reader cannot see, and the honest answer to that is the same as for a
    // deleted one — it says so rather than guessing.
    const wallet = await findWallet(context.user.id, named.id)
    const problem = ((): string | null => {
      if (!wallet) {
        return `${named.label} has been deleted, so this flow has nothing to trade.`
      }
      if (wallet.status !== "active") {
        return `${wallet.label} is switched off. Make it active in the account panel.`
      }
      if (wallet.kind === "live" && !wallet.hasKey) {
        return `${wallet.label} has no trading key saved, so it cannot place an order.`
      }
      if (coins === 0) {
        return "No coins are chosen on the Markets step yet."
      }
      if (
        markets?.success &&
        markets.data.protocol !== wallet.protocol
      ) {
        return `The coins are from ${markets.data.protocol}, which ${wallet.label} cannot trade.`
      }
      if (named.capUsd === null) {
        return "Say how much of the wallet this flow may use, on the Wallet step."
      }
      return null
    })()

    return {
      mode: "trades",
      walletLabel: wallet?.label ?? named.label,
      real: (wallet?.kind ?? named.kind) === "live",
      capUsd: named.capUsd,
      coins,
      problem,
    }
  })

export function loadFlowTrading(automationId: string) {
  return loadFlowTradingFn({ data: { automationId } })
}

export const getFlowTradingErrorMessage = createErrorMessage(
  {},
  "Could not read what this flow is set up to do."
)
