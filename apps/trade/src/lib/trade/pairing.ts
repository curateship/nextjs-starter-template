import type { WalletOpenOrder, WalletPosition } from "@/lib/protocols/contracts"

import type { LadderPlan } from "./dca"
import { gridStopPx, type GridPlan } from "./grid"

/**
 * A grid working a range above a DCA ladder waiting below — the one pairing
 * of two smart orders the app allows on a single coin.
 *
 * The rules here are the whole reason the pairing is safe. There is one
 * position per coin on the exchange, and its one whole-position stop belongs
 * to the ladder. The grid gets its own fixed-size stop instead, sitting ABOVE
 * the ladder's first buy — so on the way down the grid's stop fires first,
 * sells only the grid's coins, and the ladder takes over the fall with its
 * own stop still covering everything it holds. Every refusal below protects
 * that ordering; none of them is a preference.
 */

/**
 * The exchanges whose adapter can place a fixed-size stop beside a
 * whole-position one. Phemex is missing on purpose: its stops carry a flag
 * that may close the whole position regardless of the size given, and until
 * a real-exchange test answers that, a pairing there could sell the ladder's
 * coins on the grid's stop.
 */
const PAIRABLE_PROTOCOLS: ReadonlySet<string> = new Set([
  "hyperliquid",
  "aster",
  "kucoin",
])

/**
 * The price the ladder starts buying at — its highest rung that can still
 * trade or has already traded. Skipped and cancelled rungs are ignored: a
 * rung that will never buy cannot collide with a stop above it.
 */
export function ladderBaseRungPx(
  plan: Pick<LadderPlan, "rungs">
): number | null {
  let top: number | null = null
  for (const rung of plan.rungs) {
    if (rung.status === "skipped" || rung.status === "cancelled") continue
    if (top === null || rung.px > top) top = rung.px
  }
  return top
}

/**
 * Whether this grid's stop rides the confirmed 4h base. A base can confirm
 * lower later and carry the stop down with it — under the ladder's first buy
 * — so a base-riding stop cannot anchor the pairing. A fixed or plain
 * percent stop only ever rises (the range follows price up, never down while
 * the stop follows it), which keeps the ordering for good.
 */
export function gridStopRidesBase(plan: Pick<GridPlan, "stopLoss">): boolean {
  return (
    plan.stopLoss !== null &&
    plan.stopLoss.mode === "percent" &&
    plan.stopLoss.base !== null
  )
}

/**
 * The refusal a grid-above-ladder pairing gets, or null when it is allowed.
 *
 * `grid` or `ladder` may be null when that side's plan is not drawn yet —
 * the placement paths check once before drafting, for a fast refusal, and
 * once more inside the write with everything known. A null side skips only
 * the checks that need it; the wallet and exchange checks always run.
 */
export function gridLadderPairingRefusal(input: {
  walletKind: string
  protocol: string
  grid: Pick<
    GridPlan,
    "direction" | "stopLoss" | "topPx" | "bottomPx" | "baseWatch" | "leverage"
  > | null
  ladder: Pick<LadderPlan, "rungs" | "leverage"> | null
}): string | null {
  // A selling grid and a ladder can never share a coin, and this is checked
  // before anything else. The ladder is a buying plan and the grid a selling
  // one, and one exchange position cannot be both — the ladder's rungs would
  // close the grid's short instead of building a long. Nothing below this can
  // rescue that, so nothing below it is asked.
  if (input.grid && input.grid.direction === "short") {
    return "SMART_PAIR_SHORT_GRID"
  }
  // A practice wallet's book holds one stop per position and cannot hold the
  // grid's second one, so the handoff cannot be simulated honestly there.
  if (input.walletKind !== "live") return "SMART_PAIR_LIVE_ONLY"
  if (!PAIRABLE_PROTOCOLS.has(input.protocol)) return "SMART_PAIR_PROTOCOL"
  // The exchange holds one position for the coin. Whichever strategy buys
  // first fixes its leverage, and the other one inherits it, so two different
  // choices would make one plan's sizes and margin promise false.
  if (
    input.grid &&
    input.ladder &&
    input.grid.leverage !== input.ladder.leverage
  ) {
    return "SMART_PAIR_LEVERAGE"
  }
  if (input.grid) {
    if (!input.grid.stopLoss) return "SMART_PAIR_GRID_STOP_REQUIRED"
    if (gridStopRidesBase(input.grid)) return "SMART_PAIR_GRID_STOP_BASE"
    if (input.ladder) {
      const stopPx = gridStopPx(input.grid)
      if (stopPx === null) return "SMART_PAIR_GRID_STOP_REQUIRED"
      const basePx = ladderBaseRungPx(input.ladder)
      if (basePx === null || !(stopPx > basePx)) {
        return "SMART_PAIR_STOP_BELOW_BASE"
      }
    }
  }
  return null
}

