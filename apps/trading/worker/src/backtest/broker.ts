import type { BotBroker, Placement } from "../brokers/types"
import { SimulatedBroker } from "../brokers/paper-core"
import type { BrokerFill } from "../strategies/contract"

/**
 * Deterministic execution venue for backtests. Replaces PaperBroker's live
 * L2-book/tape machinery with a candle price path: market orders fill at the
 * current path price plus slippage (taker), resting limits fill when the path
 * crosses their price (maker, no slippage). Position/cash arithmetic is the
 * shared `applyPaperFill`, so fills and P&L match the paper broker exactly.
 * No wall-clock — fill times come from the injected bar clock.
 */
export class BacktestBroker extends SimulatedBroker implements BotBroker {
  protected readonly venueTag = "bt"
  private price = 0
  private readonly slippageRate: number
  private readonly getTime: () => number

  constructor(options: {
    startingCash: number
    getTime: () => number
    onFill: (fill: BrokerFill, purpose: string, cloid: string) => void
    takerFeeRate?: number
    makerFeeRate?: number
    /** Adverse price fraction applied to taker fills (e.g. 0.0002 = 2bps). */
    slippageRate?: number
  }) {
    super(options)
    this.getTime = options.getTime
    this.slippageRate = options.slippageRate ?? 0
  }

  protected now() {
    return this.getTime()
  }

  /** Taker fill price after adverse slippage. */
  private slipped(side: "buy" | "sell", px: number): number {
    return side === "buy"
      ? px * (1 + this.slippageRate)
      : px * (1 - this.slippageRate)
  }

  start() {}
  stop() {}

  /** Advances the simulated price the broker fills against. */
  setPrice(px: number) {
    this.price = px
  }

  protected crossesMarket(side: "buy" | "sell", px: number): boolean {
    return side === "buy" ? px >= this.price : px <= this.price
  }

  protected fillTaker(
    cloid: string,
    purpose: string,
    side: "buy" | "sell",
    sz: number,
    reduceOnly: boolean
  ): Placement {
    return this.fillCapped(cloid, purpose, side, sz, reduceOnly, this.takerFeeRate, () =>
      this.slipped(side, this.price)
    )
  }

  /** Fills every resting order the given price has crossed, at its limit price (maker). */
  matchBar(px: number) {
    this.fillCrossedOrders(px)
  }
}
