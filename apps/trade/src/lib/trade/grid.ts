import { z } from "zod"

import {
  baseStopDetection,
  dcaBaseDetectionSchema,
  dcaBaseStopSchema,
  floorSize,
  sizeOneOrder,
  volumeCapUsd,
} from "@/lib/trade/dca"

/**
 * The grid order's arithmetic — browser-safe, and a sibling of `dca.ts` rather
 * than a branch inside it.
 *
 * A grid is a range and a count. Buys sit evenly spaced below the price, each
 * with its own sell one step above it, and **when that sell fills the buy goes
 * straight back on at the same price**. That recycling is the whole difference
 * from a ladder, whose rungs each have one moment and are then finished.
 *
 * The window that places one and the server that stores one both read their
 * numbers from `gridOrderPlan`, so what is shown is what is placed — the same
 * rule the ladder follows.
 */

/** A grid may hold this many levels. */
export const MAX_GRID_LEVELS = 20

/** Fewer than this is not a grid: one level is a limit buy with a limit sell. */
export const MIN_GRID_LEVELS = 2

export const DEFAULT_GRID_LEVELS = 12

/** Most of the account the whole grid may ever spend, in percent. */
export const DEFAULT_GRID_POT_PCT = 20

/** How far under the bottom of the range the stop rests, in percent. */
export const DEFAULT_GRID_STOP_UNDER_PCT = 5

/** How far over the top of the range the take profit sits, in percent. */
export const DEFAULT_GRID_TAKE_PROFIT_PCT = 5

/**
 * How far above and below the price the range opens at, in percent.
 *
 * A grid straddles the price: the levels above it are sells of what it holds,
 * the ones below are buys waiting. **The same either side**, because a grid is
 * not a view on direction — it earns from price crossing back and forth, and
 * an even range is the honest starting point. Both are typed over anyway.
 */
export const DEFAULT_GRID_ABOVE_PCT = 8
export const DEFAULT_GRID_BELOW_PCT = DEFAULT_GRID_ABOVE_PCT

/**
 * How the levels are spread across the range.
 *
 * "even" puts the same number of dollars between each level, which is what a
 * range drawn on a chart looks like. "compounding" puts the same PERCENT
 * between each, so every round trip earns the same percentage whether it
 * happens near the top of the range or near the bottom — the better grid on a
 * wide range, and meaningfully different only when the range is wide.
 */
export const GRID_SPACINGS = ["even", "compounding"] as const
export type GridSpacing = (typeof GRID_SPACINGS)[number]

export const GRID_SPACING_LABELS: Record<GridSpacing, string> = {
  even: "The same dollars apart",
  compounding: "The same percent apart",
}

export const GRID_SPACING_HINTS: Record<GridSpacing, string> = {
  even: "Every level sits the same number of dollars below the one above it.",
  compounding:
    "Every level sits the same percent below the one above it, so each round trip earns the same percentage wherever it happens in the range.",
}

/**
 * How many times one trading fee a step must be worth before the grid is worth
 * running at all.
 *
 * A round trip pays the fee twice — once to buy, once to sell — so anything at
 * or under two is a grid that trades all day to break even. Three leaves half a
 * fee of profit on every cycle as the bare minimum, and refuses the rest out
 * loud rather than letting them run.
 */
export const GRID_STEP_FEE_MULTIPLE = 3

// ----- What the window asks for -------------------------------------------

/**
 * The stop that sits under the range.
 *
 * Measured from the BOTTOM of the range and never from the average buy price.
 * As levels recycle the average ratchets downward — the shallow levels keep
 * closing out at the price they bought at, while the deep ones keep pulling the
 * average lower — so a stop following it drifts further from the range on every
 * cycle. Worse in the other direction: after a run of shallow cycles it would
 * sit INSIDE the range and sell the whole grid on an ordinary dip, which is the
 * exact move the grid exists to trade.
 */
export const gridStopSchema = z.object({
  /** Percent below the bottom of the range. Zero rests it on the bottom itself. */
  underPct: z.number().min(0).max(50),
  /**
   * Rest the stop under the confirmed 4h base instead, when one has confirmed
   * BELOW the range. The percent above stands until then, so there is always a
   * stop. Null leaves the grid on the percent alone.
   */
  base: dcaBaseStopSchema.nullable().default(null),
})

export type GridStop = z.infer<typeof gridStopSchema>

