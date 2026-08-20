import * as React from "react"
import { toast } from "sonner"

import {
  cancelLiveOrder,
  closeLivePosition,
  getLiveErrorMessage,
  loadLiveTrading,
  placeLiveOrder,
  setLiveBrackets,
  hideLiveTrade,
  moveLiveOrder,
} from "@/lib/api/live"
import {
  cancelPaperOrder,
  closeAllPaperPositions,
  closePaperPosition,
  flipPaperPosition,
  getPaperErrorMessage,
  hidePaperTrade,
  loadPaperPortfolio,
  movePaperOrder,
  placePaperOrder,
  setPaperBrackets,
  updatePaperOrder,
} from "@/lib/api/paper"
import {
  cancelGridLevel as cancelGridLevelApi,
  cancelGridRest,
  cancelLadderRest,
  cancelLadderRung,
  moveGridExit as moveGridExitApi,
  moveGridRange as moveGridRangeApi,
  reshapeGrid as reshapeGridApi,
  placeGridOrder,
  updateGridStop,
  getSmartOrderErrorMessage,
  placeDcaLadder,
  cancelWatch,
  reconcileLiveSmartOrders,
  updateLadderExits,
  moveWatch,
  editWatch,
} from "@/lib/api/smart-orders"
import {
  parseMarketKey,
  type CandleInterval,
  type ProtocolId,
} from "@/lib/protocols/contracts"
import { showErrorToast } from "@/lib/toast/error-toast"
import { keepUnreachableRows } from "@/lib/trade/live"
import type { DcaParams } from "@/lib/trade/dca"
import { formatUsd } from "@/lib/trade/format"
import type { GridParams } from "@/lib/trade/grid"
import type {
  SmartGrid,
  SmartLadder,
  SmartOrder,
} from "@/lib/trade/smart-plan"
import type { LiveFill, LiveTrade } from "@/lib/trade/live-trades"
import type {
  PaperOrder,
  PaperPosition,
  PaperSide,
} from "@/lib/trade/paper"
import type { TradeWallet } from "@/lib/trade/wallets"

/**
 * The one owner of trading state — practice AND real, mounted once in the
 * workspace so the chart's lines, the order window and the bottom panel are
 * views of one answer rather than polls disagreeing with each other.
 *
 * The two kinds of wallet flow through the SAME rows and the same actions;
 * each action looks at the row it was aimed at and goes down the paper road
 * or the live one. What the screens see is one portfolio. The differences
 * that are kept are the honest ones: live rows carry the exchange's own
 * margin and liquidation figures, a live resting order cannot be dragged yet,
 * and Smart-order ladders use the same plan on both wallet kinds.
 *
 * It reads **every** wallet, not only the one being traded with: which wallet
 * an order goes to is a choice made when placing it, but what you are holding
 * afterwards is something you need to see all of. Every row therefore carries
 * its own wallet, and every action takes that wallet with it.
 *
 * Reads every four seconds while the tab is visible — the practice engine
 * settles on every read, and the live side is the exchange's answer — and
 * again straight after anything is done, without waiting for the next tick.
 *
 * Dragging a line is optimistic. The dropped price is held on screen until a
 * fresh read has landed, because a poll already in flight when the drag
 * finished would otherwise snap the line back to where it was for one frame.
 *
 * Placing is optimistic too, and for a plainer reason: the exchange and the
 * database together take a second or two, and an order that shows nothing for
 * that long reads as an order that did not go. So the order is drawn the
 * instant it is asked for, marked as still going, and swapped for the real one
 * the moment a read lands.
 */

const REFRESH_MS = 4_000

function getTradingSmartOrderError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? "")
  if (message.includes("LIVE_SMART_")) {
    return getSmartOrderErrorMessage(error)
  }
  return message.includes("LIVE_") || message.includes("SECRET_")
    ? getLiveErrorMessage(error)
    : getSmartOrderErrorMessage(error)
}

/** One list, so a poll that finds nothing does not hand the panel a new array. */
const EMPTY_TRADES: LiveTrade[] = []
const EMPTY_FILLS: LiveFill[] = []

