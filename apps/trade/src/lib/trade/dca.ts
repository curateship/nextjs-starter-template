import { z } from "zod"

import { smartOrderPauseFields } from "@/lib/trade/smart-order-pause"

import { entryLimitSchema } from "./entry-limit"

import type { CandleInterval } from "@/lib/protocols/contracts"
import { cascadeSchema } from "@/lib/trade/cascade"
import { BASE_FIELDS } from "@/lib/trade/indicators/base"
import { defaultIndicatorParams } from "@/lib/trade/indicators/contract"

/**
 * The DCA ladder's arithmetic, in the app's own words — browser-safe on
 * purpose, and copied from the old trading app rather than imported, because
 * apps never import each other.
 *
 * A ladder is a plan to buy a falling market in slices: each rung sits a set
 * percent below the buy above it, each buy is a set multiple of the one above,
 * and the whole ladder together may spend at most a set share of the account.
 * The window that places one and the server that stores one both read their
 * numbers from `dcaLadderPlan`, so what is shown is what is placed.
 */

/** One rung of a DCA buy ladder — it carries only its drop depth. */
type DcaRung = {
  /**
   * How far below the PREVIOUS buy this rung rests, in percent (the first rung
   * is measured from the clicked price). So 5, 8 means: first buy 5% under the
   * click, second a further 8% under the first — not 8% under the click.
   */
  deviation: number
}

/** Default ladder: five rungs, each a little deeper below the buy above. */
export const DEFAULT_DCA_RUNGS: DcaRung[] = [
  { deviation: 5 },
  { deviation: 8 },
  { deviation: 11 },
  { deviation: 14 },
  { deviation: 17 },
]

/** A ladder may hold this many rungs. */
export const MAX_DCA_RUNGS = 20

/**
 * The next rung to add below a ladder, in percent.
 *
 * It carries on the ladder's OWN shape rather than repeating its last step.
 * Copying the last rung gave 5, 8, 11, 14, 17, 17, 17 — the ladder stopped
 * getting deeper exactly where the deep rungs matter most, and every added
 * rung sat the same distance below the one above it.
 *
 * So it keeps the ratio between the last two: 14 to 17 is a step of about
 * 1.21, so the next is 21, then 25, then 31 — each gap wider than the last,
 * which is the point of a ladder. A ladder with one rung has no ratio to read,
 * so it uses 1.6, the shape of the default ladder's own first step (5 to 8).
 *
 * Capped at 99: a rung cannot sit a hundred percent below anything, and it
 * always deepens by at least one so a flat ladder still grows.
 */
export function nextDcaRung(rungs: readonly DcaRung[]): DcaRung {
  const last = rungs.at(-1)
  if (!last) return { deviation: 5 }
  const before = rungs.at(-2)
  const ratio =
    before && before.deviation > 0 ? last.deviation / before.deviation : 1.6
  const grown = Math.round(last.deviation * (ratio > 1 ? ratio : 1.6))
  return { deviation: Math.min(99, Math.max(last.deviation + 1, grown)) }
}

/** Most of the account the whole ladder may ever spend, in percent. */
const DEFAULT_DCA_MAX_POSITION_PCT = 25

/**
 * How much bigger each buy is than the one above it. 1 = every buy equal; 2 =
 * each buy doubles the last, so far more is bought the deeper price drops.
 */
const DEFAULT_DCA_SIZE_MULTIPLIER = 2

export const DEFAULT_DCA_TAKE_PROFIT_PCT = 2
export const DEFAULT_DCA_EXIT_GAP_PCT = 0
export const MAX_DCA_EXIT_GAP_PCT = 999
export const DEFAULT_DCA_STOP_LOSS_PCT = 1

// ----- The stop that rests under the base --------------------------------

/**
 * Bases for a ladder's stop are always read off the **4h**, whatever chart the
 * ladder was placed from.
 *
 * Not a setting, on purpose: this whole rule is a port of the QFL automation
 * that was measured on the 4h, and a base found on the 5m is a different thing
 * wearing the same name. Placing a ladder from a one-minute chart still gets
 * the 4h level.
 */
export const BASE_STOP_INTERVAL: CandleInterval = "4h"

/** How long one of those candles lasts. Must match the interval above. */
export const BASE_STOP_BAR_MS = 14_400_000

/**
 * How much 4h history the base is read from: about three months.
 *
 * Generous on purpose. The level in force is whichever base confirmed last,
 * however long ago that was, so a mean window would answer "no base yet" on a
 * market that has had one all along.
 */
export const BASE_STOP_BARS = 500

/**
 * How far under the base the stop rests, in percent. **Zero sits it on the
 * base itself**, which is the setup that was measured — the box exists so it
 * can be moved off the level, not because it wants to be.
 */
export const DEFAULT_BASE_STOP_UNDER_PCT = 0

/** Days price must close back above the level before the rung goes back on. */
export const DEFAULT_BASE_STOP_RECLAIM_DAYS = 1

/**
 * The furthest under the base a stop may be set, in percent.
 *
 * Named rather than typed into the schema, because the windows that ask for the
 * number have to say the same limit back when somebody types past it — and a
 * limit written down twice is a limit that drifts.
 */
export const MAX_BASE_STOP_UNDER_PCT = 50

/** The longest buy-back wait, in days. Same reason it is named. */
export const MAX_BASE_STOP_RECLAIM_DAYS = 90

/** What the window asks for: how far under the base, and the buy-back wait. */
export const dcaBaseStopSchema = z.object({
  underPct: z.number().min(0).max(MAX_BASE_STOP_UNDER_PCT),
  /** 0 turns the buy-back off, which is how a ladder behaved before it existed. */
  reclaimDays: z.number().min(0).max(MAX_BASE_STOP_RECLAIM_DAYS),
})