/**
 * Everything a grid setup asks for — also the shape remembered between uses.
 *
 * The top and the bottom are deliberately **not** in here. They are prices, and
 * a price belongs to one coin; remembering them would carry Bitcoin's range
 * onto the next chart you opened. They travel in the place request beside the
 * clicked price instead, exactly as the ladder's clicked price does. What is
 * remembered is shape: how deep, how many, how much.
 */
export const gridParamsSchema = z.object({
  levels: z.number().int().min(MIN_GRID_LEVELS).max(MAX_GRID_LEVELS),
  /** The whole grid's share of the account, in percent, split evenly. */
  potPct: z.number().positive().max(100),
  /**
   * Size a fresh grid from the account's value at that moment. Off, it uses the
   * wallet's starting value instead. Same meaning as the ladder's.
   */
  compound: z.boolean().default(true),
  /**
   * Liquidity guard: no single buy bigger than this share of the coin's
   * last-24-hours volume, so thin coins get small orders. 0 = off.
   */
  maxOrderVolPct: z.number().min(0).max(5),
  spacing: z.enum(GRID_SPACINGS).default("even"),
  /**
   * How far ABOVE the price the top of the range sits, in percent.
   *
   * The range is set as two percentages rather than two prices because a
   * percentage means the same thing on the next coin you open and a price does
   * not — the same reason none of the other settings here are prices.
   */
  abovePct: z.number().positive().max(999).default(DEFAULT_GRID_ABOVE_PCT),
  /** How far BELOW the price the bottom of the range sits, in percent. */
  rangePct: z.number().positive().max(99).default(DEFAULT_GRID_BELOW_PCT),
  /**
   * How a base is found, when the stop rides one. Frozen onto the grid at
   * placement for the same reason the ladder freezes it: nudging the indicator
   * tomorrow must not move a stop that is already protecting real money.
   */
  baseDetection: dcaBaseDetectionSchema.default(baseStopDetection),
  stopLoss: gridStopSchema.nullable(),
  /**
   * How far ABOVE the upper price the take profit sits, in percent. Reaching it
   * sells everything and finishes the grid.
   *
   * Its own level rather than "the top of the range finishes it", because they
   * are two different ideas. The upper price is where the grid stops having
   * anything left to sell; the take profit is where you have made enough and
   * want out. Null leaves the grid running above its range, waiting for price
   * to come back down into it.
   */
  takeProfitPct: z.number().positive().max(999).nullable().default(null),
})

export type GridParams = z.infer<typeof gridParamsSchema>

export function defaultGridParams(): GridParams {
  return {
    levels: DEFAULT_GRID_LEVELS,
    potPct: DEFAULT_GRID_POT_PCT,
    compound: true,
    maxOrderVolPct: 0,
    spacing: "even",
    abovePct: DEFAULT_GRID_ABOVE_PCT,
    rangePct: DEFAULT_GRID_BELOW_PCT,
    baseDetection: baseStopDetection(),
    stopLoss: { underPct: DEFAULT_GRID_STOP_UNDER_PCT, base: null },
    takeProfitPct: DEFAULT_GRID_TAKE_PROFIT_PCT,
  }
}

// ----- Where the levels sit ------------------------------------------------

export type GridLevelPrices = { buyPx: number; sellPx: number }

/**
 * The buy and sell price of every level.
 *
 * The arrangement is chosen so the range means exactly what it says: the
 * DEEPEST buy is the bottom, and the SHALLOWEST sell is the top. So with a
 * range of $80–$120 over 12 levels there is a buy at $80 and a sell at $120,
 * and every sell is one step above its own buy.
 *
 * Even spacing divides the range by the level count; compounding spacing takes
 * the same ratio between each level instead, so each round trip earns the same
 * percentage wherever in the range it happens.
 *
 * Deepest first, so the array reads the way the chart draws — index 0 is the
 * bottom of the range.
 */
export function gridLevels(input: {
  topPx: number
  bottomPx: number
  levels: number
  spacing: GridSpacing
}): GridLevelPrices[] {
  const { topPx, bottomPx, levels } = input
  if (!(topPx > bottomPx) || !(bottomPx > 0) || levels < 1) return []

  if (input.spacing === "compounding") {
    // One ratio applied `levels` times takes the bottom to the top, so every
    // step is the same percentage of the price it starts from.
    const ratio = (topPx / bottomPx) ** (1 / levels)
    return Array.from({ length: levels }, (_, index) => {
      const buyPx = bottomPx * ratio ** index
      return { buyPx, sellPx: buyPx * ratio }
    })
  }

  const step = (topPx - bottomPx) / levels
  return Array.from({ length: levels }, (_, index) => {
    const buyPx = bottomPx + step * index
    return { buyPx, sellPx: buyPx + step }
  })
}