export type Trading = {
  /** The wallet an order placed right now would go to, or null until one is picked. */
  wallet: TradeWallet | null
  /** Held across every wallet, practice and real alike. */
  positions: PaperPosition[]
  orders: PaperOrder[]
  /**
   * Watched prices drawn as the orders they stand in for. A plain order is a
   * watch by default now, so it has to sit in the Open orders tab and on the
   * chart like any other — one list built HERE, because two screens each
   * building their own was how the tab ended up empty while the chart drew
   * the line.
   */
  watchOrders: PaperOrder[]
  /**
   * Orders asked for whose answer has not come back yet. Kept apart from the
   * ones that really exist: the chart draws them so a press is seen at once,
   * and nothing offers to change or cancel something the server has never
   * heard of.
   */
  placing: PaperOrder[]
  /** Every visible execution, including entries for positions still open. */
  fills: LiveFill[]
  /**
   * Finished round trips, newest first — the Journal tab. Practice and real
   * in one list, each row saying which it was, because the question you ask a
   * journal is "how did that go" and the answer reads the same either way.
   */
  trades: LiveTrade[]
  /** Every smart order still working across every wallet, of either kind. */
  smartOrders: SmartOrder[]
  /** Just the DCA ladders, for the screens that only know about those. */
  ladders: SmartLadder[]
  /** Each wallet's name, for the Wallet column. */
  walletNames: ReadonlyMap<string, string>
  /** An action is in flight; the buttons that started it stay disabled. */
  busy: boolean
  /**
   * True only before the first answer — never during a background refresh.
   * While this is true the tables have not looked yet, so nothing may claim
   * to be empty. Same shape as `use-trade-account`, on purpose.
   */
  loading: boolean
  /** The first read failed and there is nothing to fall back on. */
  failed: boolean
  /** The button on the failed state; the poll retries on its own too. */
  retry: () => void
  /**
   * Sends an order and returns straight away. Nothing waits on it: the window
   * that asked for it has already closed, the chart is already drawing it, and
   * a refusal arrives as an error toast whenever the exchange gets round to it.
   */
  place: (input: {
    marketKey: string
    side: PaperSide
    px: number
    sz: number
    leverage: number
    reduceOnly: boolean
    tpPx: number | null
    slPx: number | null
  }) => void
  move: (walletId: string, orderId: string, px: number) => Promise<void>
  cancel: (walletId: string, orderId: string) => Promise<void>
  /**
   * From the order window: how much a waiting order is for, and where it gets
   * out once it fills. Its price is not here — that is the drag on the chart.
   */
  editOrder: (
    walletId: string,
    orderId: string,
    changes: { sz: number; tpPx: number | null; slPx: number | null }
  ) => Promise<boolean>
  /** From the edit window: says so when it saves, and reports a refusal. */
  setBrackets: (
    walletId: string,
    marketKey: string,
    brackets: {
      tpPx: number | null
      /** Coins the target sells; leave it out to sell the whole position. */
      tpSz?: number | null
      slPx: number | null
    }
  ) => Promise<boolean>
  /**
   * From the chart: the same save, but silent and optimistic. Dragging a line
   * is its own confirmation — the line is where you put it — so it neither
   * announces itself nor waits for the server before showing the new price.
   */
  dragBrackets: (
    walletId: string,
    marketKey: string,
    brackets: {
      tpPx: number | null
      /** Coins the target sells; leave it out to sell the whole position. */
      tpSz?: number | null
      slPx: number | null
    }
  ) => Promise<void>
  close: (walletId: string, marketKey: string) => Promise<void>
  flip: (walletId: string, marketKey: string) => Promise<void>
  closeAll: () => Promise<void>
  /**
   * The bin on a Journal row. The trade's fills come off the list and nothing
   * else moves: a practice wallet's cash is the sum of its fills, so really
   * removing one would change what the wallet is worth.
   */
  hideTrade: (trade: LiveTrade) => Promise<void>
  /** Places a whole DCA ladder at once; the toast counts any instant buys. */
  placeLadder: (input: {
    marketKey: string
    clickPx: number
    interval: CandleInterval
    params: DcaParams
  }) => Promise<boolean>
  /** The × on one waiting rung. */
  cancelRung: (
    walletId: string,
    ladderId: string,
    rungIndex: number
  ) => Promise<void>
  /** Stop buying deeper: calls off every waiting rung, keeps what's bought. */
  cancelLadder: (walletId: string, ladderId: string) => Promise<void>
  /** Change a live ladder's take profit and stop rules. */
  setLadderExits: (
    walletId: string,
    ladderId: string,
    exits: {
      takeProfit: DcaParams["takeProfit"]
      stopLoss: DcaParams["stopLoss"]
    }
  ) => Promise<boolean>
  /** The grids still working, the same list filtered by kind. */
  grids: SmartGrid[]
  /** Places a whole grid at once. */
  placeGrid: (input: {
    marketKey: string
    topPx: number
    bottomPx: number
    params: GridParams
  }) => Promise<boolean>
  /** The × on one waiting level. Unlike the others it never comes back. */
  cancelGridLevel: (
    walletId: string,
    gridId: string,
    levelIndex: number
  ) => Promise<void>
  /** Stop the grid buying: calls off every waiting level, keeps what's held. */
  cancelGrid: (walletId: string, gridId: string) => Promise<void>
  /**
   * Drag an end of a grid's range. Only while nothing has bought — after that
   * the server refuses, because levels that have bought sell against the price
   * they bought at.
   */
  moveGridRange: (
    walletId: string,
    gridId: string,
    range: { topPx: number; bottomPx: number }
  ) => Promise<boolean>
  /**
   * Re-slice a running grid: how many levels it has, and what share of the
   * account it spends. Both redraw every level and settle the position to
   * match, so nothing is left holding a size it did not choose.
   */
  reshapeGrid: (
    walletId: string,
    gridId: string,
    shape: { levels?: number; potPct?: number }
  ) => Promise<boolean>
  /** Drag the grid's take profit or stop loss to a price. Always allowed. */
  moveGridExit: (
    walletId: string,
    gridId: string,
    which: "takeProfit" | "stopLoss",
    px: number
  ) => Promise<boolean>
  /** Change a live grid's stop. */
  setGridStop: (
    walletId: string,
    gridId: string,
    stopLoss: GridParams["stopLoss"]
  ) => Promise<boolean>
}

