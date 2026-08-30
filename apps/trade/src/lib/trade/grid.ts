import { z } from "zod"

import { smartOrderPauseFields } from "@/lib/trade/smart-order-pause"

import {
  baseStopDetection,
  dcaAllocationPcts,
  dcaBaseDetectionSchema,
  dcaBaseStopSchema,
  floorSize,
  MIN_ORDER_USD,
  sizeOneOrder,
  volumeCapUsd,
} from "@/lib/trade/dca"
import { liquidationPx } from "@/lib/trade/paper"

/**
 * The grid order's arithmetic — browser-safe, and a sibling of `dca.ts` rather
 * than a branch inside it.
 *
 * A grid is a range and a count. Levels sit evenly spaced across it, each with
 * its own way out one step away. A buying grid buys at a level and sells one
 * step above it; a selling grid sells at a level and buys back one step below
 * it. When the way out fills, the level goes back to watching. A level near
 * that trade first waits for price to move one percent past it and return.
 * That recycling is the whole difference from a ladder, whose rungs each have
 * one moment and are then finished.
 *
 * The window that places one and the server that stores one both read their
 * numbers from `gridOrderPlan`, so what is shown is what is placed — the same
 * rule the ladder follows.
 */

/** A grid may hold this many levels. */
export const MAX_GRID_LEVELS = 20

/** Fewer than this is not a grid: one level is a limit buy with a limit sell. */
export const MIN_GRID_LEVELS = 2

const DEFAULT_GRID_LEVELS = 12

/** Most of the account the whole grid may ever spend, in percent. */
const DEFAULT_GRID_POT_PCT = 20

/** How far under the bottom of the range the stop rests, in percent. */
export const DEFAULT_GRID_STOP_UNDER_PCT = 5

/** How far over the higher of price or range the fixed End Grid line sits. */
export const DEFAULT_GRID_TAKE_PROFIT_PCT = 5

/** Rise required before a buy near a sale may watch for the return. */
export const GRID_REBUY_CLEARANCE_PCT = 1

/**
 * How far above and below the price the range opens at, in percent.
 *
 * A grid straddles the price with waiting levels above and below it. **The same
 * either side**, because a grid is not a view on direction — it earns from
 * price crossing back and forth, and an even range is the honest starting
 * point. Both are typed over anyway.
 */
export const DEFAULT_GRID_ABOVE_PCT = 8
export const DEFAULT_GRID_BELOW_PCT = DEFAULT_GRID_ABOVE_PCT

// ----- Which way round the grid runs ---------------------------------------

/**
 * A grid buys the dips or it sells the rallies. Nothing else about it changes.
 *
 * "long" buys at each level and sells one step above it, so it earns while a
 * coin chops sideways or drifts up. "short" sells at each level and buys back
 * one step below it, so it earns while a coin chops sideways or drifts down.
 * Selling a coin you do not own means borrowing it from the exchange, selling
 * it, and buying it back later; you keep the difference if it got cheaper.
 *
 * Every stored grid without this field is a buying grid, which is what they
 * all were.
 */
export const GRID_DIRECTIONS = ["long", "short"] as const
export type GridDirection = (typeof GRID_DIRECTIONS)[number]

/**
 * What each direction is called in a sentence — the chart's badge, and the
 * running grid's window. A phrase, because those places are explaining rather
 * than asking.
 */
export const GRID_DIRECTION_LABELS: Record<GridDirection, string> = {
  long: "Buy the dips",
  short: "Sell the rallies",
}

/**
 * What each direction is called on the control that picks it. One word,
 * because a pair of choices side by side reads as a pair only when both are
 * the same shape, and "Long" against "Sell the rallies" is not a pair.
 */
export const GRID_DIRECTION_PICKER_LABELS: Record<GridDirection, string> = {
  long: "Long",
  short: "Short",
}

/** What each direction means, for the tooltip beside the control. */
export const GRID_DIRECTION_HINTS: Record<GridDirection, string> = {
  long: "Buy the dips. The grid buys at each level and sells one step above it, so it earns while a coin chops sideways or drifts up.",
  short:
    "Sell the rallies. The grid sells at each level and buys back one step below it, so it earns while a coin chops sideways or drifts down. Selling a coin you do not own means borrowing it from the exchange and buying it back later, and keeping the difference if it got cheaper.",
}

/**
 * **Every price comparison in the grid lives here, and nowhere else.**
 *
 * A selling grid is the same grid with every comparison turned upside down.
 * Written by hand at each site, one of forty of them would eventually be
 * missed, and a missed one on a selling grid means a level that trades at a
 * price it never agreed to. So `smart-grids.ts`, `grid-orders.ts` and
 * `grid-layer.tsx` carry no bare `<`, `>`, `Math.min` or `Math.max` between
 * two prices at all: they ask one of these instead.
 *
 * The only bare comparisons left in those files are against zero and against
 * array lengths.
 */

/** The trade that opens a level: a buy on a buying grid, a sell on a selling one. */
export function entrySide(direction: GridDirection): "buy" | "sell" {
  return direction === "long" ? "buy" : "sell"
}

/** The trade that closes a level and banks its round trip. */
export function exitSide(direction: GridDirection): "buy" | "sell" {
  return direction === "long" ? "sell" : "buy"
}

/**
 * Has price come as far as `px`, arriving from the winning side?
 *
 * A buying grid's levels are reached on the way DOWN, a selling grid's on the
 * way UP. The same question answers three others, because all three are a
 * price being reached from the winning side: whether a level trades, whether
 * a level sits past the stop and so can never trade, and whether the stop
 * itself has been reached.
 */
export function reachedEntry(
  direction: GridDirection,
  mark: number,
  px: number
): boolean {
  return direction === "long" ? mark <= px : mark >= px
}

/** The mirror: has price come as far as `px` from the losing side? */
export function reachedExit(
  direction: GridDirection,
  mark: number,
  px: number
): boolean {
  return direction === "long" ? mark >= px : mark <= px
}

/**
 * Is price strictly past `px` on the winning side — the armed rule?
 *
 * A level may only trade once price has been past it, so it trades at its own
 * price rather than in one lump at whatever the market happened to be. A
 * buying grid needs price above the level; a selling grid needs price below it.
 */
export function readyWhen(
  direction: GridDirection,
  mark: number,
  px: number
): boolean {
  return direction === "long" ? mark > px : mark < px
}

/** Whichever of two prices is further into a win. */
export function winningSide(
  direction: GridDirection,
  a: number,
  b: number
): number {
  return direction === "long" ? Math.max(a, b) : Math.min(a, b)
}

/** The end of the range a loss runs towards: the bottom, or the top. */
export function lossEdge(
  direction: GridDirection,
  range: { topPx: number; bottomPx: number }
): number {
  return direction === "long" ? range.bottomPx : range.topPx
}