type DcaBaseStop = z.infer<typeof dcaBaseStopSchema>

/**
 * What counts as a base: how far back to look for a low, and how long that low
 * must stand without being broken before it means anything.
 *
 * **The same two numbers the Base indicator draws with**, and the reason they
 * are written down on the ladder rather than read from the chart is that a
 * saved flow has to test the same thing twice. Nudging the chart is how you
 * explore; a run that quietly changed with it could not be compared to the run
 * before it.
 *
 * They used to be neither — fixed at the indicator's factory numbers, with no
 * way to change them from anywhere. So the whole strategy hung off a level
 * whose definition could not be tested, and a chart tuned to find bases one way
 * traded on bases found another.
 */
export const dcaBaseDetectionSchema = z.object({
  searchBars: z.number().int().min(4).max(500),
  holdBars: z.number().int().min(1).max(499),
  /**
   * A base only counts when it sits above the base before it — the textbook
   * higher low. Off, every level counts.
   */
  withTrendOnly: z.boolean().default(true),
  /**
   * Two bases can never count closer together than this many candles.
   *
   * It reads like a drawing preference and is not one. The chart applied it and
   * the ladder did not, so on the same coin with the same settings the chart
   * showed 1,387 bases and the ladder followed 1,622 — it re-aimed on levels
   * that were never drawn.
   */
  minBarsApart: z.number().int().min(1).max(1000).default(20),
})

export type DcaBaseDetection = z.infer<typeof dcaBaseDetectionSchema>

/**
 * The base indicator's own two numbers, read from the indicator's field list
 * rather than written down again here.
 *
 * They are frozen onto a ladder when it is placed, so the stop keeps aiming at
 * the level the chart drew on the day you placed it. Nudging the indicator
 * afterwards changes the chart and leaves every live stop where it is.
 */
export function baseStopDetection(): DcaBaseDetection {
  const params = defaultIndicatorParams(BASE_FIELDS)
  return {
    searchBars: params.searchBars as number,
    holdBars: params.holdBars as number,
    withTrendOnly: params.withTrendOnly as boolean,
    minBarsApart: params.minBarsApart as number,
  }
}

/**
 * Where rung 1 is measured from.
 *
 * "base" is the QFL rule and the default: a full step below the confirmed
 * base, so the ladder always hangs off the level it is betting on. "click"
 * puts it a step below whatever price was right-clicked, for placing one
 * somewhere the indicator has not marked.
 */
export const DCA_ANCHORS = ["base", "click"] as const
export type DcaAnchor = (typeof DCA_ANCHORS)[number]

export const DCA_ANCHOR_LABELS: Record<DcaAnchor, string> = {
  base: "The last known base",
  click: "The price you clicked",
}

export const DCA_ANCHOR_HINTS: Record<DcaAnchor, string> = {
  base: "The ladder hangs off the confirmed base, and rung 1 is a full step below it. It will not place without one, or once price has already fallen under it.",
  click:
    "The ladder hangs off the price you right-clicked. Any rung price has already fallen past is skipped, since it can no longer wait for a drop.",
}

/**
 * The smallest order the exchange will take, in dollars.
 *
 * **Hyperliquid refuses anything under $10.** This was a penny for a long time,
 * which only checked that an order was not literally nothing — so the app waved
 * through orders it already knew would come back refused, and a flow with a
 * hundred coins asked the exchange a hundred times a minute for an answer it
 * had. Every rung of a six-rung ladder on a $30 account is worth pennies, and
 * every one of them was sent.
 *
 * Practice orders are held to the same number on purpose. A practice wallet
 * that happily fills seven-cent rungs is not practice — it is a different
 * strategy that cannot be traded, and finding that out with real money is the
 * expensive way.
 */
export const MIN_ORDER_USD = 10

const dcaRungSchema = z.object({
  deviation: z.number().positive().max(99),
})

const dcaRungsSchema = z.array(dcaRungSchema).min(1).max(20)

/**
 * How the ladder takes profit. "average" re-aims one target above the average
 * buy price after every fill; "prevRung" rests each rung's own sell at the
 * price of the rung above it; "nearestRung" keeps one sell for everything at
 * the nearest rung above the deepest buy, sliding down as deeper rungs fill;
 * "exitLadder" mirrors the entry gaps above the anchor and sells the largest
 * buys first at the closest exits.
 */
export const DCA_TP_MODES = [
  "average",
  "prevRung",
  "nearestRung",
  "exitLadder",
] as const
export type DcaTpMode = (typeof DCA_TP_MODES)[number]

export const DCA_TP_MODE_LABELS: Record<DcaTpMode, string> = {
  average: "At the average price",
  prevRung: "Sell at previous rung",
  nearestRung: "Sell everything at nearest rung",
  exitLadder: "Sell back up the ladder",
}

/** What each mode does, for the tooltip beside the picker. */
export const DCA_TP_MODE_HINTS: Record<DcaTpMode, string> = {
  average:
    "The target sits the chosen percent above the average buy price, and is re-aimed after every fill.",
  prevRung:
    "Each buy sells at the price of the buy above it — the first at the clicked price itself.",
  nearestRung:
    "One sell for everything at the rung above the deepest buy; it slides deeper as more rungs fill.",
  exitLadder:
    "Mirrors the buy steps above the anchor, with the biggest buys selling first at the closest exits. Drag an exit line to move every exit and change the gap above the buys.",
}

/**
 * Everything a ladder setup asks for — also the shape remembered between
 * uses, so junk saved by an older build falls back to defaults.
 */
