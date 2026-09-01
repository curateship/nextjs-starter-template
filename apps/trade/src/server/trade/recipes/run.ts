import { and, eq } from "drizzle-orm"

import { tradeDcaNode } from "@/lib/recipes/trade-dca"
import { tradeGridNode } from "@/lib/recipes/trade-grid"
import { tradeMarketsNode } from "@/lib/recipes/trade-markets"
import { tradeSignalsNode } from "@/lib/recipes/trade-signals"
import { chosenWallet, tradeWalletNode } from "@/lib/recipes/trade-wallet"
import { recipeCompiledConfigSchema } from "@/lib/recipes/compile"
import { plural } from "@/lib/format/plural"
import { flowStartProblem } from "@/lib/trade/flow-words"
import { db, type CustomShellDb } from "@/server/db"
import { startBacktestForRecipe } from "@/server/trade/backtest/start"
import { startFlowRun, type FlowNodes } from "@/server/trade/flow-run"
import { tradeRecipes } from "@/server/trade/schema"

export type RecipeRunOutcome = {
  started: boolean
  mode: "backtest" | "trades"
  summary: string
}

type RecipeRunInput = {
  workspaceId: string
  recipeId: string
  pressId: string
  now: number
}

/** The Trade steps in a compiled recipe, or null when the set is incomplete. */
export function flowNodesOf(
  config: {
    nodes: Record<string, { kind: string; settings: unknown }>
    edges: Array<{ from: string; sourcePort: string; to: string }>
  } | null
): FlowNodes | null {
  if (!config) return null
  const steps = Object.entries(config.nodes)
  const wallets = steps.filter(([, step]) => step.kind === tradeWalletNode.kind)
  const marketsSteps = steps.filter(
    ([, step]) => step.kind === tradeMarketsNode.kind
  )
  const strategies = steps.filter(([, step]) =>
    [tradeDcaNode.kind, tradeSignalsNode.kind, tradeGridNode.kind].includes(
      step.kind
    )
  )
  if (
    wallets.length !== 1 ||
    marketsSteps.length !== 1 ||
    strategies.length !== 1
  ) {
    return null
  }

  const [walletId, wallet] = wallets[0]
  const [marketsId, markets] = marketsSteps[0]
  const [strategyId, strategy] = strategies[0]
  const connected = (from: string, to: string) =>
    config.edges.some(
      (edge) =>
        edge.from === from && edge.sourcePort === "then" && edge.to === to
    )
  if (!connected(walletId, marketsId) || !connected(marketsId, strategyId)) {
    return null
  }

  if (strategy.kind === tradeDcaNode.kind) {
    return {
      wallet: wallet.settings as Record<string, unknown>,
      markets: markets.settings as Record<string, unknown>,
      strategy: {
        kind: "dca",
        settings: strategy.settings as Record<string, unknown>,
      },
    }
  }
  if (strategy.kind === tradeSignalsNode.kind) {
    return {
      wallet: wallet.settings as Record<string, unknown>,
      markets: markets.settings as Record<string, unknown>,
      strategy: {
        kind: "signals",
        settings: strategy.settings as Record<string, unknown>,
      },
    }
  }
  if (strategy.kind === tradeGridNode.kind) {
    return {
      wallet: wallet.settings as Record<string, unknown>,
      markets: markets.settings as Record<string, unknown>,
      strategy: {
        kind: "emaGrid",
        settings: strategy.settings as Record<string, unknown>,
      },
    }
  }
  return null
}

/** One sentence for the recipe shape that cannot choose a single strategy. */
export function flowStrategyProblem(
  config: { nodes: Record<string, { kind: string; settings: unknown }> } | null
): string | null {
  if (!config) return null
  const strategies = Object.values(config.nodes).filter((step) =>
    [tradeDcaNode.kind, tradeSignalsNode.kind, tradeGridNode.kind].includes(
      step.kind
    )
  )
  if (strategies.length < 2) return null
  return "This recipe has more than one strategy step. A recipe trades one strategy, so delete the extra strategy step."
}

/** Runs the freshly saved recipe, never a client copy of its settings. */
export async function runWorkspaceRecipe(
  userId: string,
  input: RecipeRunInput,
  database: CustomShellDb = db
): Promise<RecipeRunOutcome> {
  return database.transaction((tx) =>
    runLockedWorkspaceRecipe(userId, input, tx)
  )
}

async function runLockedWorkspaceRecipe(
  userId: string,
  input: RecipeRunInput,
  database: CustomShellDb
): Promise<RecipeRunOutcome> {
  const [recipe] = await database
    .select({
      name: tradeRecipes.name,
      compiledConfig: tradeRecipes.compiledConfig,
    })
    .from(tradeRecipes)
    .where(
      and(
        eq(tradeRecipes.id, input.recipeId),
        eq(tradeRecipes.workspaceId, input.workspaceId)
      )
    )
    .limit(1)
    .for("update")
  if (!recipe) throw new Error("NOT_FOUND")

  const compiled = recipeCompiledConfigSchema.safeParse(recipe.compiledConfig)
  if (!compiled.success) {
    return {
      started: false,
      mode: "backtest",
      summary:
        "This recipe has a step with something wrong in it, so there is nothing to run. Fix the steps marked in red and try again.",
    }
  }

  const strategyProblem = flowStrategyProblem(compiled.data)
  if (strategyProblem) {
    return { started: false, mode: "backtest", summary: strategyProblem }
  }

  const nodes = flowNodesOf(compiled.data)
  const namedWallet = nodes ? chosenWallet(nodes.wallet) : null
  if (!nodes || !namedWallet) {
    const outcome = await startBacktestForRecipe(
      userId,
      {
        recipeId: input.recipeId,
        recipeName: recipe.name,
        compiledConfig: compiled.data,
        idempotencyKey: input.pressId,
      },
      input.now,
      database
    )
    if (!outcome.started) {
      return { started: false, mode: "backtest", summary: outcome.problem }
    }
    if (outcome.alreadyStarted) {
      return {
        started: true,
        mode: "backtest",
        summary: "That backtest already started.",
      }
    }
    return {
      started: true,
      mode: "backtest",
      summary: `Backtest started over ${outcome.coins} ${plural(outcome.coins, "coin", "coins")}. It carries on in the background.`,
    }
  }

  try {
    const started = await startFlowRun(
      userId,
      { automationId: input.recipeId, nodes, now: input.now },
      database
    )
    const coins = started.spec.marketKeys.length
    return {
      started: true,
      mode: "trades",
      summary: `Switched on. It is watching ${coins} ${plural(coins, "coin", "coins")} on ${started.spec.walletLabel} with ${started.spec.real ? "real" : "practice"} money.`,
    }
  } catch (error) {
    return {
      started: false,
      mode: "trades",
      summary: flowStartProblem(
        error instanceof Error ? error.message : "",
        namedWallet.label
      ),
    }
  }
}
