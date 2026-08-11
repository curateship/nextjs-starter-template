const UNITS: Record<string, number> = {
  k: 1_000,
  m: 1_000_000,
  b: 1_000_000_000,
}

/** Turns volume input into dollars; a plain number means millions. */
export function parseMarketVolume(value: string): number | null {
  const match = value
    .trim()
    .match(/^\$?((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?|\.\d+)\s*([kmb])?$/i)

  if (!match) return null

  const amount = Number(match[1].replaceAll(",", ""))
  const multiplier = match[2] ? UNITS[match[2].toLowerCase()] : UNITS.m
  const dollars = amount * multiplier

  return Number.isFinite(dollars) ? dollars : null
}

/** Narrows a market list and keeps the busiest matching coin first. */
export function filterMarketsByVolume<
  T extends { symbol: string; volume24hUsd: number },
>(
  markets: readonly T[],
  minimum: number,
  maximum: number,
  search: string
): T[] {
  const needle = search.trim().toLowerCase()

  return markets
    .filter(
      (market) =>
        market.volume24hUsd >= minimum &&
        market.volume24hUsd <= maximum &&
        (!needle || market.symbol.toLowerCase().includes(needle))
    )
    .sort(
      (left, right) =>
        right.volume24hUsd - left.volume24hUsd ||
        left.symbol.localeCompare(right.symbol)
    )
}
