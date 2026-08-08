import * as React from "react"
import { toast } from "sonner"

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
} from "@/lib/api/paper"
import {
  cancelLadderRest,
  cancelLadderRung,
  getSmartOrderErrorMessage,
  placeDcaLadder,
  updateLadderExits,
} from "@/lib/api/smart-orders"
import type { CandleInterval } from "@/lib/protocols/contracts"
import { showErrorToast } from "@/lib/toast/error-toast"
import type { DcaParams, SmartLadder } from "@/lib/trade/dca"
import type {
  PaperJournalEntry,
  PaperOrder,
  PaperPosition,
  PaperSide,
} from "@/lib/trade/paper"
import type { TradeWallet } from "@/lib/trade/wallets"

/**
 * The one owner of practice-trading state, mounted once in the workspace so
 * the chart's lines, the order window and the bottom panel are three views of
 * one answer rather than three polls disagreeing with each other.
 *
 * It reads **every** practice wallet, not only the one being traded with:
 * which wallet an order goes to is a choice made when placing it, but what you
 * are holding afterwards is something you need to see all of. Every row
 * therefore carries its own wallet, and every action takes that wallet with it
 * rather than assuming the active one.
 *
 * Reads every four seconds while the tab is visible — the engine settles on
 * every read, so this poll is also what makes stops and targets fire — and
 * again straight after anything is done, without waiting for the next tick.
 *
 * Dragging a line is optimistic. The dropped price is held on screen until a
 * fresh read has landed, because a poll already in flight when the drag
 * finished would otherwise snap the line back to where it was for one frame.
 */

const REFRESH_MS = 4_000

export type PaperTrading = {
  /** The wallet an order placed right now would go to, or null until one is picked. */
  wallet: TradeWallet | null
  /** Held across every practice wallet. */
  positions: PaperPosition[]
  orders: PaperOrder[]
  journal: PaperJournalEntry[]
  /** The smart-order ladders still working, across every practice wallet. */
  ladders: SmartLadder[]
  /** Each practice wallet's name, for the Wallet column. */
  walletNames: ReadonlyMap<string, string>
  /** An action is in flight; the buttons that started it stay disabled. */
  busy: boolean
  place: (input: {
    marketKey: string
    side: PaperSide
    px: number
    sz: number
    leverage: number
    reduceOnly: boolean
    tpPx: number | null
    slPx: number | null
  }) => Promise<boolean>
  move: (walletId: string, orderId: string, px: number) => Promise<void>
  cancel: (walletId: string, orderId: string) => Promise<void>
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
    anchorPx: number
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
}

