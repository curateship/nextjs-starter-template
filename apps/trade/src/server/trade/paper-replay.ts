import { randomUUID } from "node:crypto"

import type { CandleBar } from "@/lib/protocols/contracts"
import { canOpenAnother, type EntryLimit } from "@/lib/trade/entry-limit"
import {
  applyPaperFill,
  bracketsTie,
  candleLegs,
  capReduceOnly,
  isMarketable,
  liquidationPx,
  nextEventOnLeg,
  positionMargin,
  positionProfit,
  positionTargets,
  slippedPx,
  type PaperCosts,
  type PaperFillReason,
  type PaperJournalEntry,
  type TradeOrder,
  type TradePosition,
  type TradeSide,
} from "@/lib/trade/paper"
import type { TradeWallet } from "@/lib/trade/wallets"

/** Practice wallets stay a hand-made thing: enough orders to work, not a fleet. */
export const MAX_OPEN_ORDERS = 50

// ----- The wallet as the engine holds it --------------------------------

/**
 * One wallet mid-settlement: what it holds, what it has asked for, and what
 * has changed so far. Everything happens here in memory and is written once at
 * the end, so a half-applied candle can never reach the database.
 */
export type WalletBook = {
  wallet: TradeWallet
  /**
   * What trading costs this book. Filled with `defaultPaperCosts()` for a real
   * practice wallet, which is the exchange's own fees and no slippage — the
   * same arithmetic, to the penny, as when these were read off the two
   * constants directly.
   *
   * On the book rather than read from the constants because a backtest is
   * allowed to ask "what if it cost more?", and the answer has to reach every
   * fill without a second copy of the engine to keep in step.
   */
  costs: PaperCosts
  /** Starting balance plus everything banked — the cash the account has. */
  cash: number
  positions: Map<string, TradePosition>
  orders: TradeOrder[]
  /** Fills to record, in the order they happened. */
  fills: PaperJournalEntry[]
  /** Markets whose position row must be rewritten or removed. */
  touchedMarkets: Set<string>
  /** Orders that filled or were cancelled by the engine. */
  goneOrderIds: Set<string>
  /**
   * How many coins this wallet may open in a stretch of time, and when it last
   * opened one. Null is off, which is every wallet that has not asked.
   *
   * On the BOOK rather than on a plan because the question is about the wallet:
   * forty-four separate ladders each opening one coin is the thing being
   * limited, and no single ladder can see the other forty-three.
   */
  entryLimit: EntryLimit | null
  /** Every moment this wallet went from flat to holding, oldest first. */
  openedAt: number[]
  /**
   * Markets liquidated inside the current pass.
   *
   * The ladder asks "did a liquidation just take my position?" to keep its
   * waiting rungs alive — and it used to read the answer off `fills`, which a
   * minute-walked candle drains every minute. The evidence vanished before
   * the question was asked, and the ladder died exactly where it was built to
   * survive. This set is cleared by whoever owns the pass, never by the
   * drain.
   */
  liquidatedThisPass: Set<string>
  /**
   * The whole market is falling off a cliff right now, and the least leverage
   * the exchange must allow on a coin before a NEW one may be opened while it
   * lasts. Null is off.
   *
   * On the book because it stops a FILL, and a fill does not go through a
   * ladder — the replay's rungs are orders its own wick fills. Set once a bar
   * by whoever knows the answer.
   */
  crashEntry: { cascading: boolean; leastLeverage: number | null }
  /**
   * Orders the engine itself put on the book — today only the exits that ride
   * on a rung's buy. Everything else here is written down when it is asked
   * for, so this is the one list that has to be saved after the fact.
   */
  addedOrders: TradeOrder[]
  /**
   * Bumped every time `orders` gains or loses one, so the answer to "is this
   * order still on the book?" can be worked out once and kept.
   *
   * **Anything that changes `orders` must change this too.** It is a counter
   * rather than a flag so nothing has to remember to clear it, and the six
   * places that touch the list all sit beside a `bumpOrders` call. `liveOrderIds`
   * is the only reader; `ordersMatchVersion` is the test that keeps them honest.
   */
  ordersVersion: number
  /**
   * What each market this book holds is worth right now.
   *
   * **Here so that free cash can mean what an exchange means by it.** Buying
   * power is the account's VALUE less the margin already posted, and the value
   * moves with every position that is down — cash alone does not, because cash
   * only changes when something closes. Without these prices a wallet whose
   * positions had halved still looked as though it had every dollar of its
   * cash to spend, and went on buying.
   *
   * A market with no price in here contributes nothing rather than a loss:
   * silence is not a fall.
   */
  marks: Map<string, number>
}

