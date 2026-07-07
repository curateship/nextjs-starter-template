import * as React from "react"
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronsUpDownIcon,
  SearchIcon,
  StarIcon,
} from "lucide-react"

import { formatCompactUsd } from "@/components/trading/format"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useMarketRows } from "@/lib/hl/hooks"
import type { TradingNetwork } from "@/lib/hl/network"
import { usePersistedState } from "@/lib/use-persisted-state"
import { cn } from "@/lib/utils"

const FAVORITES_KEY = "trading-favorite-markets"

type WatchlistTab = "all" | "fav" | "gainers" | "losers"
type SortKey = "vol" | "change"

const TABS: { value: WatchlistTab; label: string }[] = [
  { value: "all", label: "All" },
  { value: "fav", label: "Fav" },
  { value: "gainers", label: "Gainers" },
  { value: "losers", label: "Losers" },
]

export function MarketWatchlist({
  network,
  selected,
  onSelect,
}: {
  network: TradingNetwork
  selected: string
  onSelect: (coin: string) => void
}) {
  const rows = useMarketRows(network)
  const [query, setQuery] = React.useState("")
  const [tab, setTab] = React.useState<WatchlistTab>("all")
  const [sort, setSort] = React.useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "vol",
    dir: "desc",
  })
  const { favorites, toggleFavorite } = useFavorites()

  const visible = React.useMemo(() => {
    const trimmed = query.trim().toUpperCase()
    let list = rows
      .filter((row) => !trimmed || row.coin.toUpperCase().includes(trimmed))
      .map((row) => ({ row, change: dayChangePct(row.markPx, row.prevDayPx) }))

    if (tab === "fav") list = list.filter((item) => favorites.has(item.row.coin))
    else if (tab === "gainers") list = list.filter((item) => item.change > 0)
    else if (tab === "losers") list = list.filter((item) => item.change < 0)

    const direction = sort.dir === "asc" ? 1 : -1
    list.sort((a, b) =>
      sort.key === "change"
        ? (a.change - b.change) * direction
        : (Number(a.row.dayNtlVlm) - Number(b.row.dayNtlVlm)) * direction
    )
    return list
  }, [rows, query, tab, favorites, sort])

  const toggleSort = (key: SortKey) =>
    setSort((current) =>
      current.key === key
        ? { key, dir: current.dir === "desc" ? "asc" : "desc" }
        : { key, dir: "desc" }
    )

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-col gap-2 border-b p-2">
        <div className="relative">
          <SearchIcon className="absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            placeholder="Search markets"
            className="h-8 pl-7 text-xs"
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <div className="flex gap-1 rounded-lg bg-muted/50 p-1">
          {TABS.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setTab(item.value)}
              className={cn(
                "flex flex-1 items-center justify-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium transition-colors",
                tab === item.value
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {item.value === "fav" ? (
                <StarIcon className="size-3.5 fill-current" />
              ) : null}
              {item.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center justify-between border-b px-3 py-1.5 text-[11px] font-medium text-muted-foreground">
        <SortHeader label="Market / 24h Vol" sortKey="vol" sort={sort} onSort={toggleSort} />
        <SortHeader
          label="Change 24h"
          sortKey="change"
          align="right"
          sort={sort}
          onSort={toggleSort}
        />
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div>
          {visible.map(({ row, change }) => {
            const isFavorite = favorites.has(row.coin)
            return (
              <div
                key={row.coin}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-2 hover:bg-muted/50",
                  selected === row.coin && "bg-muted"
                )}
              >
                <button
                  type="button"
                  aria-label={
                    isFavorite ? "Remove from favorites" : "Add to favorites"
                  }
                  onClick={() => toggleFavorite(row.coin)}
                  className="shrink-0 rounded p-0.5 text-muted-foreground/40 hover:text-amber-500"
                >
                  <StarIcon
                    className={cn(
                      "size-4",
                      isFavorite && "fill-amber-500 text-amber-500"
                    )}
                  />
                </button>
                <button
                  type="button"
                  onClick={() => onSelect(row.coin)}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                >
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-semibold leading-tight">
                      {row.coin}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {formatCompactUsd(Number(row.dayNtlVlm))}
                    </span>
                  </span>
                  <span
                    className={cn(
                      "font-mono text-sm tabular-nums",
                      change >= 0 ? "text-emerald-600" : "text-red-500"
                    )}
                  >
                    {change >= 0 ? "+" : ""}
                    {change.toFixed(2)}%
                  </span>
                </button>
              </div>
            )
          })}
          {visible.length === 0 ? (
            <div className="px-3 py-8 text-center text-xs text-muted-foreground">
              {rows.length === 0
                ? "Loading markets…"
                : tab === "fav"
                  ? "No favorites yet — tap a star to add one."
                  : "No matches."}
            </div>
          ) : null}
        </div>
      </ScrollArea>
    </div>
  )
}

function SortHeader({
  label,
  sortKey,
  align,
  sort,
  onSort,
}: {
  label: string
  sortKey: SortKey
  align?: "right"
  sort: { key: SortKey; dir: "asc" | "desc" }
  onSort: (key: SortKey) => void
}) {
  const active = sort.key === sortKey
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      className={cn(
        "flex items-center gap-1 hover:text-foreground",
        align === "right" && "flex-row-reverse"
      )}
    >
      {label}
      {!active ? (
        <ChevronsUpDownIcon className="size-3 opacity-50" />
      ) : sort.dir === "asc" ? (
        <ArrowUpIcon className="size-3" />
      ) : (
        <ArrowDownIcon className="size-3" />
      )}
    </button>
  )
}

const EMPTY_FAVORITES: string[] = []

/** Favorited markets, persisted to localStorage across sessions. */
function useFavorites() {
  const [list, setList] = usePersistedState<string[]>(
    FAVORITES_KEY,
    EMPTY_FAVORITES
  )
  const favorites = React.useMemo(() => new Set(list), [list])
  const toggleFavorite = React.useCallback(
    (coin: string) => {
      setList((prev) =>
        prev.includes(coin) ? prev.filter((c) => c !== coin) : [...prev, coin]
      )
    },
    [setList]
  )
  return { favorites, toggleFavorite }
}

function dayChangePct(mid: string, prevDayPx: string): number {
  const current = Number(mid)
  const previous = Number(prevDayPx)
  if (!previous || !Number.isFinite(current)) return 0
  return ((current - previous) / previous) * 100
}
