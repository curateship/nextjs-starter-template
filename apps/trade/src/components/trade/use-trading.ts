import * as React from "react"
import { toast } from "sonner"

import {
  cancelLiveOrder,
  changeLiveLeverage,
  changeLiveMargin,
  closeLivePosition,
  getLiveErrorMessage,
  loadOlderLiveTrades,
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
  loadOlderPaperTrades,
  loadPaperPortfolio,
  movePaperOrder,
  placePaperOrder,
  setPaperBrackets,
  updatePaperOrder,
} from "@/lib/api/paper"
import {
  cancelAllSmartOrders as cancelAllSmartOrdersApi,
  cancelGridLevel as cancelGridLevelApi,
  cancelGridRest,
  cancelLadderRest,
  cancelLadderRung,
  moveGridExit as moveGridExitApi,
  moveGridRange as moveGridRangeApi,
  reshapeGrid as reshapeGridApi,
  setGridFollow as setGridFollowApi,
  placeGridOrder,
  updateGridStop,
  getSmartOrderErrorMessage,
  placeDcaLadder,
  cancelWatch,
  closePartOfPosition,
  type PartCloseOutcome,
  flattenWalletApi,
  reconcileLiveSmartOrders,
  resumeSmartOrder as resumeSmartOrderApi,
  updateLadderExits,
  moveWatch,
  editWatch,
} from "@/lib/api/smart-orders"
import {
  marketSymbol,
  parseMarketKey,
  type CandleInterval,
  type ProtocolId,
} from "@/lib/protocols/contracts"
import { showErrorToast } from "@/lib/toast/error-toast"
import {
  keepUnreachableRows,
  liveRefusalKey,
  refusalAlertsForActiveWatches,
  type LiveRefusal,
} from "@/lib/trade/live"
import type { DcaParams } from "@/lib/trade/dca"
import { orderCancelKind } from "@/lib/trade/cancel-order"
import { formatUsd } from "@/lib/trade/format"
import type { GridStop, PlaceGridParams } from "@/lib/trade/grid"
import {
  laddersAndGridsYouPlaced,
  type SmartGrid,
  type SmartLadder,
  type SmartOrder,
} from "@/lib/trade/smart-plan"
import type { LiveFill, LiveTrade } from "@/lib/trade/live-trades"
import type { TradeOrder, TradePosition, TradeSide } from "@/lib/trade/paper"
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
 *
 * ## Every action shows its answer at once
 *
 * **This is the rule, and it lives here so no exchange can get it wrong.**
 * Nothing in this file knows which venue a row came from, so an exchange added
 * tomorrow inherits all of it without writing a line: opening, closing,
 * cancelling and dragging a price, a stop or a target are all instant on
 * screen, and the venue is told afterwards.
 *
 * Each of those keeps a HOLD — a small note saying "show it this way for now".
 * The part that was got wrong for a long time is when a hold ends:
 *
 * **A hold is released when the data agrees, never when a read merely lands.**
 *
 * A read already on its way when the action started knows nothing about it, so
 * letting it end the hold made the line snap back to where it was and then
 * forward again a moment later. It looked like a delay, and it looked like a
 * different delay on every exchange, because it was really a race with
 * whichever venue's read happened to be slowest.
 *
 * So: a cancelled row is held hidden until it is really gone, a dragged price
 * is held until a row comes back carrying it, and a just-placed order is held
 * on screen until the real one appears — never a gap between the two. Each
 * hold gives up after {@link HOLD_GIVE_UP_MS} so a venue that never agrees
 * cannot hide the truth forever; a refusal says so out loud and releases at
 * once.
 */

const REFRESH_MS = 4_000

/** What a poll may leave out, to be carried over from the last answer. */
type Carried = {
  fills: LiveFill[]
  trades: LiveTrade[]
  nextBefore: number | null
  smartOrders: SmartOrder[]
}

/**
 * A fresh answer filled in from the last one, wherever the server said
 * "unchanged": the Journal when no fill has happened since the stamp it
 * was sent, and the smart orders when no ladder has moved. Both keep their
 * identity then, so nothing downstream re-sorts or re-saves them.
 */
function carryOver<
  T extends Omit<Carried, "smartOrders"> & {
    smartOrders: SmartOrder[] | null
    journalUnchanged: boolean
  },
>(fresh: T, was: Carried | null): T & Carried {
  const journal =
    !fresh.journalUnchanged || !was
      ? {
          fills: fresh.fills,
          trades: fresh.trades,
          nextBefore: fresh.nextBefore,
        }
      : { fills: was.fills, trades: was.trades, nextBefore: was.nextBefore }
  return {
    ...fresh,
    ...journal,
    smartOrders: fresh.smartOrders ?? was?.smartOrders ?? [],
  }
}

/**
 * How long an optimistic hold may outlive its answer.
 *
 * Long enough for a slow venue and a poll or two, short enough that a venue
 * which never agrees cannot keep the truth off the screen. On giving up the
 * real data simply shows.
 */
const HOLD_GIVE_UP_MS = 30_000

/** Near enough to be the same price, after a venue rounds to its own tick. */
function samePrice(a: number | null, b: number | null): boolean {
  if (a === null || b === null) return a === b
  if (a === b) return true
  return Math.abs(a - b) <= Math.abs(b) * 0.005
}

/** One trade's fill ids can repeat inside it; the server wants each once. */
function tradeFillIds(trades: readonly LiveTrade[]): string[] {
  return [
    ...new Set(
      trades.flatMap((trade) => trade.fills.map((fill) => fill.fillId))
    ),
  ]
}

/**
 * The server takes at most this many fill ids in one hide call, so a big
 * removal is dealt into batches — whole trades only, counting each trade's
 * own fills, so no batch can go over by splitting a trade.
 */
const FILL_IDS_PER_CALL = 200

function batchTrades(trades: readonly LiveTrade[]): LiveTrade[][] {
  const batches: LiveTrade[][] = []
  let batch: LiveTrade[] = []
  let fills = 0
  for (const trade of trades) {
    const own = tradeFillIds([trade]).length
    if (batch.length > 0 && fills + own > FILL_IDS_PER_CALL) {
      batches.push(batch)
      batch = []
      fills = 0
    }
    batch.push(trade)
    fills += own
  }
  if (batch.length > 0) batches.push(batch)
  return batches
}

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
const EMPTY_REFUSALS: LiveRefusal[] = []
const EMPTY_FILLS: LiveFill[] = []

