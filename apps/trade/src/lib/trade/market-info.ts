import type { MarketRow } from "@/lib/protocols/contracts"
import { floorSize } from "@/lib/trade/dca"

export type OrderMinimumRules = {
  sizeDecimals: number | null
  minOrderValueUsd?: number | null
  minOrderSize?: number | null
}

export type OrderMinimumCheck = {
  /** The coin size the protocol will actually receive after rounding down. */
  size: number
  /** What that rounded order is worth at the price where it will execute. */
  orderUsd: number
  /** The first legal coin size at the same price. */
  minimumSize: number
  /** What the first legal coin size is worth at the same price. */
  minimumUsd: number
  tooSmall: boolean
}

export function minimumOrderUsd(
  rules: Pick<MarketRow, "minOrderValueUsd" | "minOrderSize">,
  price: number
): number | null {
  const values = [
    rules.minOrderValueUsd,
    rules.minOrderSize == null ? null : rules.minOrderSize * price,
  ].filter((value): value is number => value !== null && value > 0)
  return values.length === 0 ? null : Math.max(...values)
}

export function orderDollars(value: number): string {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export function minimumOrderDollars(value: number): string {
  return orderDollars(Math.ceil(value * 100 - 1e-9) / 100)
}

/**
 * Checks one order against one protocol's size step and dollar floor.
 *
 * The check is protocol-wide rather than coin-specific. A market contributes
 * only its published rules and current price. The result uses the rounded coin
 * size that will actually be sent, and works out the first legal size using
 * the same step.
 */
export function checkOrderMinimum(
  rules: OrderMinimumRules,
  price: number,
  requestedSize: number
): OrderMinimumCheck {
  const size = floorSize(requestedSize, rules.sizeDecimals)
  const minimumUsdAtAnySize = minimumOrderUsd(
    {
      minOrderValueUsd: rules.minOrderValueUsd ?? null,
      minOrderSize: rules.minOrderSize ?? null,
    },
    price
  )
  const tooSmall =
    size <= 0 ||
    (rules.minOrderSize != null && size + 1e-12 < rules.minOrderSize) ||
    (minimumUsdAtAnySize !== null && price * size + 1e-9 < minimumUsdAtAnySize)
  const sizeFactor = 10 ** Math.max(0, rules.sizeDecimals ?? 0)
  const minimumSizeFromDollars =
    minimumUsdAtAnySize !== null && price > 0
      ? Math.ceil((minimumUsdAtAnySize / price) * sizeFactor - 1e-9) /
        sizeFactor
      : 0
  const minimumSize = Math.max(
    1 / sizeFactor,
    rules.minOrderSize ?? 0,
    minimumSizeFromDollars
  )

  return {
    size,
    orderUsd: price * size,
    minimumSize,
    minimumUsd: price > 0 ? price * minimumSize : (minimumUsdAtAnySize ?? 0),
    tooSmall,
  }
}

/** The one sentence every live order path uses for the same minimum check. */
export function orderMinimumRefusal(
  protocolLabel: string,
  check: OrderMinimumCheck
): string {
  return `${protocolLabel}'s smallest order here is $${minimumOrderDollars(check.minimumUsd)}, and this order is $${orderDollars(check.orderUsd)}.`
}

export function minimumOrderLabel(row: MarketRow): string | null {
  const floor = minimumOrderUsd(row, row.price)
  if (floor === null) return null
  const sizeSetsFloor =
    row.minOrderSize != null &&
    row.minOrderSize * row.price > (row.minOrderValueUsd ?? 0)
  return sizeSetsFloor
    ? `Smallest order now: $${minimumOrderDollars(floor)}`
    : `Smallest order: $${floor}`
}
