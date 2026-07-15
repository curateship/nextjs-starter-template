import { pruneAlertEvents } from "@/server/alerts"

const PRUNE_INTERVAL_MS = 6 * 60 * 60_000
const RETENTION_DAYS = 30

export class TradingViewAlertRetention {
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
      await pruneAlertEvents(cutoff)
    } catch (error) {
      console.error("price alerts: retention prune failed", error)
    }
  }
}