export const dcaParamsSchema = z.object({
  rungs: dcaRungsSchema,
  maxPositionPct: z.number().positive().max(100),
  sizeMultiplier: z.number().min(1).max(10),
  /**
   * Size each fresh ladder from the account's value at that moment. Off, every
   * ladder uses the run's starting value instead. Defaulted so saved ladders
   * keep the current behavior.
   */
  compound: z.boolean().default(true),
  /**
   * How many dollars of coin each dollar of the pot buys. 1 is cash.
   * Defaults to cash. A higher number is used only when somebody chooses it,
   * and the market's own maximum still wins when it is lower.
   */
  leverage: z.number().int().min(1).max(50).default(1),
  /**
   * Liquidity guard: no single buy bigger than this share of the coin's
   * last-24-hours volume, so thin coins get small orders. 0 = off.
   */
  maxOrderVolPct: z.number().min(0).max(5),
  /** Buy only after two green candles confirm the turn, instead of resting orders. */
  twoGreen: z.boolean(),
  /**
   * Where rung 1 is measured from. Defaults to the base, so a ladder saved
   * before this existed gets the rule the QFL automation uses.
   */
  anchor: z.enum(DCA_ANCHORS).default("base"),
  /**
   * How a base is found — read wherever this ladder needs to know where the
   * floor is, which is both where it hangs its rungs and where it rests its
   * stop. Defaulted, so a ladder saved before this existed keeps the numbers it
   * was always run with.
   */
  baseDetection: dcaBaseDetectionSchema.default(baseStopDetection),
  /**
   * INERT as a setting — kept only so saved flows and old backtest snapshots
   * still parse. Nothing reads it: every placement forces the plan onto
   * watched triggers ("market"), and a replay overrides its armed plans to
   * "limit" as its own wick-fill model. The pair of values still means
   * something on a PLAN (see `LadderPlan.rungEntry`); on the params it is a
   * leftover.
   */
  rungEntry: z.enum(["market", "limit"]).default("limit"),
  takeProfit: z
    .object({
      mode: z.enum(DCA_TP_MODES),
      /** Only the "average" mode has a percent; the rung modes aim at rungs. */
      pct: z.number().positive().max(999),
      /** Extra room above the mirrored exits. Missing on older saved settings. */
      exitGapPct: z.number().min(0).max(MAX_DCA_EXIT_GAP_PCT).optional(),
    })
    .nullable(),
  /**
   * Stop selling while the whole market is falling off a cliff. Null is off,
   * which is what every ladder saved before this carries — see `cascade.ts`
   * for what it is and why the numbers are what they are.
   */
  cascade: cascadeSchema.nullable().default(null),
  /**
   * How many coins the wallet may open in a stretch of time. Null is off.
   *
   * **What it is for.** On 10 October 2025 the market fell 50-70% in eleven
   * minutes and forty-four coins took their first rung inside one candle. The
   * wallet could not then fund their second rungs, and a coin holding one rung
   * is wiped out 45% below it at 2x — so almost all forty-four were liquidated
   * before the fall was over. Spending everything on first rungs is the worst
   * possible use of the money on the one day the deep rungs pay.
   *
   * A coin going from holding nothing to holding something counts as one, so a
   * coin wiped out and bought again counts twice. Adding to a coin already held
   * is never counted: the whole point is to leave room for exactly that.
   */
  entryLimit: entryLimitSchema.nullable().default(null),
  stopLoss: z
    .object({
      /**
       * Percent below the average buy price, re-aimed as the average moves.
       *
       * 100 is allowed and means the stop can never fire — price would have to
       * reach zero. That is not a mistake: it is how you say "no stop until the
       * base arrives" while `base` below is switched on.
       */
      pct: z.number().positive().max(100),
      /**
       * Rest the stop under the confirmed 4h base instead, once one has
       * confirmed below the first buy. The percent above stands until then, so
       * there is always a stop. Null leaves the ladder on the percent alone.
       */
      base: dcaBaseStopSchema.nullable().default(null),
    })
    .nullable(),
})

export type DcaParams = z.infer<typeof dcaParamsSchema>

export function defaultDcaParams(): DcaParams {
  return {
    rungs: DEFAULT_DCA_RUNGS.map((rung) => ({ ...rung })),
    maxPositionPct: DEFAULT_DCA_MAX_POSITION_PCT,
    sizeMultiplier: DEFAULT_DCA_SIZE_MULTIPLIER,
    compound: true,
    // Cash. Above 1 the exchange gets a price at which it can close the
    // position, and nothing should acquire that by default.
    leverage: 1,
    maxOrderVolPct: 0,
    twoGreen: false,
    anchor: "base",
    baseDetection: baseStopDetection(),
    rungEntry: "limit",
    takeProfit: {
      mode: "average",
      pct: DEFAULT_DCA_TAKE_PROFIT_PCT,
      exitGapPct: DEFAULT_DCA_EXIT_GAP_PCT,
    },
    stopLoss: null,
    // Off. A ladder that did not ask for a limit enters as many coins as it
    // always did.
    entryLimit: null,
    // Off. The rule only ever fires twice in six years of history, so a ladder
    // that did not ask for it must behave exactly as it did before.
    cascade: null,
  }
}

/**
 * Rung buy prices. Each rung's `deviation` is measured from the PREVIOUS rung
 * (the first from the clicked price), so the drops compound: click −5% → then
 * −8% of that → and so on. This spreads the ladder out rather than bunching
 * every rung a few percent under the click.
 */
export function dcaLevels(base: number, rungs: readonly DcaRung[]): number[] {
  const levels: number[] = []
  let price = base
  for (const rung of rungs) {
    price = price * (1 - rung.deviation / 100)
    levels.push(price)
  }
  return levels
}

