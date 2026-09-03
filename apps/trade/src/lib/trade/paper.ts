import type {
  CandleBar,
  TakeProfitTarget,
  WalletAccountFigures,
} from "@/lib/protocols/contracts"

/**
 * Practice trading, in the app's own words — browser-safe on purpose.
 *
 * Everything here is arithmetic: what a fill does to a position, what a
 * position is worth, and where price would have to go for it to be closed out.
 * The server file (`@/server/trade/paper.ts`) stores the rows and decides when
 * to ask these questions; the screens ask the same ones to draw the answers.
 * One home, so the table and the engine can never disagree about what a
 * position is worth.
 *
 * The model is isolated margin, one position per market. A trade puts up
 * `value ÷ leverage` as margin and can lose it; the rest of the account is
 * never at risk from it. That is the simplest honest model of what the real
 * exchange does, and it is the one the numbers on screen are built from.
 *
 * `TradePosition`, `TradeOrder` and `TradeSide` are named without "paper"
 * because they are not only paper: real exchange rows are shaped into the
 * same types (a real position carries `live`) so every screen draws both
 * kinds with one set of code. Everything still named "Paper" belongs to the
 * practice engine alone.
 */

/**
 * What the exchange charges. Taking a price that is already there costs more
 * than leaving an order for somebody else to take — Hyperliquid's standard
 * rates, the same pair the old app used.
 */
export const TAKER_FEE_RATE = 0.00045
export const MAKER_FEE_RATE = 0.00015

/**
 * What trading costs, as fractions — 0.00045 is 4.5 cents on every hundred
 * dollars traded.
 *
 * The two constants above are the exchange's real rates and are what every
 * practice wallet uses. This exists because a backtest has to be able to ask
 * "what if it cost more?" without changing what the practice engine charges,
 * and because slippage is a cost the live engine has no opinion about: a
 * practice order fills at a price the engine already knows, while a replayed
 * one has to guess how much worse a market order would really have gone.
 *
 * Every wallet book carries a set of these. Fill it with `defaultPaperCosts()`
 * and the arithmetic is the same to the penny as it was before this existed.
 */
export type PaperCosts = {
  /** Charged when an order takes a price that was already there. */
  takerFeeRate: number
  /** Charged when an order sat and waited for somebody else to take it. */
  makerFeeRate: number
  /**
   * How much worse than the asked-for price a market order really fills, as a
   * fraction. Zero is what the practice engine does today: it fills at the
   * price it was looking at.
   */
  slippageRate: number
}

/** Today's numbers — the exchange's real fees, and no slippage. */
export function defaultPaperCosts(): PaperCosts {
  return {
    takerFeeRate: TAKER_FEE_RATE,
    makerFeeRate: MAKER_FEE_RATE,
    slippageRate: 0,
  }
}

/**
 * Where a market order really fills once slippage is counted: worse for
 * whoever is in a hurry, always.
 *
 * A buy pays a little more than it meant to and a sell takes a little less.
 * Getting that sign wrong would make a backtest *better* the more it slipped,
 * which is the one direction it must never go.
 */
export function slippedPx(
  px: number,
  side: TradeSide,
  slippageRate: number
): number {
  if (!(slippageRate > 0)) return px
  return side === "buy" ? px * (1 + slippageRate) : px * (1 - slippageRate)
}

/** Below this many coins a position counts as flat — see `applyPaperFill`. */
const POSITION_DUST = 1e-9

export type TradeSide = "buy" | "sell"

/**
 * Why a fill happened, kept on every journal row. Not decoration: "the stop
 * took me out" and "I closed it" are different stories about the same trade,
 * and only the engine knows which one it was.
 */
export type PaperFillReason =
  /** A limit order that was waiting, or one placed straight through the price. */
  | "order"
  /** Closed, flipped or reduced by hand. */
  | "manual"
  | "take_profit"
  | "stop_loss"
  | "liquidated"

