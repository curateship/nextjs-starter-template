import { SubscriptionClient } from "@nktkas/hyperliquid"

import { getActivePerpMarkets } from "@/server/hyperliquid/info"
import { createReadOnlyWebSocketTransport } from "@/server/hyperliquid/transport"
import { getScannerInfoClient } from "@/server/scanner/info"
import { MarketScannerRateLimiter } from "../market-scanner/rate-limiter"
import { MarketTradeStream } from "../market-scanner/trade-stream"
import { TradingViewAlertEngine } from "./alert-engine"
import { TradingViewAlertRetention } from "./retention"

/** Owns the live market feed and evaluation lifecycle for Trade chart alerts. */
export class AlertSupervisor {
  private subClient: SubscriptionClient | null = null
  private engine: TradingViewAlertEngine | null = null
  private tradeStream: MarketTradeStream | null = null
  private readonly rateLimiter = new MarketScannerRateLimiter()
  private readonly retention = new TradingViewAlertRetention()
  private running = false

  meta() {
    return {
      ...(this.engine?.meta() ?? { alertRules: 0, alertCoins: 0 }),
      alertSubscriptions: this.tradeStream?.meta().subscriptions ?? 0,
      currentActivity: this.running ? "Watching Trade alerts" : "Idle",
    }
  }

  async start() {
    if (this.running) return
    const universe = await getActivePerpMarkets("mainnet")
    this.subClient = new SubscriptionClient({
      transport: createReadOnlyWebSocketTransport("mainnet"),
    })
    this.engine = new TradingViewAlertEngine(
      getScannerInfoClient(),
      this.rateLimiter
    )
    try {
      await this.engine.start()
      this.tradeStream = new MarketTradeStream(
        this.subClient,
        (trades) => this.engine?.onTrades(trades),
        async () => universe,
        "alert worker"
      )
      await this.tradeStream.start()
      this.retention.start()
      this.running = true
      console.log("alert worker: started")
    } catch (error) {
      await this.stop()
      throw error
    }
  }

  async stop() {
    this.running = false
    this.retention.stop()
    this.tradeStream?.stop()
    this.engine?.stop()
    this.tradeStream = null
    this.engine = null
    this.subClient = null
  }
}
