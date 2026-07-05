import { and, eq, inArray } from "drizzle-orm"
import pg from "pg"

import { MAKER_FEE_RATE, TAKER_FEE_RATE } from "@/lib/order-preview"
import { db, getDatabaseUrl } from "@/server/db"
import { getDefaultNetwork } from "@/server/hyperliquid/transport"
import {
  tradingPaperFills,
  tradingPaperOrders,
  tradingPaperPositions,
  tradingPaperWallets,
  type TradingPaperOrder,
} from "@/server/schema"
import { now, uuid } from "@/server/util"

import { marketHub, type MarketHub } from "./market-hub"
import {
  applyPaperFill,
  capReduceOnly,
  walkBookDepth,
  type PaperPositionState,
} from "./paper-math"

export const PAPER_ORDER_CHANNEL = "paper_orders"
const POLL_INTERVAL_MS = 5_000
// The public l2Book stream pushes roughly every 5s; wait past one full push.
const BOOK_WAIT_MS = 8_000

type CoinFeed = {
  refCount: number
  book: { px: string; sz: string }[][] | null
  unsubscribers: (() => void)[]
}

/**
 * Executes manual Paper Wallet orders for the trading dashboard. One engine
 * serves every paper wallet: market orders fill by walking live book depth,
 * resting limits fill when the tape prints through, and everything persists
 * to paper_* tables so state survives restarts and closed tabs.
 */
export class PaperAccountEngine {
  private client: pg.Client | null = null
  private timer: NodeJS.Timeout | null = null
  private stopped = false
  private draining = false
  private readonly hub: MarketHub
  private readonly feeds = new Map<string, CoinFeed>()
  /** Resting orders in memory, keyed by order id. */
  private readonly resting = new Map<string, TradingPaperOrder>()
  private unsubscribeMids: (() => void) | null = null

  constructor(hub: MarketHub = marketHub) {
    this.hub = hub
  }

  private get network() {
    return getDefaultNetwork()
  }

  async start() {
    this.stopped = false
    // Keep the mids cache warm for the mid-price market-fill fallback.
    this.unsubscribeMids = this.hub.subscribeMids(this.network, () => {})
    const restingRows = await db
      .select()
      .from(tradingPaperOrders)
      .where(eq(tradingPaperOrders.status, "resting"))
    for (const order of restingRows) {
      this.resting.set(order.id, order)
      this.retainFeed(order.coin)
    }
    console.log(
      `paper engine: restored ${restingRows.length} resting order(s)`
    )

    await this.connect()
    this.timer = setInterval(() => void this.drain(), POLL_INTERVAL_MS)
    await this.drain()
  }

  async stop() {
    this.stopped = true
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    this.unsubscribeMids?.()
    this.unsubscribeMids = null
    await this.client?.end().catch(() => {})
    this.client = null
    for (const feed of this.feeds.values()) {
      for (const unsubscribe of feed.unsubscribers) unsubscribe()
    }
    this.feeds.clear()
  }

  private async connect() {
    if (this.stopped) return
    try {
      const client = new pg.Client({ connectionString: getDatabaseUrl() })
      await client.connect()
      await client.query(`listen ${PAPER_ORDER_CHANNEL}`)
      client.on("notification", () => void this.drain())
      client.on("error", () => void this.reconnect())
      client.on("end", () => void this.reconnect())
      this.client = client
    } catch (error) {
      console.error("paper engine listener connect failed", error)
      setTimeout(() => void this.connect(), POLL_INTERVAL_MS)
    }
  }

  private async reconnect() {
    if (this.stopped) return
    await this.client?.end().catch(() => {})
    this.client = null
    setTimeout(() => void this.connect(), POLL_INTERVAL_MS)
  }