export type Trading = {
  /** The wallet an order placed right now would go to, or null until one is picked. */
  wallet: TradeWallet | null
  /** Held across every wallet, practice and real alike. */
  positions: TradePosition[]
  orders: TradeOrder[]
  /**
   * Watched prices drawn as the orders they stand in for. A plain order is a
   * watch by default now, so it has to sit in the Open orders tab and on the
   * chart like any other — one list built HERE, because two screens each
   * building their own was how the tab ended up empty while the chart drew
   * the line.
   */
  watchOrders: TradeOrder[]
  /**
   * The last refusal on each wallet and market.
   *
   * **The engine trades with nobody watching, so this is the only way it can
   * say no.** A refusal that comes back from a press throws to the hand that
   * pressed and becomes a toast; one that happens during a background pass
   * had nowhere to go, and a level the exchange had refused twenty times
   * still drew as "waiting". Empty is the ordinary state.
   */
  refusals: ReadonlyMap<string, LiveRefusal>
  /**
   * Orders asked for whose answer has not come back yet. Kept apart from the
   * ones that really exist: the chart draws them so a press is seen at once,
   * and nothing offers to change or cancel something the server has never
   * heard of.
   */
  placing: TradeOrder[]
  /** Every visible execution, including entries for positions still open. */
  fills: LiveFill[]
  /**
   * Finished round trips, newest first — the Journal tab. Practice and real
   * in one list, each row saying which it was, because the question you ask a
   * journal is "how did that go" and the answer reads the same either way.
   */
  trades: LiveTrade[]
  /** Load the next older Journal page without changing the polled page. */
  loadOlderTrades: () => Promise<void>
  olderTradesBusy: boolean
  olderTradesDone: boolean
  /** Every smart order still working across every wallet, of either kind. */
  smartOrders: SmartOrder[]
  /** Restarts one strategy after its refusal has been fixed. */
  resumeSmartOrder: (order: SmartOrder) => Promise<boolean>
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
  /**
   * BOTH halves of the read have landed — practice and real alike.
   *
   * `loading` turns false the moment EITHER half lands, because a table that
   * draws one kind of row has its whole answer as soon as its own half is in.
   * A list spanning both halves does not: with `loading` false and the
   * exchange still on its way, a screen whose every waiting level is on a real
   * wallet holds an empty practice answer and cannot tell that apart from
   * having nothing. Whatever is about to say "there is nothing here" waits for
   * this instead.
   *
   * A half that REFUSED has not landed and does not count. It leaves its
   * answer null, exactly as it did before it was ever asked, and a half that
   * was never seen is the one thing that must not pass as "none". Both
   * refusing is `failed`, which has its own wording.
   */
  settled: boolean
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
    side: TradeSide
    px: number
    sz: number
    leverage: number
    reduceOnly: boolean
    tpPx: number | null
    slPx: number | null
  }) => void
  move: (walletId: string, orderId: string, px: number) => Promise<void>
  cancel: (order: TradeOrder) => Promise<void>
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
    position: TradePosition,
    brackets: {
      targets: Array<{ px: number; sz: number | null }>
      slPx: number | null
    }
  ) => Promise<boolean>
  /**
   * From the chart: the same save, but silent and optimistic. Dragging a line
   * is its own confirmation — the line is where you put it — so it neither
   * announces itself nor waits for the server before showing the new price.
   */
  dragBrackets: (
    position: TradePosition,
    brackets: {
      targets: Array<{ px: number; sz: number | null }>
      slPx: number | null
    }
  ) => Promise<void>
  close: (position: TradePosition) => Promise<void>
  /**
   * Sells part of a position and leaves the rest running.
   *
   * A different mechanism from `close`, not a smaller version of it. `close`
   * pays the spread to be out now; this rests a reduce-only limit and follows
   * the price with it, which is what the trading rules ask of a close and what
   * makes taking some profit worth doing. Nothing is on the exchange the
   * moment this returns — the engine's next pass places it.
   *
   * An amount that turns out to be the whole position falls back to `close`,
   * decided on the server where the held size is known for certain.
   */
  closePart: (
    position: TradePosition,
    ask: { unit: "coins" | "usd"; amount: number }
  ) => Promise<void>
  flip: (walletId: string, marketKey: string) => Promise<void>
  closeAll: () => Promise<void>
  /**
   * The bin on a Journal row and the Remove button over ticked rows — one
   * door for both, taking however many trades were chosen. The trades' fills
   * come off the list and nothing else moves: a practice wallet's cash is the
   * sum of its fills, so really removing one would change what the wallet is
   * worth.
   */
  hideTrades: (trades: readonly LiveTrade[]) => Promise<void>
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
    params: PlaceGridParams
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
    stopLoss: GridStop
  ) => Promise<boolean>
  /**
   * Start or stop a grid following price up. Switching it on also clears the
   * finish line, because a range that slides up ahead of price can never reach
   * one.
   */
  setGridFollow: (
    walletId: string,
    gridId: string,
    following: { up: boolean; down: boolean }
  ) => Promise<boolean>
  /**
   * The other emergency button: every ladder and every grid you placed, stood
   * down at once, across every wallet holding one.
   *
   * Beside `closeAll` rather than inside it. What you are holding and what is
   * still waiting to buy are two different decisions, and a fast market is
   * exactly when somebody wants one without the other. This one buys nothing
   * more and sells nothing at all: the positions those orders opened stay open,
   * with their stops still under them.
   */
  cancelAllSmartOrders: () => Promise<void>
  /**
   * Every watched price called off at once, across every wallet holding one.
   *
   * A watched price is not resting anywhere until its level is touched, so
   * this is a row of database writes and they all go together. Nothing is
   * bought and nothing is sold: the lines leave the chart and that is all.
   */
  cancelAllWatchedOrders: () => Promise<void>
  /**
   * Empties one wallet: its ladders and grids called off, then everything it
   * holds sold with limits that follow the price.
   *
   * **Not `closeAll` scoped to a wallet.** `closeAll` pays the spread on every
   * coin to be out this second, and it only ever closes positions — the Close
   * all menu calls the ladders and watches off through their own functions
   * beside it, and either can be unticked. This calls them off first, always,
   * and then sells as a maker, which is what the trading rules ask of a close.
   * Being out this second is still `closeAll`.
   *
   * The selling happens in the engine, so this returns once every sale has
   * been STARTED, not once anything has sold.
   */
  flattenWallet: (walletId: string) => Promise<void>
  /**
   * Changes the leverage on a real position that is already open.
   *
   * Nothing is written here. The exchange is asked, and the row's leverage,
   * margin and liquidation price all come from the next portfolio read — so
   * what ends up on screen is the venue's answer, not what was asked for.
   */
  setPositionLeverage: (
    position: TradePosition,
    leverage: number
  ) => Promise<void>
  /**
   * Adds or takes back the cash behind one real isolated position. Signed:
   * a minus takes margin out, which is refused when it would bring the
   * liquidation price inside the position's own stop.
   */
  adjustPositionMargin: (
    position: TradePosition,
    dollars: number
  ) => Promise<void>
}

type PaperAnswer = {
  positions: TradePosition[]
  orders: TradeOrder[]
  fills: LiveFill[]
  trades: LiveTrade[]
  nextBefore: number | null
  smartOrders: SmartOrder[]
  wallets: { id: string; label: string }[]
}

type LiveAnswer = {
  positions: TradePosition[]
  orders: TradeOrder[]
  fills: LiveFill[]
  trades: LiveTrade[]
  nextBefore: number | null
  smartOrders: SmartOrder[]
  wallets: { id: string; label: string }[]
  refusals: LiveRefusal[]
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
  // A list with nothing to drop is handed back AS IS, not as a copy. A list
  // carried over from the last answer keeps its identity that way, and the
  // panels that save to localStorage when their list changes stay quiet.
  const scoped = <T extends { marketKey: string }>(list: T[]): T[] => {
    const kept = list.filter((one) => mine(one.marketKey))
    return kept.length === list.length ? list : kept
  }
  return {
    ...answer,
    positions: scoped(answer.positions),
    orders: scoped(answer.orders),
    fills: scoped(answer.fills),
    trades: scoped(answer.trades),
    smartOrders: scoped(answer.smartOrders),
  }
}

