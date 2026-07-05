import { lt, sql } from "drizzle-orm"

import { db } from "@/server/db"
import {
  scannerAlerts,
  scannerCrowdSignals,
  scannerPositionEvents,
  scannerTrades,
} from "@/server/schema"

const PRUNE_INTERVAL_MS = 6 * 60 * 60_000
const RETENTION_DAYS = 30

/**
 * Prunes raw scanner data past the 30-day retention window. Daily per-wallet
 * rollups (scanner_wallet_daily) are kept forever.
 */
export class Retention {
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
      const trades = await db
        .delete(scannerTrades)
        .where(lt(scannerTrades.ts, cutoff))
        .returning({ id: sql`1` })
      await db
        .delete(scannerPositionEvents)
        .where(lt(scannerPositionEvents.ts, cutoff))
      await db.delete(scannerAlerts).where(lt(scannerAlerts.createdAt, cutoff))
      await db
        .delete(scannerCrowdSignals)
        .where(lt(scannerCrowdSignals.createdAt, cutoff))
      if (trades.length > 0) {
        console.log(`scanner: pruned ${trades.length} trades past ${RETENTION_DAYS}d`)
      }
    } catch (error) {
      console.error("scanner: retention prune failed", error)
    }
  }
}
