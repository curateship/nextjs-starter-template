import * as React from "react"
import { toast } from "sonner"

import {
  cancelLiveOrder,
  closeLivePosition,
  describeLiveJournalNote,
  getLiveErrorMessage,
  loadLiveTrading,
  placeLiveOrder,
  setLiveBrackets,
} from "@/lib/api/live"
import {
  cancelPaperOrder,
  closeAllPaperPositions,
  closePaperPosition,
  flipPaperPosition,
  getPaperErrorMessage,
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
  reconcileLiveSmartOrders,
  updateLadderExits,
} from "@/lib/api/smart-orders"
import {
  parseMarketKey,
  type CandleInterval,
} from "@/lib/protocols/contracts"
import { showErrorToast } from "@/lib/toast/error-toast"
import type { DcaParams } from "@/lib/trade/dca"
import { formatUsd } from "@/lib/trade/format"
import type { GridParams } from "@/lib/trade/grid"
import type {
  SmartGrid,
  SmartLadder,
  SmartOrder,
} from "@/lib/trade/smart-plan"
import type { LiveJournalEntry } from "@/lib/trade/live"
import type {
  JournalReason,
  PaperJournalEntry,
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

/** How a live action reads in the journal's Why column. */
const LIVE_REASONS: Record<LiveJournalEntry["action"], JournalReason> = {
  fill: "order",
  placed: "placed",
  cancelled: "cancelled",
  close: "manual",
  brackets: "brackets",
  refused: "refused",
}

export type Trading = {
  /** The wallet an order placed right now would go to, or null until one is picked. */
  wallet: TradeWallet | null
  /** Held across every wallet, practice and real alike. */
  positions: PaperPosition[]
  orders: PaperOrder[]
  /**
   * Orders asked for whose answer has not come back yet. Kept apart from the
   * ones that really exist: the chart draws them so a press is seen at once,
   * and nothing offers to change or cancel something the server has never
   * heard of.
   */
  placing: PaperOrder[]
  journal: PaperJournalEntry[]
  /** Every smart order still working across every wallet, of either kind. */
  smartOrders: SmartOrder[]
  /** Just the DCA ladders, for the screens that only know about those. */
  ladders: SmartLadder[]
  /** Each wallet's name, for the Wallet column. */
  walletNames: ReadonlyMap<string, string>
  /** An action is in flight; the buttons that started it stay disabled. */
  busy: boolean
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
    brackets: { tpPx: number | null; slPx: number | null }
  ) => Promise<boolean>
  /**
   * From the chart: the same save, but silent and optimistic. Dragging a line
   * is its own confirmation — the line is where you put it — so it neither
   * announces itself nor waits for the server before showing the new price.
   */
  dragBrackets: (
    walletId: string,
    marketKey: string,
    brackets: { tpPx: number | null; slPx: number | null }
  ) => Promise<void>
  close: (walletId: string, marketKey: string) => Promise<void>
  flip: (walletId: string, marketKey: string) => Promise<void>
  closeAll: () => Promise<void>
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
  journal: PaperJournalEntry[]
  smartOrders: SmartOrder[]
  wallets: { id: string; label: string }[]
}

type LiveAnswer = {
  positions: PaperPosition[]
  orders: PaperOrder[]
  journal: LiveJournalEntry[]
  smartOrders: SmartOrder[]
  wallets: { id: string; label: string }[]
  unreachable: string[]
}

