import { and, desc, eq, gt, isNull, lte, or } from "drizzle-orm"

import type { EngineUptime } from "@/lib/trade/engine-uptime"
import { db, type CustomShellDb } from "@/server/db"
import { tradeEngineOutageHistory } from "@/server/trade/schema"

export async function loadEngineUptime(
  database: CustomShellDb = db,
  at = new Date()
): Promise<EngineUptime> {
  const cutoff = new Date(at.getTime() - 30 * 86_400_000)
  const rows = await database
    .select()
    .from(tradeEngineOutageHistory)
    .where(
      and(
        eq(tradeEngineOutageHistory.kind, "ladders"),
        lte(tradeEngineOutageHistory.startedAt, at),
        or(
          isNull(tradeEngineOutageHistory.endedAt),
          gt(tradeEngineOutageHistory.endedAt, cutoff)
        )
      )
    )
    .orderBy(desc(tradeEngineOutageHistory.startedAt))
  const outages = rows.map((row) => ({
    startedAt: row.startedAt.toISOString(),
    endedAt: row.endedAt?.toISOString() ?? null,
    durationMs: Math.max(
      0,
      Math.min(row.endedAt?.getTime() ?? at.getTime(), at.getTime()) -
        row.startedAt.getTime()
    ),
  }))
  const totalDowntimeMs = rows.reduce(
    (total, row) =>
      total +
      Math.max(
        0,
        Math.min(row.endedAt?.getTime() ?? at.getTime(), at.getTime()) -
          Math.max(row.startedAt.getTime(), cutoff.getTime())
      ),
    0
  )
  return { outages, totalDowntimeMs, checkedAt: at.toISOString() }
}
