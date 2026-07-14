import { desc, sql } from "drizzle-orm"

import { db, type CustomShellDb } from "@/server/db"
import { tradingWorkerHeartbeats } from "@/server/schema"

const ONLINE_WINDOW_MS = 30_000

export async function getMarketScannerWorkerStatus(
  database: CustomShellDb = db
) {
  const [heartbeat] = await database
    .select({ lastSeenAt: tradingWorkerHeartbeats.lastSeenAt })
    .from(tradingWorkerHeartbeats)
    .where(
      sql`${tradingWorkerHeartbeats.meta}->>'workerKind' = 'market-scanner'`
    )
    .orderBy(desc(tradingWorkerHeartbeats.lastSeenAt))
    .limit(1)

  return {
    workerOnline:
      heartbeat !== undefined &&
      Date.now() - heartbeat.lastSeenAt.getTime() < ONLINE_WINDOW_MS,
  }
}
