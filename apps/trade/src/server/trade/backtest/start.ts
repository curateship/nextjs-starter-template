import { and, eq, inArray } from "drizzle-orm"
import { createHash } from "node:crypto"
import {
  CANDLE_INTERVALS,
  type CandleInterval,
} from "@/lib/protocols/contracts"

import {
  backtestSpecFromFlow,
  type BacktestSpec,
} from "@/lib/trade/backtest/flow"
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
      groupIds: string[]
      coins: number
      problem: null
    }
  | { started: false; groupId: string | null; coins: 0; problem: string }

export type RecipeBacktestInput = {
  recipeId: string
  recipeName: string
  compiledConfig: RecipeCompiledConfig
  idempotencyKey: string
  intervals?: CandleInterval[]
}

/** Starts one saved recipe backtest, once for each browser press. */
export async function startBacktestForRecipe(
  userId: string,
  input: RecipeBacktestInput,
  now: number,
  database: CustomShellDb = db
): Promise<StartOutcome> {
  const selected =
    input.intervals === undefined ? undefined : [...new Set(input.intervals)]
  if (
    selected &&
    (selected.length === 0 ||
      selected.some((size) => !CANDLE_INTERVALS.includes(size)))
  ) {
    return {
      started: false,
      groupId: null,
      coins: 0,
      problem: "Choose at least one supported candle size.",
    }
  }
  const keyFor = (interval: CandleInterval) => {
    const hex = createHash("sha256")
      .update(
        JSON.stringify([userId, input.recipeId, input.idempotencyKey, interval])
      )
      .digest("hex")
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
  }
  // Read every possible size so retrying the press cannot add a changed selection.
  const pressKeys = [input.idempotencyKey, ...CANDLE_INTERVALS.map(keyFor)]
  const findExisting = () =>
    database
      .select({ id: tradeBacktestGroups.id })
      .from(tradeBacktestGroups)
      .where(
        and(
          eq(tradeBacktestGroups.userId, userId),
          eq(tradeBacktestGroups.automationId, input.recipeId),
          inArray(tradeBacktestGroups.automationRunId, pressKeys)
        )
      )
  const existing = await findExisting()
  if (existing.length) {
    return {
      started: true,
      alreadyStarted: true,
      groupId: existing[0].id,
      groupIds: existing.map((row) => row.id),
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
  const specs: BacktestSpec[] = []
  for (const interval of selected ?? [undefined]) {
    const read = backtestSpecFromFlow(
      input.compiledConfig,
      resolvedFolder,
      interval
    )
    if (!read.spec) {
      return {
        started: false,
        groupId: null,
        coins: 0,
        problem: interval ? `${interval}: ${read.problem}` : read.problem,
      }
    }
    specs.push(read.spec)
  }
  const keys = await sourceKeysFor(specs[0].markets.marketKeys)
  for (const spec of specs) spec.markets.marketKeys = keys

  try {
    // A failed insert or invalid window rolls the whole set back.
    const created = await database.transaction(async (tx) => {
      const groups = []
      for (const spec of specs) {
        groups.push(
          await createBacktest(
            userId,
            {
              automationId: input.recipeId,
              automationName: input.recipeName,
              name: selected
                ? `${input.recipeName}, ${spec.interval}`
                : undefined,
              idempotencyKey: selected
                ? keyFor(spec.interval)
                : input.idempotencyKey,
              spec,
              now,
            },
            tx
          )
        )
      }
      return groups
    })
    return {
      started: true,
      alreadyStarted: false,
      groupId: created[0].groupId,
      groupIds: created.map((row) => row.groupId),
      coins: created[0].coins,
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
      const duplicates = await findExisting()
      if (duplicates.length) {
        return {
          started: true,
          alreadyStarted: true,
          groupId: duplicates[0].id,
          groupIds: duplicates.map((row) => row.id),
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