export type TradePosition = {
  id: string
  walletId: string
  marketKey: string
  /**
   * How much is held, signed: positive is long (bought, wins when price
   * rises), negative is short. One number rather than a size and a side,
   * because every sum below wants the sign anyway.
   */
  szi: number
  entryPx: number
  /** Fixed when the position opened; adding to it inherits this. */
  leverage: number
  /**
   * The most leverage this market allowed when the position opened, kept as a
   * copy because the liquidation estimate is built from it and the exchange's
   * answer can change under a position that is already open.
   */
  maxLeverage: number
  targets: TakeProfitTarget[]
  /** First target, kept for one compatibility release. */
  tpPx: number | null
  /**
   * How many coins the target sells when it fires. Empty means all of them —
   * the whole position closes, which is what a target has always done. A
   * number smaller than the position sells that much at the target price and
   * leaves the rest running with no target; the target is used up by firing.
   * Meaningless without `tpPx`, and never set while `tpPx` is empty.
   */
  tpSz?: number | null
  slPx: number | null
  /** Fees this position has paid so far, entry and any part-closes. */
  feesPaid: number
  /** Epoch ms. The settlement guard reads it — see `paper.ts` on the server. */
  updatedAt: number
  /**
   * Present on a REAL position. Carries the exchange's own answers, which the
   * screens prefer over the formulas below — for real money the exchange's
   * margin and liquidation price are the ones actually enforced. The order
   * ids are the protection legs', needed to replace them.
   */
  live?: {
    marginUsed: number
    liquidationPx: number | null
    tpOrderId: string | null
    slOrderId: string | null
  }
}

export type TradeOrder = {
  id: string
  walletId: string
  marketKey: string
  side: TradeSide
  px: number
  sz: number
  leverage: number
  maxLeverage: number
  reduceOnly: boolean
  /** Applied to the position this order opens, once it fills. */
  tpPx: number | null
  slPx: number | null
  /**
   * The price this slice sells itself at, resting from the instant this order
   * fills — not from the end of the candle it filled in.
   *
   * A ladder rung's exit used to be placed by the ladder afterwards, and the
   * ladder only gets to look once a candle has finished. On 10 October KAS
   * fell from 7.1c to 0.9c and came back to 5.5c inside one four-hour candle:
   * every rung bought, and by the time the ladder could place their sells the
   * price was already back above four of them. Those four were never sold.
   * A real exchange has the exit sitting there the moment the buy fills.
   */
  exitPx?: number | null
  createdAt: number
  updatedAt: number
  /**
   * A REAL resting order. Its id is the exchange's own; it cannot be dragged
   * to a new price or changed in place yet, and its leverage reads as a dash —
   * the account's setting, not the order's.
   */
  live?: true
  /**
   * Asked for, but the answer has not come back. Only ever set in the browser,
   * so a press is seen the instant it happens — nothing on the server ever
   * writes one, and nothing offers to change or cancel it.
   */
  placing?: true
  /**
   * A watched price wearing an order's clothes, so the chart can draw it as
   * the order it stands in for.
   *
   * **It has no order behind it**, so everything that reaches for one has to
   * step aside: it cannot be dragged to a new price, its stop and target
   * cannot be dragged, and the edit window has nothing to open. Only the × is
   * offered, and that goes through the smart-order door. Marked rather than
   * dressed up as `live`, because a lie there would send a practice cancel to
   * a real exchange.
   */
  watched?: true
  /**
   * A watched price the engine has stopped working after the exchange refused
   * it five times running. Nothing is resting anywhere. The row stays on
   * screen so the refusal can be read and the watch resumed or called off.
   */
  paused?: true
  /** Which way price must touch a watched level. Missing on older watches. */
  triggerDirection?: "up" | "down"
  /**
   * A real order that waits at a trigger price rather than resting in the
   * book — a stop or target leg the exchange holds. Its price is not a limit
   * and must never be rewritten into one.
   */
  trigger?: true
}

/** One fill the practice engine made, and why it made it. */
export type PaperJournalEntry = {
  id: string
  walletId: string
  marketKey: string
  side: TradeSide
  px: number
  sz: number
  fee: number
  /** What the closing part of this fill banked. Zero when it only opened. */
  closedPnl: number
  reason: PaperFillReason
  fillTime: number
  /**
   * The order this fill came from, when it came from one.
   *
   * **So a fill never has to be guessed back to its order.** A replay labels
   * each arrow with the ladder rung that bought it, and used to work that out
   * afterwards by hunting the ladder for a rung of the same size — which fails
   * the moment the ladder has moved on, and a ladder can buy, sell out and be
   * replaced inside a single crashing candle. Eighteen buys out of 763 lost
   * their rung that way, all of them on crash bars, which are the ones worth
   * reading.
   *
   * Null for a fill nothing placed: a stop, a liquidation, a hand-closed
   * position.
   */
  orderId: string | null
}

/** Everything the fill arithmetic reads and rewrites. */
export type PositionCore = Pick<
  TradePosition,
  | "szi"
  | "entryPx"
  | "leverage"
  | "maxLeverage"
  | "targets"
  | "tpPx"
  | "slPx"
  | "feesPaid"
>

