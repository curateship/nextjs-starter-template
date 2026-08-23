import type { MarketRow } from "@/lib/protocols/contracts"

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
