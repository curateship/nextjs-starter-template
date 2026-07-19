import { and, eq } from "drizzle-orm"

import type { ChartDrawings } from "@/lib/trading/chart-drawings"
import type { TradingNetwork } from "@/lib/hl/network"
import { db, type CustomShellDb } from "@/server/db"
import { tradingChartDrawings } from "@/server/schema"
import { now, uuid } from "@/server/util"

export type ChartDrawingScope = {
  network: TradingNetwork
  market: string
}

export type SaveChartDrawingsInput = ChartDrawingScope & ChartDrawings

const chartWhere = (userId: string, scope: ChartDrawingScope) =>
  and(
    eq(tradingChartDrawings.userId, userId),
    eq(tradingChartDrawings.network, scope.network),
    eq(tradingChartDrawings.market, scope.market)
  )

export async function loadUserChartDrawings(
  userId: string,
  scope: ChartDrawingScope,
  database: CustomShellDb = db
): Promise<ChartDrawings> {
  const [row] = await database
    .select({
      trendlines: tradingChartDrawings.trendlines,
      positions: tradingChartDrawings.positions,
    })
    .from(tradingChartDrawings)
    .where(chartWhere(userId, scope))
    .limit(1)
  return {
    trendlines: row?.trendlines ?? [],
    positions: row?.positions ?? [],
  }
}

export async function saveUserChartDrawings(
  userId: string,
  input: SaveChartDrawingsInput,
  database: CustomShellDb = db
): Promise<ChartDrawings> {
  // Nothing left on the chart → drop the row rather than keep an empty one.
  if (input.trendlines.length === 0 && input.positions.length === 0) {
    await database.delete(tradingChartDrawings).where(chartWhere(userId, input))
    return { trendlines: [], positions: [] }
  }

  const savedAt = now()
  const [row] = await database
    .insert(tradingChartDrawings)
    .values({
      id: uuid(),
      userId,
      network: input.network,
      market: input.market,
      trendlines: input.trendlines,
      positions: input.positions,
      createdAt: savedAt,
      updatedAt: savedAt,
    })
    .onConflictDoUpdate({
      target: [
        tradingChartDrawings.userId,
        tradingChartDrawings.network,
        tradingChartDrawings.market,
      ],
      set: {
        trendlines: input.trendlines,
        positions: input.positions,
        updatedAt: savedAt,
      },
    })
    .returning({
      trendlines: tradingChartDrawings.trendlines,
      positions: tradingChartDrawings.positions,
    })
  if (!row) throw new Error("Chart drawings were not saved")
  return row
}