/** One order on or off the book. Every such change goes through here. */
export function bumpOrders(book: WalletBook): void {
  book.ordersVersion += 1
}

/**
 * Every order id on the book right now — worked out once per change, not once
 * per question.
 *
 * A ladder asks this to tell an order that FILLED from one that is still
 * waiting, and it is the single hottest question in the app. Each ladder asked
 * it four times, and each ask walked the whole book: on a replay of 500 coins
 * that is 500 ladders reading 5,500 orders, four times over, on every one of
 * 4,380 bars — about fifty billion reads, and the reason a big run took twenty
 * minutes rather than two.
 *
 * The list only changes when an order is placed or comes off, so the answer is
 * kept until that happens. On a quiet bar it is worked out no times at all.
 */
const liveIds = new WeakMap<
  WalletBook,
  { version: number; ids: ReadonlySet<string> }
>()

export function liveOrderIds(book: WalletBook): ReadonlySet<string> {
  const known = liveIds.get(book)
  if (known && known.version === book.ordersVersion) return known.ids
  const ids = new Set(book.orders.map((order) => order.id))
  liveIds.set(book, { version: book.ordersVersion, ids })
  return ids
}

/** The id an order's own exit carries, so the ladder can find it again. */
export function exitOrderIdOf(orderId: string): string {
  return `${orderId}:exit`
}

/** Everything written down; nothing left to save. */
export function markSaved(book: WalletBook): void {
  book.fills = []
  book.touchedMarkets.clear()
  book.goneOrderIds.clear()
  book.addedOrders = []
}

/**
 * What is left to put behind a new trade: the account's value, less the margin
 * already posted.
 *
 * **Value, not cash.** A position sitting 40% down has not banked anything, so
 * the cash is untouched — and for a long time this said the wallet could still
 * spend it. On 13 June 2022 one replay held $12,460 of margin against a wallet
 * worth $9,273 and kept buying, which no exchange would have allowed: on
 * Hyperliquid the money available is the account value minus what is in use,
 * and the account value carries every open loss with it.
 *
 * Goes negative when the losses have eaten past the margin. That is a real
 * answer and the callers all read it as "no": every one of them compares the
 * cost of what it wants against this.
 */
export function freeCash(book: WalletBook): number {
  let held = 0
  let openProfit = 0
  for (const position of book.positions.values()) {
    held += positionMargin(position)
    const mark = book.marks.get(position.marketKey)
    if (mark !== undefined && mark > 0) {
      openProfit += positionProfit(position, mark)
    }
  }
  return book.cash + openProfit - held
}

/**
 * Puts one fill through the arithmetic and writes the result back into the
 * book — the single door every fill goes through, whether it came from a
 * candle, from the price right now, or from somebody pressing Close.
 */