type PaperAnswer = {
  positions: PaperPosition[]
  orders: PaperOrder[]
  fills: LiveFill[]
  trades: LiveTrade[]
  smartOrders: SmartOrder[]
  wallets: { id: string; label: string }[]
}

type LiveAnswer = {
  positions: PaperPosition[]
  orders: PaperOrder[]
  fills: LiveFill[]
  trades: LiveTrade[]
  smartOrders: SmartOrder[]
  wallets: { id: string; label: string }[]
  unreachable: string[]
}

/**
 * Everything the answers carry is keyed by market key, and a market key
 * names its exchange — so one filter at the moment an answer lands is what
 * scopes the whole bottom panel (positions, orders, journal, smart orders)
 * to the page's exchange. Rows on other exchanges live on their own pages.
 */
function scopedToProtocol<
  T extends Pick<
    PaperAnswer,
    "positions" | "orders" | "fills" | "trades" | "smartOrders"
  >,
>(answer: T, protocol: ProtocolId): T {
  const mine = (marketKey: string) =>
    parseMarketKey(marketKey)?.protocol === protocol
  return {
    ...answer,
    positions: answer.positions.filter((one) => mine(one.marketKey)),
    orders: answer.orders.filter((one) => mine(one.marketKey)),
    fills: answer.fills.filter((one) => mine(one.marketKey)),
    trades: answer.trades.filter((one) => mine(one.marketKey)),
    smartOrders: answer.smartOrders.filter((one) => mine(one.marketKey)),
  }
}

