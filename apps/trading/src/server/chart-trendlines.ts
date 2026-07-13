import { and, eq } from "drizzle-orm"

import type { TradingNetwork } from "@/lib/hl/network"
import type { Trendline } from "@/lib/trading/trendlines"
import { db, type CustomShellDb } from "@/server/db"
import { tradingChartTrendlines } from "@/server/schema"
import { now, uuid } from "@/server/util"

export type ChartTrendlineScope = {
  network: TradingNetwork
  market: string
}

export type SaveChartTrendlinesInput = ChartTrendlineScope & {
  trendlines: Trendline[]
}

const chartWhere = (userId: string, scope: ChartTrendlineScope) =>
  and(
    eq(tradingChartTrendlines.userId, userId),
    eq(tradingChartTrendlines.network, scope.network),
    eq(tradingChartTrendlines.market, scope.market)
  )

export async function loadUserChartTrendlines(
  userId: string,
  scope: ChartTrendlineScope,
  database: CustomShellDb = db
): Promise<Trendline[]> {
  const [row] = await database
    .select({ trendlines: tradingChartTrendlines.trendlines })
    .from(tradingChartTrendlines)
    .where(chartWhere(userId, scope))
    .limit(1)
  return row?.trendlines ?? []
}

export async function saveUserChartTrendlines(
  userId: string,
  input: SaveChartTrendlinesInput,
  database: CustomShellDb = db
): Promise<Trendline[]> {
  if (input.trendlines.length === 0) {
    await database
      .delete(tradingChartTrendlines)
      .where(chartWhere(userId, input))
    return []
  }

  const savedAt = now()
  const values = {
    userId,
    network: input.network,
    market: input.market,
    trendlines: input.trendlines,
    updatedAt: savedAt,
  }
  const [row] = await database
    .insert(tradingChartTrendlines)
    .values({ ...values, id: uuid(), createdAt: savedAt })
    .onConflictDoUpdate({
      target: [
        tradingChartTrendlines.userId,
        tradingChartTrendlines.network,
        tradingChartTrendlines.market,
      ],
      set: { trendlines: input.trendlines, updatedAt: savedAt },
    })
    .returning({ trendlines: tradingChartTrendlines.trendlines })
  if (!row) throw new Error("Chart trendlines were not saved")
  return row.trendlines
}