export function fill(
  book: WalletBook,
  input: {
    marketKey: string
    side: TradeSide
    px: number
    sz: number
    feeRate: number
    leverage: number
    maxLeverage: number
    reason: PaperFillReason
    at: number
    /** Brackets to hand the position this fill opens, if it opens one. */
    brackets?: { tpPx: number | null; slPx: number | null }
    /** The order behind this fill, when there was one. */
    orderId?: string | null
  }
): void {
  const held = book.positions.get(input.marketKey) ?? null
  const outcome = applyPaperFill(held, {
    side: input.side,
    px: input.px,
    sz: input.sz,
    feeRate: input.feeRate,
    leverage: input.leverage,
    maxLeverage: input.maxLeverage,
  })

  if (!outcome.position) {
    book.positions.delete(input.marketKey)
  } else {
    const opened =
      !held || Math.sign(outcome.position.szi) !== Math.sign(held.szi)
    // A coin going from holding nothing to holding something. Adding to one
    // already held is not an entry — leaving room for exactly that is what the
    // limit is for.
    if (opened) book.openedAt.push(input.at)
    book.positions.set(input.marketKey, {
      // One row per market, so a turn-around reuses the slot it turned in.
      id: held?.id ?? randomUUID(),
      walletId: book.wallet.id,
      marketKey: input.marketKey,
      ...outcome.position,
      // A fill that opened a position takes the brackets the order carried;
      // one that added to a position leaves the ones already set alone.
      targets: opened
        ? input.brackets?.tpPx != null
          ? [{ px: input.brackets.tpPx, sz: null, orderId: null }]
          : []
        : outcome.position.targets,
      tpPx: opened ? (input.brackets?.tpPx ?? null) : outcome.position.tpPx,
      // A sized target stays as coins, not a fraction: adding to the position
      // does not grow what the target sells, and a fresh open starts clean.
      tpSz: opened ? null : (held?.tpSz ?? null),
      slPx: opened ? (input.brackets?.slPx ?? null) : outcome.position.slPx,
      updatedAt: input.at,
    })
  }

  book.cash += outcome.closedPnl - outcome.fee
  book.fills.push({
    id: randomUUID(),
    walletId: book.wallet.id,
    marketKey: input.marketKey,
    side: input.side,
    px: input.px,
    sz: input.sz,
    fee: outcome.fee,
    closedPnl: outcome.closedPnl,
    reason: input.reason,
    fillTime: input.at,
    orderId: input.orderId ?? null,
  })
  book.touchedMarkets.add(input.marketKey)
  if (input.reason === "liquidated") {
    book.liquidatedThisPass.add(input.marketKey)
  }
}

export function dropOrder(book: WalletBook, orderId: string): void {
  book.orders = book.orders.filter((order) => order.id !== orderId)
  bumpOrders(book)
  book.goneOrderIds.add(orderId)
}

/**
 * A waiting order reaching its price.
 *
 * Two things can still stop it. A reduce-only order with nothing left to
 * reduce is cancelled rather than turned into a new position the other way,
 * and an opening order the account can no longer afford is cancelled rather
 * than filled — waiting orders hold no margin aside, so by the time one fills
 * the cash may be somewhere else.
 */
export function fillOrder(
  book: WalletBook,
  order: TradeOrder,
  input: {
    px: number
    feeRate: number
    at: number
    /**
     * Whether this fill takes what is there rather than waiting for somebody to
     * come to it. A taker fill pays the book's slippage; an order that sat and
     * waited gets the price it asked for.
     */
    slip?: boolean
  }
): void {
  const held = book.positions.get(order.marketKey) ?? null
  let sz = order.sz

  if (order.reduceOnly) {
    const capped = capReduceOnly(held, order.side, order.sz)
    if (capped === null || capped <= 0) {
      dropOrder(book, order.id)
      return
    }
    sz = capped
  } else if (
    !book.positions.has(order.marketKey) &&
    book.crashEntry.cascading &&
    book.crashEntry.leastLeverage !== null &&
    order.maxLeverage < book.crashEntry.leastLeverage
  ) {
    // Mid-crash, and the exchange does not give this coin enough room. Opening
    // it now buys a position that gets closed out before the rung below it can
    // buy. Left resting: the moment the crash rule lets go, it is an ordinary
    // coin again and this rung buys as it always would.
    return
  } else if (
    !book.positions.has(order.marketKey) &&
    !canOpenAnother(book.entryLimit, book.openedAt, input.at)
  ) {
    // The wallet has opened its allowance of coins for now. The order is left
    // exactly where it is rather than dropped: the level has not stopped being
    // worth buying, the wallet has run out of room for NEW coins, and room
    // comes back on its own as the window moves.
    return
  } else if ((input.px * sz) / order.leverage > freeCash(book) + 1e-9) {
    dropOrder(book, order.id)
    return
  }

  fill(book, {
    marketKey: order.marketKey,
    side: order.side,
    px: input.slip
      ? slippedPx(input.px, order.side, book.costs.slippageRate)
      : input.px,
    sz,
    feeRate: input.feeRate,
    leverage: order.leverage,
    maxLeverage: order.maxLeverage,
    reason: "order",
    at: input.at,
    brackets: { tpPx: order.tpPx, slPx: order.slPx },
    orderId: order.id,
  })

  // The exit goes on the book here, not after the candle finishes — see
  // `exitPx`. It is stamped with the buy's own time so the same candle walk
  // can reach it, and that walk only ever looks at prices AHEAD of where the
  // buy filled, so it can never sell into the move that bought it.
  if (
    !order.reduceOnly &&
    order.exitPx !== null &&
    order.exitPx !== undefined
  ) {
    if (order.exitPx > 0) {
      const exit: TradeOrder = {
        id: exitOrderIdOf(order.id),
        walletId: order.walletId,
        marketKey: order.marketKey,
        side: order.side === "buy" ? "sell" : "buy",
        px: order.exitPx,
        sz,
        leverage: order.leverage,
        maxLeverage: order.maxLeverage,
        reduceOnly: true,
        tpPx: null,
        slPx: null,
        exitPx: null,
        createdAt: order.updatedAt,
        updatedAt: order.updatedAt,
      }
      book.orders.push(exit)
      bumpOrders(book)
      book.addedOrders.push(exit)
    }
  }

  dropOrder(book, order.id)
}

