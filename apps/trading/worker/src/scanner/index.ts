import { SubscriptionClient } from "@nktkas/hyperliquid"

import { createReadOnlyWebSocketTransport } from "@/server/hyperliquid/transport"
import { getScannerInfoClient } from "@/server/scanner/info"
import { BookWatcher } from "./book-watcher"
import { CrowdDetector } from "./crowd-detector"
import { PositionTracker } from "./position-tracker"
import { TokenBucket } from "./rate-limiter"
import { Retention } from "./retention"
import { TradeCollector } from "./trade-collector"
import { WalletStatsRefresher } from "./wallet-stats"

/**
 * Whale Scanner: read-only mainnet market surveillance. It runs in its own
 * process and never touches trading keys or the Bot worker.
 */
export class ScannerSupervisor {
  private subClient: SubscriptionClient | null = null
  private collector: TradeCollector | null = null
  private statsRefresher: WalletStatsRefresher | null = null
  private positionTracker: PositionTracker | null = null
  private bookWatcher: BookWatcher | null = null
  private readonly crowdDetector = new CrowdDetector()
  private readonly retention = new Retention()
  private readonly restBucket = new TokenBucket(600)
  private running = false

  meta() {
    return {
      currentActivity: this.running ? "Collecting whale activity" : "Idle",
      ...(this.collector?.meta() ?? { subscriptions: 0, tradesCollected: 0 }),
      ...(this.statsRefresher?.meta() ?? { statsRefreshed: 0 }),
      ...(this.positionTracker?.meta() ?? {
        positionEvents: 0,
        positionQueue: 0,
      }),
      ...this.crowdDetector.meta(),
      ...(this.bookWatcher?.meta() ?? { bookCoins: 0 }),
    }
  }

  async start() {
    if (this.running) return
    await this.startSubsystems()
  }

  async stop() {
    await this.stopSubsystems()
  }

  private async startSubsystems() {
    const minNotional = Number(
      process.env.SCANNER_MIN_TRADE_NOTIONAL_USD ?? "25000"
    )
    this.subClient = new SubscriptionClient({
      transport: createReadOnlyWebSocketTransport("mainnet"),
    })
    this.collector = new TradeCollector(this.subClient, minNotional)
    await this.collector.start()
    this.statsRefresher = new WalletStatsRefresher(
      getScannerInfoClient(),
      this.restBucket
    )
    this.statsRefresher.start()
    this.positionTracker = new PositionTracker(
      getScannerInfoClient(),
      this.restBucket
    )
    this.positionTracker.start()
    this.collector.onActivity = (takers) =>
      this.positionTracker?.enqueue(takers)
    this.crowdDetector.start()
    this.bookWatcher = new BookWatcher(this.subClient)
    await this.bookWatcher.start()
    this.retention.start()
    this.running = true
    console.log(
      `whale scanner: started (min trade notional $${minNotional.toLocaleString("en-US")})`
    )
  }

  private async stopSubsystems() {
    this.running = false
    this.retention.stop()
    this.crowdDetector.stop()
    this.bookWatcher?.stop()
    this.positionTracker?.stop()
    await this.statsRefresher?.stop()
    await this.collector?.stop()
    this.bookWatcher = null
    this.positionTracker = null
    this.statsRefresher = null
    this.collector = null
    this.subClient = null
  }
}
