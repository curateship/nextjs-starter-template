import { sql } from "drizzle-orm"

import { safeWorkerError, type WorkerKind } from "@/lib/workers"
import { db } from "@/server/db"
import { tradingWorkerHeartbeats } from "@/server/schema"

const HEARTBEAT_INTERVAL_MS = 10_000

export class WorkerHeartbeat {
  private timer: NodeJS.Timeout | null = null
  private readonly startedAt = new Date()
  private readonly workerId: string
  private readonly kind: WorkerKind
  private readonly version: string
  private readonly getMeta: () => Record<string, unknown>

  constructor(
    workerId: string,
    kind: WorkerKind,
    version: string,
    getMeta: () => Record<string, unknown>
  ) {
    this.workerId = workerId
    this.kind = kind
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
      const meta = this.getMeta()
      await db
        .insert(tradingWorkerHeartbeats)
        .values({
          id: this.workerId,
          startedAt: this.startedAt,
          lastSeenAt: new Date(),
          version: this.version,
          meta: {
            ...meta,
            workerKind: this.kind,
            latestError: safeWorkerError(meta.latestError),
          },
        })
        .onConflictDoUpdate({
          target: tradingWorkerHeartbeats.id,
          set: {
            lastSeenAt: sql`excluded.last_seen_at`,
            meta: sql`excluded.meta`,
          },
        })
    } catch (error) {
      console.error(`${this.kind} worker: heartbeat failed`, error)
    }
  }
}
