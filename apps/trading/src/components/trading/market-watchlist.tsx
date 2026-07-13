import * as React from "react"
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronsUpDownIcon,
  SearchIcon,
  StarIcon,
} from "lucide-react"

import { formatCompactUsd } from "@/components/trading/format"
import {
  filterMarketsByCoins,
  pinFavoriteMarkets,
} from "@/components/trading/market-watchlist-order"
import { MarketListLoadingSkeleton } from "@/components/loading-skeleton"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useMarketRows } from "@/lib/hl/hooks"
import type { TradingNetwork } from "@/lib/hl/network"
import { usePersistedState } from "@/lib/use-persisted-state"
import { cn } from "@/lib/utils"

const FAVORITES_KEY = "trading-favorite-markets"

type WatchlistTab = "all" | "active" | "gainers" | "losers"
type ActiveTab = "positions" | "orders"
type SortKey = "vol" | "change"

const TABS: { value: WatchlistTab; label: string }[] = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "gainers", label: "Gainers" },
  { value: "losers", label: "Losers" },
]

export function MarketWatchlist({
  network,
  selected,
  positionMarkets,
  openOrderMarkets,
  onSelect,
}: {
  network: TradingNetwork
  selected: string
  positionMarkets: ReadonlySet<string>
  openOrderMarkets: ReadonlySet<string>
  onSelect: (coin: string) => void
}) {
  const rows = useMarketRows(network)
  const [query, setQuery] = React.useState("")
  const [tab, setTab] = React.useState<WatchlistTab>("all")
  const [activeTab, setActiveTab] = React.useState<ActiveTab>("orders")
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

    if (tab === "active") {
      list = filterMarketsByCoins(
        list,
        activeTab === "positions" ? positionMarkets : openOrderMarkets
      )
    }
    else if (tab === "gainers") list = list.filter((item) => item.change > 0)
    else if (tab === "losers") list = list.filter((item) => item.change < 0)

    const direction = sort.dir === "asc" ? 1 : -1
    list.sort((a, b) =>
      sort.key === "change"
        ? (a.change - b.change) * direction
        : (Number(a.row.dayNtlVlm) - Number(b.row.dayNtlVlm)) * direction
    )
    return tab === "all" ? pinFavoriteMarkets(list, favorites) : list
  }, [
    rows,
    query,
    tab,
    activeTab,
    positionMarkets,
    openOrderMarkets,
    favorites,
    sort,
  ])

  const toggleSort = (key: SortKey) =>
    setSort((current) =>
      current.key === key
        ? { key, dir: current.dir === "desc" ? "asc" : "desc" }
        : { key, dir: "desc" }
    )

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-col gap-2 p-3 pb-2">
        <div className="relative">
          <SearchIcon className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            placeholder="Search markets"
            className="h-9 rounded-lg border-none bg-muted pl-8 text-xs shadow-none"
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <div className="flex gap-1.5">
          {TABS.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setTab(item.value)}
              className={cn(
                "flex flex-1 items-center justify-center gap-1 rounded-lg px-1.5 py-1.5 text-xs font-medium transition-colors",
                tab === item.value
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
        {tab === "active" ? (
          <div
            role="group"
            aria-label="Active market type"
            className="grid grid-cols-2 rounded-lg bg-muted p-1"
          >
            <ActiveMarketTab
              active={activeTab === "orders"}
              label="Open"
              onClick={() => setActiveTab("orders")}
            />
            <ActiveMarketTab
              active={activeTab === "positions"}
              label="Active"
              onClick={() => setActiveTab("positions")}
            />
          </div>
        ) : null}
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
        <div className="px-2 py-1">
          {visible.map(({ row, change }) => {
            const isFavorite = favorites.has(row.coin)
            return (
              <div
                key={row.coin}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg px-2 py-2 hover:bg-muted/70",
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
                    <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
                      {formatCompactUsd(Number(row.dayNtlVlm))}
                    </span>
                  </span>
                  <span
                    className={cn(
                      "rounded-md px-1.5 py-0.5 font-mono text-xs tabular-nums",
                      change >= 0
                        ? "bg-emerald-500/10 text-emerald-600"
                        : "bg-red-500/10 text-red-500"
                    )}
                  >
                    {change >= 0 ? "+" : ""}
                    {change.toFixed(2)}%
                  </span>
                </button>
              </div>
            )
          })}
          {rows.length === 0 ? (
            <MarketListLoadingSkeleton />
          ) : visible.length === 0 ? (
            <div className="px-3 py-8 text-center text-xs text-muted-foreground">
              {emptyMarketText(tab, activeTab)}
            </div>
          ) : null}
        </div>
      </ScrollArea>
    </div>
  )
}

function ActiveMarketTab({
  active,
  label,
  onClick,
}: {
  active: boolean
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "rounded-md px-2 py-1 text-xs font-medium transition-colors",
        active
          ? "bg-card text-foreground shadow-xs"
          : "text-muted-foreground hover:text-foreground"
      )}
    >
      {label}
    </button>
  )
}

function emptyMarketText(tab: WatchlistTab, activeTab: ActiveTab): string {
  if (tab !== "active") return "No matches."
  return activeTab === "positions"
    ? "No active positions."
    : "No open orders."
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
