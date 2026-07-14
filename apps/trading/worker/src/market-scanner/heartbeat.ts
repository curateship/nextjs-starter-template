import { sql } from "drizzle-orm"

import { db } from "@/server/db"
import { tradingWorkerHeartbeats } from "@/server/schema"

const HEARTBEAT_INTERVAL_MS = 10_000

export class MarketScannerHeartbeat {
  private timer: NodeJS.Timeout | null = null
  private readonly startedAt = new Date()
  private readonly workerId: string
  private readonly getMeta: () => Record<string, unknown>

  constructor(workerId: string, getMeta: () => Record<string, unknown>) {
    this.workerId = workerId
    this.getMeta = getMeta
  }

  start() {
    void this.beat()
    this.timer = setInterval(() => void this.beat(), HEARTBEAT_INTERVAL_MS)
  }

  stop() {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  private async beat() {
    try {
      await db
        .insert(tradingWorkerHeartbeats)
        .values({
          id: this.workerId,
          startedAt: this.startedAt,
          lastSeenAt: new Date(),
          version: "market-scanner-1",
          meta: { workerKind: "market-scanner", ...this.getMeta() },
        })
        .onConflictDoUpdate({
          target: tradingWorkerHeartbeats.id,
          set: {
            lastSeenAt: sql`excluded.last_seen_at`,
            meta: sql`excluded.meta`,
          },
        })
    } catch (error) {
      console.error("market scanner: heartbeat failed", error)
    }
  }
}