/**
 * The gap between two levels, as a share of the price — what a round trip earns
 * before fees, and the number the fee check is made against.
 *
 * Taken at the TOP of the range, which is the thinnest step in percentage terms
 * on an evenly spaced grid. Checking the fattest step would pass a grid whose
 * upper levels all lose money.
 */
export function gridStepPct(levels: readonly GridLevelPrices[]): number {
  const highest = levels.at(-1)
  if (!highest || !(highest.buyPx > 0)) return 0
  return (highest.sellPx - highest.buyPx) / highest.buyPx
}

// ----- What each level spends ---------------------------------------------

export type GridPlannedLevel = {
  buyPx: number
  sellPx: number
  /** What this buy spends, after the liquidity guard capped it. */
  dollars: number
  /** In coins, floored to the market's size step. */
  sz: number
}

export type GridOrderPlan = {
  levels: GridPlannedLevel[]
  /** What the whole grid costs if every level buys at once — dollars. */
  totalCost: number
  /** First level too small to be an order at this market's size step, or null. */
  tooSmallIndex: number | null
  /** True when the liquidity guard shrank at least one buy. */
  volumeCapped: boolean
  /** The gap between levels as a share of the price, for the fee check. */
  stepPct: number
}

/**
 * The whole grid as concrete numbers: where each buy sits, where its sell
 * rests, what it spends and how many coins that is.
 *
 * Read by the window for its live figures and by the server for the orders it
 * writes, so the two can never disagree — and it sizes each order through the
 * same `sizeOneOrder` the ladder uses, so there is one liquidity guard and one
 * too-small-to-be-a-trade rule in the app rather than two.
 *
 * The pot is split **evenly**. A ladder ramps its rungs because it is betting
 * harder the further price falls; a grid is not betting on direction at all —
 * it wants the same money working at every level so each round trip earns the
 * same amount.
 */
export function gridOrderPlan(input: {
  topPx: number
  bottomPx: number
  equity: number
  params: Pick<GridParams, "levels" | "potPct" | "maxOrderVolPct" | "spacing">
  sizeDecimals: number | null
  volume24hUsd: number | null
}): GridOrderPlan {
  const prices = gridLevels({
    topPx: input.topPx,
    bottomPx: input.bottomPx,
    levels: input.params.levels,
    spacing: input.params.spacing,
  })
  const capUsd = volumeCapUsd(input.params.maxOrderVolPct, input.volume24hUsd)
  const wantedUsd =
    prices.length > 0
      ? (input.equity * input.params.potPct) / 100 / prices.length
      : 0

  let totalCost = 0
  let tooSmallIndex: number | null = null
  let volumeCapped = false

  const levels = prices.map((price, index) => {
    const sized = sizeOneOrder({
      px: price.buyPx,
      wantedUsd,
      capUsd,
      sizeDecimals: input.sizeDecimals,
    })
    if (sized.capped) volumeCapped = true
    if (sized.tooSmall && tooSmallIndex === null) tooSmallIndex = index
    totalCost += sized.dollars
    return {
      buyPx: price.buyPx,
      sellPx: price.sellPx,
      dollars: sized.dollars,
      sz: sized.sz,
    }
  })

  return {
    levels,
    totalCost,
    tooSmallIndex,
    volumeCapped,
    stepPct: gridStepPct(prices),
  }
}

// ----- A placed grid, as it lives in its row -------------------------------

/**
 * Where one level of a placed grid stands.
 *
 * `waiting` has its buy resting and hopes to buy. `holding` bought and has its
 * sell resting. `cancelled` was called off by hand and never comes back.
 *
 * **There is deliberately no "sold".** A sell filling puts the level straight
 * back to `waiting`, and it buys again the next time price reaches it. The
 * whole recycling loop is that one transition — there is no queue, no re-arm
 * flag and no second table.
 *
 * There are no order ids on a level either. Nothing rests on the book: a level
 * is a price the grid watches, so there is never an order to point at.
 */
