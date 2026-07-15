import { SubscriptionClient } from "@nktkas/hyperliquid"

import { createReadOnlyWebSocketTransport } from "@/server/hyperliquid/transport"
import { getScannerInfoClient } from "@/server/scanner/info"
import { TradingViewAlertEngine } from "../alerts/alert-engine"
import { TradingViewAlertRetention } from "../alerts/retention"
import { MarketAlertEngine } from "./alert-engine"
import { MarketScannerRateLimiter } from "./rate-limiter"
import { MarketScannerRetention } from "./retention"
import { MarketTradeStream } from "./trade-stream"

/** Independent mainnet price/volume scanner for user-created market rules. */
export class MarketScannerSupervisor {
  private subClient: SubscriptionClient | null = null
  private engine: MarketAlertEngine | null = null
  private alertEngine: TradingViewAlertEngine | null = null
  private tradeStream: MarketTradeStream | null = null
  private readonly rateLimiter = new MarketScannerRateLimiter()
  private readonly retention = new MarketScannerRetention()
  private readonly alertRetention = new TradingViewAlertRetention()
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
      currentActivity: this.running ? "Watching market rules" : "Idle",
    }
  }

  async start() {
    if (this.running) return
    await this.startSubsystems()
  }

  async stop() {
    this.stopSubsystems()
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
    this.engine = new MarketAlertEngine(
      getScannerInfoClient(),
      this.rateLimiter
    )
    await this.engine.start()
    this.retention.start()
    this.alertRetention.start()
    this.running = true
    console.log("market scanner: started")
  }

  private stopSubsystems() {
    this.running = false
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
}