/**
 * Each rung's share of the account, in percent. The pot is split across the
 * rungs by an exponential ramp: rung i carries `sizeMultiplier ** i` of the
 * weight, so each buy is `sizeMultiplier`× the one above it. The shares always
 * sum to `maxPositionPct` — raising the ramp redistributes the pot, it never
 * grows it.
 */
export function dcaAllocationPcts(
  rungCount: number,
  maxPositionPct: number,
  sizeMultiplier: number
): number[] {
  const ramp = sizeMultiplier > 0 ? sizeMultiplier : 1
  const weights = Array.from({ length: rungCount }, (_, i) => ramp ** i)
  const total = weights.reduce((sum, weight) => sum + weight, 0)
  if (!(total > 0)) return weights.map(() => 0)
  return weights.map((weight) => (maxPositionPct * weight) / total)
}

/** Sizes go only as fine as the market allows, and never round up into more risk. */
export function floorSize(sz: number, sizeDecimals: number | null): number {
  if (!Number.isFinite(sz) || sz <= 0) return 0
  const factor = 10 ** Math.max(0, sizeDecimals ?? 0)
  return Math.floor(sz * factor) / factor
}

type DcaPlannedRung = {
  px: number
  /** What this buy spends, after the liquidity guard capped it. */
  dollars: number
  /** In coins, floored to the market's size step. */
  sz: number
}

// ----- Sizing one order, which every smart order does the same way ---------

/**
 * The most one order may spend under the liquidity guard, or null when the
 * guard is off or the market's volume is unknown.
 *
 * Its own function so the ladder and the grid cannot drift apart on what "no
 * single buy bigger than this share of the day's volume" means.
 */
export function volumeCapUsd(
  maxOrderVolPct: number,
  volume24hUsd: number | null
): number | null {
  if (!(maxOrderVolPct > 0)) return null
  if (!volume24hUsd || !(volume24hUsd > 0)) return null
  return (volume24hUsd * maxOrderVolPct) / 100
}

/**
 * One order, sized: the dollars it may spend after the liquidity guard, and how
 * many coins that buys at this market's size step.
 *
 * The kernel every smart order shares. A ladder splits its pot by an
 * exponential ramp and a grid splits its pot evenly, but from the moment each
 * has decided "this order wants $166" the rest is identical — the same cap, the
 * same floor to the size step, the same test for too small to be a trade. Two
 * copies of that is two places for the dust rule to be different.
 *
 * `tooSmall` is reported, never silently dropped: the caller refuses the whole
 * order out loud so nobody places half of what the window drew.
 */
export function sizeOneOrder(input: {
  px: number
  /** What this order would like to spend, before the guard. */
  wantedUsd: number
  /** From `volumeCapUsd`, or null when nothing caps it. */
  capUsd: number | null
  sizeDecimals: number | null
}): { dollars: number; sz: number; capped: boolean; tooSmall: boolean } {
  const wanted = input.wantedUsd
  const dollars =
    input.capUsd !== null ? Math.min(wanted, input.capUsd) : wanted
  const capped = input.capUsd !== null && dollars < wanted
  const sz =
    input.px > 0 ? floorSize(dollars / input.px, input.sizeDecimals) : 0
  const spent = sz * input.px
  return {
    dollars: spent,
    sz,
    capped,
    tooSmall: sz <= 0 || spent < MIN_ORDER_USD,
  }
}

type DcaLadderPlan = {
  rungs: DcaPlannedRung[]
  /** What the whole ladder costs if every rung buys, at 1× — dollars. */
  totalCost: number
  /** First rung too small to be an order at this market's size step, or null. */
  tooSmallIndex: number | null
  /** True when the liquidity guard shrank at least one buy. */
  volumeCapped: boolean
}

/**
 * The whole ladder as concrete numbers: where each buy sits, what it spends,
 * and how many coins that is. Used by the window for its live figures and by
 * the server for the orders it actually writes — one function, so the two can
 * never disagree.
 *
 * A rung the guard capped is shown capped; a rung too small to be an order is
 * flagged, never skipped — the caller refuses the whole ladder out loud.
 */
export function dcaLadderPlan(input: {
  anchorPx: number
  equity: number
  params: Pick<
    DcaParams,
    | "rungs"
    | "maxPositionPct"
    | "sizeMultiplier"
    | "maxOrderVolPct"
    | "leverage"
  >
  sizeDecimals: number | null
  volume24hUsd: number | null
}): DcaLadderPlan {
  const levels = dcaLevels(input.anchorPx, input.params.rungs)
  const shares = dcaAllocationPcts(
    input.params.rungs.length,
    input.params.maxPositionPct,
    input.params.sizeMultiplier
  )
  const capUsd = volumeCapUsd(input.params.maxOrderVolPct, input.volume24hUsd)
  // What each share of the pot BUYS. At 1 they are the same number and always
  // were. At 2 the same slice of the pot puts twice as many dollars of coin on
  // — which is the whole of what borrowing means here, and the share of the
  // pot itself is untouched: "15% per coin" still sets aside 15%.
  const buying = input.params.leverage

  let totalCost = 0
  let tooSmallIndex: number | null = null
  let volumeCapped = false

  const rungs = levels.map((px, index) => {
    const sized = sizeOneOrder({
      px,
      wantedUsd: (input.equity * shares[index] * buying) / 100,
      capUsd,
      sizeDecimals: input.sizeDecimals,
    })
    if (sized.capped) volumeCapped = true
    if (sized.tooSmall && tooSmallIndex === null) tooSmallIndex = index
    totalCost += sized.dollars
    return { px, dollars: sized.dollars, sz: sized.sz }
  })

  return { rungs, totalCost, tooSmallIndex, volumeCapped }
}