/**
 * The take profit firing — the one place its size rule lives.
 *
 * A target with no size closes the whole position, as it always has. A sized
 * target sells that much and no more: the rest keeps running with the target
 * used up — cleared in the same motion, or the settle loop would sell another
 * slice at the same level forever. Either way a target is a limit sitting at
 * your price, so it fills exactly there at maker fees, never slipping.
 */
function takeProfitAt(
  book: WalletBook,
  position: TradePosition,
  input: { px: number; at: number }
): void {
  const target = positionTargets(position).find(
    (one) => Math.abs(one.px - input.px) <= 1e-9
  )
  if (!target) return
  const tpSz = target.sz
  if (tpSz === null || tpSz >= Math.abs(position.szi) - 1e-9) {
    closeAt(book, position, {
      px: input.px,
      feeRate: book.costs.makerFeeRate,
      reason: "take_profit",
      at: input.at,
    })
    return
  }
  fill(book, {
    marketKey: position.marketKey,
    side: position.szi > 0 ? "sell" : "buy",
    px: input.px,
    sz: tpSz,
    feeRate: book.costs.makerFeeRate,
    leverage: position.leverage,
    maxLeverage: position.maxLeverage,
    reason: "take_profit",
    at: input.at,
  })
  const rest = book.positions.get(position.marketKey)
  if (rest) {
    const targets = rest.targets.filter((one) => one !== target)
    const first = targets[0] ?? null
    book.positions.set(position.marketKey, {
      ...rest,
      targets,
      tpPx: first?.px ?? null,
      tpSz: first?.sz ?? null,
    })
  }
}

/** Closing the whole of a position at one price. */
export function closeAt(
  book: WalletBook,
  position: TradePosition,
  input: {
    px: number
    feeRate: number
    reason: PaperFillReason
    at: number
    /** A stop or a liquidation takes what is there, so it pays slippage. */
    slip?: boolean
  }
): void {
  const side: TradeSide = position.szi > 0 ? "sell" : "buy"
  fill(book, {
    marketKey: position.marketKey,
    side,
    px: input.slip
      ? slippedPx(input.px, side, book.costs.slippageRate)
      : input.px,
    sz: Math.abs(position.szi),
    feeRate: input.feeRate,
    leverage: position.leverage,
    maxLeverage: position.maxLeverage,
    reason: input.reason,
    at: input.at,
  })
}

// ----- Replaying one market ---------------------------------------------

/** The worse of two prices for whoever holds this position. */
function worseOf(szi: number, a: number, b: number): number {
  return szi > 0 ? Math.min(a, b) : Math.max(a, b)
}

/**
 * The levels today's price has plainly already gone past, nearest to the entry
 * first — the order price would have met them coming away from the trade.
 *
 * A stop set inside the liquidation price is reached first and takes the
 * trade; a stop set beyond it never gets the chance, because the position was
 * already gone. Reading them in this order is what tells those two apart.
 */
