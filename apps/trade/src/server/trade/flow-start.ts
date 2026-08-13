import { eq } from "drizzle-orm"

import { chosenWallet } from "@/lib/automations/nodes/trade-wallet"
import { plural } from "@/lib/format/plural"
import { formatUsd } from "@/lib/trade/format"
import { db } from "@/server/db"
import {
  customShellAutomations,
  type CustomShellAutomationRun,
} from "@/server/schema"
import { startBacktestForRun } from "@/server/trade/backtest/start"
import { startFlowRun, type FlowNodes } from "@/server/trade/flow-run"
import { flowStartProblem } from "@/lib/trade/flow-words"

/**
 * What pressing Run on a trading flow does — and it is one of two things.
 *
 * The whole fork lives here rather than in the step's executor, so the executor
 * stays the one-line hand-over it already was. No wallet named and this is the
 * backtest it has always been. A wallet named and there is nothing to test: the
 * flow is switched on to trade instead.
 *
 * Like the backtest starter, it re-reads the saved flow rather than trusting
 * the settings the engine handed the step. The thing that spends money reads
 * the saved truth.
 */

export type RunOutcome = {
  /** Words for the step's own row in the run history. Always said. */
  summary: string
}

/** The three trade steps off a compiled flow, or null when they are not all there. */
export function flowNodesOf(
  config: { nodes: Record<string, { kind: string; settings: unknown }> } | null
): FlowNodes | null {
  if (!config) return null
  const steps = Object.values(config.nodes)
  const wallet = steps.find((one) => one.kind === "tradeWallet")
  const markets = steps.find((one) => one.kind === "tradeMarkets")
  const dca = steps.find((one) => one.kind === "tradeDca")
  if (!wallet || !markets || !dca) return null
  return {
    wallet: wallet.settings as Record<string, unknown>,
    markets: markets.settings as Record<string, unknown>,
    dca: dca.settings as Record<string, unknown>,
  }
}

export async function runTradeFlow(
  run: CustomShellAutomationRun,
  now: number
): Promise<RunOutcome> {
  if (!run.userId) {
    return {
      summary:
        "This flow has no owner any more, so there is nobody to run it for.",
    }
  }

  const [flow] = await db
    .select({ compiledConfig: customShellAutomations.compiledConfig })
    .from(customShellAutomations)
    .where(eq(customShellAutomations.id, run.automationId))

  const nodes = flowNodesOf(flow?.compiledConfig ?? null)
  const named = nodes ? chosenWallet(nodes.wallet) : null

  // No wallet named: the backtest this flow has always been, untouched.
  if (!named || !nodes) {
    const outcome = await startBacktestForRun(run, now)
    if (!outcome.started) return { summary: outcome.problem }
    return {
      summary: `Backtest started over ${outcome.coins} ${plural(outcome.coins, "coin", "coins")}. It carries on in the background; the result appears on this step when it finishes.`,
    }
  }

  try {
    const started = await startFlowRun(run.userId, {
      automationId: run.automationId,
      nodes,
      now,
    })
    const coins = started.spec.marketKeys.length
    return {
      summary:
        `Switched on. It is watching ${coins} ${plural(coins, "coin", "coins")} on ${started.spec.walletLabel} ` +
        `with up to ${formatUsd(started.spec.capUsd)} of ${started.spec.real ? "real" : "practice"} money, ` +
        "and places a ladder on each one as it finds a base. It keeps going with nothing open.",
    }
  } catch (error) {
    // Every refusal reaches the person as a sentence on the step, the way every
    // other failure on this flow already does. A thrown code here would show as
    // an engine error on a screen about money.
    return {
      summary: flowStartProblem(
        error instanceof Error ? error.message : "",
        named.label
      ),
    }
  }
}