/** Compatibility for positions written before the target-list migration. */
export function positionTargets(
  position: Pick<TradePosition, "targets" | "tpPx"> & { tpSz?: number | null }
): TakeProfitTarget[] {
  if (position.targets.length > 0) return position.targets
  return position.tpPx === null
    ? []
    : [{ px: position.tpPx, sz: position.tpSz ?? null, orderId: null }]
}

type PaperFill = {
  side: TradeSide
  px: number
  sz: number
  feeRate: number
  /** Only used by a fill that opens a position; an add inherits what is there. */
  leverage: number
  maxLeverage: number
}

export type PaperFillOutcome = {
  /** What is held afterwards, or null when the fill closed it out. */
  position: PositionCore | null
  fee: number
  closedPnl: number
}

/**
 * One fill against one position — the whole of the practice engine's
 * arithmetic, ported from the old app because it was already right.
 *
 * Four cases, and they are the four things a fill can do: open, add to,
 * reduce, or turn around. Only the reducing part banks a profit or a loss;
 * buying more never does, which is why an add moves the entry price instead
 * of paying anything out.
 */
export function applyPaperFill(
  position: PositionCore | null,
  fill: PaperFill
): PaperFillOutcome {
  const fee = fill.px * fill.sz * fill.feeRate
  const signed = fill.side === "buy" ? fill.sz : -fill.sz
  const szi = position?.szi ?? 0
  const entryPx = position?.entryPx ?? 0

  let closedPnl = 0
  if (szi !== 0 && Math.sign(signed) !== Math.sign(szi)) {
    const closedSz = Math.min(Math.abs(signed), Math.abs(szi))
    closedPnl = (fill.px - entryPx) * closedSz * Math.sign(szi)
  }

  // Snap a position that nets to within dust of flat to exactly flat. Filling
  // a position in pieces and selling it back sums many fractions, so the close
  // can land on ~1e-15 instead of 0; without this that dust reads as a phantom
  // position that never quite closes.
  const rawNextSzi = szi + signed
  const nextSzi = Math.abs(rawNextSzi) < POSITION_DUST ? 0 : rawNextSzi

  if (nextSzi === 0) {
    return { position: null, fee, closedPnl }
  }

  // Opened from flat, or turned around through it. Either way this is a new
  // position: its own entry price, its own leverage, and no brackets — the
  // ones aimed at a long are nonsense the moment it becomes a short.
  if (szi === 0 || Math.sign(nextSzi) !== Math.sign(szi)) {
    return {
      position: {
        szi: nextSzi,
        entryPx: fill.px,
        leverage: fill.leverage,
        maxLeverage: fill.maxLeverage,
        targets: [],
        tpPx: null,
        slPx: null,
        feesPaid: fee,
      },
      fee,
      closedPnl,
    }
  }

  const kept: PositionCore = {
    szi: nextSzi,
    entryPx,
    leverage: position?.leverage ?? fill.leverage,
    maxLeverage: position?.maxLeverage ?? fill.maxLeverage,
    targets: position?.targets ?? [],
    tpPx: position?.tpPx ?? null,
    slPx: position?.slPx ?? null,
    feesPaid: (position?.feesPaid ?? 0) + fee,
  }

  // Added to: the entry price becomes the average of what was paid for each
  // piece, weighted by how much each piece was.
  if (Math.abs(nextSzi) > Math.abs(szi)) {
    kept.entryPx =
      (entryPx * Math.abs(szi) + fill.px * fill.sz) / Math.abs(nextSzi)
  }
  return { position: kept, fee, closedPnl }
}

/**
 * How much of a reduce-only order the position can actually take. Null when
 * it would not reduce anything at all — an order to sell when nothing is held
 * long is not a small order, it is the wrong order.
 */
export function capReduceOnly(
  position: PositionCore | null,
  side: TradeSide,
  sz: number
): number | null {
  const szi = position?.szi ?? 0
  const reduces = (szi > 0 && side === "sell") || (szi < 0 && side === "buy")
  if (!reduces) return null
  return Math.min(sz, Math.abs(szi))
}

// ----- What a position is worth -----------------------------------------

/** The stake put up to hold it: what it was worth at entry, over leverage. */
export function positionMargin(
  position: Pick<TradePosition, "szi" | "entryPx" | "leverage">
): number {
  if (!(position.leverage > 0)) return Math.abs(position.szi) * position.entryPx
  return (Math.abs(position.szi) * position.entryPx) / position.leverage
}

/** What it is worth at this price — the whole holding, not the stake. */
export function positionValue(
  position: Pick<TradePosition, "szi">,
  mark: number
): number {
  return Math.abs(position.szi) * mark
}

