import type { LiveFigures, MarketRow } from "@/lib/protocols/contracts"
import type { ExplorerVenue } from "@/lib/api/trade/market-explorer"
import type { ExplorerView } from "@/lib/trade/market-explorer"
import type { MarketHistory, MarketWindow } from "@/lib/trade/market-history"
import { getLiveAdapter } from "@/lib/protocols/live-registry"
import { coinIdentity, groupSameCoins } from "@/lib/trade/same-coin"

export type ExplorerRow = MarketRow & {
  displayKey?: string
  venue: ExplorerVenue
  windows: Record<5 | 60 | 300, MarketWindow | null>
  children: ExplorerRow[]
  gap: number | null
}
export function explorerRows(
  venues: readonly ExplorerVenue[],
  figures: ReadonlyMap<string, LiveFigures>,
  history: MarketHistory,
  now: number,
  view: ExplorerView
): ExplorerRow[] {
  const query = view.search.toLowerCase().trim()
  const rows = venues
    .flatMap((venue) =>
      (venue.catalog?.rows ?? []).map((original): ExplorerRow => {
        const live = figures.get(original.key)
        const supportsWindows = !!getLiveAdapter(venue.protocol)?.watchFigures
        const merged = live
          ? supportsWindows
            ? {
                ...original,
                ...live,
                fundingHourly: live.fundingHourly ?? original.fundingHourly,
                openInterestUsd:
                  live.openInterestUsd ?? original.openInterestUsd,
              }
            : { ...original, price: live.price }
          : original
        const row = {
          ...merged,
          fundingHourly: venue.catalog?.picker.funding
            ? merged.fundingHourly
            : null,
          openInterestUsd: venue.catalog?.picker.openInterest
            ? merged.openInterestUsd
            : null,
        }
        return {
          ...row,
          venue,
          children: [],
          gap: null,
          windows: {
            5: supportsWindows ? history.window(row.key, now, 5) : null,
            60: supportsWindows ? history.window(row.key, now, 60) : null,
            300: supportsWindows ? history.window(row.key, now, 300) : null,
          },
        }
      })
    )
    .filter((row) => {
      if (!view.exchanges.includes(row.venue.protocol)) return false
      if (view.categories.length && !view.categories.includes(row.category))
        return false
      if (
        query &&
        !`${row.symbol} ${row.subExchange ?? ""} ${row.marketId}`
          .toLowerCase()
          .includes(query)
      )
        return false
      if (row.volume24hUsd < view.minimumVolume) return false
      if (
        view.minimumLeverage &&
        (row.maxLeverage === null || row.maxLeverage < view.minimumLeverage)
      )
        return false
      if (
        view.tradeable !== "any" &&
        row.venue.orders !== (view.tradeable === "yes")
      )
        return false
      if (view.minimumMove || view.moveDirection !== "either") {
        if (row.change24h === null) return false
        const move =
          view.moveDirection === "up"
            ? row.change24h
            : view.moveDirection === "down"
              ? -row.change24h
              : Math.abs(row.change24h)
        if (move * 100 < view.minimumMove) return false
      }
      if (view.funding !== "any") {
        if (row.fundingHourly === null) return false
        if (view.funding === "paying" && row.fundingHourly >= 0) return false
        if (view.funding === "costing" && row.fundingHourly <= 0) return false
        if (view.funding === "cheap" && row.fundingHourly > 0.000001)
          return false
      }
      return true
    })
  if (!view.groupByCoin) return rows
  const groups = groupSameCoins(rows)
  const identityCounts = new Map<string, number>()
  for (const group of groups) {
    const id = coinIdentity(group[0]).id
    identityCounts.set(id, (identityCounts.get(id) ?? 0) + 1)
  }
  return groups.map((children) => {
    children.sort(
      (a, b) => b.volume24hUsd - a.volume24hUsd || a.key.localeCompare(b.key)
    )
    const prices = children
      .filter((row) => row.price > 0)
      .map((row) => row.price / coinIdentity(row).units)
    return {
      ...children[0],
      displayKey:
        identityCounts.get(coinIdentity(children[0]).id) === 1
          ? `coin:${coinIdentity(children[0]).id}`
          : children[0].key,
      children: children.length > 1 ? children : [],
      gap: prices.length > 1 ? Math.max(...prices) - Math.min(...prices) : null,
    }
  })
}
export function explorerValue(
  row: ExplorerRow,
  column: ExplorerView["sort"]
): number | string | null {
  if (column === "price" && !(row.price > 0)) return null
  if (column === "market")
    return `${row.subExchange ?? ""} ${row.symbol}`.trim()
  const window = column.endsWith("5s")
    ? row.windows[5]
    : column.endsWith("1m")
      ? row.windows[60]
      : row.windows[300]
  if (column.startsWith("move")) return window?.fraction ?? null
  if (column.startsWith("traded")) return window?.traded ?? null
  return row[
    column as
      | "price"
      | "change24h"
      | "volume24hUsd"
      | "fundingHourly"
      | "maxLeverage"
      | "openInterestUsd"
  ]
}
export function sortExplorerRows(
  rows: readonly ExplorerRow[],
  view: ExplorerView
) {
  return [...rows].sort((a, b) => {
    const left = explorerValue(a, view.sort),
      right = explorerValue(b, view.sort)
    if (left === null || right === null)
      return left === right
        ? a.key.localeCompare(b.key)
        : left === null
          ? 1
          : -1
    const order =
      typeof left === "string" && typeof right === "string"
        ? left.localeCompare(right)
        : Number(left) - Number(right)
    return (
      (view.direction === "asc" ? order : -order) || a.key.localeCompare(b.key)
    )
  })
}
