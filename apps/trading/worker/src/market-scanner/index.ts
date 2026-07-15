import { SubscriptionClient } from "@nktkas/hyperliquid"

import { createReadOnlyWebSocketTransport } from "@/server/hyperliquid/transport"
import { getScannerInfoClient } from "@/server/scanner/info"
import { getMarketScannerRuntimeEnabled } from "@/server/market-scanner"
import { TradingViewAlertEngine } from "../alerts/alert-engine"
import { TradingViewAlertRetention } from "../alerts/retention"
import { MarketAlertEngine } from "./alert-engine"
import { MarketScannerRateLimiter } from "./rate-limiter"
import { MarketScannerRetention } from "./retention"
import { MarketTradeStream } from "./trade-stream"

const RUNTIME_CONTROL_POLL_MS = 2_000

type RuntimeEngine = {
  start: () => Promise<void>
  stop: () => void
}

export async function reconcileMarketScannerEngine<T extends RuntimeEngine>(
  current: T | null,
  enabled: boolean,
  create: () => T
): Promise<T | null> {
  if (!enabled) {
    current?.stop()
    return null
  }
  if (current) return current

  const engine = create()
  try {
    await engine.start()
    return engine
  } catch (error) {
    engine.stop()
    throw error
  }
}

/** Independent mainnet price/volume scanner for user-created market rules. */
export class MarketScannerSupervisor {
  private subClient: SubscriptionClient | null = null
  private engine: MarketAlertEngine | null = null
  private alertEngine: TradingViewAlertEngine | null = null
  private tradeStream: MarketTradeStream | null = null
  private readonly rateLimiter = new MarketScannerRateLimiter()
  private readonly retention = new MarketScannerRetention()
  private readonly alertRetention = new TradingViewAlertRetention()
  private runtimeControlTimer: NodeJS.Timeout | null = null
  private syncingRuntimeControl = false
  private running = false

  meta() {
    return {
      ...(this.engine?.meta() ?? {
        marketScannerRules: 0,
        marketScannerCoins: 0,
      }),
      marketScannerEnabled: this.engine !== null,
      ...(this.alertEngine?.meta() ?? { alertRules: 0, alertCoins: 0 }),
      ...(this.tradeStream?.meta() ?? { marketScannerSubscriptions: 0 }),
    }
  }

  async start() {
    await this.startSubsystems()
  }

  async stop() {
    if (this.running) this.stopSubsystems()
  }

  private async startSubsystems() {
    this.subClient = new SubscriptionClient({
      transport: createReadOnlyWebSocketTransport("mainnet"),
    })
    this.alertEngine = new TradingViewAlertEngine(
      getScannerInfoClient(),
      this.rateLimiter
    )
    await this.alertEngine.start()
    this.tradeStream = new MarketTradeStream(this.subClient, (trades) => {
      this.engine?.onTrades(trades)
      this.alertEngine?.onTrades(trades)
    })
    await this.tradeStream.start()
    this.retention.start()
    this.alertRetention.start()
    this.running = true
    await this.applyRuntimeControl()
    this.runtimeControlTimer = setInterval(
      () => void this.syncRuntimeControl(),
      RUNTIME_CONTROL_POLL_MS
    )
    console.log("market scanner: started")
  }

  private stopSubsystems() {
    this.running = false
    if (this.runtimeControlTimer) clearInterval(this.runtimeControlTimer)
    this.runtimeControlTimer = null
    this.alertRetention.stop()
    this.retention.stop()
    this.tradeStream?.stop()
    this.alertEngine?.stop()
    this.engine?.stop()
    this.tradeStream = null
    this.engine = null
    this.alertEngine = null
    this.subClient = null
  }

  private async applyRuntimeControl() {
    const enabled = await getMarketScannerRuntimeEnabled()
    const current = this.engine
    const next = await reconcileMarketScannerEngine(
      current,
      enabled,
      () => new MarketAlertEngine(getScannerInfoClient(), this.rateLimiter)
    )
    if (!this.running) {
      next?.stop()
      return
    }
    this.engine = next
    if ((current !== null) !== enabled) {
      console.log(`market scanner: turned ${enabled ? "on" : "off"}`)
    }
  }

  private async syncRuntimeControl() {
    if (this.syncingRuntimeControl || !this.running) return
    this.syncingRuntimeControl = true
    try {
      await this.applyRuntimeControl()
    } catch (error) {
      console.error("market scanner: runtime control check failed", error)
    } finally {
      this.syncingRuntimeControl = false
    }
  }
}
