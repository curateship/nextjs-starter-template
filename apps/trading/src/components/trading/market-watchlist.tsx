import * as React from "react"
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronDownIcon,
  ChevronsUpDownIcon,
  SearchIcon,
  StarIcon,
} from "lucide-react"

import {
  formatCompactUsd,
  formatPriceDisplay,
} from "@/components/trading/format"
import { filterMarketsByCoins } from "@/components/trading/market-watchlist-order"
import { MarketListLoadingSkeleton } from "@/components/loading-skeleton"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  STICKY_SCROLL_OVERRIDES,
  STICKY_TABLE_HEADER,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSortButton,
} from "@/components/ui/table"
import type { MarketRow } from "@/lib/hl/hooks"
import { isMarketVisible } from "@/lib/hl/market-visibility"
import type { PerpMarketCategory } from "@/lib/hl/perp-markets"
import { cn } from "@/lib/utils"

type WatchlistTab = "favorites" | "active" | "gainers" | "losers"
type ActiveTab = "positions" | "orders"
type SortKey = "vol" | "change"
type CategoryFilter = "all" | PerpMarketCategory
type PickerView =
  | "favorites"
  | "all"
  | "crypto"
  | "tradfi"
  | "hip3"
  | "trending"
type PickerSortKey =
  | "market"
  | "price"
  | "change"
  | "funding"
  | "volume"
  | "openInterest"

const TABS: { value: WatchlistTab; label: string }[] = [
  { value: "favorites", label: "Fav" },
  { value: "active", label: "Active" },
  { value: "gainers", label: "Gainers" },
  { value: "losers", label: "Losers" },
]

const CATEGORIES: Array<{ value: CategoryFilter; label: string }> = [
  { value: "all", label: "All categories" },
  { value: "crypto", label: "Crypto" },
  { value: "stocks", label: "Stocks" },
  { value: "indices", label: "Indices" },
  { value: "commodities", label: "Commodities" },
  { value: "forex", label: "Forex" },
  { value: "other", label: "Other" },
]

const PICKER_VIEWS: Array<{ value: PickerView; label: string }> = [
  { value: "favorites", label: "Favorites" },
  { value: "all", label: "All" },
  { value: "crypto", label: "Crypto" },
  { value: "tradfi", label: "TradFi" },
  { value: "hip3", label: "HIP-3" },
  { value: "trending", label: "Trending" },
]

const TRADFI_CATEGORIES: Array<{ value: CategoryFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "stocks", label: "Stocks" },
  { value: "indices", label: "Indices" },
  { value: "commodities", label: "Commodities" },
  { value: "forex", label: "FX" },
]

