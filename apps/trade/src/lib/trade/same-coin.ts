import type { MarketRow } from "@/lib/protocols/contracts"

/** Contract multipliers apply to prices too. Never compare a thousand coins to one. */
export function coinIdentity(row: MarketRow): { id: string; units: number } {
  // Open listings can borrow any ticker. A mint address is the identity there.
  if (row.caution || /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(row.marketId)) {
    return { id: row.key, units: 1 }
  }
  let symbol = row.symbol.split(":").at(-1) ?? row.symbol
  symbol = symbol
    .replace(/[-_/](?:USDT|USDC|USD)(?:[-_]PERP)?$/i, "")
    .replace(/[-_]PERP$/i, "")
  let units = 1
  const multiple = /^(1000|1000000|k)([A-Z][A-Z0-9]+)$/.exec(symbol)
  if (row.category === "crypto" && multiple) {
    units = multiple[1] === "k" ? 1000 : Number(multiple[1])
    symbol = multiple[2]
  }
  // Prefixes on hosted markets are retained in each child row, not in the coin id.
  return { id: `${row.category}:${symbol.toUpperCase()}`, units }
}

/** Ambiguous same-symbol listings on one venue stay separate. */
export function groupSameCoins<T extends MarketRow>(rows: readonly T[]): T[][] {
  const groups = new Map<string, T[]>()
  for (const row of rows) {
    const id = coinIdentity(row).id
    const group = groups.get(id) ?? []
    group.push(row)
    groups.set(id, group)
  }
  return [...groups.values()].flatMap((group) => {
    const venues = group.map((row) => row.key.split(":")[0])
    return new Set(venues).size === venues.length
      ? [group]
      : group.map((row) => [row])
  })
}