function passedLevels(
  position: TradePosition,
  mark: number
): { reason: PaperFillReason; px: number }[] {
  const long = position.szi > 0
  const through = (level: number) => (long ? mark <= level : mark >= level)
  const levels: { reason: PaperFillReason; px: number }[] = []

  const liq = liquidationPx(position)
  if (liq !== null && through(liq))
    levels.push({ reason: "liquidated", px: liq })
  if (position.slPx !== null && through(position.slPx)) {
    levels.push({ reason: "stop_loss", px: position.slPx })
  }
  for (const target of positionTargets(position)) {
    if (long ? mark >= target.px : mark <= target.px) {
      levels.push({ reason: "take_profit", px: target.px })
    }
  }

  return levels.sort(
    (a, b) =>
      Math.abs(a.px - position.entryPx) - Math.abs(b.px - position.entryPx)
  )
}

/**
 * Walks the candles of one market, then checks the price right now. Everything
 * that should have happened to this wallet in this market happens here.
 *
 * Exported because a backtest is exactly this, over and over: hand it a book in
 * memory, a bar, and **no price right now**, and it becomes a candles-only
 * replay. That is the whole seam — the tested ladder and the practice one are
 * the same code, so they cannot drift into two strategies with one name.
 */
/**
 * The bar is starting on every coin: value the book at the worst each of them
 * gets to inside it.
 *
 * **Because a crash is not one coin at a time.** The replay walks coins in
 * turn, so while coin one is filling rungs the other sixty-six are still
 * valued where they closed yesterday — a wallet that looks untouched while the
 * whole market is falling through it. That is how $125,274 of coin was bought
 * on a wallet worth $10,151 on 10 October 2025.
 *
 * A long is valued at the bar's low, which is the price it demonstrably had to
 * live through. It is the conservative reading on purpose: what a run may
 * spend has to survive the worst moment of the bar, not the best.
 */
export function openBar(
  book: WalletBook,
  lows: ReadonlyMap<string, number>
): void {
  for (const [marketKey, low] of lows) {
    if (low > 0) book.marks.set(marketKey, low)
  }
}

/**
 * The bar is over on every coin: this is what they are all worth now.
 *
 * Called once the whole list has been walked, so nothing inside the bar was
 * ever valued at a price the bar only reached later. See `settleMarket`.
 */
export function closeBar(
  book: WalletBook,
  closes: ReadonlyMap<string, number>
): void {
  for (const [marketKey, close] of closes) {
    if (close > 0) book.marks.set(marketKey, close)
  }
}