/** What a re-attribution needs to know about one market's paired grid stop. */
export type PairedStopRef = {
  orderId: string
  px: number
  sz: number
  /** The stop the ladder last wrote, to recognise its leg among the rest. */
  ladderAimedSlPx: number | null
}

/**
 * Puts each stop back with its owner after a portfolio read.
 *
 * Every adapter names the OLDEST stop leg as the position's stop — the right
 * rule for a position that should only carry one. A paired grid's stop is
 * usually the oldest leg, because the ladder's is cancelled and re-placed on
 * every move while the grid's is left alone. So the read hands back the
 * grid's stop wearing the position's one stop slot, and the ladder's real
 * stop sitting in the open-orders list as a stray trigger.
 *
 * This swaps them: the position's slot gets the ladder's leg (found below
 * the grid's stop — the pairing's own ordering rule says it is always
 * lower), and the grid's leg becomes an ordinary trigger row, which the
 * chart already hides behind the grid's own STOP LOSS line. Without the
 * swap the ladder's engine reads a stop price it never wrote, concludes a
 * hand moved it, and stops managing its stop for good.
 *
 * Markets with no paired grid pass through untouched.
 */
export function reattributePairedStops(
  portfolio: { positions: WalletPosition[]; orders: WalletOpenOrder[] },
  pairedByMarketId: ReadonlyMap<string, PairedStopRef>
): { positions: WalletPosition[]; orders: WalletOpenOrder[] } {
  if (pairedByMarketId.size === 0) return portfolio
  let orders = portfolio.orders
  const positions = portfolio.positions.map((position) => {
    const paired = pairedByMarketId.get(position.marketId)
    if (!paired || position.slOrderId !== paired.orderId || position.szi <= 0) {
      return position
    }
    const near = (a: number, b: number | null) =>
      b !== null && Math.abs(a - b) <= Math.max(1e-9, Math.abs(b) * 1e-6)
    const candidates = orders.filter(
      (order) =>
        order.marketId === position.marketId &&
        order.trigger &&
        order.reduceOnly &&
        order.side === "sell" &&
        order.orderId !== paired.orderId &&
        // The ladder's stop sits below the grid's — that ordering is what
        // makes the pairing legal at all. A leftover trigger above it is a
        // spare target, not the stop.
        order.px < paired.px
    )
    const ladderLeg =
      candidates.find((order) => near(order.px, paired.ladderAimedSlPx)) ??
      // Oldest first, the same tie-break every adapter read uses.
      [...candidates].sort((a, b) =>
        a.orderId.localeCompare(b.orderId, undefined, { numeric: true })
      )[0] ??
      null
    orders = orders.filter((order) => order !== ladderLeg)
    // The grid's leg leaves the position's slot and becomes a plain trigger
    // row, sized off the grid's own record since the read folded it away.
    orders = [
      ...orders,
      {
        orderId: paired.orderId,
        marketId: position.marketId,
        side: "sell",
        px: paired.px,
        sz: paired.sz,
        reduceOnly: true,
        trigger: true,
      },
    ]
    return {
      ...position,
      slPx: ladderLeg?.px ?? null,
      slOrderId: ladderLeg?.orderId ?? null,
    }
  })
  return { positions, orders }
}
