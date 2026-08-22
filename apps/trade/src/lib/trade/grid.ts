import { z } from "zod"

import {
  baseStopDetection,
  dcaAllocationPcts,
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
 * How the pot is divided between the levels.
 *
 * "even" gives every level the same dollars, which is the grid's own instinct:
 * it is not betting on direction, so it wants the same money working at every
 * price. "double" gives each level down twice the one above it, for a coin you
 * are happy to own more of the cheaper it gets.
 *
 * Doubling gets steep fast. Twelve levels doubling makes the deepest buy 2,048
 * times the shallowest, and on an ordinary pot the top few land under the
 * exchange's minimum order and the whole grid is refused. That refusal is the
 * feature working: it fits about six levels, and it says so rather than quietly
 * placing five of the twelve.
 */
export const GRID_SIZINGS = ["even", "double"] as const
export type GridSizing = (typeof GRID_SIZINGS)[number]

export const GRID_SIZING_LABELS: Record<GridSizing, string> = {
  even: "The same at every level",
  double: "Double at every level down",
}

export const GRID_SIZING_HINTS: Record<GridSizing, string> = {
  even: "Every level buys the same amount, so each round trip earns the same.",
  double:
    "Each level down buys twice what the level above it bought, so the deepest buy is the biggest. It only fits about six levels before the top ones are too small for the exchange to accept.",
}

/** How much bigger each level down is, when the pot is doubled. */
export const GRID_DOUBLE_MULTIPLIER = 2

/**
 * Where the range is measured from.
 *
 * "price" opens it around today's price, so it straddles: the levels above are
 * sells of what the grid holds, the ones below are buys waiting. That means it
 * buys at market the moment it is placed, to stand behind the sells above.
 *
 * "click" hangs the whole grid under the price that was right-clicked, and the
 * click is the TOP BUY rather than the edge of the range — the edge sits one
 * step higher, because the edge is where that buy sells and is not a buy
 * itself. Nothing is bought at market, so it is the one way to place a grid
 * without being put into the market on the spot.
 */
export const GRID_ANCHORS = ["price", "click"] as const
export type GridAnchor = (typeof GRID_ANCHORS)[number]

export const GRID_ANCHOR_LABELS: Record<GridAnchor, string> = {
  price: "Around today's price",
  click: "Below the price you clicked",
}

export const GRID_ANCHOR_HINTS: Record<GridAnchor, string> = {
  price:
    "The range opens above and below today's price. Levels above it are sells, so the grid buys at market as it is placed to stand behind them.",
  click:
    "The price you right-clicked becomes the top buy, and the whole grid hangs under it. Nothing is bought at market — every level waits for price to fall to it.",
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
  /** How the pot is split between the levels. See `GRID_SIZINGS`. */
  sizing: z.enum(GRID_SIZINGS).default("even"),
  /**
   * Where the range is measured from: today's price, or the clicked price.
   *
   * Not carried onto the placed grid. A placed grid is concrete prices, and
   * where they came from stops mattering the moment they exist.
   */
  anchor: z.enum(GRID_ANCHORS).default("price"),
  /**
   * Slide the whole range up when price climbs past the top of it, and keep
   * trading. See `gridFollowShift` for the arithmetic and `advanceGrid` for the
   * conditions.
   */
  follow: z.boolean().default(false),
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
    sizing: "even",
    anchor: "price",
    follow: false,
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
 * The range a right-click describes: the clicked price is the TOP BUY, and the
 * top of the range sits one step above it.
 *
 * The top has to be solved for rather than set. `gridLevels` puts the highest
 * buy one step BELOW the top, because the top is where that buy sells and is
 * not a price the grid ever buys at. The step is itself the range divided by
 * the level count, so a top that gives the clicked price its own buy depends on
 * the top. One line of algebra each way:
 *
 * - Same dollars apart: `top − (top − bottom) / n = click`, so
 *   `top = (n × click − bottom) / (n − 1)`.
 * - Same percent apart: `top / (top / bottom) ** (1 / n) = click`, so
 *   `top = (click ** n / bottom) ** (1 / (n − 1))`, worked in logs because the
 *   powers overflow on a five-figure coin.
 *
 * Null when the numbers cannot describe a grid. Note what this does NOT do:
 * check that the range ends up under the price. The top sits a whole step above
 * the click, and on a grid with very few levels that step is wide enough to
 * reach over the market — so a two-level grid clicked just under the price
 * still straddles it. The window says how much that buys, which is the honest
 * answer, rather than this quietly moving the range somewhere nobody asked for.
 */
export function gridRangeFromClick(input: {
  clickPx: number
  /** How far under the click the bottom sits, in percent. */
  rangePct: number
  levels: number
  spacing: GridSpacing
}): { topPx: number; bottomPx: number } | null {
  const { clickPx, rangePct, levels } = input
  if (!(clickPx > 0) || !(rangePct > 0) || rangePct >= 100 || levels < 2) {
    return null
  }
  const bottomPx = clickPx * (1 - rangePct / 100)
  if (!(bottomPx > 0)) return null

  const topPx =
    input.spacing === "compounding"
      ? Math.exp(
          (levels * Math.log(clickPx) - Math.log(bottomPx)) / (levels - 1)
        )
      : (levels * clickPx - bottomPx) / (levels - 1)

  if (!Number.isFinite(topPx) || !(topPx > clickPx)) return null
  return { topPx, bottomPx }
}

/**
 * Where a following grid's range moves to, or null when it should not move.
 *
 * Whole steps, never a re-centring on the price. A step at a time puts the new
 * top just above the price, so the price lands inside the top step and above
 * every level's buy — every level stays waiting and the grid buys nothing.
 * Re-centring would leave levels above the price, and a level above the price
 * is one the grid SELLS at, so it would have to buy the coins for them at
 * market, at the top, which is the one thing following must never do.
 */
export function gridFollowShift(input: {
  topPx: number
  bottomPx: number
  levels: number
  spacing: GridSpacing
  /** Today's price. */
  mark: number
}): { topPx: number; bottomPx: number; steps: number } | null {
  const { topPx, bottomPx, levels, mark } = input
  if (!(topPx > bottomPx) || !(bottomPx > 0) || levels < 1) return null
  if (!(mark > topPx)) return null

  if (input.spacing === "compounding") {
    const ratio = (topPx / bottomPx) ** (1 / levels)
    if (!(ratio > 1)) return null
    const steps = Math.ceil(Math.log(mark / topPx) / Math.log(ratio))
    if (steps < 1) return null
    const factor = ratio ** steps
    if (!Number.isFinite(factor)) return null
    return { topPx: topPx * factor, bottomPx: bottomPx * factor, steps }
  }

  const step = (topPx - bottomPx) / levels
  if (!(step > 0)) return null
  const steps = Math.ceil((mark - topPx) / step)
  if (steps < 1) return null
  return {
    topPx: topPx + step * steps,
    bottomPx: bottomPx + step * steps,
    steps,
  }
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
 * Each level's share of the pot, as a fraction, deepest level first.
 *
 * "even" is one over the count, which is the grid's own instinct: it is not
 * betting on direction, so it wants the same money working at every price.
 *
 * "double" reuses the LADDER's ramp from `dcaAllocationPcts` and turns it
 * round. That function already builds the doubling weights and normalises them
 * so the shares add up to the pot rather than growing it, and it hands the
 * biggest back last, where a ladder's deepest rung sits. A grid's array runs
 * the other way, bottom first, so the result is reversed. One ramp in the app
 * rather than two that drift.
 */
export function gridShares(count: number, sizing: GridSizing): number[] {
  if (count < 1) return []
  if (sizing !== "double") return Array.from({ length: count }, () => 1 / count)
  return dcaAllocationPcts(count, 1, GRID_DOUBLE_MULTIPLIER).reverse()
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
* How the pot is divided is the one thing `gridShares` decides, and it is
 * decided in one place so the window and the server cannot disagree about it.
 */
export function gridOrderPlan(input: {
  topPx: number
  bottomPx: number
  equity: number
  params: Pick<
    GridParams,
    "levels" | "potPct" | "maxOrderVolPct" | "spacing" | "sizing"
  >
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
  const pot = (input.equity * input.params.potPct) / 100
  const shares = gridShares(prices.length, input.params.sizing)

  let totalCost = 0
  let tooSmallIndex: number | null = null
  let volumeCapped = false

  const levels = prices.map((price, index) => {
    const sized = sizeOneOrder({
      px: price.buyPx,
      wantedUsd: pot * shares[index],
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
   * Price has been above this level, so it is allowed to buy when price comes
   * back down to it.
   *
   * **This is the rule that a rung buys at its own price or does not buy.**
   * Without it, every level above the price at placement bought instantly, all
   * at one market price that belonged to no level: the top rung then sold at
   * its own sell price against coins it had never paid its own buy price for,
   * and the account sat at its most long at the exact moment a grid is supposed
   * to be waiting. One big lump is not a grid, the same way it is not a ladder.
   *
   * Set at placement for every level under the price, and set on any pass where
   * price is above the level. A level price never visits simply never trades,
   * which costs nothing. Grids saved before this existed read as armed, which
   * is what they were.
   */
  armed: z.boolean().default(true),
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
  /**
   * How the pot was split at placement. Frozen for the same reason `spacing`
   * is: re-shaping redraws every level, and a re-draw that forgot this would
   * quietly flatten a doubled grid back to even. Grids saved before this
   * existed read as even, which is what they are.
   */
  sizing: z.enum(GRID_SIZINGS).default("even"),
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
  /** The market's smallest price step, frozen with the rest. Null: no tick stated. */
  priceTick: z.number().nullable().default(null),
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
  /**
   * Slide the range up behind price instead of waiting above the top for price
   * to come back down. Only ever upward, and only while the grid holds nothing:
   * see `advanceGrid` for the conditions and why each one is there.
   */
  follow: z.boolean().default(false),
  /** How many times the range has moved up. For the record, beside `cycles`. */
  shifts: z.number().int().min(0).default(0),
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
 * Every price a grid's stop could be resting at, keyed by wallet and market.
 *
 * Two of them, because the position and the plan can disagree for a moment.
 * The exchange's stop leg is written from the position, so the position's
 * price is where the leg really is. The plan's price is where the grid is
 * moving it to, and between one pass and the next the leg is still at the old
 * one. Both count as the grid's stop.
 */
export function gridStopLegPrices(
  grids: readonly {
    walletId: string
    marketKey: string
    plan: Pick<GridPlan, "stopLoss" | "bottomPx" | "baseWatch">
  }[],
  positions: readonly {
    walletId: string
    marketKey: string
    slPx: number | null
  }[]
): Map<string, number[]> {
  const at = new Map<string, number[]>()
  const add = (key: string, px: number | null) => {
    if (px === null || !(px > 0)) return
    at.set(key, [...(at.get(key) ?? []), px])
  }
  const running = new Set<string>()
  for (const grid of grids) {
    const key = `${grid.walletId}:${grid.marketKey}`
    running.add(key)
    add(key, gridStopPx(grid.plan))
  }
  for (const position of positions) {
    const key = `${position.walletId}:${position.marketKey}`
    if (running.has(key)) add(key, position.slPx)
  }
  return at
}

/**
 * Is this order the exchange's own copy of a grid's stop?
 *
 * Every other order type already hides that copy: a position's stop shows
 * once, as its red stop bar, and the untriggered leg sitting behind it on the
 * exchange is dropped by its order id. A grid's stop was the one that escaped,
 * because the grid draws that line itself and the id match runs off a position
 * whose stop the chart has deliberately blanked. What escaped was a grey pill
 * carrying the same price as the red STOP LOSS pill, right behind it, which
 * reads as some second thing at the same level.
 *
 * Matched on price rather than on id, so a leg the exchange re-made under a
 * new id, or a second stop-family leg left over from an earlier one, is caught
 * as well. Only untriggered legs, and only on a market a grid is running.
 */
export function isGridStopLeg(
  order: {
    walletId: string
    marketKey: string
    px: number
    trigger?: true
  },
  prices: Map<string, number[]>
): boolean {
  if (!order.trigger) return false
  const at = prices.get(`${order.walletId}:${order.marketKey}`)
  if (at === undefined) return false
  return at.some((px) => Math.abs(order.px - px) <= Math.abs(px) * 1e-6)
}

/**
 * Can this grid's range be moved? **Only while it is holding nothing.**
 *
 * A move redraws every level from the new range, and a level that is holding
 * bought at a price and sells against it, so sliding the range under it would
 * leave a level selling coins it never paid that price for. That is the same
 * lump this whole order type exists to avoid.
 *
 * This rule was removed once, for a good reason that has since gone away: a
 * grid used to buy every level above the price the moment it was placed, so it
 * always held something and the range locked forever after one move. A grid
 * buys nothing on the way in now, so most of the time there is nothing holding
 * and the range moves freely. Once it is holding, it stays put.
 */
export function gridRangeMovable(plan: Pick<GridPlan, "levels">): boolean {
  return (
    plan.levels.some((level) => level.status === "waiting") &&
    !plan.levels.some((level) => level.status === "holding")
  )
}