// ----- A placed ladder, as it lives in its row ---------------------------

/**
 * Where one rung of a placed ladder stands. `waiting` still hopes to buy;
 * `filled` bought; `sold` bought and its own sell has since gone; `skipped`
 * lost its order without buying — cancelled by hand or unaffordable when its
 * turn came; `cancelled` was called off with the rest of the ladder.
 */
const LADDER_RUNG_STATUSES = [
  "waiting",
  "filled",
  "sold",
  "skipped",
  "cancelled",
] as const
export type LadderRungStatus = (typeof LADDER_RUNG_STATUSES)[number]

const ladderRungStateSchema = z.object({
  px: z.number().positive(),
  sz: z.number().positive(),
  /**
   * What this rung was planned to spend, in dollars, fixed at placement.
   *
   * `px * sz` answers the same question until a buy-back changes `sz`, and a
   * buy-back is capped at exactly this number — so it has to be the one thing
   * a buy-back can never move. Without it a rung bought back cheaper would
   * carry a bigger budget into the next round, and the round after that, which
   * is how the old app turned a $25,000 pot into $76,750.
   *
   * Zero on a ladder placed before this existed; `rungBudget` falls back.
   */
  budget: z.number().min(0).default(0),
  status: z.enum(LADDER_RUNG_STATUSES),
  /** The resting buy order carrying this rung, while it waits. */
  orderId: z.string().nullable(),
  /** The "sell at previous rung" order, once this rung has bought. */
  sellOrderId: z.string().nullable(),
  /**
   * The rung sits at or below the position's stop, so its order was taken off
   * the book — price cannot reach it without ending the ladder first. It is
   * still drawn, faded, and comes back if the stop moves below it again.
   */
  dead: z.boolean(),
  /** Two-green mode: price has reached this rung; the candles may now arm it. */
  touched: z.boolean(),
})

export type LadderRungState = z.infer<typeof ladderRungStateSchema>

const ladderTakeProfitSchema = z.object({
  mode: z.enum([...DCA_TP_MODES, "fixed"]),
  pct: z.number().positive().max(999).nullable(),
  /** One movable gap shifts the whole mirrored exit shape. */
  exitGapPct: z
    .number()
    .min(0)
    .max(MAX_DCA_EXIT_GAP_PCT)
    .default(DEFAULT_DCA_EXIT_GAP_PCT),
})

const exitLadderRungSchema = z.object({
  status: z.enum(["waiting", "sold"]),
  orderId: z.string().nullable(),
  armedSz: z.number().min(0),
})

/**
 * The base rule as a placed ladder carries it — the two settings from the
 * window, plus the base indicator's own numbers frozen alongside them.
 *
 * Frozen because the alternative is a live stop that moves when you nudge a
 * slider on the chart, which is the sort of thing you only find out about
 * afterwards.
 */
/**
 * The stop's own two settings, and only those.
 *
 * It used to carry a frozen copy of how a base is found as well, which the plan
 * now holds for the whole ladder. One ladder with two answers to "what is a
 * base" is the shape of every bug in this area so far.
 */
const ladderBaseStopSchema = z.object({
  underPct: z.number().min(0).max(MAX_BASE_STOP_UNDER_PCT),
  reclaimDays: z.number().min(0).max(MAX_BASE_STOP_RECLAIM_DAYS),
})

type LadderBaseStop = z.infer<typeof ladderBaseStopSchema>

const ladderStopLossSchema = z.object({
  /** "percent" follows the average; "fixed" is wherever it was put by hand. */
  mode: z.enum(["percent", "fixed"]),
  pct: z.number().positive().max(100).nullable(),
  /**
   * The base rule, or null for a plain percent stop. A ladder placed before
   * this existed reads as null and behaves exactly as it did.
   */
  base: ladderBaseStopSchema.nullable().default(null),
})

/**
 * Everything a placed ladder remembers. Percentages from the window die at
 * placement — from here on the ladder is concrete prices and sizes, and every
 * rule reads them as they stand.
 */
