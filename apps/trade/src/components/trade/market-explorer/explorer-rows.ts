import type { LiveFigures, MarketRow } from "@/lib/protocols/contracts"
import type { ExplorerVenue } from "@/lib/api/trade/market-explorer"
import type { ExplorerView } from "@/lib/trade/market-explorer"
import type { MarketHistory, MarketWindow } from "@/lib/trade/market-history"
import { getLiveAdapter } from "@/lib/protocols/live-registry"
import { fundingPerDay, marketPace } from "@/lib/trade/market-discovery"
import type { MarketFolder } from "@/lib/trade/market-folders"
import { coinIdentity, groupSameCoins } from "@/lib/trade/same-coin"

export type ExplorerRow = MarketRow & {
  folders?: string[]
  listed?: number | null
  quiet?: boolean
  holdings?: { wallet: string; size: number | null }[]
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
  view: ExplorerView,
  discovery: {
    folders?: Partial<Record<string, MarketFolder[]>>
    marks?: { marketKey: string; wallet: string; size: number | null }[]
  } = {}
): ExplorerRow[] {
  const marketByKey = new Map(
    venues.flatMap(
      (venue) => venue.catalog?.rows.map((row) => [row.key, row] as const) ?? []
    )
  )
  const groupByKey = new Map<string, string>()
  for (const group of groupSameCoins([...marketByKey.values()])) {
    for (const row of group) groupByKey.set(row.key, group[0].key)
  }
  const marksByCoin = new Map<
    string,
    { wallet: string; size: number | null }[]
  >()
  for (const mark of discovery.marks ?? []) {
    const source = marketByKey.get(mark.marketKey)
    const identity = source ? coinIdentity(source) : null
    const key = groupByKey.get(mark.marketKey) ?? mark.marketKey
    const marks = marksByCoin.get(key) ?? []
    marks.push({
      wallet: mark.wallet,
      size: mark.size === null ? null : mark.size * (identity?.units ?? 1),
    })
    marksByCoin.set(key, marks)
  }
  const folderNames = new Map<string, string[]>()
  for (const folder of Object.values(discovery.folders ?? {}).flatMap(
    (value) => value ?? []
  )) {
    for (const key of folder.marketKeys)
      folderNames.set(key, [
        ...(folderNames.get(key) ?? []),
        folder.isFav ? "Fav" : folder.name,
      ])
  }
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
          folders: folderNames.get(row.key) ?? [],
          listed: venue.catalog?.firstSeen?.[row.key] ?? null,
          quiet:
            supportsWindows &&
            !["stocks", "forex"].includes(row.category) &&
            history.quiet(row.key, now),
          holdings:
            marksByCoin.get(groupByKey.get(row.key) ?? row.key) ??
            marksByCoin.get(row.key) ??
            [],
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
      if (
        view.minimumPace &&
        (marketPace(row.volume24hUsd, row.windows[60]) ?? -1) < view.minimumPace
      )
        return false
      if (view.onlyMine && !row.holdings?.length) return false
      if (view.folder && !row.folders?.includes(view.folder)) return false
      if (view.hideQuiet && row.quiet) return false
      if (
        view.recentListings &&
        (!row.listed || row.listed < now - 7 * 86400_000)
      )
        return false
      if (view.dailyFunding !== "any") {
        const side = view.dailyFunding.startsWith("long") ? "long" : "short"
        const dollars = fundingPerDay(row.fundingHourly, side)
        if (dollars === null) return false
        if (
          view.dailyFunding.endsWith("Earns")
            ? dollars <= 0
            : -dollars >= view.maximumDailyCost
        )
          return false
      }
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
  if (column === "pace") return marketPace(row.volume24hUsd, row.windows[60])
  if (column === "longDaily" || column === "shortDaily")
    return fundingPerDay(
      row.fundingHourly,
      column === "longDaily" ? "long" : "short"
    )
  if (column === "folders") return row.folders?.join(", ") ?? ""
  if (column === "listed") return row.listed ?? null
  if (column === "sparkline") return row.windows[300]?.fraction ?? null
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
  const pins = new Map(view.pins.map((key, index) => [key, index]))
  return [...rows].sort((a, b) => {
    const aPin = pins.get(a.displayKey ?? a.key),
      bPin = pins.get(b.displayKey ?? b.key)
    if (aPin !== undefined || bPin !== undefined)
      return (aPin ?? Infinity) - (bPin ?? Infinity)
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
