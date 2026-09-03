import { eq } from "drizzle-orm"

import { backtestSpecFromFlow } from "@/lib/trade/backtest/flow"
import type { RecipeCompiledConfig } from "@/lib/recipes/compile"
import { db, type CustomShellDb } from "@/server/db"
import { createBacktest } from "@/server/trade/backtest/store"
import { tradeBacktestGroups } from "@/server/trade/schema"
import { marketFolderForRun } from "@/server/trade/market-folders"
import { resolveHistorySource } from "@/server/trade/history-source"
import {
  tradeMarketsNode,
  tradeMarketsSettingsSchema,
} from "@/lib/recipes/trade-markets"

/**
 * Turning a recipe press into a backtest waiting to be worked on.
 *
 * The recipe runner re-reads the saved compiled copy before calling this. A
 * backtest therefore uses the Wallet, Markets and strategy settings that the
 * server compiled from the saved drawing, not settings sent by the browser.
 *
 * Nothing is run here either. The row goes down and the background pass picks
 * it up, so pressing Run comes back straight away however many coins are named.
 */
export type StartOutcome =
  | {
      started: true
      alreadyStarted: boolean
      groupId: string
      coins: number
      problem: null
    }
  | { started: false; groupId: string | null; coins: 0; problem: string }

export type RecipeBacktestInput = {
  recipeId: string
  recipeName: string
  compiledConfig: RecipeCompiledConfig
  idempotencyKey: string
}

/** Starts one saved recipe backtest, once for each browser press. */
export async function startBacktestForRecipe(
  userId: string,
  input: RecipeBacktestInput,
  now: number,
  database: CustomShellDb = db
): Promise<StartOutcome> {
  const [existing] = await database
    .select({ id: tradeBacktestGroups.id })
    .from(tradeBacktestGroups)
    .where(eq(tradeBacktestGroups.automationRunId, input.idempotencyKey))
  if (existing) {
    return {
      started: true,
      alreadyStarted: true,
      groupId: existing.id,
      coins: 0,
      problem: null,
    }
  }

  const marketsStep = Object.values(input.compiledConfig.nodes).find(
    (node) => node.kind === tradeMarketsNode.kind
  )
  const marketSettings = marketsStep
    ? tradeMarketsSettingsSchema.safeParse(marketsStep.settings)
    : null
  let resolvedFolder
  if (marketSettings?.success && marketSettings.data.folderId) {
    try {
      resolvedFolder = await marketFolderForRun(
        userId,
        marketSettings.data.folderId,
        database
      )
    } catch {
      return {
        started: false,
        groupId: null,
        coins: 0,
        problem: `${marketSettings.data.folderName ?? "That folder"} was deleted. Choose another folder on the Markets step.`,
      }
    }
  }
  const read = backtestSpecFromFlow(input.compiledConfig, resolvedFolder)
  if (!read.spec) {
    return { started: false, groupId: null, coins: 0, problem: read.problem }
  }
  // Every coin is tested on its history source, and once: a folder holding
  // BTC on Lighter and BTC on Aster tests Binance's BTC one time. A market
  // no source covers keeps its own key and the venue's own history.
  read.spec.markets.marketKeys = await sourceKeysFor(
    read.spec.markets.marketKeys
  )

  try {
    const created = await createBacktest(
      userId,
      {
        automationId: input.recipeId,
        automationName: input.recipeName,
        idempotencyKey: input.idempotencyKey,
        spec: read.spec,
        now,
      },
      database
    )
    return {
      started: true,
      alreadyStarted: false,
      groupId: created.groupId,
      coins: created.coins,
      problem: null,
    }
  } catch (error) {
    if (error instanceof Error && error.message === "BACKTEST_WINDOW") {
      return {
        started: false,
        groupId: null,
        coins: 0,
        problem:
          "Those dates have not happened yet, so there are no prices to test against. Pick a window that has already been and gone.",
      }
    }
    if (isUniqueViolation(error)) {
      const [duplicate] = await database
        .select({ id: tradeBacktestGroups.id })
        .from(tradeBacktestGroups)
        .where(eq(tradeBacktestGroups.automationRunId, input.idempotencyKey))
      if (duplicate) {
        return {
          started: true,
          alreadyStarted: true,
          groupId: duplicate.id,
          coins: 0,
          problem: null,
        }
      }
    }
    throw error
  }
}

async function sourceKeysFor(keys: readonly string[]): Promise<string[]> {
  const sources = await Promise.all(
    keys.map(async (key) => (await resolveHistorySource(key)) ?? key)
  )
  return [...new Set(sources)]
}

function isUniqueViolation(error: unknown): boolean {
  let current = error
  for (let depth = 0; depth < 4 && current; depth += 1) {
    if (
      typeof current === "object" &&
      "code" in current &&
      (current as { code?: string }).code === "23505"
    ) {
      return true
    }
    current =
      typeof current === "object" && "cause" in current
        ? (current as { cause?: unknown }).cause
        : null
  }
  return false
}
