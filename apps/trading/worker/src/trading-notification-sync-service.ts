import { syncTradingNotificationsForAllUsers } from "@/server/trading-notification-sync"

const SYNC_INTERVAL_MS = 5_000

export class TradingNotificationSyncService {
  private timer: NodeJS.Timeout | null = null
  private running = false
  private stopped = true

  async start() {
    this.stopped = false
    await this.tick()
    this.timer = setInterval(() => void this.tick(), SYNC_INTERVAL_MS)
  }

  stop() {
    this.stopped = true
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  private async tick() {
    if (this.stopped || this.running) return
    this.running = true
    try {
      await syncTradingNotificationsForAllUsers()
    } catch (error) {
      console.error("trading notification sync failed", error)
    } finally {
      this.running = false
    }
  }
}