export function useTrading(
  wallet: TradeWallet | null,
  /** The page's exchange — the only one whose rows this hook answers with. */
  protocol: ProtocolId
): Trading {
  const [paperAnswer, setPaperAnswer] = React.useState<PaperAnswer | null>(null)
  const [liveAnswer, setLiveAnswer] = React.useState<LiveAnswer | null>(null)
  // The whole read came back with nothing — both halves refused. With rows
  // already on screen the next tick is the retry and nothing is said; this
  // only ever surfaces while there is nothing to fall back on.
  const [failed, setFailed] = React.useState(false)
  // Counted, not a flag: two actions can overlap, and the first to finish
  // must not re-enable the buttons while the second is still running.
  const [pending, setPending] = React.useState(0)

  // Only the newest request may write state: an older answer landing after a
  // newer one would put stale trades over fresh ones.
  const requestRef = React.useRef(0)
  /** A read still on its way — the clock's poll skips its turn while it is. */
  const inFlightRef = React.useRef<Promise<boolean> | null>(null)
  // Prices dropped by a drag, still waiting for the server to agree.
  const [dropped, setDropped] = React.useState<ReadonlyMap<string, number>>(
    new Map()
  )
  // Orders asked for whose answer is still on its way.
  const [placing, setPlacing] = React.useState<PaperOrder[]>([])
  // Orders whose × has been pressed, still being told to the exchange.
  const [cancelling, setCancelling] = React.useState<ReadonlySet<string>>(
    new Set()
  )
  // Keyed by wallet *and* market: two wallets can hold the same coin, and a
  // drag on one must not move the other one's lines while it saves.
  const [droppedBrackets, setDroppedBrackets] = React.useState<
    ReadonlyMap<string, { tpPx: number | null; slPx: number | null }>
  >(new Map())

  const bracketKey = (walletId: string, marketKey: string) =>
    `${walletId}:${marketKey}`

  // The wallet an order goes to: a practice wallet, or a live one with a key
  // saved. A live wallet with no key can be looked at but not traded with.
  const tradable =
    wallet !== null &&
    (wallet.kind === "paper" || (wallet.kind === "live" && wallet.hasKey))
  const walletId = tradable ? wallet.id : null

  /**
   * Re-reads everything, both halves at once, each half keeping its last good
   * answer when its read fails. Answers whether this read fully became what
   * is on screen: a read the poll overtook is thrown away, and a caller
   * holding a dragged price has to keep holding it until one really lands.
   */
  const refresh = React.useCallback(async (): Promise<boolean> => {
    const request = ++requestRef.current
    // The nudge goes out ALONGSIDE the reads, not before them. It tells the
    // engine to look at this wallet's ladders; the panel's rows do not come
    // from it, so waiting for it only meant the whole panel sat on a spinner
    // for as long as the slowest exchange took to answer a question nobody
    // on this screen had asked. Anything it changes shows on the next poll,
    // seconds later.
    const [, paper, live] = await Promise.allSettled([
      reconcileLiveSmartOrders(),
      loadPaperPortfolio(),
      loadLiveTrading(),
    ])
    if (requestRef.current !== request) return false
    if (paper.status === "fulfilled") {
      setPaperAnswer(scopedToProtocol(paper.value, protocol))
    }
    if (live.status === "fulfilled") {
      // Scoped BEFORE the unreachable-rows merge, so kept-alive rows from a
      // wallet the exchange missed are already this page's rows and nothing
      // foreign can ride back in through the merge.
      const scoped = scopedToProtocol(live.value, protocol)
      setLiveAnswer((was) => keepUnreachableRows(was, scoped))
    }
    setFailed(
      paper.status === "rejected" && live.status === "rejected"
    )
    return paper.status === "fulfilled" && live.status === "fulfilled"
  }, [protocol])

  /** Reads until one lands, so a dragged price is never let go too early. */
  const refreshUntilLanded = React.useCallback(async () => {
    if (await refresh()) return
    await refresh()
  }, [refresh])

  /**
   * One poll's turn, skipped outright while the last one is still running.
   *
   * A read against a slow or rate-limited exchange can outlast the gap
   * between polls. Starting another anyway stacked them: each waiting request
   * held a database connection, the pool ran out, and every read in the app
   * — wallets, drawings, this panel — hung behind them with a spinner that
   * never ended. An action's own refresh is untouched; only the clock's turn
   * is skipped, and the next one is seconds away.
   */
  const poll = React.useCallback(() => {
    if (document.hidden || inFlightRef.current) return
    const running = refresh().finally(() => {
      if (inFlightRef.current === running) inFlightRef.current = null
    })
    inFlightRef.current = running
  }, [refresh])

  React.useEffect(() => {
    // Scheduled rather than called in the effect body, so mounting never sets
    // state mid-render — the same shape the account poll uses.
    const first = window.setTimeout(poll, 0)
    const timer = window.setInterval(poll, REFRESH_MS)
    const onVisible = () => poll()
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      window.clearTimeout(first)
      window.clearInterval(timer)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [poll])

  /**
   * One shape for every action: run it, say what went wrong if it did, and
   * re-read either way — a refused order still leaves the account worth
   * re-reading, because the refusal may be why.
   */
  const runWith = React.useCallback(
    async (
      describeError: (error: unknown) => string,
      action: () => Promise<unknown>,
      done?: string
    ): Promise<boolean> => {
      setPending((count) => count + 1)
      try {
        await action()
        if (done) toast.success(done)
        return true
      } catch (error) {
        showErrorToast(describeError(error))
        return false
      } finally {
        setPending((count) => count - 1)
        void refresh()
      }
    },
    [refresh]
  )

  const run = React.useCallback(
    (action: () => Promise<unknown>, done?: string): Promise<boolean> =>
      runWith(getPaperErrorMessage, action, done),
    [runWith]
  )

  /**
   * Calling something off: an order, a rung, a level, a whole ladder or grid.
   *
   * **The line goes the moment it is pressed and the server is told behind
   * it.** Telling it takes a second or more — a read of what is open, then the
   * cancel itself, then the journal row — and waiting for all of that before
   * anything moved made the × feel broken enough to press twice. Nothing else
   * on the panel is dimmed meanwhile either, for the same reason: there is
   * nothing here for anyone to wait for.
   *
   * A refusal puts the line straight back and says why. That is the one time
   * calling something off says anything at all, because a line returning on
   * its own would otherwise look like the × had been missed.
   *
   * `key` is what is being held as already gone — an order id, or an id and
   * the rung's place in it. It is let go only once a read has landed without
   * it, so a poll that was already in flight cannot flash the line back.
   */
  const callOff = React.useCallback(
    async (
      key: string,
      action: () => Promise<unknown>,
      describeError: (error: unknown) => string,
      done?: string
    ): Promise<void> => {
      setCancelling((held) => new Set(held).add(key))
      const forget = () =>
        setCancelling((held) => {
          if (!held.has(key)) return held
          const next = new Set(held)
          next.delete(key)
          return next
        })

      try {
        await action()
      } catch (error) {
        forget()
        showErrorToast(describeError(error))
        void refresh()
        return
      }
      if (done) toast.success(done)
      await refreshUntilLanded()
      forget()
    },
    [refresh, refreshUntilLanded]
  )

  /** A wallet's name, for the messages that have to say which one they mean. */
  const walletNames = React.useMemo(
    () =>
      new Map(
        [...(paperAnswer?.wallets ?? []), ...(liveAnswer?.wallets ?? [])].map(
          (one) => [one.id, one.label]
        )
      ),
    [paperAnswer, liveAnswer]
  )
  const nameOf = React.useCallback(
    (walletId: string) => walletNames.get(walletId) ?? "that wallet",
    [walletNames]
  )

  const allOrders = React.useMemo(
    () => [...(paperAnswer?.orders ?? []), ...(liveAnswer?.orders ?? [])],
    [paperAnswer, liveAnswer]
  )
  const allPositions = React.useMemo(
    () => [...(paperAnswer?.positions ?? []), ...(liveAnswer?.positions ?? [])],
    [paperAnswer, liveAnswer]
  )
  /** Exactly what the server last said, for the lookups an action does. */
  const allSmartOrders = React.useMemo(
    () => [
      ...(paperAnswer?.smartOrders ?? []),
      ...(liveAnswer?.smartOrders ?? []),
    ],
    [paperAnswer?.smartOrders, liveAnswer?.smartOrders]
  )

  /**
   * The same list with anything already called off taken out of it, so a ×
   * lands the moment it is pressed instead of a second later.
   *
   * A whole ladder or grid goes altogether. A single rung or level is marked
   * the way the server is about to mark it — a rung called off by hand is
   * `skipped`, which the chart draws faded, and a grid level is `cancelled`,
   * which the chart does not draw at all. Guessing the same answer the server
   * will give is what keeps the line from jumping when the real one lands.
   */
  const smartOrders = React.useMemo(() => {
    if (cancelling.size === 0) return allSmartOrders
    return allSmartOrders
      .filter((order) => !cancelling.has(order.id))
      .map((order) => {
        if (order.kind === "dca") {
          if (!order.plan.rungs.some((_, at) => cancelling.has(`${order.id}#${at}`)))
            return order
          return {
            ...order,
            plan: {
              ...order.plan,
              rungs: order.plan.rungs.map((rung, at) =>
                cancelling.has(`${order.id}#${at}`) && rung.status === "waiting"
                  ? { ...rung, status: "skipped" as const }
                  : rung
              ),
            },
          }
        }
        if (order.kind === "grid") {
          if (!order.plan.levels.some((_, at) => cancelling.has(`${order.id}#${at}`)))
            return order
          return {
            ...order,
            plan: {
              ...order.plan,
              levels: order.plan.levels.map((level, at) =>
                cancelling.has(`${order.id}#${at}`) && level.status === "waiting"
                  ? { ...level, status: "cancelled" as const }
                  : level
              ),
            },
          }
        }
        return order
      })
  }, [allSmartOrders, cancelling])
  // Derived rather than fetched separately: the screens that predate the grid
  // still want ladders alone, and one list of both is the truth they filter.
  const ladders = React.useMemo(
    () =>
      smartOrders.filter(
        (order): order is SmartLadder => order.kind === "dca"
      ),
    [smartOrders]
  )
  const grids = React.useMemo(
    () => smartOrders.filter((order): order is SmartGrid => order.kind === "grid"),
    [smartOrders]
  )

  const trades = React.useMemo((): LiveTrade[] => {
    const paper = paperAnswer?.trades ?? EMPTY_TRADES
    const live = liveAnswer?.trades ?? EMPTY_TRADES
    if (paper.length === 0) return live
    if (live.length === 0) return paper
    return [...paper, ...live].sort(
      (left, right) => right.closedAt - left.closedAt
    )
  }, [paperAnswer, liveAnswer])

  const fills = React.useMemo(
    () => [
      ...(paperAnswer?.fills ?? EMPTY_FILLS),
      ...(liveAnswer?.fills ?? EMPTY_FILLS),
    ],
    [paperAnswer, liveAnswer]
  )

  const orders = React.useMemo(() => {
    const shown =
      cancelling.size === 0
        ? allOrders
        : allOrders.filter((order) => !cancelling.has(order.id))
    if (dropped.size === 0) return shown
    return shown.map((order) => {
      const held = dropped.get(order.id)
      return held === undefined ? order : { ...order, px: held }
    })
  }, [allOrders, dropped, cancelling])

  const watchOrders = React.useMemo(
    () =>
      smartOrders.flatMap((order): PaperOrder[] =>
        order.kind === "watch" &&
        order.plan.phase === "waiting" &&
        !cancelling.has(order.id)
          ? [
              {
                id: order.id,
                walletId: order.walletId,
                marketKey: order.marketKey,
                side: order.plan.side,
                // A drag's dropped price holds here the same way it does for a
                // real order, so the line never blinks back mid-save.
                px: dropped.get(order.id) ?? order.plan.triggerPx,
                sz: order.plan.sz,
                leverage: order.plan.leverage,
                maxLeverage: order.plan.maxLeverage,
                reduceOnly: order.plan.reduceOnly,
                tpPx: order.plan.tpPx,
                slPx: order.plan.slPx,
                createdAt: order.createdAt,
                updatedAt: order.updatedAt,
                // No order exists behind this row — see `watched` on
                // `PaperOrder`. Everything that would reach for one steps
                // aside; the × still works and goes the smart-order way.
                watched: true,
              },
            ]
          : []
      ),
    [smartOrders, dropped, cancelling]
  )

  const positions = React.useMemo(() => {
    if (droppedBrackets.size === 0) return allPositions
    return allPositions.map((position) => {
      const held = droppedBrackets.get(
        `${position.walletId}:${position.marketKey}`
      )
      return held ? { ...position, ...held } : position
    })
  }, [allPositions, droppedBrackets])

  /** The row an action is aimed at decides which road the action takes. */
  const findOrder = React.useCallback(
    (orderId: string) =>
      allOrders.find((one) => one.id === orderId) ??
      // Watched prices are orders to everything that asks by id — the drags
      // and edits route on the `watched` flag this lookup carries back.
      watchOrders.find((one) => one.id === orderId) ??
      null,
    [allOrders, watchOrders]
  )
  const findPosition = React.useCallback(
    (walletId: string, marketKey: string) =>
      allPositions.find(
        (one) => one.walletId === walletId && one.marketKey === marketKey
      ) ?? null,
    [allPositions]
  )

  const place: Trading["place"] = React.useCallback(
    (input) => {
      if (!walletId || !wallet) return
      const kind = wallet.kind
      // Drawn at once, before anything is sent. Its own id, never the
      // server's: this order does not exist anywhere else yet.
      const ghost: PaperOrder = {
        id: `placing:${crypto.randomUUID()}`,
        walletId,
        marketKey: input.marketKey,
        side: input.side,
        px: input.px,
        sz: input.sz,
        leverage: input.leverage,
        maxLeverage: input.leverage,
        reduceOnly: input.reduceOnly,
        tpPx: input.tpPx,
        slPx: input.slPx,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        placing: true,
      }
      setPlacing((held) => [...held, ghost])

      void (async () => {
        try {
          if (kind === "paper") {
            await placePaperOrder({ walletId, ...input })
          } else {
            // The one part of the real road that still speaks up: an order
            // that went on but whose protection did not is the thing that
            // must never pass quietly.
            const { outcome } = await placeLiveOrder({ walletId, ...input })
            if (outcome.protection === "partial" && outcome.protectionNote) {
              showErrorToast(outcome.protectionNote)
            }
          }
        } catch (error) {
          showErrorToast(
            kind === "paper"
              ? getPaperErrorMessage(error)
              : getLiveErrorMessage(error)
          )
        } finally {
          // Held until a read has actually landed, so the line never blinks
          // out between the answer and the order arriving in the next poll.
          await refreshUntilLanded()
          setPlacing((held) => held.filter((one) => one.id !== ghost.id))
        }
      })()
    },
    [walletId, wallet, refreshUntilLanded]
  )

  const editOrder: Trading["editOrder"] = React.useCallback(
    async (walletId, orderId, changes) => {
      const order = findOrder(orderId)
      if (order?.live) {
        // The chart never offers this on a real order; the guard is for any
        // other path that might.
        showErrorToast(
          "A real order cannot be changed in place yet — cancel it and place a new one."
        )
        return false
      }
      if (order?.watched) {
        // A watched price is a row of ours — its size, stop and target change
        // in the row, and nothing goes near the exchange until it fires.
        return await run(() =>
          editWatch({ walletId, ladderId: orderId, ...changes })
        )
      }
      return await run(() => updatePaperOrder({ walletId, orderId, ...changes }))
    },
    [run, findOrder]
  )

  const move: Trading["move"] = React.useCallback(
    async (walletId, orderId, px) => {
      const order = findOrder(orderId)
      // Let go only of this drop. A second drag while the first is still
      // saving owns the line now, and releasing its hold here would show the
      // first price again for as long as the second save takes.
      const forget = () =>
        setDropped((held) => {
          if (held.get(orderId) !== px) return held
          const next = new Map(held)
          next.delete(orderId)
          return next
        })

      setDropped((held) => new Map(held).set(orderId, px))
      try {
        if (order?.watched) {
          // A watched price is a row of ours, not an order anywhere — moving
          // it is rewriting the level the app is watching for.
          await moveWatch({ walletId, ladderId: orderId, px })
        } else if (order?.live) {
          // A real order moves on the exchange itself — same order, same
          // size, new price. The refusal path journals anything it disliked.
          await moveLiveOrder({
            walletId,
            marketKey: order.marketKey,
            orderId,
            px,
            side: order.side,
            sz: order.sz,
            reduceOnly: order.reduceOnly,
          })
        } else {
          await movePaperOrder({ walletId, orderId, px })
        }
      } catch (error) {
        showErrorToast(
          order?.live
            ? getLiveErrorMessage(error)
            : getPaperErrorMessage(error)
        )
      } finally {
        // Held until a read has actually landed, so the line never flicks back
        // to where it was for a frame — a read the poll overtook does not count.
        await refreshUntilLanded()
        forget()
      }
    },
    [refreshUntilLanded, findOrder]
  )

  const cancel: Trading["cancel"] = React.useCallback(
    async (walletId, orderId) => {
      // Cancelling costs nothing, so there is no question asked first — and
      // nothing is said afterwards either: the row disappearing is the answer.
      const watch = allSmartOrders.find(
        (one) => one.kind === "watch" && one.id === orderId
      )
      const order = findOrder(orderId)
      await callOff(
        orderId,
        () => {
          // A watched price is drawn as an order and cancelled as one, but
          // there is no order anywhere to cancel — the row IS the order until
          // its level is touched, so it goes back through the smart-order door.
          if (watch) return cancelWatch({ walletId, ladderId: orderId })
          if (order?.live) {
            return cancelLiveOrder({
              walletId,
              marketKey: order.marketKey,
              orderId,
            })
          }
          return cancelPaperOrder(walletId, orderId)
        },
        order?.live ? getLiveErrorMessage : getPaperErrorMessage
      )
    },
    [callOff, findOrder, allSmartOrders]
  )

  const setBrackets: Trading["setBrackets"] = React.useCallback(
    async (walletId, marketKey, brackets) => {
      if (findPosition(walletId, marketKey)?.live) {
        return await runWith(
          getLiveErrorMessage,
          () => setLiveBrackets({ walletId, marketKey, ...brackets }),
          "Saved on the exchange."
        )
      }
      return await run(
        () => setPaperBrackets({ walletId, marketKey, ...brackets }),
        "Saved."
      )
    },
    [run, runWith, findPosition]
  )

  const dragBrackets: Trading["dragBrackets"] = React.useCallback(
    async (walletId, marketKey, brackets) => {
      const live = findPosition(walletId, marketKey)?.live !== undefined
      const key = bracketKey(walletId, marketKey)
      const forget = () =>
        setDroppedBrackets((held) => {
          if (held.get(key) !== brackets) return held
          const next = new Map(held)
          next.delete(key)
          return next
        })

      setDroppedBrackets((held) => new Map(held).set(key, brackets))
      try {
        if (live) {
          await setLiveBrackets({ walletId, marketKey, ...brackets })
        } else {
          await setPaperBrackets({ walletId, marketKey, ...brackets })
        }
      } catch (error) {
        // A refusal still has to be said out loud — a stop dragged to the
        // wrong side of the trade would otherwise just spring back unexplained.
        showErrorToast(
          live ? getLiveErrorMessage(error) : getPaperErrorMessage(error)
        )
      } finally {
        await refreshUntilLanded()
        forget()
      }
    },
    [refreshUntilLanded, findPosition]
  )

  const close: Trading["close"] = React.useCallback(
    async (walletId, marketKey) => {
      if (findPosition(walletId, marketKey)?.live) {
        // The market key names its network, and the words follow it — a
        // testnet close must never announce itself as real money.
        const testnet = parseMarketKey(marketKey)?.network === "testnet"
        await runWith(
          getLiveErrorMessage,
          () => closeLivePosition(walletId, marketKey),
          `${testnet ? "Testnet" : "Real"} position closed in ${nameOf(walletId)}.`
        )
        return
      }
      await run(
        () => closePaperPosition(walletId, marketKey),
        `Position closed in ${nameOf(walletId)}.`
      )
    },
    [run, runWith, nameOf, findPosition]
  )

  const flip: Trading["flip"] = React.useCallback(
    async (walletId, marketKey) => {
      if (findPosition(walletId, marketKey)?.live) {
        // The table hides its flip button on live rows; this is the backstop.
        showErrorToast(
          "Turning a real position around in one go isn't built yet — close it, then open the other way."
        )
        return
      }
      await run(
        () => flipPaperPosition(walletId, marketKey),
        `Position turned around in ${nameOf(walletId)}.`
      )
    },
    [run, nameOf, findPosition]
  )

  const placeLadder: Trading["placeLadder"] = React.useCallback(
    async (input) => {
      if (!walletId || !wallet) return false
      setPending((count) => count + 1)
      try {
        const { placed, passed } = await placeDcaLadder({
          walletId,
          ...input,
        })
        // Counted honestly: rungs above the price never get a chance to wait,
        // and a ladder quietly placing four buys instead of seven is worse
        // than one that says so.
        toast.success(
          passed > 0
            ? `Ladder placed in ${nameOf(walletId)} — ${placed} buys waiting, ${passed} skipped because price is already below them.`
            : `Ladder placed in ${nameOf(walletId)} — ${placed} buys waiting.`
        )
        return true
      } catch (error) {
        showErrorToast(getTradingSmartOrderError(error))
        return false
      } finally {
        setPending((count) => count - 1)
        void refresh()
      }
    },
    [walletId, wallet, nameOf, refresh]
  )

  const cancelRung: Trading["cancelRung"] = React.useCallback(
    async (walletId, ladderId, rungIndex) => {
      await callOff(
        `${ladderId}#${rungIndex}`,
        () => cancelLadderRung({ walletId, ladderId, rungIndex }),
        getTradingSmartOrderError,
        `Rung ${rungIndex + 1} called off in ${nameOf(walletId)}.`
      )
    },
    [callOff, nameOf]
  )

  const cancelLadder: Trading["cancelLadder"] = React.useCallback(
    async (walletId, ladderId) => {
      await callOff(
        ladderId,
        () => cancelLadderRest({ walletId, ladderId }),
        getTradingSmartOrderError,
        `Ladder stopped in ${nameOf(walletId)} — what's bought stays.`
      )
    },
    [callOff, nameOf]
  )

  const setLadderExits: Trading["setLadderExits"] = React.useCallback(
    async (walletId, ladderId, exits) => {
      return await runWith(
        getTradingSmartOrderError,
        () => updateLadderExits({ walletId, ladderId, ...exits }),
        "Exits changed."
      )
    },
    [runWith]
  )

  const placeGrid: Trading["placeGrid"] = React.useCallback(
    async (input) => {
      if (!walletId || !wallet) return false
      setPending((count) => count + 1)
      try {
        const { levels, totalCost } = await placeGridOrder({
          walletId,
          ...input,
        })
        toast.success(
          `Grid placed in ${nameOf(walletId)} — ${levels} buys waiting, ${formatUsd(totalCost)} in total.`
        )
        return true
      } catch (error) {
        showErrorToast(getTradingSmartOrderError(error))
        return false
      } finally {
        setPending((count) => count - 1)
        void refresh()
      }
    },
    [walletId, wallet, nameOf, refresh]
  )

  const cancelGridLevel: Trading["cancelGridLevel"] = React.useCallback(
    async (walletId, gridId, levelIndex) => {
      await callOff(
        `${gridId}#${levelIndex}`,
        () => cancelGridLevelApi({ walletId, gridId, levelIndex }),
        getTradingSmartOrderError,
        `Level ${levelIndex + 1} called off in ${nameOf(walletId)}.`
      )
    },
    [callOff, nameOf]
  )

  const cancelGrid: Trading["cancelGrid"] = React.useCallback(
    async (walletId, gridId) => {
      await callOff(
        gridId,
        () => cancelGridRest({ walletId, gridId }),
        getTradingSmartOrderError,
        `Grid stopped in ${nameOf(walletId)} — what's held stays.`
      )
    },
    [callOff, nameOf]
  )

  const moveGridRange: Trading["moveGridRange"] = React.useCallback(
    async (walletId, gridId, range) => {
      // No toast. Dragging a line is a direct thing — the line moves and you
      // can see it — and a message for every nudge is noise. Errors still say
      // so, because a refused drag looks exactly like one that worked.
      return await runWith(getTradingSmartOrderError, () =>
        moveGridRangeApi({ walletId, gridId, ...range })
      )
    },
    [runWith]
  )

  const reshapeGrid: Trading["reshapeGrid"] = React.useCallback(
    async (walletId, gridId, shape) => {
      return await runWith(
        getTradingSmartOrderError,
        () => reshapeGridApi({ walletId, gridId, ...shape }),
        "Grid re-sliced."
      )
    },
    [runWith]
  )

  const moveGridExit: Trading["moveGridExit"] = React.useCallback(
    async (walletId, gridId, which, px) => {
      return await runWith(getTradingSmartOrderError, () =>
        moveGridExitApi({ walletId, gridId, which, px })
      )
    },
    [runWith]
  )

  const setGridStop: Trading["setGridStop"] = React.useCallback(
    async (walletId, gridId, stopLoss) => {
      return await runWith(
        getTradingSmartOrderError,
        () => updateGridStop({ walletId, gridId, stopLoss }),
        "Stop changed."
      )
    },
    [runWith]
  )

  const hideTrade: Trading["hideTrade"] = React.useCallback(
    async (trade) => {
      setPending((count) => count + 1)
      const fillIds = [...new Set(trade.fills.map((fill) => fill.fillId))]
      try {
        // A trade is not stored; its fills are. Hiding them is what makes the
        // row go. One list, two stores — the row says which it came from.
        if (trade.live) await hideLiveTrade(trade.walletId, fillIds)
        else await hidePaperTrade(fillIds)
        toast.success("Removed from the Journal.")
      } catch (error) {
        showErrorToast(
          trade.live ? getLiveErrorMessage(error) : getPaperErrorMessage(error)
        )
      } finally {
        setPending((count) => count - 1)
        void refresh()
      }
    },
    [refresh]
  )

  /**
   * The emergency button: everything open, closed at once.
   *
   * **All of it starts together, and nothing waits on anything else.** This is
   * the button somebody presses because the market is moving against them, so
   * a real position must never sit in a queue behind another one, and a
   * practice sweep that fails must never be the reason real money stayed open
   * — which is exactly what a single throw used to do.
   *
   * Each real position goes through `closeLivePosition`, the same door its own
   * row's button uses, so the emergency path can never sell real money
   * differently from a hand on each row.
   */
  const closeAll: Trading["closeAll"] = React.useCallback(async () => {
    setPending((count) => count + 1)
    const real = positions.filter((one) => one.live)
    try {
      const [sweep, ...answers] = await Promise.allSettled([
        closeAllPaperPositions(),
        ...real.map((held) => closeLivePosition(held.walletId, held.marketKey)),
      ])

      if (sweep.status === "rejected") {
        showErrorToast(getPaperErrorMessage(sweep.reason))
      }
      const refused = answers.filter((one) => one.status === "rejected")
      if (refused.length > 0) {
        const why = getLiveErrorMessage(refused[0].reason)
        showErrorToast(
          refused.length === 1
            ? why
            : `${refused.length} real positions were not closed. The first said: ${why}`
        )
      }

      // Counted honestly: a market the exchange would not price is left open,
      // and saying "all closed" when one is still there would be a lie.
      const done =
        (sweep.status === "fulfilled" ? sweep.value.closed : 0) +
        (answers.length - refused.length)
      toast.success(
        done === 1 ? "1 position closed." : `${done} positions closed.`
      )
    } finally {
      setPending((count) => count - 1)
      void refresh()
    }
  }, [refresh, positions])

  return {
    wallet: tradable ? wallet : null,
    walletNames,
    positions,
    orders,
    placing,
    fills,
    trades,
    smartOrders,
    ladders,
    grids,
    busy: pending > 0,
    // Never both: an answered half is something to show, a failure with rows
    // still up stays quiet, and only a screen with nothing yet says either.
    loading: paperAnswer === null && liveAnswer === null && !failed,
    failed: failed && paperAnswer === null && liveAnswer === null,
    retry: () => void refresh(),
    place,
    watchOrders,
    move,
    cancel,
    editOrder,
    setBrackets,
    dragBrackets,
    close,
    flip,
    closeAll,
    hideTrade,
    placeLadder,
    cancelRung,
    cancelLadder,
    setLadderExits,
    placeGrid,
    cancelGridLevel,
    cancelGrid,
    moveGridRange,
    moveGridExit,
    reshapeGrid,
    setGridStop,
  }
}