export function settleMarket(
  book: WalletBook,
  marketKey: string,
  input: { bars: CandleBar[]; barMs: number; mark: number | null; now: number }
): void {
  // What this market is worth, kept on the book so free cash can see what the
  // positions are down.
  //
  // **Never the bar being walked.** A bar is not a moment: on 10 October 2025
  // coins fell 80% and came back inside one four-hour candle, and marking the
  // book at that candle's CLOSE while its own wick was still filling rungs
  // turned the recovery into buying power for the next coin's rungs — 208 of
  // them across 67 coins in a single bar, on a wallet holding $10,151. The
  // price a trade inside this bar may be valued against is the last one that
  // had finished happening.
  for (const bar of input.bars) {
    const barOpen = bar.openTime
    // Anything created after the bar opened is left out of it: part of that
    // bar happened before the order existed, and filling on price that
    // predates an order would be an invention. It gets the next bar, and the
    // price right now, which is where it would have been caught anyway.
    const settled = (updatedAt: number) => updatedAt <= barOpen
    // A fill inside a bar is stamped at the bar's close: it happened somewhere
    // in there, and the close is the only moment it had definitely happened by.
    const at = barOpen + input.barMs

    for (const leg of candleLegs(bar)) {
      let reached = leg.from
      // Every pass either fills an order or closes the position, and both are
      // finite. The cap is a backstop, not a rule.
      for (let step = 0; step < MAX_OPEN_ORDERS + 2; step += 1) {
        const held = book.positions.get(marketKey) ?? null
        // A position is liable from the moment it exists — including a
        // position this very bar has just opened or added to.
        //
        // It used to be held to the same "existed before the bar" test as an
        // order, and that is wrong for a position in a way it is not for an
        // order. An order must not fill on price that predates it. A position
        // that exists NOW is exposed to every price the bar has left to go,
        // and the leg is walked in price order, so what remains is exactly the
        // price it has not met yet.
        //
        // What the old test did was make a ladder un-liquidatable during the
        // crash that built it. HEI bought seven rungs down the 10 Oct 2025
        // candle, from 0.22376 to 0.02481, while its liquidation price fell
        // from 0.18647 to 0.02803 — it traded through its own floor three
        // rungs before the end and nothing closed it, because every one of
        // those fills was stamped at the bar's close. The next bar it was back
        // at 0.17 and safe. Every leveraged run was flattered on exactly the
        // days the deep rungs exist for.
        const eligibleHeld = held
        const eligibleOrders = book.orders.filter(
          (order) => order.marketKey === marketKey && settled(order.updatedAt)
        )
        const event = nextEventOnLeg({
          leg,
          at: reached,
          position: eligibleHeld,
          orders: eligibleOrders,
          ignoreTakeProfit: bracketsTie(bar, eligibleHeld),
        })
        if (!event) break

        // Buying power during this walk reads the mark `openBar` set — the
        // bar's LOW — so every fill is checked against the worst this candle
        // got to, not against where the coin started it. That floor is what
        // stopped 10 October 2025 buying $125,274 of coin on a wallet holding
        // $10,151: 208 fills across 67 coins in one candle, each funded by a
        // recovery the next coin had not had yet.
        if (event.kind === "order") {
          const order = eligibleOrders.find((one) => one.id === event.orderId)
          if (order) {
            fillOrder(book, order, {
              px: event.px,
              feeRate: book.costs.makerFeeRate,
              at,
            })
          }
        } else if (eligibleHeld) {
          if (event.kind === "take_profit") {
            // A target is a limit sitting at your price — `takeProfitAt`
            // fills exactly there, whole or sized, at maker fees.
            takeProfitAt(book, eligibleHeld, { px: event.px, at })
          } else {
            // A stop and a liquidation are market orders that take what is
            // there, so they pay taker fees and slippage.
            closeAt(book, eligibleHeld, {
              px: event.px,
              feeRate: book.costs.takerFeeRate,
              slip: true,
              reason: event.kind,
              at,
            })
          }
        }
        reached = event.px
      }
    }
  }

  // **Deliberately not the bar's close.** In a replay every coin's bar covers
  // the same four hours, and they are walked one after another — so writing
  // coin A's recovered close here hands coin B a wallet fattened by a recovery
  // that, for B, has not happened yet. The walk above leaves the mark at the
  // last price this coin actually traded at, which is the conservative answer
  // and the honest one. The caller settles every coin, then says what the bar
  // closed at: `closeBar` below.

  const mark = input.mark
  if (mark === null || !(mark > 0)) return
  // A price right now beats any bar's close.
  book.marks.set(marketKey, mark)

  for (let step = 0; step < MAX_OPEN_ORDERS + 2; step += 1) {
    const waiting = book.orders.find(
      (order) =>
        order.marketKey === marketKey &&
        isMarketable(order.side, order.px, mark)
    )
    if (waiting) {
      // Filled at the price it asked for rather than today's better one: it
      // was sitting there as price went past, so that is where it was taken.
      fillOrder(book, waiting, {
        px: waiting.px,
        feeRate: book.costs.makerFeeRate,
        at: input.now,
      })
      continue
    }

    const held = book.positions.get(marketKey) ?? null
    if (!held) break
    const level = passedLevels(held, mark)[0]
    if (!level) break

    if (level.reason === "take_profit") {
      // A target is a limit at your price, and running past it does not pay
      // more — `takeProfitAt` fills exactly there, whole or sized.
      takeProfitAt(book, held, { px: level.px, at: input.now })
      continue
    }

    closeAt(book, held, {
      // A stop and a liquidation are market orders, so a price that has
      // gapped past fills where the market actually is — the cost of the gap.
      px: worseOf(held.szi, level.px, mark),
      feeRate: book.costs.takerFeeRate,
      slip: true,
      reason: level.reason,
      at: input.now,
    })
  }
}