export const GRID_LEVEL_STATUSES = ["waiting", "holding", "cancelled"] as const
export type GridLevelStatus = (typeof GRID_LEVEL_STATUSES)[number]

const gridLevelStateSchema = z.object({
  buyPx: z.number().positive(),
  /**
   * Where this level's sell rests, frozen at placement — one step above the buy.
   *
   * Written down rather than worked out from the level above. A ladder derives
   * its exits in three separate places and they have to agree forever; a grid
   * recycles far too often to keep a derivation honest, and a level that sold at
   * a price nobody expected is a level that never recycles again.
   */
  sellPx: z.number().positive(),
  /** Coins one arm of this level buys — re-derived from `budget` every cycle. */
  sz: z.number().positive(),
  /**
   * What this level may spend, in dollars, fixed at placement.
   *
   * The same rule as a ladder rung's budget, and it bites far harder here. A
   * rung buys back once; a grid level buys back every single cycle, so a level
   * allowed to carry a cheaper round's leftover forward would compound on every
   * round trip — which is how a fixed pot quietly turns into a much larger one.
   */
  budget: z.number().positive(),
  /**
   * Coins this level holds right now — zero while it is waiting.
   *
   * Kept apart from `sz` because a part-filled sell has to shrink what is left
   * to sell WITHOUT shrinking what the next cycle may spend. Shrinking the size
   * instead would ratchet a busy level down towards nothing over a month.
   */
  heldSz: z.number().min(0).default(0),
  status: z.enum(GRID_LEVEL_STATUSES),
  /**
   * The level sits at or below the stop, so its order was taken off the book —
   * price cannot reach it without ending the grid first. Still drawn, faded,
   * and back on the book if the stop moves below it again.
   */
  dead: z.boolean(),
  /** How many complete round trips this level has made. For the record. */
  cycles: z.number().int().min(0).default(0),
})

export type GridLevelState = z.infer<typeof gridLevelStateSchema>

/**
 * Where the stop stands as a placed grid carries it. "percent" follows the
 * rules below the range; "fixed" is wherever a hand put it, and is then left
 * alone.
 */
const gridPlanStopSchema = z.object({
  mode: z.enum(["percent", "fixed"]),
  underPct: z.number().min(0).max(50),
  /** Where a hand put it. Only read in "fixed" mode. */
  px: z.number().positive().nullable().default(null),
  /** The base rule, or null for a plain percent stop under the range. */
  base: dcaBaseStopSchema.nullable().default(null),
})

/**
 * Everything a placed grid remembers. The percentages from the window die at
 * placement — from here on it is concrete prices and sizes, and every rule
 * reads them as they stand.
 */
export const gridPlanSchema = z.object({
  topPx: z.number().positive(),
  bottomPx: z.number().positive(),
  /**
   * Sell everything and finish here. Null means the grid never finishes on its
   * own above the range — it simply runs out of levels and waits.
   */
  takeProfitPx: z.number().positive().nullable().default(null),
  spacing: z.enum(GRID_SPACINGS).default("even"),
  /** The whole grid's share of the account at placement, for the record. */
  potPct: z.number().positive().max(100),
  /**
   * The liquidity guard the grid was placed with. Kept so moving the range
   * re-sizes under the same rule it was drawn with rather than quietly
   * dropping it. Zero on a grid saved before this existed, which is off.
   */
  maxOrderVolPct: z.number().min(0).max(5).default(0),
  /** When this grid came into existence, in epoch milliseconds. */
  startedAt: z.number().default(0),
  /** The market's rules, frozen at placement — the engine re-sizes from these. */
  sizeDecimals: z.number().nullable(),
  maxLeverage: z.number().positive(),
  levels: z.array(gridLevelStateSchema).min(MIN_GRID_LEVELS).max(MAX_GRID_LEVELS),
  stopLoss: gridPlanStopSchema.nullable(),
  /** How this grid finds a base, frozen at placement. */
  baseDetection: dcaBaseDetectionSchema.default(baseStopDetection),
  /**
   * The 4h base the stop is riding, and how far the watch has read. Kept so a
   * pass a second after the last one costs no candles: the level can only change
   * when a 4h bar closes.
   */
  baseWatch: z
    .object({
      levelPx: z.number().positive().nullable(),
      seenTo: z.number(),
    })
    .nullable()
    .default(null),
  /**
   * The stop the grid last wrote onto the position. Anything else there means a
   * hand moved it, and from then on the grid leaves it alone.
   *
   * **There is no `aimedTpPx`, on purpose.** A grid's exits are its resting
   * sells, one per level. Writing a take-profit onto the position would sell
   * everything at one price and defeat the whole order, so the field is left out
   * rather than left unused.
   */
  aimedSlPx: z.number().nullable(),
  /**
   * How far the exchange's fill feed has been read, in epoch milliseconds.
   *
   * A ladder makes perhaps forty fills in its whole life, so the live pass could
   * afford to re-read everything since it was placed. A grid running for a month
   * makes hundreds, and re-reading them every second is a bill that grows for as
   * long as the grid is winning.
   */
  seenFillsTo: z.number().default(0),
  /** Completed round trips across the whole grid. */
  cycles: z.number().int().min(0).default(0),
  /** Why it finished, once it has. Null while it is still working. */
  closedReason: z
    .enum(["takeProfit", "aboveTop", "stop", "flat", "cancelled"])
    .nullable()
    .default(null),
})