export function MarketWatchlist({
  rows,
  selected,
  positionMarkets,
  openOrderMarkets,
  favorites,
  onToggleFavorite,
  onSelect,
}: {
  rows: MarketRow[]
  selected: string
  positionMarkets: ReadonlySet<string>
  openOrderMarkets: ReadonlySet<string>
  favorites: ReadonlySet<string>
  onToggleFavorite: (coin: string) => void
  onSelect: (coin: string) => void
}) {
  const [query, setQuery] = React.useState("")
  const [tab, setTab] = React.useState<WatchlistTab>("favorites")
  const [category, setCategory] = React.useState<CategoryFilter>("all")
  const [activeTab, setActiveTab] = React.useState<ActiveTab>("orders")
  const [sort, setSort] = React.useState<{ key: SortKey; dir: "asc" | "desc" }>(
    {
      key: "vol",
      dir: "desc",
    }
  )
  const visible = React.useMemo(() => {
    const trimmed = query.trim().toUpperCase()
    const protectedMarkets = new Set([
      selected,
      ...favorites,
      ...positionMarkets,
      ...openOrderMarkets,
    ])
    let list = rows
      .filter((row) => isMarketVisible(row, protectedMarkets))
      .filter((row) => !trimmed || row.coin.toUpperCase().includes(trimmed))
      .filter((row) => category === "all" || row.category === category)
      .map((row) => ({ row, change: dayChangePct(row.markPx, row.prevDayPx) }))

    if (tab === "favorites") {
      list = list.filter((item) => favorites.has(item.row.coin))
    } else if (tab === "active") {
      list = filterMarketsByCoins(
        list,
        activeTab === "positions" ? positionMarkets : openOrderMarkets
      )
    } else if (tab === "gainers") list = list.filter((item) => item.change > 0)
    else if (tab === "losers") list = list.filter((item) => item.change < 0)

    const direction = sort.dir === "asc" ? 1 : -1
    list.sort((a, b) =>
      sort.key === "change"
        ? (a.change - b.change) * direction
        : (Number(a.row.dayNtlVlm) - Number(b.row.dayNtlVlm)) * direction
    )
    return list
  }, [
    rows,
    selected,
    query,
    category,
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
        <Select
          value={category}
          onValueChange={(value) => setCategory(value as CategoryFilter)}
        >
          <SelectTrigger className="h-8 w-full bg-muted text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CATEGORIES.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
        <SortHeader
          label="Market / 24h Vol"
          sortKey="vol"
          sort={sort}
          onSort={toggleSort}
        />
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
            const liveData = row.liveData
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
                  onClick={() => onToggleFavorite(row.coin)}
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
                    <span className="truncate text-sm leading-tight font-semibold">
                      {displaySymbol(row.coin)}
                    </span>
                    <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
                      {row.dex ? `${row.dex} · ` : ""}
                      {liveData ? formatCompactUsd(Number(row.dayNtlVlm)) : "—"}
                    </span>
                  </span>
                  <span
                    className={cn(
                      "rounded-md px-1.5 py-0.5 font-mono text-xs tabular-nums",
                      !liveData
                        ? "bg-muted text-muted-foreground"
                        : change >= 0
                          ? "bg-emerald-500/10 text-emerald-600"
                          : "bg-red-500/10 text-red-500"
                    )}
                  >
                    {liveData ? (
                      <>
                        {change >= 0 ? "+" : ""}
                        {change.toFixed(2)}%
                      </>
                    ) : (
                      "—"
                    )}
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
      <div className="shrink-0 border-t bg-card p-3">
        <div className="relative">
          <SearchIcon className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            placeholder="Search markets"
            className="h-9 rounded-lg border-none bg-muted pl-8 text-xs shadow-none"
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
      </div>
    </div>
  )
}

export function MarketPicker({
  rows,
  selected,
  protectedMarkets,
  favorites,
  onToggleFavorite,
  onSelect,
}: {
  rows: MarketRow[]
  selected: string
  protectedMarkets: ReadonlySet<string>
  favorites: ReadonlySet<string>
  onToggleFavorite: (coin: string) => void
  onSelect: (coin: string) => void
}) {
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState("")
  const [view, setView] = React.useState<PickerView>("all")
  const [category, setCategory] = React.useState<CategoryFilter>("all")
  const [sort, setSort] = React.useState<{
    key: PickerSortKey
    dir: "asc" | "desc"
  }>({ key: "volume", dir: "desc" })
  const visible = React.useMemo(() => {
    const trimmed = query.trim().toUpperCase()
    const retained = new Set([...protectedMarkets, selected, ...favorites])
    let list = rows
      .filter((row) => isMarketVisible(row, retained))
      .filter(
        (row) =>
          !trimmed ||
          row.coin.toUpperCase().includes(trimmed) ||
          displaySymbol(row.coin).toUpperCase().includes(trimmed)
      )

    if (view === "favorites") {
      list = list.filter((row) => favorites.has(row.coin))
    } else if (view === "crypto") {
      list = list.filter((row) => row.category === "crypto")
    } else if (view === "tradfi") {
      list = list.filter((row) =>
        ["stocks", "indices", "commodities", "forex"].includes(row.category)
      )
      if (category !== "all") {
        list = list.filter((row) => row.category === category)
      }
    } else if (view === "hip3") {
      list = list.filter((row) => Boolean(row.dex))
    } else if (view === "trending") {
      list = [...list]
        .sort((a, b) => Number(b.dayNtlVlm) - Number(a.dayNtlVlm))
        .slice(0, 50)
    }

    const direction = sort.dir === "asc" ? 1 : -1
    return list.sort((a, b) => {
      if (sort.key === "market") {
        return (
          displaySymbol(a.coin).localeCompare(displaySymbol(b.coin)) * direction
        )
      }
      return (
        (pickerSortValue(a, sort.key) - pickerSortValue(b, sort.key)) *
        direction
      )
    })
  }, [category, favorites, protectedMarkets, query, rows, selected, sort, view])

  const toggleSort = (key: PickerSortKey) =>
    setSort((current) =>
      current.key === key
        ? { key, dir: current.dir === "desc" ? "asc" : "desc" }
        : { key, dir: key === "market" ? "asc" : "desc" }
    )

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Choose market"
          className="flex items-center gap-1.5 rounded-md px-1 py-0.5 text-[15px] font-bold transition-colors hover:bg-muted"
        >
          <MarketIcon key={selected} coin={selected} />
          <span>{selected}-PERP</span>
          <ChevronDownIcon className="size-3.5 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={8}
        className="h-[min(72vh,640px)] w-[min(94vw,960px)] max-w-none gap-0 overflow-hidden rounded-xl p-0"
      >
        <div className="flex flex-col gap-3 border-b p-3">
          <div className="relative">
            <SearchIcon className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              placeholder="Search markets"
              className="h-10 rounded-lg bg-muted pl-9 shadow-none"
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-1" role="tablist">
            {PICKER_VIEWS.map((item) => (
              <button
                key={item.value}
                type="button"
                role="tab"
                aria-selected={view === item.value}
                onClick={() => {
                  setView(item.value)
                  setCategory("all")
                }}
                className={cn(
                  "border-b-2 px-1 py-1.5 text-xs font-medium transition-colors",
                  view === item.value
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
        {view === "tradfi" ? (
          <div
            className="flex gap-x-5 border-b px-3"
            role="tablist"
            aria-label="TradFi categories"
          >
            {TRADFI_CATEGORIES.map((item) => (
              <button
                key={item.value}
                type="button"
                role="tab"
                aria-selected={category === item.value}
                onClick={() => setCategory(item.value)}
                className={cn(
                  "border-b-2 px-1 py-2 text-xs font-medium transition-colors",
                  category === item.value
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
        ) : null}
        <ScrollArea className={cn("min-h-0 flex-1", STICKY_SCROLL_OVERRIDES)}>
          <Table className="min-w-[760px] text-xs [&_td:first-child]:pl-3 [&_td:last-child]:pr-3 [&_th:first-child]:pl-3 [&_th:last-child]:pr-3">
            <TableHeader className={STICKY_TABLE_HEADER}>
              <TableRow>
                <PickerTableHead
                  label="Market"
                  sortKey="market"
                  sort={sort}
                  onSort={toggleSort}
                />
                <PickerTableHead
                  label="Last price"
                  sortKey="price"
                  sort={sort}
                  onSort={toggleSort}
                />
                <PickerTableHead
                  label="24h change"
                  sortKey="change"
                  sort={sort}
                  onSort={toggleSort}
                />
                <PickerTableHead
                  label="Funding"
                  sortKey="funding"
                  sort={sort}
                  onSort={toggleSort}
                />
                <PickerTableHead
                  label="Volume"
                  sortKey="volume"
                  sort={sort}
                  onSort={toggleSort}
                />
                <PickerTableHead
                  label="Open interest"
                  sortKey="openInterest"
                  sort={sort}
                  onSort={toggleSort}
                />
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((row) => {
                const change = dayChangePct(row.markPx, row.prevDayPx)
                const funding = Number(row.funding) * 100
                const openInterest =
                  Number(row.openInterest) * Number(row.markPx)
                const favorite = favorites.has(row.coin)
                const liveData = row.liveData
                return (
                  <TableRow
                    key={row.coin}
                    data-state={selected === row.coin ? "selected" : undefined}
                    onClick={() => {
                      onSelect(row.coin)
                      setOpen(false)
                    }}
                  >
                    <TableCell className="py-2 pl-3">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          aria-label={
                            favorite
                              ? "Remove from favorites"
                              : "Add to favorites"
                          }
                          onClick={(event) => {
                            event.stopPropagation()
                            onToggleFavorite(row.coin)
                          }}
                          className="rounded p-0.5 text-muted-foreground/50 hover:text-amber-500"
                        >
                          <StarIcon
                            className={cn(
                              "size-4",
                              favorite && "fill-amber-500 text-amber-500"
                            )}
                          />
                        </button>
                        <span className="font-semibold">
                          {displaySymbol(row.coin)}-{row.collateralSymbol}
                        </span>
                        <span className="rounded bg-primary/10 px-1.5 py-0.5 text-primary">
                          {row.maxLeverage}x
                        </span>
                        {row.dex ? (
                          <span className="rounded bg-primary/10 px-1.5 py-0.5 text-primary">
                            {row.dex}
                          </span>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="font-mono tabular-nums">
                      {liveData ? formatPriceDisplay(row.markPx) : "—"}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "font-mono tabular-nums",
                        !liveData
                          ? "text-muted-foreground"
                          : change >= 0
                            ? "text-emerald-600"
                            : "text-red-500"
                      )}
                    >
                      {liveData ? (
                        <>
                          {change >= 0 ? "+" : ""}
                          {change.toFixed(2)}%
                        </>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="font-mono tabular-nums">
                      {liveData ? `${funding.toFixed(4)}%` : "—"}
                    </TableCell>
                    <TableCell className="font-mono tabular-nums">
                      {liveData ? formatCompactUsd(Number(row.dayNtlVlm)) : "—"}
                    </TableCell>
                    <TableCell className="font-mono tabular-nums">
                      {liveData ? formatCompactUsd(openInterest) : "—"}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
          {rows.length === 0 ? (
            <MarketListLoadingSkeleton />
          ) : visible.length === 0 ? (
            <div className="p-8 text-center text-xs text-muted-foreground">
              No matching markets.
            </div>
          ) : null}
        </ScrollArea>
        <div className="border-t px-3 py-2 text-[11px] text-muted-foreground">
          {visible.length} market{visible.length === 1 ? "" : "s"}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function PickerTableHead({
  label,
  sortKey,
  sort,
  onSort,
}: {
  label: string
  sortKey: PickerSortKey
  sort: { key: PickerSortKey; dir: "asc" | "desc" }
  onSort: (key: PickerSortKey) => void
}) {
  return (
    <TableHead className="h-9 px-3 text-xs text-muted-foreground">
      <TableSortButton
        active={sort.key === sortKey}
        direction={sort.dir}
        onClick={() => onSort(sortKey)}
      >
        {label}
      </TableSortButton>
    </TableHead>
  )
}

function MarketIcon({ coin }: { coin: string }) {
  const symbol = displaySymbol(coin)
  const [failed, setFailed] = React.useState(false)

  if (failed) {
    return (
      <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary">
        {symbol.slice(0, 1)}
      </span>
    )
  }

  return (
    <img
      src={`https://app.hyperliquid.xyz/coins/${encodeURIComponent(symbol)}.svg`}
      alt=""
      className="size-5 shrink-0 rounded-full"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  )
}

function displaySymbol(coin: string) {
  return coin.includes(":") ? coin.slice(coin.indexOf(":") + 1) : coin
}

function pickerSortValue(
  row: MarketRow,
  key: Exclude<PickerSortKey, "market">
) {
  switch (key) {
    case "price":
      return Number(row.markPx)
    case "change":
      return dayChangePct(row.markPx, row.prevDayPx)
    case "funding":
      return Number(row.funding)
    case "volume":
      return Number(row.dayNtlVlm)
    case "openInterest":
      return Number(row.openInterest) * Number(row.markPx)
  }
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
  if (tab === "favorites") return "No favorite markets."
  if (tab !== "active") return "No matches."
  return activeTab === "positions" ? "No active positions." : "No open orders."
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

function dayChangePct(mid: string, prevDayPx: string): number {
  const current = Number(mid)
  const previous = Number(prevDayPx)
  if (!previous || !Number.isFinite(current)) return 0
  return ((current - previous) / previous) * 100
}