export const ladderPlanSchema = z.object({
  ...smartOrderPauseFields,
  anchorPx: z.number().positive(),
  /**
   * What `anchorPx` is: the confirmed base, or the price that was clicked.
   *
   * Only a base-anchored ladder follows its base. A ladder from before this
   * existed was hung on a click, which is what the default says.
   */
  anchor: z.enum(DCA_ANCHORS).default("click"),
  /**
   * How this plan's rungs buy, decided by whoever built the plan — never by a
   * setting.
   *
   * **"market"** is every real and practice ladder: each rung is a price the
   * engine watches, fired at market the moment the live price crosses it.
   * **"limit"** is only ever written by a backtest's arm: the replay models
   * "fired when crossed" as an order its own book wick-fills, exits able to
   * sell on the same bar's bounce — the model every measured run used.
   */
  rungEntry: z.enum(["market", "limit"]).default("limit"),
  /**
   * When this ladder came into existence, in epoch milliseconds.
   *
   * A ladder that watches candles has to know where to start reading, and the
   * answer is "the moment it existed". Without it the first pass read the WHOLE
   * feed — a year of candles — and bought a rung on each of the earliest bars,
   * months before this ladder was created: a column of buys in one spot with
   * its rungs out of order. Zero is a ladder saved before this was recorded.
   */
  startedAt: z.number().default(0),
  /**
   * How this ladder finds a base, frozen at placement.
   *
   * On the plan and not looked up, so a ladder already working keeps aiming at
   * the level it was drawn against even if the flow behind it is edited. A
   * ladder saved before this existed reads as the numbers it was run with.
   */
  baseDetection: dcaBaseDetectionSchema.default(baseStopDetection),
  /** The market's rules, frozen at placement — the engine re-aims from these. */
  sizeDecimals: z.number().nullable(),
  /**
   * The market's smallest price step, frozen with the rest of the rules. Null
   * on an exchange that states none — which is every ladder placed before a
   * second exchange existed, so old rows read exactly as they did.
   */
  priceTick: z.number().nullable().default(null),
  maxLeverage: z.number().positive(),
  /**
   * What this ladder buys at, frozen at placement and already clamped to the
   * market's own ceiling — so nothing downstream has to re-check it against a
   * catalogue that may have moved since.
   *
   * Defaulted to 1, which is what every ladder placed before this existed was
   * doing. New ladders also use 1 unless somebody chooses borrowing.
   */
  leverage: z.number().int().positive().default(1),
  rungs: z.array(ladderRungStateSchema).min(1).max(20),
  /**
   * The mirrored sells. Old plans and mode switches start empty; the engine
   * builds one entry per buy rung when the exit-ladder mode is active.
   */
  exitRungs: z.array(exitLadderRungSchema).max(20).default([]),
  takeProfit: ladderTakeProfitSchema.nullable(),
  stopLoss: ladderStopLossSchema.nullable(),
  /** The market-crash rule this ladder was placed with. Null is off. */
  cascade: cascadeSchema.nullable().default(null),
  /**
   * The moment a market-wide crash was last seen, or null.
   *
   * On the plan rather than worked out fresh each pass because the hold has to
   * survive a restart. The engine can go down mid-crash — that is exactly when
   * it is under load — and a ladder that forgot it was holding would come back
   * up and sell the whole ladder into the hole it was waiting out.
   */
  cascadeSeenAt: z.number().nullable().default(null),
  /**
   * How many coins this wallet may open in a stretch of time. Null is off.
   *
   * Carried on every plan the flow places, so the live engine can put the rule
   * on the wallet's book without knowing which flow it came from. Every ladder
   * a flow places carries the same numbers.
   */
  entryLimit: entryLimitSchema.nullable().default(null),
  /**
   * The brackets the ladder last wrote onto the position. When the position
   * carries something else, a hand moved it — the ladder stops following and
   * treats that side as fixed, rather than quietly dragging it back.
   */
  aimedTpPx: z.number().nullable(),
  aimedSlPx: z.number().nullable(),
  /** Two-green mode: candles are watched instead of orders resting. */
  twoGreen: z.boolean(),
  greenInterval: z.string().nullable(),
  /** How far the candle watch has read, and whether the last close was green. */
  green: z.object({ seenTo: z.number(), lastGreen: z.boolean() }).nullable(),
  /**
   * How many times the base stop has taken a rung and stepped the ladder down.
   *
   * Above zero it also changes how the ladder rests: **one rung at a time**.
   * Before the first stop every rung rests at once, which is how a ladder has
   * always worked here and what you see when you place one.
   */
  steppedDown: z.number().int().min(0).max(100).default(0),
  /**
   * The stop just took a rung and the next one has not bought yet.
   *
   * Being flat normally ends a ladder. Being flat for these few hours does
   * not — it sold at a stop on purpose and the next rung is still waiting.
   *
   * This used to be read off `steppedDown > 0`, which is a count that never
   * goes back down: once a ladder had been stopped even once, EVERY later flat
   * moment looked like this one. So a ladder that sold its last slice at a
   * profit stayed open instead of finishing, and went on buying rungs down the
   * same fall — YGG bought six more rungs from 8.5c to 1.7c on a ladder that
   * should have closed months earlier and gone back to hunting a base break.
   */
  awaitingSteppedRung: z.boolean().default(false),
  /**
   * The position was liquidated and a waiting rung has not re-bought yet.
   *
   * ON THE PLAN, because "just liquidated" can last for days: mid-crash the
   * crash rule itself may refuse the re-buy for candles on end, and a flag
   * that only lived for the liquidation's own candle let the ladder be read
   * as "bought something, holding nothing — done" one bar later. A ladder
   * ends when its rungs are used up, never because the exchange took the
   * position. Cleared the moment something is held again.
   */
  awaitingRungAfterWipe: z.boolean().default(false),
  /**
   * The 4h base the stop is riding, and how far the watch has read. Kept so a
   * settle four seconds after the last one costs no candles: the level can
   * only change when a 4h bar closes.
   */
  baseWatch: z
    .object({
      /** The confirmed base in force, or null before one has confirmed. */
      levelPx: z.number().positive().nullable(),
      seenTo: z.number(),
    })
    .nullable()
    .default(null),
  /**
   * A rung the base stop took, waiting to be put back if price climbs back
   * over the level it was cut at and stays there.
   *
   * `dollars` rather than a coin count on purpose: a level reclaimed months
   * later at three times the price would otherwise cost three times the money.
   * The rung's budget is the rung's budget.
   */
  reclaim: z
    .object({
      levelPx: z.number().positive(),
      rungIndex: z.number().int().min(0).max(19),
      dollars: z.number().positive(),
      /** When price first closed back above the level, or null while under it. */
      aboveSince: z.number().nullable(),
    })
    .nullable()
    .default(null),
})

export type LadderPlan = z.infer<typeof ladderPlanSchema>

export type LadderShapeChange =
  | { anchorPx: number; deepestPx?: never }
  | { anchorPx?: never; deepestPx: number }
  | {
      anchorPx?: never
      deepestPx?: never
      exitIndex: number
      exitPx: number
    }