export function useTrading(
  wallet: TradeWallet | null,
  /** The page's exchange — the only one whose rows this hook answers with. */
  protocol: ProtocolId,
  /**
   * Whether the Journal is the tab on screen.
   *
   * Passed all the way to the server, where it decides whether a wallet's
   * trade history is read from the exchange at all. The Journal only changes
   * when a fill lands, so re-reading it while another tab is showing bought
   * nothing — and on Lighter, which allows sixty requests a minute for
   * everything, it was a real share of the allowance. A wallet that has just
   * filled is still read whatever tab is open.
   */
  journalOpen = false
): Trading {
  /**
   * Held in a ref, not read straight from the argument: switching tabs must
   * not restart the poll. A restart would cancel the request in flight and
   * fire a fresh one, which is a request spent to learn nothing. The next
   * tick simply asks with the new answer.
   */
  const journalOpenRef = React.useRef(journalOpen)
  React.useEffect(() => {
    journalOpenRef.current = journalOpen
  }, [journalOpen])

  const [paperAnswer, setPaperAnswer] = React.useState<PaperAnswer | null>(null)
  const [liveAnswer, setLiveAnswer] = React.useState<LiveAnswer | null>(null)
  const [olderTrades, setOlderTrades] = React.useState<LiveTrade[]>([])
  const [paperBefore, setPaperBefore] = React.useState<number | null>()
  const [liveBefore, setLiveBefore] = React.useState<number | null>()
  const [olderTradesBusy, setOlderTradesBusy] = React.useState(false)
  const olderRequestRef = React.useRef(0)
  const historyScope = `${protocol}:${[
    ...(paperAnswer?.wallets ?? []),
    ...(liveAnswer?.wallets ?? []),
  ]
    .map((wallet) => wallet.id)
    .sort()
    .join(",")}`
  React.useEffect(() => {
    let current = true
    olderRequestRef.current += 1
    queueMicrotask(() => {
      if (!current) return
      setOlderTrades([])
      setPaperBefore(undefined)
      setLiveBefore(undefined)
      setOlderTradesBusy(false)
    })
    return () => {
      current = false
    }
  }, [historyScope])
  // The whole read came back with nothing — both halves refused. With rows
  // already on screen the next tick is the retry and nothing is said; this
  // only ever surfaces while there is nothing to fall back on.
  const [failed, setFailed] = React.useState(false)
  // Counted, not a flag: two actions can overlap, and the first to finish
  // must not re-enable the buttons while the second is still running.
  const [pending, setPending] = React.useState(0)
  /** When the last read landed. The clock every hold is measured against. */
  const [readAt, setReadAt] = React.useState(() => Date.now())
  const refusalToastsRef = React.useRef<{
    protocol: ProtocolId
    pageOpenedAt: number
    shown: Set<string>
  } | null>(null)
  React.useEffect(() => {
    refusalToastsRef.current = {
      protocol,
      pageOpenedAt: Date.now(),
      shown: new Set<string>(),
    }
  }, [protocol])

  // Only the newest request may write state: an older answer landing after a
  // newer one would put stale trades over fresh ones.
  const requestRef = React.useRef(0)
  /** A read still on its way — the clock's poll skips its turn while it is. */
  const inFlightRef = React.useRef<Promise<boolean> | null>(null)
  // Prices dropped by a drag, still waiting for the server to agree. Each
  // carries the moment it was taken — see `holdExpired`.
  const [dropped, setDropped] = React.useState<
    ReadonlyMap<string, { px: number; at: number }>
  >(new Map())
  // Orders asked for whose answer is still on its way.
  const [placing, setPlacing] = React.useState<TradeOrder[]>([])
  // A smart order the server has confirmed — just placed, or just moved —
  // standing in until an ordinary read carries the same thing. The window
  // that placed it clears its preview lines as it closes, and a drag's drop
  // has nothing else to show, so without this the grid vanished off the
  // chart and came back a second later. `at` is when the hold was taken,
  // which for a moved grid is now rather than when it was first placed.
  const [placedSmart, setPlacedSmart] = React.useState<
    { order: SmartOrder; at: number }[]
  >([])
  // Orders whose × has been pressed, still being told to the exchange.
  const [cancelling, setCancelling] = React.useState<
    ReadonlyMap<string, number>
  >(new Map())
  // Keyed by wallet *and* market: two wallets can hold the same coin, and a
  // drag on one must not move the other one's lines while it saves.
  const [droppedBrackets, setDroppedBrackets] = React.useState<
    ReadonlyMap<
      string,
      {
        targets: Array<{ px: number; sz: number | null }>
        slPx: number | null
        at: number
      }
    >
  >(new Map())

  const bracketKey = (walletId: string, marketKey: string) =>
    `${walletId}:${marketKey}`

  /**
   * Whether a hold taken at this moment has waited long enough to let go.
   *
   * Judged against the clock the last read carried rather than the clock right
   * now: a render must give the same answer every time it runs, and a poll
   * every four seconds is far finer than a thirty-second patience needs.
   */
  const holdExpired = React.useCallback(
    (at: number | undefined) =>
      at !== undefined && readAt - at > HOLD_GIVE_UP_MS,
    [readAt]
  )

  /**
   * Holds a smart order the server just wrote — placed or moved — on screen,
   * replacing any older hold on the same row and sweeping out any that have
   * had their turn. Released when a read carries a copy at least as new.
   */
  const holdSmart = React.useCallback((order: SmartOrder) => {
    const at = Date.now()
    setPlacedSmart((held) => [
      ...held.filter(
        (one) => one.order.id !== order.id && at - one.at <= HOLD_GIVE_UP_MS
      ),
      { order, at },
    ])
  }, [])

  /** A dragged price still worth showing, or nothing if it has had its turn. */
  const heldPx = React.useCallback(
    (id: string) => {
      const held = dropped.get(id)
      return held === undefined || holdExpired(held.at) ? null : held.px
    },
    [dropped, holdExpired]
  )

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
  // The stamps each half was last given, sent back so the server can say
  // "unchanged" for the Journal and the smart orders. Kept per exchange.
  const stampsRef = React.useRef<{
    protocol: ProtocolId
    paper: { journal?: string; smart?: string }
    live: { journal?: string; smart?: string }
  }>({ protocol, paper: {}, live: {} })
  const refresh = React.useCallback(async (): Promise<boolean> => {
    const request = ++requestRef.current
    // Another exchange's stamps mean nothing here: start blank.
    if (stampsRef.current.protocol !== protocol) {
      stampsRef.current = { protocol, paper: {}, live: {} }
    }
    const stamps = stampsRef.current
    const paperScope = {
      protocol,
      journalStamp: stamps.paper.journal,
      smartOrdersStamp: stamps.paper.smart,
      journalOpen: journalOpenRef.current,
    }
    const liveScope = {
      protocol,
      journalStamp: stamps.live.journal,
      smartOrdersStamp: stamps.live.smart,
      journalOpen: journalOpenRef.current,
    }
    // The nudge goes out ALONGSIDE the reads, not before them. It tells the
    // engine to look at this wallet's ladders; the panel's rows do not come
    // from it, so waiting for it only meant the whole panel sat on a spinner
    // for as long as the slowest exchange took to answer a question nobody
    // on this screen had asked. Anything it changes shows on the next poll,
    // seconds later.
    //
    // **It is still waited for down at the bottom of this function**, even
    // though nothing on screen needs it. What this function's promise is
    // really for is the poll's "skip my turn while the last one is still
    // running" guard, and a nudge left running loose would slip out from
    // under that guard: one slow or rate-limited nudge, and the next tick
    // starts another, and another, each holding a database connection until
    // the pool runs out. That is the exact failure `poll` was written to
    // stop.
    const nudge = reconcileLiveSmartOrders().then(
      () => true,
      () => false
    )

    // **Each half lands on its own.** The two reads take very different
    // amounts of time — measured on 21 Aug 2026, the practice read was 3.5
    // seconds against the database while the exchange answered in 1.4 — and
    // waiting for both before drawing either meant every screen here sat on a
    // spinner for the slower one, on every visit. Whichever comes back first
    // now fills the tables, and the other joins it a moment later.
    //
    // The clock every optimistic hold is measured against moves with each
    // landing — see `holdExpired`.
    const mine = () => requestRef.current === request
    const paper = loadPaperPortfolio(paperScope).then(
      (value) => {
        if (!mine()) return false
        setReadAt(Date.now())
        // Off the ref, not the snapshot: the other half may have landed
        // first and written its own stamps in the meantime.
        stampsRef.current = {
          ...stampsRef.current,
          protocol,
          paper: {
            journal: value.journalStamp,
            smart: value.smartOrdersStamp,
          },
        }
        setPaperAnswer((was) =>
          scopedToProtocol(carryOver(value, was), protocol)
        )
        setFailed(false)
        return true
      },
      () => false
    )
    const live = loadLiveTrading(liveScope).then(
      (value) => {
        if (!mine()) return false
        setReadAt(Date.now())
        // Off the ref, not the snapshot: the other half may have landed
        // first and written its own stamps in the meantime.
        stampsRef.current = {
          ...stampsRef.current,
          protocol,
          live: {
            journal: value.journalStamp,
            smart: value.smartOrdersStamp,
          },
        }
        // Scoped BEFORE the unreachable-rows merge, so kept-alive rows from a
        // wallet the exchange missed are already this page's rows and nothing
        // foreign can ride back in through the merge.
        setLiveAnswer((was) =>
          keepUnreachableRows(
            was,
            scopedToProtocol(carryOver(value, was), protocol)
          )
        )
        setFailed(false)
        return true
      },
      () => false
    )

    const [paperLanded, liveLanded] = await Promise.all([paper, live, nudge])
    if (!mine()) return false
    // Only when BOTH refused is there nothing to show. One half failing keeps
    // its last good answer, which is what it has always done.
    setFailed(!paperLanded && !liveLanded)
    return paperLanded && liveLanded
  }, [protocol])

  /** Reads until one lands, so a dragged price is never let go too early. */

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
    ): Promise<boolean> => {
      setCancelling((held) => new Map(held).set(key, Date.now()))
      const forget = () =>
        setCancelling((held) => {
          if (!held.has(key)) return held
          const next = new Map(held)
          next.delete(key)
          return next
        })

      try {
        await action()
      } catch (error) {
        forget()
        showErrorToast(describeError(error))
        void refresh()
        return false
      }
      if (done) toast.success(done)
      // Not released here. The row is held hidden until a read comes back
      // WITHOUT it — see the reconciling effects below — because a read
      // already on its way knows nothing about this and would flash it back.
      void refresh()
      return true
    },
    [refresh]
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
  /**
   * The server's list, plus anything just placed that has not reached it yet.
   *
   * Judged here rather than in an effect, for the same reason `placingShown`
   * is: the hand-off happens in the render the real row arrives in, so there is
   * never a frame with neither drawn. Matched on the id, because the server
   * hands back the row it wrote.
   */
  const withJustPlaced = React.useMemo(() => {
    if (placedSmart.length === 0) return allSmartOrders
    const held = placedSmart.filter((one) => !holdExpired(one.at))
    if (held.length === 0) return allSmartOrders
    // A held row the server already knows about REPLACES the server's copy
    // while ours is newer — a poll that left before a drag was saved would
    // otherwise put the old prices back for a frame. One the server has not
    // returned yet is appended, so a placement shows before the next read.
    const overriding = held.filter((one) =>
      allSmartOrders.some(
        (real) =>
          real.id === one.order.id && one.order.updatedAt > real.updatedAt
      )
    )
    const appending = held.filter(
      (one) => !allSmartOrders.some((real) => real.id === one.order.id)
    )
    if (overriding.length === 0 && appending.length === 0) {
      return allSmartOrders
    }
    return [
      ...allSmartOrders.map(
        (real) =>
          overriding.find((one) => one.order.id === real.id)?.order ?? real
      ),
      ...appending.map((one) => one.order),
    ]
  }, [allSmartOrders, placedSmart, holdExpired])

  const smartOrders = React.useMemo(() => {
    if (cancelling.size === 0) return withJustPlaced
    return withJustPlaced
      .filter((order) => !cancelling.has(order.id))
      .map((order) => {
        if (order.kind === "dca") {
          if (
            !order.plan.rungs.some((_, at) =>
              cancelling.has(`${order.id}#${at}`)
            )
          )
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
          if (
            !order.plan.levels.some((_, at) =>
              cancelling.has(`${order.id}#${at}`)
            )
          )
            return order
          return {
            ...order,
            plan: {
              ...order.plan,
              levels: order.plan.levels.map((level, at) =>
                cancelling.has(`${order.id}#${at}`) &&
                level.status === "waiting"
                  ? { ...level, status: "cancelled" as const }
                  : level
              ),
            },
          }
        }
        return order
      })
  }, [withJustPlaced, cancelling])
  // Derived rather than fetched separately: the screens that predate the grid
  // still want ladders alone, and one list of both is the truth they filter.
  const ladders = React.useMemo(
    () =>
      smartOrders.filter((order): order is SmartLadder => order.kind === "dca"),
    [smartOrders]
  )
  const grids = React.useMemo(
    () =>
      smartOrders.filter((order): order is SmartGrid => order.kind === "grid"),
    [smartOrders]
  )

  // Live only: a practice wallet's orders are filled from our own numbers and
  // nothing outside can refuse one.
  const refusals = React.useMemo(() => {
    const byWalletMarket = new Map<string, LiveRefusal>()
    for (const one of liveAnswer?.refusals ?? EMPTY_REFUSALS) {
      byWalletMarket.set(liveRefusalKey(one.walletId, one.marketKey), one)
    }
    return byWalletMarket
  }, [liveAnswer])

  React.useEffect(() => {
    if (!liveAnswer) return
    const state = refusalToastsRef.current
    if (!state || state.protocol !== protocol) return
    for (const alert of refusalAlertsForActiveWatches(
      liveAnswer.refusals,
      liveAnswer.smartOrders,
      state.pageOpenedAt
    )) {
      if (state.shown.has(alert.key)) continue
      state.shown.add(alert.key)
      showErrorToast(alert.refusal.note)
    }
  }, [liveAnswer, protocol])

  const trades = React.useMemo((): LiveTrade[] => {
    const paper = paperAnswer?.trades ?? EMPTY_TRADES
    const live = liveAnswer?.trades ?? EMPTY_TRADES
    const all =
      paper.length === 0
        ? live
        : live.length === 0
          ? paper
          : [...paper, ...live].sort(
              (left, right) => right.closedAt - left.closedAt
            )
    // A row being removed leaves the Journal at once, and stays gone until a
    // read comes back without it.
    const newestIds = new Set(all.map((trade) => trade.id))
    const combined = [
      ...all,
      ...olderTrades.filter((trade) => !newestIds.has(trade.id)),
    ].sort((left, right) => right.closedAt - left.closedAt)
    if (cancelling.size === 0) return combined
    return combined.filter(
      (trade) =>
        !cancelling.has(trade.id) || holdExpired(cancelling.get(trade.id))
    )
  }, [paperAnswer, liveAnswer, olderTrades, cancelling, holdExpired])

  const loadOlderTrades = React.useCallback(async () => {
    if (olderTradesBusy) return
    const nextPaper =
      paperBefore === undefined ? paperAnswer?.nextBefore : paperBefore
    const nextLive =
      liveBefore === undefined ? liveAnswer?.nextBefore : liveBefore
    if (nextPaper == null && nextLive == null) return
    const request = ++olderRequestRef.current
    setOlderTradesBusy(true)
    try {
      const [paper, live] = await Promise.all([
        nextPaper == null ? null : loadOlderPaperTrades(nextPaper),
        nextLive == null ? null : loadOlderLiveTrades(nextLive),
      ])
      const pages = [paper, live].filter(
        (page): page is NonNullable<typeof page> => page !== null
      )
      if (request !== olderRequestRef.current) return
      const mine = pages.flatMap((page) =>
        page.trades.filter(
          (trade) => parseMarketKey(trade.marketKey)?.protocol === protocol
        )
      )
      setOlderTrades((current) => {
        const byId = new Map(current.map((trade) => [trade.id, trade]))
        for (const trade of mine) byId.set(trade.id, trade)
        return [...byId.values()]
      })
      if (paper) setPaperBefore(paper.nextBefore)
      if (live) setLiveBefore(live.nextBefore)
    } catch {
      if (request === olderRequestRef.current) {
        showErrorToast("Older trades could not be read. Try again.")
      }
    } finally {
      if (request === olderRequestRef.current) setOlderTradesBusy(false)
    }
  }, [
    liveAnswer?.nextBefore,
    liveBefore,
    olderTradesBusy,
    paperAnswer?.nextBefore,
    paperBefore,
    protocol,
  ])

  const fills = React.useMemo(
    () => [
      ...(paperAnswer?.fills ?? EMPTY_FILLS),
      ...(liveAnswer?.fills ?? EMPTY_FILLS),
    ],
    [paperAnswer, liveAnswer]
  )

  /**
   * The just-placed orders still worth drawing.
   *
   * A ghost stands in until the real thing is on screen — a resting order, or
   * the watched price a plain order becomes. Matched on what was asked for
   * rather than on an id: the venue gives the order one of its own, and a
   * watched price never had one. Judged HERE rather than in an effect so the
   * hand-off happens in the same render the real row arrives in, leaving no
   * frame where neither is drawn.
   */
  const placingShown = React.useMemo(() => {
    if (placing.length === 0) return placing
    const real = [...allOrders, ...allSmartOrders]
    return placing.filter((ghost) => {
      if (holdExpired(ghost.createdAt)) return false
      // **An order that filled at once became a POSITION, not an order.**
      // Looking only for a resting order or a watched price left the ghost
      // drawn beside the Entry line it had already turned into — two lines
      // for one trade until the ghost timed out.
      //
      // The price is not compared here: what was paid is rarely what was
      // asked, and the position's entry is an average once anything is added
      // to it. The market and the direction are enough, because the Entry
      // line the ghost would sit beside is the very thing being looked for.
      const filled = allPositions.some(
        (position) =>
          position.walletId === ghost.walletId &&
          position.marketKey === ghost.marketKey &&
          position.szi > 0 === (ghost.side === "buy")
      )
      if (filled) return false
      return !real.some((one) => {
        const px =
          "px" in one
            ? one.px
            : ((one.plan as { triggerPx?: number }).triggerPx ?? null)
        const side =
          "side" in one
            ? one.side
            : ((one.plan as { side?: string }).side ?? null)
        return (
          one.walletId === ghost.walletId &&
          one.marketKey === ghost.marketKey &&
          side === ghost.side &&
          samePrice(px ?? null, ghost.px)
        )
      })
    })
  }, [placing, allOrders, allSmartOrders, allPositions, holdExpired])

  const orders = React.useMemo(() => {
    const shown =
      cancelling.size === 0
        ? allOrders
        : allOrders.filter(
            (order) =>
              !cancelling.has(order.id) || holdExpired(cancelling.get(order.id))
          )
    if (dropped.size === 0) return shown
    return shown.map((order) => {
      const held = dropped.get(order.id)
      // A hold that has waited long enough stops speaking for the row: if the
      // venue put the order somewhere else, that is what has to show.
      return held === undefined || holdExpired(held.at)
        ? order
        : { ...order, px: held.px }
    })
  }, [allOrders, dropped, cancelling, holdExpired])

  const watchOrders = React.useMemo(
    () =>
      smartOrders.flatMap((order): TradeOrder[] =>
        order.kind === "watch" &&
        // **Still drawn while it is being taken, but never beside its own
        // order.** The moment a level is reached the watch stops waiting and
        // starts buying, and what it becomes — an order on the exchange, or
        // a position — only appears on the read after that. Dropping the line
        // the instant it fired left the chart empty for a few seconds and
        // then a bar arrived out of nowhere, so it is held until the thing it
        // turned into is really there.
        //
        // Once the exchange has named that order, the order IS the row: it
        // carries the real price and can be dragged and cancelled. Drawing
        // the watch as well put the same single order on the chart twice
        // under two labels — one LINK order on Phemex showed as two rows in
        // the app on 20 Aug 2026.
        (order.plan.phase === "waiting" ||
          (order.plan.phase === "taking" &&
            order.plan.orderId === null &&
            !allPositions.some(
              (position) =>
                position.walletId === order.walletId &&
                position.marketKey === order.marketKey
            ))) &&
        (!cancelling.has(order.id) || holdExpired(cancelling.get(order.id)))
          ? [
              {
                id: order.id,
                walletId: order.walletId,
                marketKey: order.marketKey,
                side: order.plan.side,
                // A drag's dropped price holds here the same way it does for a
                // real order, so the line never blinks back mid-save.
                px: heldPx(order.id) ?? order.plan.triggerPx,
                sz: order.plan.sz,
                leverage: order.plan.leverage,
                maxLeverage: order.plan.maxLeverage,
                reduceOnly: order.plan.reduceOnly,
                tpPx: order.plan.tpPx,
                slPx: order.plan.slPx,
                createdAt: order.createdAt,
                updatedAt: order.updatedAt,
                // No order exists behind this row — see `watched` on
                // `TradeOrder`. Everything that would reach for one steps
                // aside; the × still works and goes the smart-order way.
                watched: true,
              },
            ]
          : []
      ),
    [smartOrders, dropped, cancelling, holdExpired, allPositions]
  )

  const positions = React.useMemo(() => {
    // A position being closed leaves the screen at once — see `callOff`.
    const shown =
      cancelling.size === 0
        ? allPositions
        : allPositions.filter((position) => {
            const key = bracketKey(position.walletId, position.marketKey)
            return !cancelling.has(key) || holdExpired(cancelling.get(key))
          })
    if (droppedBrackets.size === 0) return shown
    return shown.map((position) => {
      const held = droppedBrackets.get(
        `${position.walletId}:${position.marketKey}`
      )
      // The moment it was taken travels with it and must not travel onto the
      // position; a hold that has had its turn stops speaking for the row.
      return held && !holdExpired(held.at)
        ? {
            ...position,
            targets: held.targets.map((target) => ({
              ...target,
              orderId: null,
            })),
            tpPx: held.targets[0]?.px ?? null,
            tpSz: held.targets[0]?.sz ?? null,
            slPx: held.slPx,
          }
        : position
    })
  }, [allPositions, droppedBrackets, cancelling, holdExpired])

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
      const ghost: TradeOrder = {
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
          // A refusal means there is no order for this line to stand in for.
          // Drop it before showing the reason, so the chart never says the
          // rejected order is still being sent beside its refusal toast.
          setPlacing((held) => held.filter((order) => order.id !== ghost.id))
          showErrorToast(
            kind === "paper"
              ? getPaperErrorMessage(error)
              : getLiveErrorMessage(error)
          )
        } finally {
          // A successful ghost stays until the real order is actually on
          // screen. Removing it when the answer came back left a gap where
          // the row vanished and then reappeared as the watch a moment later.
          // A refused ghost was removed in the catch above because no real
          // row is coming to replace it.
          void refresh()
        }
      })()
    },
    [walletId, wallet, refresh]
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
      return await run(() =>
        updatePaperOrder({ walletId, orderId, ...changes })
      )
    },
    [run, findOrder]
  )

  const move: Trading["move"] = React.useCallback(
    async (walletId, orderId, px) => {
      const order = findOrder(orderId)
      // Let go only of this drop. A second drag while the first is still
      // saving owns the line now, and releasing its hold here would show the
      // first price again for as long as the second save takes.
      const at = Date.now()

      setDropped((held) => {
        // Anything that has waited long enough is dropped as this one is
        // taken, so the notes cannot pile up over a long session.
        const next = new Map(
          [...held].filter(([, one]) => !holdExpired(one.at))
        )
        return next.set(orderId, { px, at })
      })
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
          order?.live ? getLiveErrorMessage(error) : getPaperErrorMessage(error)
        )
        // A refusal releases the hold at once. Whatever the venue did with
        // the order, the dropped price is not where it is, and holding the
        // line there for the next thirty seconds shows a price that is not on
        // the exchange — the one thing this hook must never do. Only this
        // drop is let go: a second drag started since owns the line now.
        setDropped((held) => {
          if (held.get(orderId)?.at !== at) return held
          const next = new Map(held)
          next.delete(orderId)
          return next
        })
      } finally {
        // No release on the way through. A drag that worked keeps its line at
        // the dropped price until a read comes back carrying it: a read
        // already on its way knows nothing about this drag and would snap the
        // line back for a moment.
        void refresh()
      }
    },
    [refresh, findOrder]
  )

  const cancel: Trading["cancel"] = React.useCallback(
    async (order) => {
      // Cancelling costs nothing, so there is no question asked first — and
      // nothing is said afterwards either: the row disappearing is the answer.
      const kind = orderCancelKind(order)
      const { id: orderId, walletId, marketKey } = order
      /**
       * The order resting on the exchange belongs to a part close that is
       * chasing — so the × means "stop closing".
       *
       * Taking that one order back would be answered by the engine placing
       * another a few seconds later, because a chase's whole job is to keep an
       * order there until it fills. The row would come back and the press
       * would look broken. Calling the close off is what stops it, and the
       * engine takes the resting order back on its next pass.
       */
      const chasing = smartOrders.find(
        (one) =>
          one.kind === "watch" &&
          one.plan.maker &&
          one.plan.orderId === orderId &&
          one.walletId === walletId
      )
      await callOff(
        orderId,
        async () => {
          if (chasing) {
            return await cancelWatch({ walletId, ladderId: chasing.id })
          }
          // A watched price is drawn as an order and cancelled as one, but
          // there is no order anywhere to cancel — the row IS the order until
          // its level is touched, so it goes back through the smart-order door.
          if (kind === "watch") {
            const result = await cancelWatch({ walletId, ladderId: orderId })
            // A watch placed seconds ago may still be standing in from the
            // placement answer while the full account read catches up.
            setPlacedSmart((held) =>
              held.filter((one) => one.order.id !== orderId)
            )
            return result
          }
          if (kind === "live") {
            return cancelLiveOrder({
              walletId,
              marketKey,
              orderId,
              side: order.side,
              px: order.px,
              sz: order.sz,
            })
          }
          return cancelPaperOrder(walletId, orderId)
        },
        chasing || kind === "watch"
          ? getTradingSmartOrderError
          : kind === "live"
            ? getLiveErrorMessage
            : getPaperErrorMessage
      )
    },
    [callOff, smartOrders]
  )

  const setBrackets: Trading["setBrackets"] = React.useCallback(
    async (position, brackets) => {
      const { walletId, marketKey } = position
      if (position.live !== undefined) {
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
    [run, runWith]
  )

  const dragBrackets: Trading["dragBrackets"] = React.useCallback(
    async (position, brackets) => {
      const { walletId, marketKey } = position
      const live = position.live !== undefined
      const key = bracketKey(walletId, marketKey)

      setDroppedBrackets((held) => {
        const next = new Map(
          [...held].filter(([, one]) => !holdExpired(one.at))
        )
        return next.set(key, { ...brackets, at: Date.now() })
      })
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
        // Held until a position comes back carrying these levels — same
        // reason as a dragged price.
        void refresh()
      }
    },
    [refresh]
  )

  const close: Trading["close"] = React.useCallback(
    async (position) => {
      // The row goes the moment it is pressed and the exchange is told behind
      // it, the same way cancelling works. Telling the exchange takes three or
      // four seconds — the close itself, then a fresh read of the account —
      // and a position that sits there through all of it reads as a close
      // that did not happen.
      const { walletId, marketKey } = position
      const live = position.live !== undefined
      // The market key names its network, and the words follow it — a testnet
      // close must never announce itself as real money.
      const testnet = parseMarketKey(marketKey)?.network === "testnet"
      await callOff(
        bracketKey(walletId, marketKey),
        () =>
          live
            ? closeLivePosition(walletId, marketKey)
            : closePaperPosition(walletId, marketKey),
        live ? getLiveErrorMessage : getPaperErrorMessage,
        live
          ? `${testnet ? "Testnet" : "Real"} position closed in ${nameOf(walletId)}.`
          : `Position closed in ${nameOf(walletId)}.`
      )
    },
    [callOff, nameOf]
  )

  const closePart: Trading["closePart"] = React.useCallback(
    async (position, ask) => {
      const { walletId, marketKey } = position
      const symbol = marketSymbol(marketKey)
      // Not `callOff`: the row does NOT go away. Part of the position stays,
      // and the piece being sold has not been sold yet — the engine has to
      // rest an order and wait for it to fill. Hiding the row here would say
      // the money had moved when nothing has left the account.
      // **What is said afterwards depends on which road it took**, and the
      // server decides that, not the window. An amount that covered the
      // position is market-closed, and telling somebody an order was following
      // the price when the coin has already been sold is a false statement
      // about money that has moved. So the toast is raised here, once the
      // answer is in, rather than handed to `runWith` before the call.
      let sold: PartCloseOutcome["kind"] | null = null
      const went = await runWith(getSmartOrderErrorMessage, async () => {
        const answer = await closePartOfPosition({
          walletId,
          marketKey,
          unit: ask.unit,
          amount: ask.amount,
        })
        if (answer.kind === "whole") {
          await (position.live !== undefined
            ? closeLivePosition(walletId, marketKey)
            : closePaperPosition(walletId, marketKey))
        }
        sold = answer.kind
        return answer
      })
      if (!went || sold === null) return
      toast.success(
        sold === "whole"
          ? `All of ${symbol} sold in ${nameOf(walletId)} — that amount covered the position.`
          : `Selling part of ${symbol} in ${nameOf(walletId)}. The order follows the price until it fills.`
      )
    },
    [runWith, nameOf]
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
        const { placed, passed, ladder } = await placeDcaLadder({
          walletId,
          ...input,
        })
        // On screen now, not after the next read — same as a placed grid.
        holdSmart(ladder)
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
    [walletId, wallet, nameOf, refresh, holdSmart]
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

  const resumeSmartOrder: Trading["resumeSmartOrder"] = React.useCallback(
    async (order) =>
      await runWith(
        getTradingSmartOrderError,
        () =>
          resumeSmartOrderApi({
            walletId: order.walletId,
            ladderId: order.id,
          }),
        `${marketSymbol(order.marketKey)} smart order resumed.`
      ),
    [runWith]
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
        const { levels, totalCost, grid } = await placeGridOrder({
          walletId,
          ...input,
        })
        // On screen now, not after the next read.
        holdSmart(grid)
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
    [walletId, wallet, nameOf, refresh, holdSmart]
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
      //
      // Not `runWith`, on purpose. The drag already shows its answer — the
      // layer holds the dropped price — so dimming the whole workspace while
      // it saves said "wait" about something that was not waiting. And the
      // server hands the saved grid back, so there is nothing to re-read:
      // one write, no refresh, and the poll agrees a few seconds later.
      try {
        const { grid } = await moveGridRangeApi({ walletId, gridId, ...range })
        holdSmart(grid)
        return true
      } catch (error) {
        showErrorToast(getTradingSmartOrderError(error))
        return false
      }
    },
    [holdSmart]
  )

  const reshapeGrid: Trading["reshapeGrid"] = React.useCallback(
    async (walletId, gridId, shape) => {
      return await runWith(
        getTradingSmartOrderError,
        async () => {
          const { grid } = await reshapeGridApi({ walletId, gridId, ...shape })
          // The redrawn levels are on the chart before the re-read lands.
          holdSmart(grid)
        },
        "Grid re-sliced."
      )
    },
    [runWith, holdSmart]
  )

  const moveGridExit: Trading["moveGridExit"] = React.useCallback(
    async (walletId, gridId, which, px) => {
      // Same shape as `moveGridRange`, for the same reasons.
      try {
        const { grid } = await moveGridExitApi({ walletId, gridId, which, px })
        holdSmart(grid)
        return true
      } catch (error) {
        showErrorToast(getTradingSmartOrderError(error))
        return false
      }
    },
    [holdSmart]
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

  const setGridFollow: Trading["setGridFollow"] = React.useCallback(
    async (walletId, gridId, following) => {
      return await runWith(
        getTradingSmartOrderError,
        () =>
          setGridFollowApi({
            walletId,
            gridId,
            follow: following.up,
            followDown: following.down,
          }),
        following.up || following.down
          ? "Grid following changed."
          : "Grid stays where it is."
      )
    },
    [runWith]
  )

  const hideTrades: Trading["hideTrades"] = React.useCallback(
    async (list) => {
      if (list.length === 0) return
      // Every row goes on the press like everything else — see the note at
      // the top of this file. Waiting for the exchange and then for the next
      // read left a removed row sitting there until the page was reloaded.
      const pressedAt = Date.now()
      setCancelling((held) => {
        const next = new Map(held)
        for (const trade of list) next.set(trade.id, pressedAt)
        return next
      })

      // A trade is not stored; its fills are. Hiding them is what makes the
      // rows go. One list, two stores — each row says which it came from —
      // and a real wallet's fills are keyed by wallet, so real trades are
      // sent per wallet. Batches never split one trade across two calls:
      // half a hidden trade would come back as a different, wrong-looking
      // trade rebuilt from the fills that were left.
      const calls: Array<{ trades: LiveTrade[]; live: boolean }> = []
      calls.push(
        ...batchTrades(list.filter((trade) => !trade.live)).map((trades) => ({
          trades,
          live: false,
        }))
      )
      const byWallet = new Map<string, LiveTrade[]>()
      for (const trade of list.filter((one) => one.live)) {
        const wallet = byWallet.get(trade.walletId)
        if (wallet) wallet.push(trade)
        else byWallet.set(trade.walletId, [trade])
      }
      for (const wallet of byWallet.values()) {
        calls.push(
          ...batchTrades(wallet).map((trades) => ({ trades, live: true }))
        )
      }

      const answers = await Promise.allSettled(
        calls.map(({ trades, live }) =>
          live
            ? hideLiveTrade(trades[0].walletId, tradeFillIds(trades))
            : hidePaperTrade(tradeFillIds(trades))
        )
      )

      // A refused batch comes straight back on screen and says why once;
      // whatever went through stays gone.
      const removed = new Set<string>()
      const refused = new Set<string>()
      let firstRefusal: string | null = null
      answers.forEach((answer, at) => {
        const call = calls[at]
        if (answer.status === "fulfilled") {
          for (const trade of call.trades) removed.add(trade.id)
          return
        }
        for (const trade of call.trades) refused.add(trade.id)
        firstRefusal ??= (
          call.live ? getLiveErrorMessage : getPaperErrorMessage
        )(answer.reason)
      })

      if (refused.size > 0) {
        setCancelling((held) => {
          const next = new Map(held)
          for (const id of refused) next.delete(id)
          return next
        })
      }
      if (firstRefusal) showErrorToast(firstRefusal)
      if (removed.size > 0) {
        toast.success(
          removed.size === 1
            ? "Removed from the Journal."
            : `Removed ${removed.size} trades from the Journal.`
        )
        setOlderTrades((current) =>
          current.filter((one) => !removed.has(one.id))
        )
      }
      void refresh()
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

  /**
   * Every ladder and grid you placed, stood down in one press.
   *
   * **Each wallet is asked once, and the wallets are asked together.** The
   * server walks one wallet's orders at a time; two wallets have nothing to do
   * with each other, and this is the button somebody presses because the market
   * is moving, so a real wallet must never queue behind a practice one.
   *
   * Every row leaves the screen on the press, the way one Stop does, and a
   * refused one comes straight back and says why. Refusals are what this
   * reports: "four cancelled and two refused" is not a success, and the two
   * still running have to be visible to whoever pressed it.
   */
  const cancelAllSmartOrders: Trading["cancelAllSmartOrders"] =
    React.useCallback(async () => {
      const working = laddersAndGridsYouPlaced(smartOrders)
      if (working.length === 0) return
      const walletIds = [...new Set(working.map((one) => one.walletId))]
      const pressedAt = Date.now()

      setPending((count) => count + 1)
      setCancelling((held) => {
        const next = new Map(held)
        for (const order of working) next.set(order.id, pressedAt)
        return next
      })
      try {
        const answers = await Promise.allSettled(
          walletIds.map((walletId) => cancelAllSmartOrdersApi({ walletId }))
        )

        let stood = 0
        // **Carried by id, never by market.** Two wallets can hold a ladder on
        // the same coin, and matching a refusal back to a row by its coin alone
        // would put the OTHER wallet's row back on screen after that one really
        // was called off. The same reason the drag holds are keyed by wallet
        // and market rather than by market.
        const refused: {
          id: string
          walletId: string
          marketKey: string
          reason: string
        }[] = []
        answers.forEach((answer, at) => {
          if (answer.status === "rejected") {
            // The whole wallet refused — finding the wallet, or a key that is
            // gone. Every order on it is still running, so every one of them
            // goes back on screen.
            const reason = getTradingSmartOrderError(answer.reason)
            for (const order of working) {
              if (order.walletId === walletIds[at]) {
                refused.push({
                  id: order.id,
                  walletId: order.walletId,
                  marketKey: order.marketKey,
                  reason,
                })
              }
            }
            return
          }
          stood += answer.value.stood.length
          for (const one of answer.value.refused) {
            refused.push({
              id: one.id,
              walletId: walletIds[at],
              marketKey: one.marketKey,
              reason: one.reason,
            })
          }
        })

        // A refused order was never called off, so its hold is let go at once
        // and its row comes back rather than sitting hidden for thirty seconds.
        if (refused.length > 0) {
          setCancelling((held) => {
            const next = new Map(held)
            for (const one of refused) next.delete(one.id)
            return next
          })
          // Named with its wallet, because this panel lists several and the
          // coin on its own does not say which one is still running.
          const named = (one: (typeof refused)[number]) =>
            `${marketSymbol(one.marketKey)} in ${nameOf(one.walletId)}`
          showErrorToast(
            refused.length === 1
              ? `${named(refused[0])} is still running: ${refused[0].reason}`
              : `${refused.length} are still running — ${refused
                  .map(named)
                  .join(", ")}. The first said: ${refused[0].reason}`
          )
        }
        if (stood > 0) {
          toast.success(
            stood === 1
              ? "1 smart order stopped — what it bought stays."
              : `${stood} smart orders stopped — what they bought stays.`
          )
        }
      } finally {
        setPending((count) => count - 1)
        void refresh()
      }
    }, [smartOrders, refresh, nameOf])

  /**
   * Every watched price called off in one press.
   *
   * **Together, not one at a time.** A watch is a row in this app's own
   * database until its level is touched — nothing is resting at an exchange —
   * so there is no venue queue to be polite about, and this is a press made
   * while a market is moving.
   *
   * Each one goes through `cancelWatch`, the same door the × on its own row
   * uses, so a sweep can never call a watch off differently from a hand on
   * each line. Every row leaves the screen on the press and a refused one
   * comes straight back and says why.
   */
  const cancelAllWatchedOrders: Trading["cancelAllWatchedOrders"] =
    React.useCallback(async () => {
      const waiting = watchOrders
      if (waiting.length === 0) return
      const pressedAt = Date.now()

      setPending((count) => count + 1)
      setCancelling((held) => {
        const next = new Map(held)
        for (const order of waiting) next.set(order.id, pressedAt)
        return next
      })
      try {
        const answers = await Promise.allSettled(
          waiting.map((order) =>
            cancelWatch({ walletId: order.walletId, ladderId: order.id })
          )
        )

        const refused: { order: TradeOrder; reason: string }[] = []
        const gone: string[] = []
        answers.forEach((answer, at) => {
          if (answer.status === "rejected") {
            refused.push({
              order: waiting[at],
              reason: getTradingSmartOrderError(answer.reason),
            })
            return
          }
          gone.push(waiting[at].id)
        })

        // One placed seconds ago may still be standing in from the placement
        // answer while the full account read catches up — see `cancel`.
        if (gone.length > 0) {
          const off = new Set(gone)
          setPlacedSmart((held) => held.filter((one) => !off.has(one.order.id)))
        }

        // A refused watch was never called off, so its hold is let go at once
        // and its line comes back rather than sitting hidden for thirty
        // seconds.
        if (refused.length > 0) {
          setCancelling((held) => {
            const next = new Map(held)
            for (const one of refused) next.delete(one.order.id)
            return next
          })
          // Named with its wallet, because this panel lists several and the
          // coin on its own does not say which one is still waiting.
          const named = (one: (typeof refused)[number]) =>
            `${marketSymbol(one.order.marketKey)} in ${nameOf(one.order.walletId)}`
          showErrorToast(
            refused.length === 1
              ? `${named(refused[0])} is still waiting: ${refused[0].reason}`
              : `${refused.length} are still waiting — ${refused
                  .map(named)
                  .join(", ")}. The first said: ${refused[0].reason}`
          )
        }
        if (gone.length > 0) {
          toast.success(
            gone.length === 1
              ? "1 watched price called off."
              : `${gone.length} watched prices called off.`
          )
        }
      } finally {
        setPending((count) => count - 1)
        void refresh()
      }
    }, [watchOrders, refresh, nameOf])

  const setPositionLeverage: Trading["setPositionLeverage"] = React.useCallback(
    async (position, leverage) => {
      const { walletId, marketKey } = position
      if (position.live === undefined) {
        showErrorToast(
          "A practice position's leverage decided how big it was when it was placed — there is nothing behind it to move now. Close it and open again at the leverage you want."
        )
        return
      }
      await runWith(
        getLiveErrorMessage,
        () =>
          changeLiveLeverage({
            walletId,
            marketKey,
            leverage,
            positionSide: position.szi > 0 ? "long" : "short",
          }),
        `${marketSymbol(marketKey)} asked to change to ${leverage}× in ${nameOf(walletId)}. The row shows what the exchange settled on.`
      )
    },
    [runWith, nameOf]
  )

  const adjustPositionMargin: Trading["adjustPositionMargin"] =
    React.useCallback(
      async (position, dollars) => {
        const { walletId, marketKey } = position
        if (position.live === undefined) {
          showErrorToast(
            "A practice wallet has no lender to take cash from. Close the position and open again at the size you want."
          )
          return
        }
        await runWith(
          getLiveErrorMessage,
          () =>
            changeLiveMargin({
              walletId,
              marketKey,
              dollars,
              positionSide: position.szi > 0 ? "long" : "short",
            }),
          dollars > 0
            ? `${formatUsd(dollars)} asked to go behind ${marketSymbol(marketKey)} in ${nameOf(walletId)}. The row shows what the exchange settled on.`
            : `${formatUsd(-dollars)} asked back out of ${marketSymbol(marketKey)} in ${nameOf(walletId)}. The row shows what the exchange settled on.`
        )
      },
      [runWith, nameOf]
    )

  const flattenWallet: Trading["flattenWallet"] = React.useCallback(
    async (walletId) => {
      setPending((count) => count + 1)
      try {
        const answer = await flattenWalletApi({ walletId })
        const where = nameOf(walletId)

        // **A refused cancel means nothing was sold**, and that is the whole
        // message: the wallet is exactly as it was apart from whatever did come
        // off, and the one order in the way has to be dealt with by hand.
        if (answer.cancelRefused.length > 0) {
          const first = answer.cancelRefused[0]
          showErrorToast(
            `Nothing was sold in ${where}. ${marketSymbol(first.marketKey)} would not come off: ${first.reason}` +
              (answer.cancelRefused.length > 1
                ? ` ${answer.cancelRefused.length - 1} more are still running.`
                : "")
          )
          return
        }
        if (answer.sellRefused.length > 0) {
          const first = answer.sellRefused[0]
          showErrorToast(
            `${answer.selling.length} of ${answer.selling.length + answer.sellRefused.length} started selling in ${where}. ${marketSymbol(first.marketKey)} did not: ${first.reason}`
          )
        }
        if (answer.selling.length > 0) {
          toast.success(
            `${where} is emptying — ${
              answer.selling.length === 1
                ? "1 position is"
                : `${answer.selling.length} positions are`
            } being sold with limits that follow the price.` +
              (answer.stood.length > 0
                ? ` ${answer.stood.length} smart ${answer.stood.length === 1 ? "order was" : "orders were"} called off first.`
                : "")
          )
        } else if (answer.sellRefused.length === 0) {
          toast.success(
            answer.stood.length > 0
              ? `${where} held nothing to sell. ${answer.stood.length} smart ${answer.stood.length === 1 ? "order was" : "orders were"} called off.`
              : `${where} was already empty.`
          )
        }
      } catch (error) {
        showErrorToast(getTradingSmartOrderError(error))
      } finally {
        setPending((count) => count - 1)
        void refresh()
      }
    },
    [refresh, nameOf]
  )

  return {
    wallet: tradable ? wallet : null,
    walletNames,
    positions,
    orders,
    placing: placingShown,
    fills,
    trades,
    loadOlderTrades,
    olderTradesBusy,
    olderTradesDone:
      (paperBefore === null ||
        (paperBefore === undefined && paperAnswer?.nextBefore === null)) &&
      (liveBefore === null ||
        (liveBefore === undefined && liveAnswer?.nextBefore === null)),
    smartOrders,
    resumeSmartOrder,
    ladders,
    grids,
    busy: pending > 0,
    // Never both: an answered half is something to show, a failure with rows
    // still up stays quiet, and only a screen with nothing yet says either.
    loading: paperAnswer === null && liveAnswer === null && !failed,
    // Read off the two answers rather than kept beside them: a flag set when
    // the reads finish would be one more thing that can disagree with what
    // they actually hold, and a half that refused leaves its answer null,
    // which is already the fact this is asking about.
    settled: paperAnswer !== null && liveAnswer !== null,
    failed: failed && paperAnswer === null && liveAnswer === null,
    retry: () => void refresh(),
    place,
    watchOrders,
    refusals,
    move,
    cancel,
    editOrder,
    setBrackets,
    dragBrackets,
    close,
    closePart,
    flip,
    closeAll,
    hideTrades,
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
    setGridFollow,
    cancelAllSmartOrders,
    cancelAllWatchedOrders,
    flattenWallet,
    setPositionLeverage,
    adjustPositionMargin,
  }
}
