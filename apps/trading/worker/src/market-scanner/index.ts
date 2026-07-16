import { SubscriptionClient } from "@nktkas/hyperliquid"

import { createReadOnlyWebSocketTransport } from "@/server/hyperliquid/transport"
import { getScannerInfoClient, getScannerUniverse } from "@/server/scanner/info"
import { MarketAlertEngine } from "./alert-engine"
import { MarketScannerRateLimiter } from "./rate-limiter"
import { MarketScannerRetention } from "./retention"
import { MarketTradeStream } from "./trade-stream"

/** Independent mainnet price/volume scanner for user-created market rules. */
export class MarketScannerSupervisor {
  private subClient: SubscriptionClient | null = null
  private engine: MarketAlertEngine | null = null
  private tradeStream: MarketTradeStream | null = null
  private readonly rateLimiter = new MarketScannerRateLimiter()
  private readonly retention = new MarketScannerRetention()
  private running = false

  meta() {
    return {
      ...(this.engine?.meta() ?? {
        marketScannerRules: 0,
        marketScannerCoins: 0,
      }),
      marketScannerEnabled: this.engine !== null,
      marketScannerSubscriptions: this.tradeStream?.meta().subscriptions ?? 0,
      currentActivity: this.running ? "Watching market rules" : "Idle",
    }
  }

  async start() {
    if (this.running) return
    const scannerUniverse = await getScannerUniverse()
    const scannerCoins = new Set(scannerUniverse.map((asset) => asset.coin))
    this.subClient = new SubscriptionClient({
      transport: createReadOnlyWebSocketTransport("mainnet"),
    })
    this.engine = new MarketAlertEngine(
      getScannerInfoClient(),
      this.rateLimiter
    )
    try {
      await this.engine.start()
      this.tradeStream = new MarketTradeStream(
        this.subClient,
        (trades) =>
          this.engine?.onTrades(
            trades.filter((trade) => scannerCoins.has(trade.coin))
          ),
        async () => scannerUniverse
      )
      await this.tradeStream.start()
      this.retention.start()
      this.running = true
      console.log("market scanner: started")
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
