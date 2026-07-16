import { desc, sql } from "drizzle-orm"

import type { WorkerKind } from "@/lib/workers"
import { db, type CustomShellDb } from "@/server/db"
import { tradingWorkerHeartbeats } from "@/server/schema"

const ONLINE_WINDOW_MS = 30_000

export function getMarketScannerWorkerStatus(database: CustomShellDb = db) {
  return getWorkerStatus("market-scanner", database)
}

export function getAlertWorkerStatus(database: CustomShellDb = db) {
  return getWorkerStatus("alert", database)
}

async function getWorkerStatus(kind: WorkerKind, database: CustomShellDb) {
  const heartbeats = await database
    .select({
      lastSeenAt: tradingWorkerHeartbeats.lastSeenAt,
      meta: tradingWorkerHeartbeats.meta,
    })
    .from(tradingWorkerHeartbeats)
    .where(sql`${tradingWorkerHeartbeats.meta}->>'workerKind' = ${kind}`)
    .orderBy(desc(tradingWorkerHeartbeats.lastSeenAt))
    .limit(10)

  const live = heartbeats.filter(
    (heartbeat) =>
      Date.now() - heartbeat.lastSeenAt.getTime() < ONLINE_WINDOW_MS
  )
  const heartbeat =
    live.find((item) => metaOf(item.meta).role === "leader") ?? live[0]
  const workerOnline = heartbeat !== undefined
  const meta = metaOf(heartbeat?.meta)
  return {
    workerOnline,
    workerActive: workerOnline && meta.serviceActive === true,
  }
}

function metaOf(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}