/** The end of the range a win runs towards. */
export function winEdge(
  direction: GridDirection,
  range: { topPx: number; bottomPx: number }
): number {
  return direction === "long" ? range.topPx : range.bottomPx
}

/** Is this position the one the grid means to hold? Coins for a buying grid, a borrowed short for a selling one. */
export function holdsEntry(direction: GridDirection, szi: number): boolean {
  return direction === "long" ? szi > 0 : szi < 0
}

/**
 * Is this position the wrong way round for the grid entirely?
 *
 * A buying grid has no business adding to a short somebody opened by hand, and
 * a selling grid has no business adding to a long. Either ends the grid.
 */
export function heldWrongWay(direction: GridDirection, szi: number): boolean {
  return direction === "long" ? szi < 0 : szi > 0
}

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

export const GRID_SPACING_HINT =
  "At $100, the same dollars apart could place levels at $100, $90 and $80. The same percent apart at 10% places them at $100, $90 and $81. Dollar spacing makes equal gaps on the chart. Percent spacing gives every cycle the same percentage move."

/**
 * How the pot is divided between the levels.
 *
 * New grids use even sizing. "double" remains here only so grids placed before
 * that choice was removed can keep their recorded budgets until they end.
 */
const GRID_SIZINGS = ["even", "double"] as const
type GridSizing = (typeof GRID_SIZINGS)[number]

/** How much bigger each level down is, when the pot is doubled. */
const GRID_DOUBLE_MULTIPLIER = 2

/**
 * Where the range is measured from.
 *
 * "price" opens it around today's price. Every level starts waiting. A level
 * on the far side of the price has to be crossed before a later return can
 * trade at that level.
 *
 * "click" hangs the whole grid on the far side of the price that was
 * right-clicked, and the click is the level nearest the market rather than the
 * edge of the range — the edge sits one step past it, because the edge is
 * where that level's way out sits and is not a price the grid ever opens at.
 * Nothing is traded at market, so it is the one way to place a grid without
 * being put into the market on the spot.
 */
export const GRID_ANCHORS = ["price", "click"] as const
export type GridAnchor = (typeof GRID_ANCHORS)[number]

export const GRID_ANCHOR_LABELS: Record<
  GridDirection,
  Record<GridAnchor, string>
> = {
  long: {
    price: "Around today's price",
    click: "Below the price you clicked",
  },
  short: {
    price: "Around today's price",
    click: "Above the price you clicked",
  },
}

export const GRID_ANCHOR_HINTS: Record<
  GridDirection,
  Record<GridAnchor, string>