export type GridPlan = z.infer<typeof gridPlanSchema>

/**
 * Reads a stored grid back, or null when it cannot be read — a row written by a
 * build that meant something else by it is ignored rather than half-obeyed.
 *
 * Reached through `readSmartPlan` rather than called directly, so nothing can
 * parse a row without first saying which kind of smart order it is.
 */
export function readGridPlan(value: unknown): GridPlan | null {
  const parsed = gridPlanSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

/**
 * How many coins a level buys this cycle: its frozen budget at its own price,
 * floored to the market's size step.
 */
export function gridLevelSize(
  level: Pick<GridLevelState, "budget" | "buyPx">,
  sizeDecimals: number | null
): number {
  return floorSize(level.budget / level.buyPx, sizeDecimals)
}

/**
 * Where a stop sits, given the bottom of a range and how far under it to rest.
 *
 * One line, in one place, because it was in four: the placement window, the
 * settings window, the chart while the range is being dragged, and here. Four
 * copies of the same sum is four chances for what is drawn and what is saved to
 * disagree about where the stop actually is.
 */
export function gridStopUnder(bottomPx: number, underPct: number): number {
  return bottomPx * (1 - underPct / 100)
}

/**
 * Where the grid wants its stop, given the base in force — or null when it has
 * no stop at all.
 *
 * The base only carries the stop when it has confirmed **below the range**. A
 * base inside the range is a level the grid fully intends to buy at, not a
 * level at which to give up, and resting a stop there would sell the grid on
 * the first ordinary dip. That is the same instinct as the ladder's base stop,
 * measured against the bottom of the range rather than against the first buy.
 */
/**
 * Where the grid takes its profit and stops, or null when it has no such level.
 *
 * Above the top of the range by definition: inside the range is where it is
 * working, so a target in there would close the grid on an ordinary swing.
 */
export function gridTakeProfitPx(
  plan: Pick<GridPlan, "takeProfitPx" | "topPx">
): number | null {
  const px = plan.takeProfitPx
  return px !== null && px > plan.topPx ? px : null
}

export function gridStopPx(
  plan: Pick<GridPlan, "stopLoss" | "bottomPx" | "baseWatch">
): number | null {
  const sl = plan.stopLoss
  if (!sl) return null
  if (sl.mode === "fixed") return sl.px
  const level = plan.baseWatch?.levelPx ?? null
  if (sl.base && level !== null && level > 0 && level < plan.bottomPx) {
    return gridStopUnder(level, sl.base.underPct)
  }
  return gridStopUnder(plan.bottomPx, sl.underPct)
}

/**
 * Can this grid's range be moved? **Always, while it is running.**
 *
 * It used to be "only while nothing has bought", which sounded careful and was
 * useless: a grid straddles the price, so it holds something from the moment it
 * is placed, and dragging the top up creates more holding levels — so after one
 * move the range locked forever.
 *
 * The reason that rule existed does not survive contact with how a move works.
 * A move redraws every level from the new range and then settles the position
 * to match: it buys the coins the new levels above the price need, or sells the
 * ones they no longer do. Nothing is left describing a price it did not pay.
 */
export function gridRangeMovable(plan: Pick<GridPlan, "levels">): boolean {
  return plan.levels.some(
    (level) => level.status === "waiting" || level.status === "holding"
  )
}

