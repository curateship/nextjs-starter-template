import { SubscriptionClient } from "@nktkas/hyperliquid"

import { createReadOnlyWebSocketTransport } from "@/server/hyperliquid/transport"
import { getScannerInfoClient } from "@/server/scanner/info"
import { isScannerPaused } from "@/server/scanner/control"
import { BookWatcher } from "./book-watcher"
import { CrowdDetector } from "./crowd-detector"
import { PositionTracker } from "./position-tracker"
import { TokenBucket } from "./rate-limiter"
import { Retention } from "./retention"
import { TradeCollector } from "./trade-collector"
import { WalletStatsRefresher } from "./wallet-stats"

const CONTROL_POLL_MS = 10_000

/**
 * Research scanner: read-only mainnet market surveillance. Runs inside the
 * worker's leader lock, gated by SCANNER_ENABLED=true. Trading (signing)
 * stays testnet — the scanner never touches keys.
 *
 * A control loop polls the `scanner_control.paused` flag so the scanner can
 * be paused/resumed from the UI without a worker restart.
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
  private stopped = false
  private syncing = false
  private controlTimer: NodeJS.Timeout | null = null

  meta() {
    return {
      scannerPaused: !this.running,
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
    this.stopped = false
    await this.syncWithControl()
    this.controlTimer = setInterval(
      () => void this.syncWithControl(),
      CONTROL_POLL_MS
    )
  }

  async stop() {
    this.stopped = true
    if (this.controlTimer) clearInterval(this.controlTimer)
    this.controlTimer = null
    if (this.running) await this.stopSubsystems()
  }

  /** Reconciles running subsystems with the DB pause flag. */
  private async syncWithControl() {
    if (this.syncing || this.stopped) return
    this.syncing = true
    try {
      const paused = await isScannerPaused()
      if (paused && this.running) {
        await this.stopSubsystems()
        console.log("scanner: paused")
      } else if (!paused && !this.running) {
        await this.startSubsystems()
      }
    } catch (error) {
      console.error("scanner: control check failed", error)
    } finally {
      this.syncing = false
    }
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
      `scanner: started (min trade notional $${minNotional.toLocaleString("en-US")})`
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
