import { lt } from "drizzle-orm"

import { db } from "@/server/db"
import { marketScannerAlerts } from "@/server/schema"

const PRUNE_INTERVAL_MS = 6 * 60 * 60_000
const RETENTION_DAYS = 30

export class MarketScannerRetention {
  private timer: NodeJS.Timeout | null = null

  start() {
    void this.prune()
    this.timer = setInterval(() => void this.prune(), PRUNE_INTERVAL_MS)
  }

  stop() {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  private async prune() {
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 86_400_000)
    try {
      await db
        .delete(marketScannerAlerts)
        .where(lt(marketScannerAlerts.occurredAt, cutoff))
    } catch (error) {
      console.error("market scanner: retention prune failed", error)
    }
  }
}