> = {
  long: {
    price:
      "The range opens above and below today's price. Placing buys nothing. Every level waits until price reaches its own buy.",
    click:
      "The price you right-clicked becomes the top buy, and the whole grid hangs under it. Nothing is bought at market — every level waits for price to fall to it.",
  },
  short: {
    price:
      "The range opens above and below today's price. Placing sells nothing. Every level waits until price reaches its own sell.",
    click:
      "The price you right-clicked becomes the lowest sell, and the whole grid sits above it. Nothing is sold at market — every level waits for price to rise to it.",
  },
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
 * The furthest under the range's bottom the stop may be set, in percent.
 *
 * Named rather than typed into the schema, because the window that asks for
 * the number has to say the same limit back when somebody types past it — and
 * a limit written down twice is a limit that drifts.
 */
export const MAX_GRID_STOP_UNDER_PCT = 50

/**
 * The stop that sits past the losing end of the range — below the bottom on a
 * buying grid, above the top on a selling one.
 *
 * Measured from that EDGE and never from the average price the grid paid. As
 * levels recycle the average ratchets towards the loss — the shallow levels
 * keep closing out where they opened, while the deep ones keep dragging the
 * average — so a stop following it drifts further from the range on every
 * cycle. Worse in the other direction: after a run of shallow cycles it would
 * sit INSIDE the range and close the whole grid on an ordinary swing, which is
 * the exact move the grid exists to trade.
 */
const gridStopSchema = z.object({
  /**
   * Percent past the losing edge of the range. Zero rests it on the edge
   * itself.
   *
   * The name says "under" because that is what it means on a buying grid, and
   * every stored grid uses it that way. On a selling grid the same number
   * means the same distance, measured above the top instead. The window's
   * label changes; the stored field does not, so no grid needs migrating.
   */
  underPct: z.number().min(0).max(MAX_GRID_STOP_UNDER_PCT),
  /**
   * Rest the stop past the confirmed 4h level instead, when one has confirmed
   * beyond the range: a base below a buying grid, a ceiling above a selling
   * one. The percent stands until then, so there is always a stop. Null leaves
   * the grid on the percent alone.
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
  /**
   * Buy the dips, or sell the rallies. Defaults to buying so every grid
   * already stored — and every remembered setting — keeps working untouched.
   */
  direction: z.enum(GRID_DIRECTIONS).default("long"),
  levels: z.number().int().min(MIN_GRID_LEVELS).max(MAX_GRID_LEVELS),
  /** The whole grid's share of the account, in percent, split evenly. */
  potPct: z.number().positive().max(100),
  /**
   * Size a fresh grid from the account's value at that moment. Off, it uses the
   * wallet's starting value instead. Same meaning as the ladder's.
   */
  compound: z.boolean().default(true),
  /**
   * How many dollars of coin each dollar behind the grid buys. Existing grids
   * and saved settings default to cash, so borrowing is always chosen.
   */
  leverage: z.number().int().min(1).max(50).default(1),
  /**
   * Liquidity guard: no single buy bigger than this share of the coin's
   * last-24-hours volume, so thin coins get small orders. 0 = off.
   */
  maxOrderVolPct: z.number().min(0).max(5),
  spacing: z.enum(GRID_SPACINGS).default("even"),
  /** How the pot is split between the levels. See `GRID_SIZINGS`. */
  sizing: z.enum(GRID_SIZINGS).default("even"),
  /**
   * Split the pot by hand, one typed percentage per level, instead of evenly.
   *
   * A NEW FIELD rather than a new value in `sizing`, and that is the whole
   * reason it exists as a pair. An older copy of the app or the engine cannot
   * read a `sizing` it has never heard of: the row fails to parse, the grid
   * goes invisible and it stops trading, stops stopping out and never closes.
   * A field an old reader has never heard of is stripped harmlessly instead.
   * See the note on `gridLevelStateSchema` for the day that cost two live
   * positions.
   */
  manualSizing: z.boolean().default(false),
  /**
   * What share of the pot each row of the card gets, in percent, adding up to
   * 100.
   *
   * **Row order: the top of the range first**, which is how the card reads and
   * how the chart draws. Held against PRICES rather than against rung numbers,
   * so what is saved can never be re-read to mean something else — the note
   * beside `gridLevelPctsFromRows` says why that matters.
   *
   * Kept even while `manualSizing` is off, so switching the card off and on
   * again does not lose what was typed. Null on every grid saved before this
   * existed, which splits evenly, which is what they all did.
   */
  manualRungPcts: z
    .array(z.number().positive().max(100))
    .min(MIN_GRID_LEVELS)
    .max(MAX_GRID_LEVELS)
    .nullable()
    .default(null),
  /**
   * Where the range is measured from: today's price, or the clicked price.
   *
   * Not carried onto the placed grid. A placed grid is concrete prices, and
   * where they came from stops mattering the moment they exist.
   */
  anchor: z.enum(GRID_ANCHORS).default("price"),
  /**
   * Slide the whole range up when price climbs past the top of it, and keep
   * trading. See `gridShiftAway` for the arithmetic and `advanceGrid` for the
   * conditions.
   */
  follow: z.boolean().default(false),
  /** Keep adding one new lower level as price falls through the bottom. */
  followDown: z.boolean().default(false),
  /**
   * How far ABOVE the price the top of the range sits, in percent.
   *
   * The range is set as two percentages rather than two prices because a
   * percentage means the same thing on the next coin you open and a price does
   * not — the same reason none of the other settings here are prices.
   *
   * Hanging off a click reads only ONE of these two: the depth away from the
   * click, which for a selling grid is this one and for a buying grid is
   * `rangePct`. See `gridRangeFromClick`.
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
   * How far past the winning end of the range the fixed End Grid line sits, in
   * percent — above a buying grid, below a selling one. Measured from that
   * edge or today's price, whichever is already further into a win. Reaching
   * it closes everything and ends the grid.
   *
   * Its own level rather than "the end of the range finishes it", because they
   * are two different ideas. The winning edge is where the grid stops having
   * anything left to close; End Grid is where the grid stops watching. Null
   * leaves the grid running past its range, waiting for price to come back
   * into it.
   */
  takeProfitPct: z.number().positive().max(999).nullable().default(null),
  /**
   * When the stop fires, turn the grid around: everything held is already
   * sold by the stop, and a grid running the OTHER way is placed over the
   * same range, with its stop on the old End Grid line and a new End Grid
   * the same distance past the fired stop as the old stop sat past the range.
   *
   * Off by default, and it never carries onto the grid a reversal creates —
   * a whipsaw market must not ping-pong the account unattended. Switching it
   * on again on the new grid is one click, and that click is a person
   * deciding.
   */
  reverseWhenStopped: z.boolean().default(false),
})

/** Settings accepted for a newly placed grid. New grids always split evenly. */
export const placeGridParamsSchema = gridParamsSchema.extend({
  sizing: z.literal("even"),
  stopLoss: gridStopSchema,
})

export type GridParams = z.infer<typeof gridParamsSchema>
export type PlaceGridParams = z.infer<typeof placeGridParamsSchema>

export function defaultGridParams(): GridParams {
  return {
    direction: "long",
    levels: DEFAULT_GRID_LEVELS,
    potPct: DEFAULT_GRID_POT_PCT,
    compound: true,
    leverage: 1,
    maxOrderVolPct: 0,
    spacing: "even",
    sizing: "even",
    manualSizing: false,
    manualRungPcts: null,
    anchor: "price",
    follow: false,
    followDown: false,
    abovePct: DEFAULT_GRID_ABOVE_PCT,
    rangePct: DEFAULT_GRID_BELOW_PCT,
    baseDetection: baseStopDetection(),
    stopLoss: { underPct: DEFAULT_GRID_STOP_UNDER_PCT, base: null },
    takeProfitPct: DEFAULT_GRID_TAKE_PROFIT_PCT,
    reverseWhenStopped: false,
  }
}

// ----- Where the levels sit ------------------------------------------------

type GridLevelPrices = { buyPx: number; sellPx: number }

/**
 * Where every level opens and where it closes.
 *
 * The names are `buyPx` and `sellPx` rather than buy and sell because a
 * selling grid's entry IS a sell. A field called "buy" holding the price it
 * sells at is a field nobody can read.
 *
 * The arrangement is chosen so the range means exactly what it says.
 *
 * - Buying: the DEEPEST buy is the bottom and the SHALLOWEST sell is the top.
 *   A range of $80–$120 over 12 levels buys at $80 and sells at $120, and
 *   every sell is one step above its own buy.
 * - Selling: the mirror. The DEEPEST sell is the top and the SHALLOWEST
 *   buy-back is the bottom. The same range sells at $120 and buys back at $80,
 *   and every buy-back is one step below its own sell.
 *
 * Even spacing divides the range by the level count; compounding spacing takes
 * the same ratio between each level instead, so each round trip earns the same
 * percentage wherever in the range it happens.
 *
 * **Always ordered lowest price first**, whichever way the grid runs, so index
 * 0 is the bottom of the range and the array reads the way the chart draws.
 */
export function gridLevels(input: {
  topPx: number
  bottomPx: number
  levels: number
  spacing: GridSpacing
  direction: GridDirection
}): GridLevelPrices[] {
  const { topPx, bottomPx, levels, direction } = input
  if (!(topPx > bottomPx) || !(bottomPx > 0) || levels < 1) return []

  if (input.spacing === "compounding") {
    // One ratio applied `levels` times takes the bottom to the top, so every
    // step is the same percentage of the price it starts from.
    const ratio = (topPx / bottomPx) ** (1 / levels)
    return Array.from({ length: levels }, (_, index) => {
      if (direction === "long") {
        const buyPx = bottomPx * ratio ** index
        return { buyPx, sellPx: buyPx * ratio }
      }
      // A selling grid's lowest level is one step ABOVE the bottom, and its
      // buy-back is the bottom itself.
      const buyPx = bottomPx * ratio ** (index + 1)
      return { buyPx, sellPx: buyPx / ratio }
    })
  }

  const step = (topPx - bottomPx) / levels
  return Array.from({ length: levels }, (_, index) => {
    if (direction === "long") {
      const buyPx = bottomPx + step * index
      return { buyPx, sellPx: buyPx + step }
    }
    const buyPx = bottomPx + step * (index + 1)
    return { buyPx, sellPx: buyPx - step }
  })
}

/**
 * The range a right-click describes: the clicked price is the level nearest
 * the market, and the far edge is solved for.
 *
 * - Buying: the click is the TOP BUY and the grid hangs under it. The top of
 *   the range sits one step above the click.
 * - Selling: the click is the LOWEST SELL and the grid sits above it. The
 *   bottom of the range sits one step below the click.
 *
 * The far edge has to be solved for rather than set. `gridLevels` puts the
 * nearest level one step INSIDE that edge, because the edge is where that
 * level's way out sits and is not a price the grid ever opens at. The step is
 * itself the range divided by the level count, so an edge that gives the
 * clicked price its own level depends on the edge. One line of algebra each
 * way, with `near` the depth away from the click:
 *
 * - Buying, same dollars apart: `top − (top − bottom) / n = click`, so
 *   `top = (n × click − bottom) / (n − 1)`, with `bottom = click × (1 − near)`.
 * - Selling is the same two lines with top and bottom swapped:
 *   `bottom = (n × click − top) / (n − 1)`, with `top = click × (1 + near)`.
 * - Same percent apart: `far = (click ** n / other) ** (1 / (n − 1))` either
 *   way, worked in logs because the powers overflow on a five-figure coin.
 *
 * Null when the numbers cannot describe a grid. Note what this does NOT do:
 * check that the range ends up clear of the price. The far edge sits a whole
 * step past the click, and on a grid with very few levels that step is wide
 * enough to reach over the market — so a two-level grid clicked just under the
 * price still straddles it. The window says how much that trades, which is the
 * honest answer, rather than this quietly moving the range somewhere nobody
 * asked for.
 */
export function gridRangeFromClick(input: {
  clickPx: number
  /** How far away from the click the far edge sits, in percent. */
  rangePct: number
  levels: number
  spacing: GridSpacing
  direction: GridDirection
}): { topPx: number; bottomPx: number } | null {
  const { clickPx, rangePct, levels, direction } = input
  if (!(clickPx > 0) || !(rangePct > 0) || rangePct >= 100 || levels < 2) {
    return null
  }
  // The end the click's own level sits one step inside — set straight from the
  // depth typed into the window.
  const nearPx =
    direction === "long"
      ? clickPx * (1 - rangePct / 100)
      : clickPx * (1 + rangePct / 100)
  if (!(nearPx > 0)) return null

  const farPx =
    input.spacing === "compounding"
      ? Math.exp((levels * Math.log(clickPx) - Math.log(nearPx)) / (levels - 1))
      : (levels * clickPx - nearPx) / (levels - 1)

  if (!Number.isFinite(farPx) || !(farPx > 0)) return null
  const range =
    direction === "long"
      ? { topPx: farPx, bottomPx: nearPx }
      : { topPx: nearPx, bottomPx: farPx }
  if (!(range.topPx > range.bottomPx)) return null
  // The click has to end up strictly inside its own range, or the level it was
  // meant to name is not there.
  if (!(clickPx < range.topPx) || !(clickPx > range.bottomPx)) return null
  return range
}

/**
 * Where a range that follows price AWAY from its loss moves to, or null when
 * it should not move. The free move: price has left through the winning edge,
 * so the grid has already closed every level and holds nothing.
 *
 * A buying grid moves up when price climbs past the top. A selling grid moves
 * down when price falls past the bottom. That is the direction swap in full —
 * the two switches in the window keep their names, and which one is the safe
 * one changes with the grid.
 *
 * Whole steps, never a re-centring on the price. A step at a time puts the new
 * winning edge just past the price, so the price lands inside that last step
 * and no level has been passed — every level stays waiting and the grid trades
 * nothing. Re-centring would leave levels on the far side of the price, which
 * are levels the grid EXITS at, so it would have to open them at market, at
 * the worst price, which is the one thing following must never do.
 */
export function gridShiftAway(input: {
  topPx: number
  bottomPx: number
  levels: number
  spacing: GridSpacing
  direction: GridDirection
  /** Today's price. */
  mark: number
}): { topPx: number; bottomPx: number; steps: number } | null {
  const { topPx, bottomPx, levels, mark, direction } = input
  if (!(topPx > bottomPx) || !(bottomPx > 0) || levels < 1) return null
  if (!reachedExit(direction, mark, winEdge(direction, input))) return null

  if (input.spacing === "compounding") {
    const ratio = (topPx / bottomPx) ** (1 / levels)
    if (!(ratio > 1)) return null
    const away =
      direction === "long" ? Math.log(mark / topPx) : Math.log(bottomPx / mark)
    const steps = Math.max(1, Math.ceil(away / Math.log(ratio)))
    const factor = direction === "long" ? ratio ** steps : ratio ** -steps
    if (!Number.isFinite(factor) || !(topPx * factor > bottomPx * factor)) {
      return null
    }
    if (!(bottomPx * factor > 0)) return null
    return { topPx: topPx * factor, bottomPx: bottomPx * factor, steps }
  }

  const step = (topPx - bottomPx) / levels
  if (!(step > 0)) return null
  const away = direction === "long" ? mark - topPx : bottomPx - mark
  const steps = Math.max(1, Math.ceil(away / step))
  const move = direction === "long" ? step * steps : -step * steps
  if (!(bottomPx + move > 0)) return null
  return { topPx: topPx + move, bottomPx: bottomPx + move, steps }
}

/**
 * Move a range exactly one level INTO its loss after price leaves through the
 * losing edge — down for a buying grid, up for a selling one.
 *
 * A sharp move may be several ranges deep. Moving one step per engine pass
 * introduces one new level instead of sending every crossed level together.
 */
export function gridShiftInto(input: {
  topPx: number
  bottomPx: number
  levels: number
  spacing: GridSpacing
  direction: GridDirection
  mark: number
}): { topPx: number; bottomPx: number } | null {
  const { topPx, bottomPx, levels, mark, direction } = input
  if (!(topPx > bottomPx) || !(bottomPx > 0) || levels < 1) return null
  if (!reachedEntry(direction, mark, lossEdge(direction, input))) return null

  if (input.spacing === "compounding") {
    const ratio = (topPx / bottomPx) ** (1 / levels)
    if (!(ratio > 1)) return null
    const factor = direction === "long" ? 1 / ratio : ratio
    const nextBottom = bottomPx * factor
    const nextTop = topPx * factor
    if (!(nextBottom > 0) || !Number.isFinite(nextTop)) return null
    return { topPx: nextTop, bottomPx: nextBottom }
  }

  const step = (topPx - bottomPx) / levels
  if (!(step > 0)) return null
  const move = direction === "long" ? -step : step
  if (!(bottomPx + move > 0)) return null
  return { topPx: topPx + move, bottomPx: bottomPx + move }
}

/**
 * The gap between two levels, as a share of the price — what a round trip earns
 * before fees, and the number the fee check is made against.
 *
 * The THINNEST step of the lot, which on an evenly spaced grid is the one
 * highest up the range: the same dollars are a smaller percentage of a bigger
 * price. Checking the fattest step would pass a grid whose thinnest levels all
 * lose money. Taken over every level rather than off one end, because which
 * end is thinnest depends on which way the grid runs.
 */
export function gridStepPct(levels: readonly GridLevelPrices[]): number {
  let thinnest = Infinity
  for (const level of levels) {
    // Against the price the level OPENS at, which is what the round trip's
    // money is put up at, on either side.
    if (!(level.buyPx > 0)) return 0
    thinnest = Math.min(
      thinnest,
      Math.abs(level.sellPx - level.buyPx) / level.buyPx
    )
  }
  return Number.isFinite(thinnest) ? thinnest : 0
}

// ----- What each level spends ---------------------------------------------

type GridPlannedLevel = {
  buyPx: number
  sellPx: number
  /** What this level puts up, after the liquidity guard capped it. */
  dollars: number
  /** In coins, floored to the market's size step. */
  sz: number
}

type GridOrderPlan = {
  levels: GridPlannedLevel[]
  /** Dollars of coin the whole grid controls if every level opens. */
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
 *
 * The bottom-first order only matters to "double", and "double" only exists on
 * buying grids placed before that choice was removed — `placeGridParamsSchema`
 * refuses it now. So there is nothing here to mirror for a selling grid.
 */
export function gridShares(count: number, sizing: GridSizing): number[] {
  if (count < 1) return []
  if (sizing !== "double") return Array.from({ length: count }, () => 1 / count)
  return dcaAllocationPcts(count, 1, GRID_DOUBLE_MULTIPLIER).reverse()
}

// ----- Splitting the pot by hand -------------------------------------------

/**
 * How far off 100 the typed rung percentages may land and still be taken.
 *
 * Three equal rungs are 33.33, 33.33 and 33.34, and a card that refused those
 * would be a card nobody could use. A tenth of a percent of a $2,000 grid is
 * $2, less than the rounding the market's own size step does to every order.
 *
 * Not exported: every caller asks `gridRungPctsFit` instead, so the limit is
 * never restated anywhere it could drift from this one.
 */
const GRID_RUNG_SUM_SLACK = 0.1

/** What a set of typed rung percentages adds up to. */
export function gridRungPctsSum(pcts: number[]): number {
  return pcts.reduce((sum, pct) => sum + pct, 0)
}

/** Do the typed percentages use the whole pot, give or take the slack? */
export function gridRungPctsFit(pcts: number[]): boolean {
  return Math.abs(gridRungPctsSum(pcts) - 100) <= GRID_RUNG_SUM_SLACK
}

/**
 * The rungs' percentages, or null when the grid is not hand-set.
 *
 * One rule read from two shapes — the window's settings and a placed grid's
 * plan — because both carry the same two fields and the arithmetic must not
 * differ between what is drawn and what is traded. A list whose length has
 * drifted from the level count is treated as absent rather than stretched: a
 * guessed share is a guessed order size.
 */
export function gridManualPcts(
  source: { manualSizing?: boolean; manualRungPcts?: number[] | null },
  count: number
): number[] | null {
  if (!source.manualSizing) return null
  const pcts = source.manualRungPcts
  if (!pcts || pcts.length !== count || count < 1) return null
  return pcts
}

/**
 * An even split as typed percentages, for the moment the card is switched on.
 *
 * Rounded to two decimals with the leftover put on the first rung, so the rows
 * add to exactly 100 and the grid does not change size the instant somebody
 * opens the card to look at it.
 */
export function gridEvenRungPcts(count: number): number[] {
  if (count < 1) return []
  const each = Math.round((100 / count) * 100) / 100
  const pcts = Array.from({ length: count }, () => each)
  pcts[0] = Math.round((100 - each * (count - 1)) * 100) / 100
  return pcts
}

// ----- Rows, levels, and which rung is which --------------------------------

/**
 * **What you see on the card is what lands at those prices, and turning the
 * grid round turns the card over.**
 *
 * Tyler, 29 Aug 2026: *"if long was 1, 2, 3, 4, 5 then short is 5, 4, 3, 2,
 * 1"*, said about a selling grid whose biggest rung kept coming out at the
 * bottom like a buying grid's.
 *
 * The shares are held **against prices** — the card's top row is the top of the
 * range, always — so nothing saved is ever re-read to mean something else.
 * Three goes at holding them against rung numbers instead all failed the same
 * way: each change to the mapping silently re-interpreted what was already
 * saved, the card flipped what had been typed, and the chart came out
 * identical.
 *
 * What reverses with the direction is the NUMBER on each row, because rung 1 is
 * the first trade the grid makes: the top of the range on a buying grid,
 * reached on the way down, and the bottom on a selling grid, reached on the way
 * up. And because a share belongs to a rung, switching Long to Short turns the
 * values over in the boxes — which is what mirrors the grid, and it happens
 * where somebody can watch it happen.
 *
 * Level arrays read lowest price first; rows read the top of the range first.
 * So a row is its level's mirror image, and that never varies.
 *
 * Rows, top of the range first, into level order.
 */
export function gridLevelPctsFromRows(rowsTopFirst: number[]): number[] {
  return [...rowsTopFirst].reverse()
}

/** Level order back into rows. */
export function gridRowPctsFromLevels(levelPcts: number[]): number[] {
  return [...levelPcts].reverse()
}

/** Which level a row sits on. Rows run down the range, levels up it. */
export function gridRowLevelIndex(rowIndex: number, count: number): number {
  return count - 1 - rowIndex
}

/**
 * The rung number a level carries — what a refusal names, so it names the
 * number somebody actually typed against.
 */
export function gridRungNumber(
  levelIndex: number,
  count: number,
  direction: GridDirection
): number {
  return direction === "long" ? count - levelIndex : levelIndex + 1
}

/** The rung number printed on a row of the card. */
export function gridRowRungNumber(
  rowIndex: number,
  count: number,
  direction: GridDirection
): number {
  return direction === "long" ? rowIndex + 1 : count - rowIndex
}

/**
 * The same shares moved to the other end of the range — what turning a grid
 * round does to the money.
 *
 * Its own step rather than a bare `.reverse()` at each site, because it is a
 * decision about what turning a grid round MEANS: rung 1 keeps rung 1's share,
 * and rung 1 has moved to the other end.
 */
export function gridFlippedPcts(pcts: number[]): number[] {
  return [...pcts].reverse()
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
    | "levels"
    | "potPct"
    | "leverage"
    | "maxOrderVolPct"
    | "spacing"
    | "sizing"
    | "direction"
  > &
    Partial<Pick<GridParams, "manualSizing" | "manualRungPcts">>
  sizeDecimals: number | null
  volume24hUsd: number | null
}): GridOrderPlan {
  const prices = gridLevels({
    topPx: input.topPx,
    bottomPx: input.bottomPx,
    levels: input.params.levels,
    spacing: input.params.spacing,
    direction: input.params.direction,
  })
  const capUsd = volumeCapUsd(input.params.maxOrderVolPct, input.volume24hUsd)
  // The account share is the cash behind the grid. Borrowing changes how many
  // dollars of coin that cash controls, not how much of the account is set
  // aside. At 3x, a $2,000 share buys $6,000 of coin across the levels.
  const pot = (input.equity * input.params.potPct * input.params.leverage) / 100
  // Hand-set rungs take their share of the SAME pot, so Share of account %
  // still decides the money and the rungs only decide how it is divided. The
  // settings carry the card's rows, top of the range first, and levels are
  // priced lowest first: one mirror, with no direction in it.
  const manualPcts = gridManualPcts(input.params, prices.length)
  const split =
    manualPcts === null
      ? gridShares(prices.length, input.params.sizing)
      : gridLevelPctsFromRows(manualPcts).map((pct) => pct / 100)

  let totalCost = 0
  let tooSmallIndex: number | null = null
  let volumeCapped = false

  const levels = prices.map((price, index) => {
    const sized = sizeOneOrder({
      px: price.buyPx,
      wantedUsd: pot * split[index],
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
const GRID_LEVEL_STATUSES = ["waiting", "holding", "cancelled"] as const
export type GridLevelStatus = (typeof GRID_LEVEL_STATUSES)[number]

/**
 * **Never rename a field in here.**
 *
 * This record is read and written by more than one running copy of the app at
 * once: the deployed engine that does the trading, and whatever a developer is
 * running locally, both against the same database. `readGridPlan` can teach
 * NEW code to read an OLD record, but nothing can teach an OLD copy to read a
 * NEW one — it simply fails to read the row, and a row that cannot be read is
 * skipped in silence on every pass. The grid then stops trading, stops
 * stopping out and never closes, with no error anywhere.
 *
 * That happened on 28 Aug 2026. `buyPx` and `sellPx` were renamed to `entryPx`
 * and `exitPx` when the grid learned to sell first, because "buy" is the wrong
 * word for a selling grid's entry. Two live grids were re-saved under the new
 * names by a dev server and went invisible to the deployed engine.
 *
 * So the stored names stay as they are, and the direction helpers carry the
 * honest meaning instead: `entrySide`, `exitSide`, `reachedEntry`. On a
 * selling grid `buyPx` is where it SELLS and `sellPx` is where it buys back.
 * The comment costs nothing; the rename cost two unmanaged positions.
 *
 * Adding a field is safe — an older copy ignores what it does not know, which
 * is why `direction` was fine.
 */
const gridLevelStateSchema = z.object({
  /** Where this level opens: a buy on a buying grid, a sell on a selling one. */
  buyPx: z.number().positive(),
  /**
   * Where this level's way out rests, frozen at placement — one step past the
   * entry, above it on a buying grid and below it on a selling one.
   *
   * Written down rather than worked out from the level next door. A ladder
   * derives its exits in three separate places and they have to agree
   * forever; a grid recycles far too often to keep a derivation honest, and a
   * level that closed at a price nobody expected is a level that never
   * recycles again.
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
   * Price has been past this level on the winning side, so it is allowed to
   * open when price comes back to it.
   *
   * **This is the rule that a level trades at its own price or does not
   * trade.** Without it, every level on the far side of the price at
   * placement traded instantly, all at one market price that belonged to no
   * level: the furthest rung then closed at its own exit price against coins
   * it had never opened at its own price, and the account sat at its biggest
   * at the exact moment a grid is supposed to be waiting. One big lump is not
   * a grid, the same way it is not a ladder.
   *
   * Set at placement for every level price has already passed, and normally
   * set on any pass where price is past the level. A level near any trade
   * must first see price move one percent past its own line. A followed edge
   * can require a larger move to the next rung. A level price never visits
   * simply never trades, which costs nothing. Grids saved before this existed
   * read as armed, which is what they were.
   */
  armed: z.boolean().default(true),
  /**
   * Price the market must reach before this level may watch for a return —
   * above the buy on a buying grid, below the sell on a selling one.
   *
   * **The name says "above" and means "past".** It is kept exactly as it is
   * because this record is read and written by more than one running copy of
   * the app at a time, and a renamed field is one copy writing something
   * another copy cannot read. See the note on `gridLevelStateSchema`.
   */
  rebuyAbove: z.number().positive().optional(),
  /**
   * The level sits at or past the stop, so its order was taken off the book —
   * price cannot reach it without ending the grid first. Still drawn, faded,
   * and back on the book if the stop moves clear of it again.
   */
  dead: z.boolean(),
  /** How many complete round trips this level has made. For the record. */
  cycles: z.number().int().min(0).default(0),
})

export type GridLevelState = z.infer<typeof gridLevelStateSchema>

/**
 * Where the stop stands as a placed grid carries it. "percent" follows the
 * rules past the losing edge of the range; "fixed" is wherever a hand put it,
 * and is then left alone.
 */
const gridPlanStopSchema = z.object({
  mode: z.enum(["percent", "fixed"]),
  underPct: z.number().min(0).max(50),
  /** Where a hand put it. Only read in "fixed" mode. */
  px: z.number().positive().nullable().default(null),
  /** The base rule, or null for a plain percent stop past the range. */
  base: dcaBaseStopSchema.nullable().default(null),
})

/**
 * Everything a placed grid remembers. Most percentages from the window die at
 * placement. End Grid keeps its chosen percentage so a hand-moved range can
 * put the line the same distance above the higher of the range or market.
 */
const gridPlanSchema = z.object({
  ...smartOrderPauseFields,
  /**
   * Which way this grid runs, frozen at placement and never editable after it.
   * The prices are frozen and they belong to one side, so switching would
   * leave every level closing at a price it never opened at.
   */
  direction: z.enum(GRID_DIRECTIONS).default("long"),
  topPx: z.number().positive(),
  bottomPx: z.number().positive(),
  /**
   * Close everything and end here. Null means the grid does not end on its own
   * past the range. It simply runs out of levels and waits.
   */
  takeProfitPx: z.number().positive().nullable().default(null),
  /** The chosen distance, kept so a hand-moved range can redraw End Grid. */
  takeProfitPct: z.number().positive().max(999).nullable().optional(),
  spacing: z.enum(GRID_SPACINGS).default("even"),
  /**
   * How the pot was split at placement. Frozen for the same reason `spacing`
   * is: re-shaping redraws every level, and a re-draw that forgot this would
   * quietly flatten a doubled grid back to even. Grids saved before this
   * existed read as even, which is what they are.
   */
  sizing: z.enum(GRID_SIZINGS).default("even"),
  /**
   * The pot was split by hand, one typed percentage per level, and every path
   * that re-divides it has to use those percentages instead of an even share.
   * Following price down is the only such path once a grid is placed.
   *
   * ADDITIVE, like the reversal fields below, which is the only safe kind of
   * plan change: an older reader strips it and sees an even grid. An older
   * ENGINE strips it when it saves the plan back, which would quietly flatten
   * a hand-set grid on its next move, so the engine ships with the app or
   * before it, never the app alone.
   */
  manualSizing: z.boolean().default(false),
  /**
   * The typed shares, in percent, in LEVEL order — lowest price first, which is
   * what the engine reads. Converted from the card's row order exactly once, in
   * `draftGridOrder`. Null on an evenly split grid and on every grid saved
   * before this existed.
   */
  manualRungPcts: z
    .array(z.number().positive().max(100))
    .min(MIN_GRID_LEVELS)
    .max(MAX_GRID_LEVELS)
    .nullable()
    .default(null),
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
  /** The smallest dollar order this market accepted when the grid was placed. */
  minOrderValueUsd: z.number().positive().default(MIN_ORDER_USD),
  /** The borrowing chosen for every fresh buy. Old grids used cash. */
  leverage: z.number().int().positive().default(1),
  maxLeverage: z.number().positive(),
  levels: z
    .array(gridLevelStateSchema)
    .min(MIN_GRID_LEVELS)
    .max(MAX_GRID_LEVELS),
  /** Filled levels left above a range that followed downward. */
  carriedLevels: z.array(gridLevelStateSchema).default([]),
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
   * The grid's own fixed-size stop order on the exchange, when a DCA ladder
   * shares the coin. Null for a grid running alone — a lone grid writes the
   * position's ordinary whole-position stop through `aimedSlPx` instead.
   *
   * When a ladder shares the coin the position's one stop slot belongs to the
   * ladder, so the grid places a separate reduce-only trigger sized to what
   * the grid will be holding when price reaches it. This records exactly what
   * was placed: the id so cancelling or moving the grid touches only this
   * order, the price and size so a pass can tell whether the order standing
   * still matches what the grid wants, and the moment it went on so a
   * portfolio read that has not caught up yet is not mistaken for the stop
   * having fired.
   */
  pairedStop: z
    .object({
      orderId: z.string(),
      px: z.number().positive(),
      sz: z.number().positive(),
      placedAt: z.number(),
    })
    .nullable()
    .default(null),
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
  /** Slide the range down one level per pass after price leaves the bottom. */
  followDown: z.boolean().default(false),
  /**
   * Whether price has ever been at or under the top of the range — whether
   * the range has actually been in play. Follow may only slide a range price
   * has genuinely climbed out of; without this it fired the moment a grid was
   * placed below the price, and dragged a range somebody had deliberately
   * hung under a level straight up to the market. Placement writes it
   * honestly; the engine flips it the first time price reaches the range.
   * Defaults true so grids from before the field keep their behaviour.
   */
  entered: z.boolean().default(true),
  /** How many times the range has moved up. For the record, beside `cycles`. */
  shifts: z.number().int().min(0).default(0),
  /** How many one-level downward moves the range has made. */
  downShifts: z.number().int().min(0).default(0),
  /** Why it finished, once it has. Null while it is still working. */
  closedReason: z
    .enum(["takeProfit", "aboveTop", "stop", "flat", "cancelled"])
    .nullable()
    .default(null),
  /**
   * Turn the grid around when the stop fires. See the field of the same name
   * on `gridParamsSchema` for what that means and why it never carries onto
   * the grid a reversal creates.
   *
   * All three reversal fields are ADDITIVE — an older reader strips fields it
   * does not know and parses fine, which is the only safe kind of plan change
   * (see the note on `gridLevelStateSchema`). An older ENGINE also strips
   * them when it saves the plan back, so the engine ships with the app or
   * before it, never the app alone.
   */
  reverseWhenStopped: z.boolean().default(false),
  /**
   * The id of the grid this one continues, when it came out of a reversal.
   * The ONLY chain marker: the old grid's record is not touched beyond
   * closing it, because its `closedReason` enum must not gain a value an
   * older running copy cannot parse.
   */
  reversedFrom: z.string().nullable().default(null),
  /**
   * Why an automatic reversal was refused, in a plain sentence, written onto
   * the grid that closed. Null when no reversal was tried or it succeeded.
   */
  reverseFailReason: z.string().nullable().default(null),
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
 * The coins the grid is holding right now, active and carried levels
 * together. What a paired grid's fixed-size stop is sized to: exactly what
 * the grid owns, never a coin of the ladder's beneath it.
 */
export function gridHeldSz(
  plan: Pick<GridPlan, "levels" | "carriedLevels">
): number {
  let sum = 0
  for (const level of [...plan.levels, ...plan.carriedLevels]) {
    if (level.status === "holding" && level.heldSz > 0) sum += level.heldSz
  }
  return sum
}

/**
 * Where a stop sits, given a range and how far past its losing edge to rest.
 *
 * Below the bottom for a buying grid, above the top for a selling one. The
 * range goes in whole rather than one edge, so no caller can hand over the
 * wrong end.
 *
 * One line, in one place, because it was in four: the placement window, the
 * settings window, the chart while the range is being dragged, and here. Four
 * copies of the same sum is four chances for what is drawn and what is saved to
 * disagree about where the stop actually is.
 */
export function gridStopBeyond(
  direction: GridDirection,
  range: { topPx: number; bottomPx: number },
  underPct: number
): number {
  const edge = lossEdge(direction, range)
  return direction === "long"
    ? edge * (1 - underPct / 100)
    : edge * (1 + underPct / 100)
}

/**
 * Put End Grid past both today's price and the working range, on the winning
 * side: above them for a buying grid, below them for a selling one.
 *
 * A range may be placed on the far side of today's price. Measuring only from
 * its own edge would put End Grid behind the market and finish the grid the
 * moment it was placed.
 */
export function gridEndPx(
  direction: GridDirection,
  range: { topPx: number; bottomPx: number },
  currentPx: number,
  abovePct: number
): number {
  const from = winningSide(direction, winEdge(direction, range), currentPx)
  return direction === "long"
    ? from * (1 + abovePct / 100)
    : from * (1 - abovePct / 100)
}

/** Keep End Grid the same chosen distance away when a hand moves the range. */
export function gridEndAfterRangeMove(
  plan: Pick<
    GridPlan,
    "direction" | "topPx" | "bottomPx" | "takeProfitPx" | "takeProfitPct"
  >,
  nextRange: { topPx: number; bottomPx: number },
  currentPx: number
): number | null {
  if (plan.takeProfitPx === null) return null
  const wasEdge = winEdge(plan.direction, plan)
  const abovePct =
    plan.takeProfitPct ?? Math.abs(plan.takeProfitPx / wasEdge - 1) * 100
  return gridEndPx(plan.direction, nextRange, currentPx, abovePct)
}

/**
 * Where the grid wants its stop, given the level in force — or null when it
 * has no stop at all.
 *
 * The 4h level only carries the stop when it has confirmed **beyond the
 * range**: a base below a buying grid, a ceiling above a selling one. A level
 * inside the range is one the grid fully intends to trade at, not a level at
 * which to give up, and resting a stop there would close the grid on the first
 * ordinary swing. That is the same instinct as the ladder's base stop,
 * measured against the losing edge of the range rather than against the first
 * buy.
 */
/**
 * Where the fixed End Grid line sits, or null when it has no such line.
 *
 * Placement and dragging keep the line above the range. Following may move the
 * range up to the line, so the current top cannot decide whether the fixed line
 * still counts.
 */
export function gridTakeProfitPx(
  plan: Pick<GridPlan, "takeProfitPx">
): number | null {
  const px = plan.takeProfitPx
  return px !== null && px > 0 ? px : null
}

export function gridStopPx(
  plan: Pick<
    GridPlan,
    "direction" | "stopLoss" | "topPx" | "bottomPx" | "baseWatch"
  >
): number | null {
  const sl = plan.stopLoss
  if (!sl) return null
  if (sl.mode === "fixed") return sl.px
  const level = plan.baseWatch?.levelPx ?? null
  if (
    sl.base &&
    level !== null &&
    level > 0 &&
    readyWhen(plan.direction, lossEdge(plan.direction, plan), level)
  ) {
    // The found level becomes the edge the stop hangs off, so the same sum
    // serves both: a base below a buying grid, a ceiling above a selling one.
    return gridStopBeyond(
      plan.direction,
      { topPx: level, bottomPx: level },
      sl.base.underPct
    )
  }
  return gridStopBeyond(plan.direction, plan, sl.underPct)
}

/**
 * The price the exchange would close a grid out at, once every level has
 * opened — the number the selling grid's stop has to stay clear of.
 *
 * **Why only a selling grid needs this.** A coin you bought at $100 can only
 * fall to zero, so the most it costs you is $100 and the stop cannot be past
 * anything. A coin you sold at $100 has no ceiling: at $300 you owe $200 for
 * every $100 you sold, and with borrowing the exchange closes you out long
 * before that. A stop sitting at or past that close-out price is a stop that
 * never fires, because the exchange gets there first.
 *
 * The worst case is every level filled, so the position is sized off every
 * level's own price and coins. Null when the market gave no leverage limit —
 * the same "the exchange did not say" that `liquidationPx` answers null to,
 * and a refusal built on a guess would be worse than none.
 */
export function gridLiquidationPx(input: {
  direction: GridDirection
  levels: readonly { buyPx: number; sz: number }[]
  leverage: number
  maxLeverage: number
}): number | null {
  let coins = 0
  let cost = 0
  for (const level of input.levels) {
    coins += level.sz
    cost += level.sz * level.buyPx
  }
  if (!(coins > 0) || !(cost > 0)) return null
  // Through the practice engine's own arithmetic, so the refusal and the
  // liquidation line the account screens draw can never disagree.
  return liquidationPx({
    szi: input.direction === "long" ? coins : -coins,
    entryPx: cost / coins,
    leverage: input.leverage,
    maxLeverage: input.maxLeverage,
  })
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
    plan: Pick<
      GridPlan,
      "direction" | "stopLoss" | "topPx" | "bottomPx" | "baseWatch"
    >
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
export function gridRangeMovable(
  plan: Pick<GridPlan, "levels"> & { carriedLevels?: GridLevelState[] }
): boolean {
  return (
    plan.levels.some((level) => level.status === "waiting") &&
    !plan.levels.some((level) => level.status === "holding") &&
    !(plan.carriedLevels ?? []).some((level) => level.status === "holding")
  )
}

// ----- Turning a grid around -----------------------------------------------

/**
 * The reversal a grid describes, worked out before anything is touched — or
 * the plain sentence for why it cannot be.
 *
 * A reversal keeps the range exactly where it is and swaps what the two outer
 * lines mean: the old End Grid line becomes the new grid's stop, and the new
 * End Grid sits past the old stop by the same distance the old stop sat past
 * the range. The range never moves (Tyler, 28 Aug 2026), whichever way the
 * reversal was triggered.
 *
 * Pure and browser-safe, so the confirmation the window shows and the numbers
 * the server places are the same numbers. The percentages are handed back as
 * well as the price, because `draftGridOrder` asks in percentages — deriving
 * them here keeps every one of its refusals (step-versus-fee, level too
 * small, stop past the close-out price, End Grid already passed) working on
 * the reversed grid for free.
 */
export type GridReversal =
  | {
      ok: true
      /** The new grid runs the other way round. */
      direction: GridDirection
      /** The new stop: the old End Grid line, exactly. */
      stopPx: number
      /** That stop as a percent past the new grid's losing edge, for the draft. */
      stopUnderPct: number
      /** The new End Grid's distance past the mark, for the draft. */
      endPct: number
    }
  | { ok: false; reason: string }

export function plannedGridReversal(
  plan: Pick<
    GridPlan,
    | "direction"
    | "topPx"
    | "bottomPx"
    | "takeProfitPx"
    | "stopLoss"
    | "baseWatch"
  >
): GridReversal {
  const endPx = plan.takeProfitPx
  if (endPx === null || !(endPx > 0)) {
    return {
      ok: false,
      reason:
        "This grid has no End Grid line, and the reversal makes the new stop from it. Switch End Grid on first.",
    }
  }
  const stopPx = gridStopPx(plan)
  if (stopPx === null || !(stopPx > 0)) {
    return {
      ok: false,
      reason: "This grid has no stop, so there is nothing to reverse from.",
    }
  }

  const direction: GridDirection = plan.direction === "long" ? "short" : "long"

  // How far the old stop sat past the range, as a share of the edge it hung
  // off. That same distance, measured past the fired stop, is where the new
  // End Grid goes.
  const oldEdge = lossEdge(plan.direction, plan)
  const endPct = (Math.abs(oldEdge - stopPx) / oldEdge) * 100
  if (!(endPct > 0)) {
    return {
      ok: false,
      reason:
        "This grid's stop sits exactly on its range, so there is no distance to measure the new End Grid from. Move the stop off the range first.",
    }
  }

  // The old End Grid line as a percent past the NEW grid's losing edge. The
  // draft's schema caps a stop at 50% past the range, and an End Grid that far
  // out is refused in words rather than drafted into something the schema
  // cannot hold.
  const newEdge = lossEdge(direction, plan)
  const stopUnderPct = (Math.abs(endPx - newEdge) / newEdge) * 100
  if (!(stopUnderPct > 0)) {
    return {
      ok: false,
      reason:
        "The End Grid line sits exactly on the range, so the reversed grid's stop would sit inside its own levels.",
    }
  }
  if (stopUnderPct > MAX_GRID_STOP_UNDER_PCT) {
    return {
      ok: false,
      reason: `The End Grid line sits more than ${MAX_GRID_STOP_UNDER_PCT}% past the range, which is further than a grid's stop may go. Drag End Grid closer to the range first.`,
    }
  }

  return { ok: true, direction, stopPx: endPx, stopUnderPct, endPct }
}
