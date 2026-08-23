import { and, eq } from "drizzle-orm"

import { backtestSpecFromFlow } from "@/lib/trade/backtest/flow"
import { db } from "@/server/db"
import {
  customShellAutomations,
  type CustomShellAutomationRun,
} from "@/server/schema"
import { createBacktest } from "@/server/trade/backtest/store"
import { tradeBacktestGroups } from "@/server/trade/schema"
import { marketFolderForRun } from "@/server/trade/market-folders"
import {
  tradeMarketsNode,
  tradeMarketsSettingsSchema,
} from "@/lib/automations/nodes/trade-markets"

/**
 * Turning a press of Run into a backtest waiting to be worked on.
 *
 * **The flow is re-read here, from the database.** The step could have handed
 * its own settings across, and that would be one fewer read and quietly wrong:
 * a backtest is about the whole flow — the pot, the coins and the ladder
 * together — and a step only knows its own third of that. Reading the saved
 * flow is also what makes "change the flow and press Run" do what it looks like
 * it does, because Run saves the editor's pending edit before it starts
 * anything.
 *
 * Nothing is run here either. The row goes down and the background pass picks
 * it up, so pressing Run comes back straight away however many coins are named.
 */
export type StartOutcome =
  | { started: true; groupId: string; coins: number; problem: null }
  | { started: false; groupId: string | null; coins: 0; problem: string }

export async function startBacktestForRun(
  run: CustomShellAutomationRun,
  now: number
): Promise<StartOutcome> {
  if (!run.userId) {
    return {
      started: false,
      groupId: null,
      coins: 0,
      problem:
        "This flow has no owner any more, so there is nobody to save a backtest for.",
    }
  }

  // Already done. A step the engine picked up twice — after a restart, or a
  // wobble mid-write — must not leave two identical backtests behind.
  const [existing] = await db
    .select({ id: tradeBacktestGroups.id })
    .from(tradeBacktestGroups)
    .where(eq(tradeBacktestGroups.automationRunId, run.id))
  if (existing) {
    return { started: true, groupId: existing.id, coins: 0, problem: null }
  }

  const [flow] = await db
    .select({
      id: customShellAutomations.id,
      name: customShellAutomations.name,
      compiledConfig: customShellAutomations.compiledConfig,
    })
    .from(customShellAutomations)
    .where(eq(customShellAutomations.id, run.automationId))

  if (!flow?.compiledConfig) {
    return {
      started: false,
      groupId: null,
      coins: 0,
      problem:
        "This flow has a step with something wrong in it, so there is nothing to test. Fix the steps marked in red and press Run again.",
    }
  }

  const marketsStep = Object.values(flow.compiledConfig.nodes).find(
    (node) => node.kind === tradeMarketsNode.kind
  )
  const marketSettings = marketsStep
    ? tradeMarketsSettingsSchema.safeParse(marketsStep.settings)
    : null
  let resolvedFolder
  if (marketSettings?.success && marketSettings.data.folderId) {
    try {
      resolvedFolder = await marketFolderForRun(
        run.userId,
        marketSettings.data.folderId
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
  const read = backtestSpecFromFlow(flow.compiledConfig, resolvedFolder)
  if (!read.spec) {
    return { started: false, groupId: null, coins: 0, problem: read.problem }
  }

  // Every other way this can go wrong comes back as a sentence written on the
  // step, so this one has to as well. The store refuses a window with nothing
  // left in it once the far end is cut back to now — two dates that have not
  // happened yet — and it refuses by throwing, the way it refuses a mixed-up
  // list of coins. Thrown from here that would reach the person as an engine
  // error rather than as something they could act on.
  let created
  try {
    created = await createBacktest(run.userId, {
      automationId: run.automationId,
      automationName: flow.name,
      spec: read.spec,
      now,
    })
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
    throw error
  }

  await db
    .update(tradeBacktestGroups)
    .set({ automationRunId: run.id })
    .where(
      and(
        eq(tradeBacktestGroups.userId, run.userId),
        eq(tradeBacktestGroups.id, created.groupId)
      )
    )

  return {
    started: true,
    groupId: created.groupId,
    coins: created.coins,
    problem: null,
  }
}