/** Re-spread typed rung percentages so the deepest rung lands at one price. */
export function resizedDcaDeviations(
  deviations: readonly number[],
  anchorPx: number,
  currentDeepestPx: number,
  nextDeepestPx: number
): number[] | null {
  if (
    deviations.length === 0 ||
    !(anchorPx > currentDeepestPx) ||
    !(anchorPx > nextDeepestPx) ||
    !(nextDeepestPx > 0)
  ) {
    return null
  }

  const currentDepth = Math.log(currentDeepestPx / anchorPx)
  const nextDepth = Math.log(nextDeepestPx / anchorPx)
  const scale = nextDepth / currentDepth
  if (!Number.isFinite(scale) || !(scale > 0)) return null

  const resized = deviations.map((deviation) => {
    const remaining = 1 - deviation / 100
    return (1 - remaining ** scale) * 100
  })
  return resized.every(
    (deviation) =>
      Number.isFinite(deviation) && deviation > 0 && deviation <= 99
  )
    ? resized
    : null
}

/** A ladder can be moved only before any rung has started or been called off. */
export function ladderShapeMovable(plan: LadderPlan): boolean {
  return (
    plan.steppedDown === 0 &&
    plan.reclaim === null &&
    plan.rungs.every(
      (rung) =>
        rung.status === "waiting" &&
        rung.orderId === null &&
        rung.sellOrderId === null
    )
  )
}

/** Redraw a not-yet-started ladder while preserving each rung's budget. */
export function reshapeLadderPlan(
  plan: LadderPlan,
  change: LadderShapeChange,
  roundPx: (px: number) => number
): LadderPlan {
  if ("exitPx" in change) throw new Error("SMART_EXIT_GAP")
  if (!ladderShapeMovable(plan)) throw new Error("SMART_LADDER_STARTED")

  const deepest = plan.rungs.at(-1)
  if (!deepest) throw new Error("SMART_LADDER_RANGE")
  const moving = change.anchorPx !== undefined
  const wantedAnchor = moving ? change.anchorPx : plan.anchorPx
  if (!(wantedAnchor > 0)) throw new Error("SMART_LADDER_RANGE")

  let rawPrices: number[]
  if (moving) {
    const scale = wantedAnchor / plan.anchorPx
    rawPrices = plan.rungs.map((rung) => rung.px * scale)
  } else {
    if (!(change.deepestPx > 0) || !(plan.anchorPx > change.deepestPx)) {
      throw new Error("SMART_LADDER_RANGE")
    }
    const scale =
      Math.log(change.deepestPx / plan.anchorPx) /
      Math.log(deepest.px / plan.anchorPx)
    if (!Number.isFinite(scale) || !(scale > 0)) {
      throw new Error("SMART_LADDER_RANGE")
    }
    rawPrices = plan.rungs.map(
      (rung) => plan.anchorPx * (rung.px / plan.anchorPx) ** scale
    )
  }

  const anchorPx = roundPx(wantedAnchor)
  const prices = rawPrices.map(roundPx)
  if (
    !(anchorPx > prices[0]) ||
    prices.some(
      (price, index) =>
        !(price > 0) || (index > 0 && !(prices[index - 1] > price))
    )
  ) {
    throw new Error("SMART_LADDER_RANGE")
  }

  const rungs = plan.rungs.map((rung, index) => {
    const px = prices[index]
    const budget = rungBudget(rung)
    const sz = floorSize(budget / px, plan.sizeDecimals)
    if (!(sz > 0) || px * sz < MIN_ORDER_USD) {
      throw new Error("SMART_RUNG_TOO_SMALL")
    }
    return { ...rung, px, sz, budget, dead: false, touched: false }
  })

  return {
    ...plan,
    anchorPx,
    // A hand-set shape must not jump back to the next detected base.
    anchor: "click",
    rungs,
    green: null,
    baseWatch: null,
  }
}

/**
 * The coins the ladder's filled rungs are holding right now — the rungs that
 * have bought and not yet sold. What the ladder's take profit is sized to
 * while a grid shares the coin, so the target sells the ladder's coins and
 * not one of the grid's.
 */
export function ladderHeldSz(plan: Pick<LadderPlan, "rungs">): number {
  let sum = 0
  for (const rung of plan.rungs) {
    if (rung.status === "filled") sum += rung.sz
  }
  return sum
}

export const LADDER_STATUSES = ["active", "done"] as const
export type LadderStatus = (typeof LADDER_STATUSES)[number]

/**
 * There is deliberately no `readLadderPlan` here.
 *
 * Ladders share their table with grids, and a plan parsed without knowing which
 * kind of row it came from returns null for the other kind — which every caller
 * turns into "skip this row". A skipped row is a smart order with real orders
 * resting on a real exchange that nothing will ever advance again. So the only
 * door is `readSmartPlan(kind, value)` in `smart-plan.ts`, and it cannot be
 * called without naming the kind.
 */

/**
 * The price levels a ladder exits at, one per rung: the rung above each rung,
 * and the click itself above the first. Both rung exit modes read this.
 */
export function ladderExitLevels(
  plan: Pick<LadderPlan, "anchorPx" | "rungs">
): number[] {
  return plan.rungs.map((_rung, index) =>
    index === 0 ? plan.anchorPx : plan.rungs[index - 1].px
  )
}

/**
 * Mirrors each stored buy step above the anchor. The plan keeps concrete buy
 * prices, so this recovers each percentage instead of storing a second copy of
 * the ladder shape that could drift after a move or resize.
 */
