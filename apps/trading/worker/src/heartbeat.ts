import { sql } from "drizzle-orm"

import { db } from "@/server/db"
import { tradingWorkerHeartbeats } from "@/server/schema"

const HEARTBEAT_INTERVAL_MS = 10_000

export type HeartbeatMeta = {
  runningBots: number
  subscriptions: number
}

export class Heartbeat {
  private timer: NodeJS.Timeout | null = null
  private readonly startedAt = new Date()
  private readonly workerId: string
  private readonly version: string
  private readonly getMeta: () => HeartbeatMeta

  constructor(
    workerId: string,
    version: string,
    getMeta: () => HeartbeatMeta
  ) {
    this.workerId = workerId
    this.version = version
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
          version: this.version,
          meta: this.getMeta(),
        })
        .onConflictDoUpdate({
          target: tradingWorkerHeartbeats.id,
          set: {
            lastSeenAt: sql`excluded.last_seen_at`,
            meta: sql`excluded.meta`,
          },
        })
    } catch (error) {
      console.error("heartbeat failed", error)
    }
  }
}