/** Up or down right now, in dollars. The sign of `szi` does the work. */
export function positionProfit(
  position: Pick<TradePosition, "szi" | "entryPx">,
  mark: number
): number {
  return (mark - position.entryPx) * position.szi
}

/**
 * What closing at some other price would bank — how the Projected P/L column
 * reads a take-profit and a stop. Fees are not taken off here; the table shows
 * them in their own column so each figure means exactly one thing.
 */
export function projectedProfit(
  position: Pick<TradePosition, "szi" | "entryPx">,
  exitPx: number
): number {
  return (exitPx - position.entryPx) * position.szi
}

/**
 * Where the position gets closed out against its owner's wishes.
 *
 * The exchange keeps a maintenance margin of half the stake it would demand
 * at the market's own maximum leverage; when the loss eats everything above
 * that, the position goes. This is the estimate the old app showed, and it is
 * exact for the isolated model this engine actually runs.
 *
 * Null only when the figures cannot answer: no entry price, no leverage, a max
 * leverage the exchange never gave us, or a stake already thinner than the
 * maintenance the exchange keeps — which for a position opened within the
 * market's own limit cannot happen.
 *
 * **A max leverage of 1 is not a market rule; it is a missing answer.** No
 * exchange this app trades caps a coin at 1x — Hyperliquid's lowest is 3 — and
 * Binance, whose candles every replay runs on, reports no limit at all. So the
 * `?? 1` that every placement path falls back to means "the exchange did not
 * say", and it means it for a good reason: 1 is the safe answer to the OTHER
 * question that number answers, which is how much leverage anyone may ask for.
 *
 * Read as maintenance instead, that same 1 says the exchange holds back half
 * the position — which draws the liquidation line at exactly half the entry
 * price. That is not a small error. A replay of 500 coins closed 208 trades at
 * precisely -50.06% each, $9,989 of a $10,000 pot, on positions that had
 * borrowed nothing at all; a real 3x market would not have touched them until
 * about -83%. Answering null leaves a cash position to rise or fall on its own,
 * which is what actually happens to one.
 *
 * Live positions are unaffected either way: their screens read the liquidation
 * price the exchange itself publishes and never this.
 */
export function liquidationPx(
  position: Pick<TradePosition, "szi" | "entryPx" | "leverage" | "maxLeverage">
): number | null {
  const { entryPx, leverage, maxLeverage } = position
  if (!(entryPx > 0) || !(leverage > 0) || !(maxLeverage > 1)) return null
  const buffer = 1 / leverage - 1 / (2 * maxLeverage)
  if (buffer <= 0) return null
  const px = position.szi > 0 ? entryPx * (1 - buffer) : entryPx * (1 + buffer)
  return px > 0 ? px : null
}

/**
 * How far price has to move to reach that, as a fraction of where it is now —
 * the "19% away" in the table. Null when there is no liquidation price.
 */
export function liquidationAway(
  position: Pick<TradePosition, "szi" | "entryPx" | "leverage" | "maxLeverage">,
  mark: number
): number | null {
  const liq = liquidationPx(position)
  if (liq === null || !(mark > 0)) return null
  return Math.abs(mark - liq) / mark
}

/** The dollar and proportional distance to the liquidation price. */
export function liquidationDistance(
  position: Pick<
    TradePosition,
    "szi" | "entryPx" | "leverage" | "maxLeverage" | "live"
  >,
  mark: number
): { liquidationPx: number; usd: number; fraction: number } | null {
  const px = position.live
    ? position.live.liquidationPx
    : liquidationPx(position)
  if (px === null || !(mark > 0)) return null
  const usd = Math.abs(mark - px)
  return { liquidationPx: px, usd, fraction: usd / mark }
}

/**
 * The account's five figures, folded from what it started with, what it has
 * banked, and what it is holding.
 *
 * Cash is never stored anywhere: it is the starting balance plus every
 * journal row's profit less its fee. A stored copy would be a second answer to
 * a question that already has one, and second answers drift.
 */
export function paperAccountFigures(input: {
  startingBalance: number
  /** The sum of every journal row: profit banked, less fees paid. */
  realized: number
  positions: readonly TradePosition[]
  marks: ReadonlyMap<string, number>
}): WalletAccountFigures {
  const cash = input.startingBalance + input.realized
  let inTrades = 0
  let openProfit = 0
  for (const position of input.positions) {
    inTrades += positionMargin(position)
    const mark = input.marks.get(position.marketKey)
    if (mark !== undefined) openProfit += positionProfit(position, mark)
  }
  return {
    equity: cash + openProfit,
    // **What the account is worth, less what is already committed** — the
    // exchange's own meaning of available margin. It used to be the cash less
    // the margin, which ignored every open loss and told somebody holding a
    // position 40% down that they still had the whole of their cash to spend.
    // Never below nothing: a wallet cannot have less than no money free.
    free: Math.max(0, cash + openProfit - inTrades),
    inTrades,
    openProfit,
  }
}

