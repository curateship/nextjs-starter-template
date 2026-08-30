import { eq } from "drizzle-orm"

import { tradeDcaNode } from "@/lib/automations/nodes/trade-dca"
import { tradeMarketsNode } from "@/lib/automations/nodes/trade-markets"
import { tradeSignalsNode } from "@/lib/automations/nodes/trade-signals"
import { tradeGridNode } from "@/lib/automations/nodes/trade-grid"
import {
  chosenWallet,
  tradeWalletNode,
} from "@/lib/automations/nodes/trade-wallet"
import { plural } from "@/lib/format/plural"
import { db } from "@/server/db"
import {
  customShellAutomations,
  type CustomShellAutomationRun,
} from "@/server/schema"
import { startBacktestForRun } from "@/server/trade/backtest/start"
import { flowName, startFlowRun, type FlowNodes } from "@/server/trade/flow-run"
import { flowEditorNoticeHref } from "@/lib/trade/notice-links"
import { writeTradeNotice } from "@/server/trade/notices"
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

/** The trade steps off a compiled flow, or null when they are not all there. */
export function flowNodesOf(
  config: { nodes: Record<string, { kind: string; settings: unknown }> } | null
): FlowNodes | null {
  if (!config) return null
  const steps = Object.values(config.nodes)
  const wallet = steps.find((one) => one.kind === tradeWalletNode.kind)
  const markets = steps.find((one) => one.kind === tradeMarketsNode.kind)
  const dca = steps.find((one) => one.kind === tradeDcaNode.kind)
  const signals = steps.find((one) => one.kind === tradeSignalsNode.kind)
  const grid = steps.find((one) => one.kind === tradeGridNode.kind)
  if (!wallet || !markets) return null
  // Both drawn is not a flow this can read, and saying so is
  // `flowStrategyProblem`'s job — every caller asks it first.
  if ([dca, signals, grid].filter(Boolean).length > 1) return null
  if (dca) {
    return {
      wallet: wallet.settings as Record<string, unknown>,
      markets: markets.settings as Record<string, unknown>,
      strategy: {
        kind: "dca",
        settings: dca.settings as Record<string, unknown>,
      },
    }
  }
  if (signals) {
    return {
      wallet: wallet.settings as Record<string, unknown>,
      markets: markets.settings as Record<string, unknown>,
      strategy: {
        kind: "signals",
        settings: signals.settings as Record<string, unknown>,
      },
    }
  }
  if (grid) {
    return {
      wallet: wallet.settings as Record<string, unknown>,
      markets: markets.settings as Record<string, unknown>,
      strategy: {
        kind: "emaGrid",
        settings: grid.settings as Record<string, unknown>,
      },
    }
  }
  return null
}

/**
 * The one sentence about a flow drawn with more than one strategy on it.
 *
 * **Written once and asked by both paths** — switching on and back-testing —
 * because they would otherwise say two different things about the same drawing,
 * and only one of them would be the one somebody read.
 *
 * Null means there is nothing wrong with the strategy steps, which includes a
 * flow that has none of them: that is not this question.
 */
export function flowStrategyProblem(
  config: { nodes: Record<string, { kind: string; settings: unknown }> } | null
): string | null {
  if (!config) return null
  const kinds = Object.values(config.nodes).map((one) => one.kind)
  const strategies = [
    tradeDcaNode.kind,
    tradeSignalsNode.kind,
    tradeGridNode.kind,
  ].filter((kind) => kinds.includes(kind))
  if (strategies.length < 2) return null
  return "This flow has more than one strategy step. A flow trades one strategy, so delete the extra strategy step."
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

  // Asked before anything else, because it is not a complaint about the wallet
  // or the coins: it is a drawing this app cannot read either way, and both the
  // backtest and the switch-on would otherwise refuse it in their own words.
  const twoStrategies = flowStrategyProblem(flow?.compiledConfig ?? null)
  if (twoStrategies) return { summary: twoStrategies }

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
    const action =
      started.spec.strategy.kind === "emaGrid"
        ? "It waits for each coin to hold cleanly on one side of the 4-hour EMA, then places or flips its grid."
        : started.spec.strategy.kind === "signals"
          ? "It buys and sells when the saved indicators call them."
          : "It places a ladder on each coin as it finds a base."
    return {
      summary:
        `Switched on. It is watching ${coins} ${plural(coins, "coin", "coins")} on ${started.spec.walletLabel} ` +
        `with ${started.spec.real ? "real" : "practice"} money. ${action}`,
    }
  } catch (error) {
    // Every refusal reaches the person as a sentence on the step, the way every
    // other failure on this flow already does. A thrown code here would show as
    // an engine error on a screen about money.
    const problem = flowStartProblem(
      error instanceof Error ? error.message : "",
      named.label
    )
    // A run a trigger started has nobody watching the step, so the refusal
    // also goes to the bell. A run somebody pressed Run on stays as it was:
    // the sentence lands on the step in front of them.
    if (run.triggerKind) {
      try {
        await writeTradeNotice({
          userId: run.userId,
          // No run was made, so there is no run page. The flow's own canvas is
          // where the refusing step is and where switching it on again lives.
          href: flowEditorNoticeHref(run.automationId),
          title: `Flow ${await flowName(run.automationId, db)} could not start`,
          body: problem,
          level: "warning",
        })
      } catch (noticeError) {
        console.error("flow start notice failed", noticeError)
      }
    }
    return { summary: problem }
  }
}