  private async drain() {
    if (this.draining || this.stopped) return
    this.draining = true
    try {
      const actionable = await db
        .select()
        .from(tradingPaperOrders)
        .where(inArray(tradingPaperOrders.status, ["pending", "cancelling"]))
      for (const order of actionable) {
        if (order.status === "cancelling") {
          this.resting.delete(order.id)
          this.releaseFeedIfIdle(order.coin)
          await this.updateOrder(order.id, {
            status: "cancelled",
            reason: null,
          })
        } else {
          await this.execute(order)
        }
      }
    } catch (error) {
      console.error("paper engine drain failed", error)
    } finally {
      this.draining = false
    }
  }

  private async execute(order: TradingPaperOrder) {
    const sz = Number(order.sz)
    const px = order.px ? Number(order.px) : null

    this.retainFeed(order.coin)
    const book = await this.waitForBook(order.coin)

    if (order.orderType === "market" || order.tif === "Ioc") {
      await this.fillAtMarket(order, sz, book)
      return
    }

    if (px === null || !(px > 0)) {
      await this.reject(order, "Limit order needs a price")
      return
    }

    const opposing = book?.[order.side === "buy" ? 1 : 0] ?? []
    const best = opposing[0] ? Number(opposing[0].px) : null
    const crosses =
      best !== null && (order.side === "buy" ? px >= best : px <= best)

    if (crosses) {
      if (order.tif === "Alo") {
        await this.reject(order, "Post-only order would cross the book")
        return
      }
      await this.fillAtMarket(order, sz, book)
      return
    }

    const [updated] = await db
      .update(tradingPaperOrders)
      .set({ status: "resting", updatedAt: now() })
      .where(
        and(
          eq(tradingPaperOrders.id, order.id),
          eq(tradingPaperOrders.status, "pending")
        )
      )
      .returning()
    if (updated) {
      this.resting.set(updated.id, updated)
    }
  }

  private async fillAtMarket(
    order: TradingPaperOrder,
    sz: number,
    book: { px: string; sz: string }[][] | null
  ) {
    const opposing = book?.[order.side === "buy" ? 1 : 0] ?? []
    let avgPx = walkBookDepth(opposing, sz)
    if (avgPx === null) {
      // Book stream hasn't pushed yet — fall back to the mid price.
      const mid = Number(this.hub.mid(this.network, order.coin))
      if (mid > 0) {
        avgPx = mid
      } else {
        await this.reject(order, "No book depth for market fill")
        return
      }
    }
    await this.settleFill(order, avgPx, sz, TAKER_FEE_RATE)
  }

  /** Tape prints crossed a resting order's price → maker fill at its price. */
  private onTrades(coin: string, trades: { px: string }[]) {
    for (const trade of trades) {
      const tradePx = Number(trade.px)
      for (const order of [...this.resting.values()]) {
        if (order.coin !== coin) continue
        const orderPx = Number(order.px)
        const crossed =
          order.side === "buy" ? tradePx <= orderPx : tradePx >= orderPx
        if (!crossed) continue
        this.resting.delete(order.id)
        void this.settleFill(
          order,
          orderPx,
          Number(order.remainingSz),
          MAKER_FEE_RATE
        )
      }
    }
  }