export function exitLadderLevels(plan: {
  anchorPx: number
  rungs: readonly { px: number }[]
  takeProfit?: { mode: string; exitGapPct?: number } | null
}): number[] {
  let previousBuy = plan.anchorPx
  const gapPct =
    plan.takeProfit?.mode === "exitLadder"
      ? (plan.takeProfit.exitGapPct ?? DEFAULT_DCA_EXIT_GAP_PCT)
      : DEFAULT_DCA_EXIT_GAP_PCT
  let previousExit = plan.anchorPx * (1 + gapPct / 100)
  return plan.rungs.map((rung) => {
    const step = 1 - rung.px / previousBuy
    previousBuy = rung.px
    previousExit *= 1 + step
    return previousExit
  })
}

/**
 * Turns one dragged exit price into the single extra gap shared by every exit.
 * The mirrored spacing stays intact; a price below the no-gap shape is invalid.
 */
export function exitLadderGapPctForPrice(
  plan: { anchorPx: number; rungs: readonly { px: number }[] },
  exitIndex: number,
  exitPx: number
): number | null {
  if (!Number.isInteger(exitIndex) || !(exitPx > 0)) return null
  const basePx = exitLadderLevels({
    anchorPx: plan.anchorPx,
    rungs: plan.rungs,
  })[exitIndex]
  if (!(basePx > 0)) return null
  const gapPct = (exitPx / basePx - 1) * 100
  if (
    !Number.isFinite(gapPct) ||
    gapPct < -1e-9 ||
    gapPct > MAX_DCA_EXIT_GAP_PCT
  ) {
    return null
  }
  return Math.max(DEFAULT_DCA_EXIT_GAP_PCT, gapPct)
}

/** The deepest buy maps to the closest exit, then the sizes work upward. */
export function exitLadderPlannedSz(
  plan: Pick<LadderPlan, "rungs">,
  exitIndex: number
): number {
  return plan.rungs[plan.rungs.length - 1 - exitIndex]?.sz ?? 0
}

/**
 * Accounts for an exit sale against the deepest coins still held. A partial
 * sale leaves the unsold part on that rung; complete rungs become terminal.
 */
export function consumeSoldFromRungs(
  plan: Pick<LadderPlan, "rungs" | "sizeDecimals">,
  soldSz: number
): void {
  let remaining = soldSz
  if (!Number.isFinite(remaining) || remaining <= 0) return

  for (
    let index = plan.rungs.length - 1;
    index >= 0 && remaining > 0;
    index--
  ) {
    const rung = plan.rungs[index]
    if (rung.status !== "filled") continue
    if (remaining >= rung.sz - 1e-9) {
      remaining -= rung.sz
      rung.status = "sold"
      continue
    }

    const left = floorSize(rung.sz - remaining, plan.sizeDecimals)
    if (left > 0) {
      rung.sz = left
      rung.budget = rung.px * left
    } else {
      rung.status = "sold"
    }
    remaining = 0
  }
}

/**
 * The candle interval this ladder has to WATCH, or null when it rests orders
 * and needs no candles of its own.
 *
 * Two things want candles now, not one: two-green mode, and every ladder whose
 * rungs buy at market — those rungs are levels being watched rather than
 * orders on a book, so without bars nothing would ever buy.
 */
export function ladderWatchInterval(plan: LadderPlan): CandleInterval | null {
  // Candles are only for two-green confirmation now. An ordinary ladder's
  // rungs are triggers fired off the live price mid-candle, so it has no
  // candle feed to want — and a flow watching hundreds of coins not asking
  // for hundreds of feeds is most of the exchange's request budget.
  if (!plan.twoGreen || !plan.greenInterval) return null
  return plan.greenInterval as CandleInterval
}

/**
 * The first buy the ladder is still holding — the shallowest rung that bought
 * and has not been sold out of.
 *
 * This is the price a base has to be below before it can be a stop at all.
 * Measured from a buy rather than from the average because the old app
 * measured against one and applied the answer to the other, and ended up
 * resting its stop 8.5% above the base it was aiming at.
 *
 * Rungs already sold are deliberately not counted. After a stop steps the
 * ladder down they are history — a level below a rung that was sold two rounds
 * ago is not below anything you own, and treating it as a stop would sell the
 * new rung the instant it bought.
 */
export function ladderFirstBuyPx(
  plan: Pick<LadderPlan, "rungs">
): number | null {
  const held = plan.rungs.find((rung) => rung.status === "filled")
  return held ? held.px : null
}

/**
 * Where the stop rests given the base in force — or null when the base cannot
 * carry it and the plain percent has to stand.
 *
 * Two ways it answers null, and both mean "not yet" rather than "never":
 * before any base has confirmed, and while the newest one sits above the first
 * buy. A level above your entry is a place to take profit, not a place to give
 * up, so resting a stop there would close every winning trade at a profit and
 * call it a loss.
 */
export function baseStopPx(
  plan: Pick<LadderPlan, "rungs" | "stopLoss">,
  levelPx: number | null
): number | null {
  const base = plan.stopLoss?.base
  if (!base || levelPx === null || !(levelPx > 0)) return null
  const firstBuy = ladderFirstBuyPx(plan)
  if (firstBuy === null || levelPx >= firstBuy) return null
  return levelPx * (1 - base.underPct / 100)
}

/**
 * The window's stop settings as a placed ladder carries them.
 */
export function ladderBaseStopOf(
  asked: DcaBaseStop | null
): LadderBaseStop | null {
  return asked
}

/**
 * What one rung is allowed to spend. The frozen budget when it has one, and
 * what it currently holds when it does not — which is the same number on every
 * ladder that has never bought a rung back.
 */
export function rungBudget(
  rung: Pick<LadderRungState, "px" | "sz" | "budget">
): number {
  return rung.budget > 0 ? rung.budget : rung.px * rung.sz
}
