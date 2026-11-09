import { eq } from "drizzle-orm"

import type { WidgetLayout } from "@/lib/admin-dashboard/overview-widgets"
import { readBotsWidgetLayout } from "@/lib/bots/bots-widgets"
import { buildTradingOverviewBots, type TradingOverviewBot } from "@/lib/trade/dashboard/overview"
import { db } from "@/server/trade/db"
import { listBacktests } from "@/server/trade/backtest/store"
import { listFlowRuns, listLatestFlowRuns } from "@/server/trade/flow-run-report"
import { listWorkspaceRecipes } from "@/server/trade/recipes"
import { tradePrefs } from "@/server/trade/schema"

/**
 * What the Bots dashboard reads besides its tables (9 Nov 2026): the counts
 * beside the Dashboards block's rows, and its Overview's widgets and figures.
 * Recipes belong to the workspace; backtests and bots to the person.
 */

export type BotsSectionCounts = { recipes: number; backtests: number; bots: number }

/**
 * Recipes counts every recipe, Backtests every run not archived, and Bots the
 * ones still switched on: running, waiting, paused or stopping.
 */
export async function loadBotsSectionCounts(workspaceId: string, userId: string): Promise<BotsSectionCounts> {
  const [recipes, backtests, runs] = await Promise.all([
    listWorkspaceRecipes(workspaceId, userId),
    listBacktests(userId, { includeArchived: false }),
    listFlowRuns(userId),
  ])
  return {
    recipes: recipes.length,
    backtests: backtests.length,
    bots: runs.filter((run) => run.status !== "stopped").length,
  }
}

/** The Overview's figures: the newest run of each recipe, as the Trade Overview's Running bots reads them. */
export async function loadBotsOverview(userId: string): Promise<{ bots: TradingOverviewBot[] }> {
  return { bots: buildTradingOverviewBots(await listLatestFlowRuns(userId)) }
}

/** The Bots Overview's widgets, one layout per person. Nothing saved is the starting layout. */
export async function loadBotsWidgets(userId: string): Promise<WidgetLayout> {
  const [row] = await db
    .select({ botsWidgets: tradePrefs.botsWidgets })
    .from(tradePrefs)
    .where(eq(tradePrefs.userId, userId))
    .limit(1)
  return readBotsWidgetLayout(row?.botsWidgets)
}

/** Remember the whole layout against this account, cleaned, and answer with what was stored. */
export async function saveBotsWidgets(userId: string, value: unknown): Promise<WidgetLayout> {
  const botsWidgets = readBotsWidgetLayout(value)
  await db
    .insert(tradePrefs)
    .values({ userId, botsWidgets, updatedAt: new Date() })
    .onConflictDoUpdate({ target: tradePrefs.userId, set: { botsWidgets, updatedAt: new Date() } })
  return botsWidgets
}