export function usePaperTrading(wallet: TradeWallet | null): PaperTrading {
  const [answer, setAnswer] = React.useState<{
    positions: PaperPosition[]
    orders: PaperOrder[]
    journal: PaperJournalEntry[]
    ladders: SmartLadder[]
    wallets: { id: string; label: string }[]
  } | null>(null)
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
  // Keyed by wallet *and* market: two wallets can hold the same coin, and a
  // drag on one must not move the other one's lines while it saves.
  const [droppedBrackets, setDroppedBrackets] = React.useState<
    ReadonlyMap<string, { tpPx: number | null; slPx: number | null }>
  >(new Map())

  const bracketKey = (walletId: string, marketKey: string) =>
    `${walletId}:${marketKey}`

  const walletId = wallet?.kind === "paper" ? wallet.id : null

  /**
   * Re-reads everything. Answers whether this read actually became what is on
   * screen: a read the poll overtook is thrown away, and a caller holding a
   * dragged price has to keep holding it until one really lands.
   */
  const refresh = React.useCallback(async (): Promise<boolean> => {
    const request = ++requestRef.current
    try {
      const next = await loadPaperPortfolio()
      if (requestRef.current !== request) return false
      setAnswer(next)
      return true
    } catch {
      // A failed poll keeps the last good answer on screen; the next tick is
      // the retry. Only something the person actually pressed says so out loud.
      return false
    }
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

  const current = answer

  /** A wallet's name, for the messages that have to say which one they mean. */
  const walletNames = React.useMemo(
    () => new Map((current?.wallets ?? []).map((one) => [one.id, one.label])),
    [current]
  )
  const nameOf = React.useCallback(
    (walletId: string) => walletNames.get(walletId) ?? "that wallet",
    [walletNames]
  )

  const orders = React.useMemo(() => {
    if (dropped.size === 0) return current?.orders ?? []
    return (current?.orders ?? []).map((order) => {
      const held = dropped.get(order.id)
      return held === undefined ? order : { ...order, px: held }
    })
  }, [current, dropped])

  const positions = React.useMemo(() => {
    if (droppedBrackets.size === 0) return current?.positions ?? []
    return (current?.positions ?? []).map((position) => {
      const held = droppedBrackets.get(
        `${position.walletId}:${position.marketKey}`
      )
      return held ? { ...position, ...held } : position
    })
  }, [current, droppedBrackets])

  const place: PaperTrading["place"] = React.useCallback(
    async (input) => {
      if (!walletId) return false
      return await run(
        () => placePaperOrder({ walletId, ...input }),
        `${input.side === "buy" ? "Buy" : "Sell"} order placed in ${nameOf(walletId)}.`
      )
    },
    [walletId, run, nameOf]
  )

  const move: PaperTrading["move"] = React.useCallback(
    async (walletId, orderId, px) => {
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
    [refreshUntilLanded]
  )

  const cancel: PaperTrading["cancel"] = React.useCallback(
    async (walletId, orderId) => {
      // Cancelling costs nothing and the × on the chart has to stay instant,
      // so there is no question asked first. The toast names the wallet
      // instead: cancelling in the wrong one is then obvious at once.
      await run(
        () => cancelPaperOrder(walletId, orderId),
        `Order cancelled in ${nameOf(walletId)}.`
      )
    },
    [run, nameOf]
  )

  const setBrackets: PaperTrading["setBrackets"] = React.useCallback(
    async (walletId, marketKey, brackets) => {
      return await run(
        () => setPaperBrackets({ walletId, marketKey, ...brackets }),
        "Saved."
      )
    },
    [run]
  )

  const dragBrackets: PaperTrading["dragBrackets"] = React.useCallback(
    async (walletId, marketKey, brackets) => {
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
        await setPaperBrackets({ walletId, marketKey, ...brackets })
      } catch (error) {
        // A refusal still has to be said out loud — a stop dragged to the
        // wrong side of the trade would otherwise just spring back unexplained.
        showErrorToast(getPaperErrorMessage(error))
      } finally {
        await refresh()
        forget()
      }
    },
    [refresh]
  )

  const close: PaperTrading["close"] = React.useCallback(
    async (walletId, marketKey) => {
      await run(
        () => closePaperPosition(walletId, marketKey),
        `Position closed in ${nameOf(walletId)}.`
      )
    },
    [run, nameOf]
  )

  const flip: PaperTrading["flip"] = React.useCallback(
    async (walletId, marketKey) => {
      await run(
        () => flipPaperPosition(walletId, marketKey),
        `Position turned around in ${nameOf(walletId)}.`
      )
    },
    [run, nameOf]
  )

  const placeLadder: PaperTrading["placeLadder"] = React.useCallback(
    async (input) => {
      if (!walletId) return false
      setPending((count) => count + 1)
      try {
        const { placed, filledNow } = await placeDcaLadder({
          walletId,
          ...input,
        })
        // Counted honestly: a click above the market buys some rungs at once,
        // and finding fills you did not expect is worse than being told.
        toast.success(
          filledNow > 0
            ? `Ladder placed in ${nameOf(walletId)} — ${placed} buys, ${filledNow} filled straight away.`
            : `Ladder placed in ${nameOf(walletId)} — ${placed} buys waiting.`
        )
        return true
      } catch (error) {
        showErrorToast(getSmartOrderErrorMessage(error))
        return false
      } finally {
        setPending((count) => count - 1)
        void refresh()
      }
    },
    [walletId, nameOf, refresh]
  )

  const cancelRung: PaperTrading["cancelRung"] = React.useCallback(
    async (walletId, ladderId, rungIndex) => {
      await runWith(
        getSmartOrderErrorMessage,
        () => cancelLadderRung({ walletId, ladderId, rungIndex }),
        `Rung ${rungIndex + 1} called off in ${nameOf(walletId)}.`
      )
    },
    [runWith, nameOf]
  )

  const cancelLadder: PaperTrading["cancelLadder"] = React.useCallback(
    async (walletId, ladderId) => {
      await runWith(
        getSmartOrderErrorMessage,
        () => cancelLadderRest({ walletId, ladderId }),
        `Ladder stopped in ${nameOf(walletId)} — what's bought stays.`
      )
    },
    [runWith, nameOf]
  )

  const setLadderExits: PaperTrading["setLadderExits"] = React.useCallback(
    async (walletId, ladderId, exits) => {
      return await runWith(
        getSmartOrderErrorMessage,
        () => updateLadderExits({ walletId, ladderId, ...exits }),
        "Exits changed."
      )
    },
    [runWith]
  )

  const closeAll: PaperTrading["closeAll"] = React.useCallback(async () => {
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
    wallet: wallet?.kind === "paper" ? wallet : null,
    walletNames,
    positions,
    orders,
    journal: current?.journal ?? [],
    ladders: current?.ladders ?? [],
    busy: pending > 0,
    place,
    move,
    cancel,
    setBrackets,
    dragBrackets,
    close,
    flip,
    closeAll,
    placeLadder,
    cancelRung,
    cancelLadder,
    setLadderExits,
  }
}