export function useTrading(wallet: TradeWallet | null): Trading {
  const [paperAnswer, setPaperAnswer] = React.useState<PaperAnswer | null>(null)
  const [liveAnswer, setLiveAnswer] = React.useState<LiveAnswer | null>(null)
  // Counted, not a flag: two actions can overlap, and the first to finish
  // must not re-enable the buttons while the second is still running.
  const [pending, setPending] = React.useState(0)

  // Only the newest request may write state: an older answer landing after a
  // newer one would put stale trades over fresh ones.
  const requestRef = React.useRef(0)
  // Prices dropped by a drag, still waiting for the server to agree.
  const [dropped, setDropped] = React.useState<ReadonlyMap<string, number>>(
    new Map()
  )
  // Orders asked for whose answer is still on its way.
  const [placing, setPlacing] = React.useState<PaperOrder[]>([])
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
    await reconcileLiveSmartOrders().catch(() => undefined)
    const [paper, live] = await Promise.allSettled([
      loadPaperPortfolio(),
      loadLiveTrading(),
    ])
    if (requestRef.current !== request) return false
    if (paper.status === "fulfilled") setPaperAnswer(paper.value)
    if (live.status === "fulfilled") setLiveAnswer(live.value)
    return paper.status === "fulfilled" && live.status === "fulfilled"
  }, [])

  /** Reads until one lands, so a dragged price is never let go too early. */
  const refreshUntilLanded = React.useCallback(async () => {
    if (await refresh()) return
    await refresh()
  }, [refresh])

  React.useEffect(() => {
    // Scheduled rather than called in the effect body, so mounting never sets
    // state mid-render — the same shape the account poll uses.
    const first = window.setTimeout(() => void refresh(), 0)
    const timer = window.setInterval(() => {
      if (!document.hidden) void refresh()
    }, REFRESH_MS)
    const onVisible = () => {
      if (!document.hidden) void refresh()
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      window.clearTimeout(first)
      window.clearInterval(timer)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [refresh])

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
  const smartOrders = React.useMemo(
    () => [
      ...(paperAnswer?.smartOrders ?? []),
      ...(liveAnswer?.smartOrders ?? []),
    ],
    [paperAnswer?.smartOrders, liveAnswer?.smartOrders]
  )
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

  const journal = React.useMemo((): PaperJournalEntry[] => {
    const live = (liveAnswer?.journal ?? []).map(
      (entry): PaperJournalEntry => ({
        id: entry.id,
        walletId: entry.walletId,
        marketKey: entry.marketKey,
        side: entry.side,
        px: entry.px,
        sz: entry.sz,
        fee: 0,
        closedPnl: 0,
        reason: LIVE_REASONS[entry.action],
        fillTime: entry.at,
        live: true,
        // A rails refusal is stored as its bare code; said in words here.
        note: entry.note ? describeLiveJournalNote(entry.note) : null,
      })
    )
    return [...(paperAnswer?.journal ?? []), ...live]
  }, [paperAnswer, liveAnswer])

  const orders = React.useMemo(() => {
    if (dropped.size === 0) return allOrders
    return allOrders.map((order) => {
      const held = dropped.get(order.id)
      return held === undefined ? order : { ...order, px: held }
    })
  }, [allOrders, dropped])

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
    (orderId: string) => allOrders.find((one) => one.id === orderId) ?? null,
    [allOrders]
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
      if (findOrder(orderId)?.live) {
        // The chart never offers this on a real order; the guard is for any
        // other path that might.
        showErrorToast(
          "A real order cannot be changed in place yet — cancel it and place a new one."
        )
        return false
      }
      return await run(() => updatePaperOrder({ walletId, orderId, ...changes }))
    },
    [run, findOrder]
  )

  const move: Trading["move"] = React.useCallback(
    async (walletId, orderId, px) => {
      const order = findOrder(orderId)
      if (order?.live) {
        // The chart never offers this drag; the guard is for any other path.
        showErrorToast(
          "A real order cannot be dragged to a new price yet — cancel it and place a new one."
        )
        return
      }
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
        await movePaperOrder({ walletId, orderId, px })
      } catch (error) {
        showErrorToast(getPaperErrorMessage(error))
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
      // Cancelling costs nothing and the × on the chart has to stay instant,
      // so there is no question asked first — and nothing is said afterwards
      // either: the line disappearing is the answer.
      const order = findOrder(orderId)
      if (order?.live) {
        await runWith(getLiveErrorMessage, () =>
          cancelLiveOrder({ walletId, marketKey: order.marketKey, orderId })
        )
        return
      }
      await run(() => cancelPaperOrder(walletId, orderId))
    },
    [run, runWith, findOrder]
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
      await runWith(
        getTradingSmartOrderError,
        () => cancelLadderRung({ walletId, ladderId, rungIndex }),
        `Rung ${rungIndex + 1} called off in ${nameOf(walletId)}.`
      )
    },
    [runWith, nameOf]
  )

  const cancelLadder: Trading["cancelLadder"] = React.useCallback(
    async (walletId, ladderId) => {
      await runWith(
        getTradingSmartOrderError,
        () => cancelLadderRest({ walletId, ladderId }),
        `Ladder stopped in ${nameOf(walletId)} — what's bought stays.`
      )
    },
    [runWith, nameOf]
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
      await runWith(
        getTradingSmartOrderError,
        () => cancelGridLevelApi({ walletId, gridId, levelIndex }),
        `Level ${levelIndex + 1} called off in ${nameOf(walletId)}.`
      )
    },
    [runWith, nameOf]
  )

  const cancelGrid: Trading["cancelGrid"] = React.useCallback(
    async (walletId, gridId) => {
      await runWith(
        getTradingSmartOrderError,
        () => cancelGridRest({ walletId, gridId }),
        `Grid stopped in ${nameOf(walletId)} — what's held stays.`
      )
    },
    [runWith, nameOf]
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

  const closeAll: Trading["closeAll"] = React.useCallback(async () => {
    setPending((count) => count + 1)
    try {
      const { closed } = await closeAllPaperPositions()
      // Counted honestly: a market the exchange would not price is left open,
      // and saying "all closed" when one is still there would be a lie.
      toast.success(
        closed === 1 ? "1 position closed." : `${closed} positions closed.`
      )
    } catch (error) {
      showErrorToast(getPaperErrorMessage(error))
    } finally {
      setPending((count) => count - 1)
      void refresh()
    }
  }, [refresh])

  return {
    wallet: tradable ? wallet : null,
    walletNames,
    positions,
    orders,
    placing,
    journal,
    smartOrders,
    ladders,
    grids,
    busy: pending > 0,
    place,
    move,
    cancel,
    editOrder,
    setBrackets,
    dragBrackets,
    close,
    flip,
    closeAll,
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