/**
 * An order whose price is already through the market: a buy at or above what
 * it costs, a sell at or below. It is not going to wait for anything, so it is
 * filled at once — at the market's price, never at the worse price that was
 * asked for.
 */
export function isMarketable(
  side: TradeSide,
  px: number,
  mark: number
): boolean {
  return side === "buy" ? px >= mark : px <= mark
}

// ----- Replaying the price that happened while nobody watched ------------

/** A straight run of price, from one level to another. */
type PriceLeg = { from: number; to: number }

/**
 * The path price took inside one candle, as three straight runs.
 *
 * A candle says where price opened, closed, and the furthest it got each way —
 * never the order it did them in. The standard reading is the one that fits
 * the candle's own direction: a candle that closed up dipped first and then
 * ran, a candle that closed down ran first and then fell. It is a guess, but
 * it is the same guess every backtest makes, and it is the conservative one
 * for a position that was already open.
 */
export function candleLegs(bar: CandleBar): PriceLeg[] {
  return bar.close >= bar.open
    ? [
        { from: bar.open, to: bar.low },
        { from: bar.low, to: bar.high },
        { from: bar.high, to: bar.close },
      ]
    : [
        { from: bar.open, to: bar.high },
        { from: bar.high, to: bar.low },
        { from: bar.low, to: bar.close },
      ]
}

/** Price passed through this level somewhere along the run. */
export function legCrosses(leg: PriceLeg, level: number): boolean {
  return (
    level >= Math.min(leg.from, leg.to) && level <= Math.max(leg.from, leg.to)
  )
}

/**
 * What happens next as price travels a run — nearest thing first.
 *
 * `at` is how far along the run price has already been taken; everything
 * between there and the end is still to come. The caller applies what comes
 * back, works the levels out again from the position it now has, and asks
 * again from the price where that happened.
 */
type PaperEvent =
  | { kind: "order"; orderId: string; px: number }
  | { kind: "take_profit"; px: number }
  | { kind: "stop_loss"; px: number }
  | { kind: "liquidated"; px: number }

export function nextEventOnLeg(input: {
  leg: PriceLeg
  /** Where along the run price has already been taken. */
  at: number
  position: PositionCore | null
  orders: readonly Pick<TradeOrder, "id" | "px">[]
  /** The stop already owns this candle — see `bracketsTie`. */
  ignoreTakeProfit: boolean
}): PaperEvent | null {
  const remaining: PriceLeg = { from: input.at, to: input.leg.to }
  const candidates: PaperEvent[] = []

  for (const order of input.orders) {
    if (legCrosses(remaining, order.px)) {
      candidates.push({ kind: "order", orderId: order.id, px: order.px })
    }
  }

  const position = input.position
  if (position) {
    if (!input.ignoreTakeProfit) {
      for (const target of positionTargets(position)) {
        if (legCrosses(remaining, target.px)) {
          candidates.push({ kind: "take_profit", px: target.px })
        }
      }
    }
    if (position.slPx !== null && legCrosses(remaining, position.slPx)) {
      candidates.push({ kind: "stop_loss", px: position.slPx })
    }
    const liq = liquidationPx(position)
    if (liq !== null && legCrosses(remaining, liq)) {
      candidates.push({ kind: "liquidated", px: liq })
    }
  }

  if (candidates.length === 0) return null
  return candidates.reduce((nearest, event) =>
    Math.abs(event.px - input.at) < Math.abs(nearest.px - input.at)
      ? event
      : nearest
  )
}

/**
 * One candle reached both the take-profit and the stop, so which came first is
 * unknowable — and the answer is the stop.
 *
 * This is the one place the engine deliberately picks the worse story. A
 * candle wide enough to cover both is the only case where the guess in
 * `candleLegs` could hand out a profit that never happened, and a practice
 * account that flatters itself is worse than useless.
 */
export function bracketsTie(
  bar: CandleBar,
  position: PositionCore | null
): boolean {
  if (
    !position ||
    positionTargets(position).length === 0 ||
    position.slPx === null
  )
    return false
  const covers = (level: number) => level >= bar.low && level <= bar.high
  return (
    positionTargets(position).some((target) => covers(target.px)) &&
    covers(position.slPx)
  )
}
