import { z } from "zod"

import type { CandleInterval } from "@/lib/protocols/contracts"

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
export type DcaRung = {
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

/** Most of the account the whole ladder may ever spend, in percent. */
export const DEFAULT_DCA_MAX_POSITION_PCT = 25

/**
 * How much bigger each buy is than the one above it. 1 = every buy equal; 2 =
 * each buy doubles the last, so far more is bought the deeper price drops.
 */
export const DEFAULT_DCA_SIZE_MULTIPLIER = 2

export const DEFAULT_DCA_TAKE_PROFIT_PCT = 2
export const DEFAULT_DCA_STOP_LOSS_PCT = 1

/** Below this many dollars an order is a mistake, not a trade. */
export const DUST_ORDER_USD = 0.01

const dcaRungSchema = z.object({
  deviation: z.number().positive().max(99),
})

export const dcaRungsSchema = z.array(dcaRungSchema).min(1).max(20)

/**
 * How the ladder takes profit. "average" re-aims one target above the average
 * buy price after every fill; "prevRung" rests each rung's own sell at the
 * price of the rung above it; "nearestRung" keeps one sell for everything at
 * the nearest rung above the deepest buy, sliding down as deeper rungs fill.
 */
export const DCA_TP_MODES = ["average", "prevRung", "nearestRung"] as const
export type DcaTpMode = (typeof DCA_TP_MODES)[number]

export const DCA_TP_MODE_LABELS: Record<DcaTpMode, string> = {
  average: "At the average price",
  prevRung: "Sell at previous rung",
  nearestRung: "Sell everything at nearest rung",
}

/** What each mode does, for the tooltip beside the picker. */
export const DCA_TP_MODE_HINTS: Record<DcaTpMode, string> = {
  average:
    "The target sits the chosen percent above the average buy price, and is re-aimed after every fill.",
  prevRung:
    "Each buy sells at the price of the buy above it — the first at the clicked price itself.",
  nearestRung:
    "One sell for everything at the rung above the deepest buy; it slides deeper as more rungs fill.",
}

/**
 * Everything the placement window asks for — also the shape remembered
 * between uses, so junk saved by an older build falls back to defaults.
 */
export const dcaParamsSchema = z.object({
  rungs: dcaRungsSchema,
  maxPositionPct: z.number().positive().max(100),
  sizeMultiplier: z.number().min(1).max(10),
  /**
   * Liquidity guard: no single buy bigger than this share of the coin's
   * last-24-hours volume, so thin coins get small orders. 0 = off.
   */
  maxOrderVolPct: z.number().min(0).max(5),
  /** Buy only after two green candles confirm the turn, instead of resting orders. */
  twoGreen: z.boolean(),
  takeProfit: z
    .object({
      mode: z.enum(DCA_TP_MODES),
      /** Only the "average" mode has a percent; the rung modes aim at rungs. */
      pct: z.number().positive().max(999),
    })
    .nullable(),
  stopLoss: z
    .object({
      /** Percent below the average buy price, re-aimed as the average moves. */
      pct: z.number().positive().max(99),
    })
    .nullable(),
})

export type DcaParams = z.infer<typeof dcaParamsSchema>

export function defaultDcaParams(): DcaParams {
  return {
    rungs: DEFAULT_DCA_RUNGS.map((rung) => ({ ...rung })),
    maxPositionPct: DEFAULT_DCA_MAX_POSITION_PCT,
    sizeMultiplier: DEFAULT_DCA_SIZE_MULTIPLIER,
    maxOrderVolPct: 0,
    twoGreen: false,
    takeProfit: { mode: "average", pct: DEFAULT_DCA_TAKE_PROFIT_PCT },
    stopLoss: null,
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

export type DcaPlannedRung = {
  px: number
  /** What this buy spends, after the liquidity guard capped it. */
  dollars: number
  /** In coins, floored to the market's size step. */
  sz: number
}

export type DcaLadderPlan = {
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
    "rungs" | "maxPositionPct" | "sizeMultiplier" | "maxOrderVolPct"
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
  const volumeCap =
    input.params.maxOrderVolPct > 0 && (input.volume24hUsd ?? 0) > 0
      ? ((input.volume24hUsd as number) * input.params.maxOrderVolPct) / 100
      : null

  let totalCost = 0
  let tooSmallIndex: number | null = null
  let volumeCapped = false

  const rungs = levels.map((px, index) => {
    const wanted = (input.equity * shares[index]) / 100
    const dollars = volumeCap !== null ? Math.min(wanted, volumeCap) : wanted
    if (volumeCap !== null && dollars < wanted) volumeCapped = true
    const sz = px > 0 ? floorSize(dollars / px, input.sizeDecimals) : 0
    const spent = sz * px
    if ((sz <= 0 || spent < DUST_ORDER_USD) && tooSmallIndex === null) {
      tooSmallIndex = index
    }
    totalCost += spent
    return { px, dollars: spent, sz }
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
export const LADDER_RUNG_STATUSES = [
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
})

const ladderStopLossSchema = z.object({
  /** "percent" follows the average; "fixed" is wherever it was put by hand. */
  mode: z.enum(["percent", "fixed"]),
  pct: z.number().positive().max(99).nullable(),
})

/**
 * Everything a placed ladder remembers. Percentages from the window die at
 * placement — from here on the ladder is concrete prices and sizes, and every
 * rule reads them as they stand.
 */
export const ladderPlanSchema = z.object({
  anchorPx: z.number().positive(),
  /** The market's rules, frozen at placement — the engine re-aims from these. */
  sizeDecimals: z.number().nullable(),
  maxLeverage: z.number().positive(),
  rungs: z.array(ladderRungStateSchema).min(1).max(20),
  takeProfit: ladderTakeProfitSchema.nullable(),
  stopLoss: ladderStopLossSchema.nullable(),
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
})

export type LadderPlan = z.infer<typeof ladderPlanSchema>

export const LADDER_STATUSES = ["active", "done"] as const
export type LadderStatus = (typeof LADDER_STATUSES)[number]

/** One placed ladder, as the screens see it. */
export type SmartLadder = {
  id: string
  walletId: string
  marketKey: string
  status: LadderStatus
  plan: LadderPlan
  createdAt: number
  updatedAt: number
}

/**
 * Reads a stored plan back, or null when it cannot be read — a row written by
 * a build that meant something else by it is ignored rather than half-obeyed.
 */
export function readLadderPlan(value: unknown): LadderPlan | null {
  const parsed = ladderPlanSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

/**
 * The price levels a ladder exits at, one per rung: the rung above each rung,
 * and the click itself above the first. Both rung exit modes read this.
 */
export function ladderExitLevels(plan: Pick<LadderPlan, "anchorPx" | "rungs">): number[] {
  return plan.rungs.map((_rung, index) =>
    index === 0 ? plan.anchorPx : plan.rungs[index - 1].px
  )
}

/** The candle interval two-green mode watches, or null when it is off. */
export function ladderGreenInterval(plan: LadderPlan): CandleInterval | null {
  if (!plan.twoGreen || !plan.greenInterval) return null
  return plan.greenInterval as CandleInterval
}