  private async settleFill(
    order: TradingPaperOrder,
    px: number,
    sz: number,
    feeRate: number
  ) {
    const [wallet] = await db
      .select()
      .from(tradingPaperWallets)
      .where(eq(tradingPaperWallets.id, order.paperWalletId))
      .limit(1)
    if (!wallet) {
      await this.reject(order, "Paper wallet no longer exists")
      return
    }

    const [positionRow] = await db
      .select()
      .from(tradingPaperPositions)
      .where(
        and(
          eq(tradingPaperPositions.paperWalletId, order.paperWalletId),
          eq(tradingPaperPositions.coin, order.coin)
        )
      )
      .limit(1)
    const position: PaperPositionState = positionRow
      ? { szi: Number(positionRow.szi), entryPx: Number(positionRow.entryPx) }
      : null

    let effectiveSz = sz
    if (order.reduceOnly) {
      const capped = capReduceOnly(position, order.side as "buy" | "sell", sz)
      if (capped === null || capped <= 0) {
        await this.reject(order, "Reduce-only order does not reduce position")
        return
      }
      effectiveSz = capped
    }

    const result = applyPaperFill(
      position,
      Number(wallet.cash),
      order.side as "buy" | "sell",
      px,
      effectiveSz,
      feeRate
    )

    await db
      .update(tradingPaperWallets)
      .set({ cash: String(result.cash), updatedAt: now() })
      .where(eq(tradingPaperWallets.id, wallet.id))

    if (result.position) {
      await db
        .insert(tradingPaperPositions)
        .values({
          paperWalletId: order.paperWalletId,
          coin: order.coin,
          szi: String(result.position.szi),
          entryPx: String(result.position.entryPx),
          updatedAt: now(),
        })
        .onConflictDoUpdate({
          target: [
            tradingPaperPositions.paperWalletId,
            tradingPaperPositions.coin,
          ],
          set: {
            szi: String(result.position.szi),
            entryPx: String(result.position.entryPx),
            updatedAt: now(),
          },
        })
    } else {
      await db
        .delete(tradingPaperPositions)
        .where(
          and(
            eq(tradingPaperPositions.paperWalletId, order.paperWalletId),
            eq(tradingPaperPositions.coin, order.coin)
          )
        )
    }

    await db.insert(tradingPaperFills).values({
      id: uuid(),
      paperWalletId: order.paperWalletId,
      coin: order.coin,
      side: order.side,
      px: String(px),
      sz: String(effectiveSz),
      fee: String(result.fee),
      closedPnl: String(result.closedPnl),
      fillTime: now(),
      createdAt: now(),
    })

    await this.updateOrder(order.id, { status: "filled", remainingSz: "0" })
    this.releaseFeedIfIdle(order.coin)
  }

  private async reject(order: TradingPaperOrder, reason: string) {
    this.resting.delete(order.id)
    await this.updateOrder(order.id, { status: "rejected", reason })
    this.releaseFeedIfIdle(order.coin)
  }

  private async updateOrder(
    orderId: string,
    changes: Partial<typeof tradingPaperOrders.$inferInsert>
  ) {
    await db
      .update(tradingPaperOrders)
      .set({ ...changes, updatedAt: now() })
      .where(eq(tradingPaperOrders.id, orderId))
      .catch((error: unknown) =>
        console.error("paper order update failed", error)
      )
  }

  private retainFeed(coin: string) {
    let feed = this.feeds.get(coin)
    if (!feed) {
      const created: CoinFeed = { refCount: 0, book: null, unsubscribers: [] }
      created.unsubscribers.push(
        this.hub.subscribeBook(this.network, coin, (event) => {
          created.book = event.levels
        }),
        this.hub.subscribeTrades(this.network, coin, (trades) => {
          this.onTrades(coin, trades)
        })
      )
      feed = created
      this.feeds.set(coin, feed)
    }
    feed.refCount += 1
  }

  private releaseFeedIfIdle(coin: string) {
    const feed = this.feeds.get(coin)
    if (!feed) return
    feed.refCount -= 1
    const stillNeeded = [...this.resting.values()].some(
      (order) => order.coin === coin
    )
    if (feed.refCount <= 0 && !stillNeeded) {
      for (const unsubscribe of feed.unsubscribers) unsubscribe()
      this.feeds.delete(coin)
    }
  }

  private async waitForBook(
    coin: string
  ): Promise<{ px: string; sz: string }[][] | null> {
    const deadline = Date.now() + BOOK_WAIT_MS
    for (;;) {
      const feed = this.feeds.get(coin)
      if (feed?.book) return feed.book
      if (Date.now() > deadline) return null
      await new Promise((resolve) => setTimeout(resolve, 200))
    }
  }
}
