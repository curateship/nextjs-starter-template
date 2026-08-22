import * as React from "react"
import { ChevronDownIcon, SearchIcon, StarIcon } from "lucide-react"

import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSortButton,
} from "@/components/ui/table"
import type { MarketCategory, MarketRow } from "@/lib/protocols/contracts"
import {
  formatChange,
  formatCompactUsd,
  formatFunding,
  formatPrice,
} from "@/lib/trade/format"
import { useLiveFigures } from "@/lib/trade/live-market"
import { moneyTone } from "@/lib/trade/money-tone"
import { cn } from "@/lib/utils"

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

type TradFiCategory = "all" | Extract<
  MarketCategory,
  "stocks" | "indices" | "commodities" | "forex"
>

const PICKER_VIEWS: Array<{ value: PickerView; label: string }> = [
  { value: "favorites", label: "Favorites" },
  { value: "all", label: "All" },
  { value: "crypto", label: "Crypto" },
  { value: "tradfi", label: "TradFi" },
  { value: "hip3", label: "HIP-3" },
  { value: "trending", label: "Trending" },
]

const TRADFI_CATEGORIES: Array<{
  value: TradFiCategory
  label: string
}> = [
  { value: "all", label: "All" },
  { value: "stocks", label: "Stocks" },
  { value: "indices", label: "Indices" },
  { value: "commodities", label: "Commodities" },
  { value: "forex", label: "FX" },
]

const TRADFI_CATEGORY_SET = new Set<MarketCategory>([
  "stocks",
  "indices",
  "commodities",
  "forex",
])

/**
 * The full-width market picker used by the old Trading app, adapted to the
 * protocol-neutral rows Trade already loads. It owns display state only;
 * selection and saved stars stay with the workspace.
 */
export function MarketPicker({
  rows,
  selected,
  favorites,
  onToggleFavorite,
  onSelect,
}: {
  rows: MarketRow[]
  selected: MarketRow
  favorites: ReadonlySet<string>
  onToggleFavorite: (key: string) => void
  onSelect: (key: string) => void
}) {
  const triggerRef = React.useRef<HTMLButtonElement>(null)
  const [open, setOpen] = React.useState(false)
  /**
   * Opening by hovering, with a pause at each end.
   *
   * The pause going in stops the list flying open when the pointer only
   * crosses the name on its way somewhere else; the pause coming out is what
   * lets you travel the gap between the button and the panel without it
   * shutting in your face. Mouse only — a tap has no hover, and on a phone
   * this would open on the press that was meant to select.
   */
  const searchRef = React.useRef<HTMLInputElement>(null)
  const hoverTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const openedByHover = React.useRef(false)
  const clearHover = () => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current)
    hoverTimer.current = null
  }
  const hoverOpen = (event: React.PointerEvent) => {
    if (event.pointerType !== "mouse") return
    clearHover()
    hoverTimer.current = setTimeout(() => {
      openedByHover.current = true
      setOpen(true)
    }, 120)
  }
  const hoverClose = (event: React.PointerEvent) => {
    if (event.pointerType !== "mouse") return
    clearHover()
    hoverTimer.current = setTimeout(() => setOpen(false), 220)
  }
  React.useEffect(() => clearHover, [])
  const [borderColor, setBorderColor] = React.useState<string>()
  const [query, setQuery] = React.useState("")
  const [view, setView] = React.useState<PickerView>("all")
  const [category, setCategory] = React.useState<TradFiCategory>("all")
  const [sort, setSort] = React.useState<{
    key: PickerSortKey
    dir: "asc" | "desc"
  }>({ key: "volume", dir: "desc" })

  const visible = React.useMemo(() => {
    const trimmed = query.trim().toUpperCase()
    let list = rows.filter(
      (row) =>
        (row.volume24hUsd > 0 ||
          row.key === selected.key ||
          favorites.has(row.key)) &&
        (!trimmed ||
          row.symbol.toUpperCase().includes(trimmed) ||
          displaySymbol(row.symbol).toUpperCase().includes(trimmed))
    )

    if (view === "favorites") {
      list = list.filter((row) => favorites.has(row.key))
    } else if (view === "crypto") {
      list = list.filter((row) => row.category === "crypto")
    } else if (view === "tradfi") {
      list = list.filter((row) => TRADFI_CATEGORY_SET.has(row.category))
      if (category !== "all") {
        list = list.filter((row) => row.category === category)
      }
    } else if (view === "hip3") {
      list = list.filter((row) => row.subExchange !== null)
    } else if (view === "trending") {
      list = [...list]
        .sort((a, b) => b.volume24hUsd - a.volume24hUsd)
        .slice(0, 50)
    }

    const direction = sort.dir === "asc" ? 1 : -1
    return [...list].sort((a, b) => {
      if (sort.key === "market") {
        return (
          displaySymbol(a.symbol).localeCompare(displaySymbol(b.symbol)) *
          direction
        )
      }
      return (sortValue(a, sort.key) - sortValue(b, sort.key)) * direction
    })
  }, [category, favorites, query, rows, selected.key, sort, view])

  const toggleSort = (key: PickerSortKey) =>
    setSort((current) =>
      current.key === key
        ? { key, dir: current.dir === "desc" ? "asc" : "desc" }
        : { key, dir: key === "market" ? "asc" : "desc" }
    )

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next && triggerRef.current) {
          setBorderColor(
            getComputedStyle(triggerRef.current)
              .getPropertyValue("--border")
              .trim() || undefined
          )
        }
        setOpen(next)
        if (!next) {
          setQuery("")
          openedByHover.current = false
        }
      }}
    >
      <PopoverTrigger asChild>
        <button
          ref={triggerRef}
          type="button"
          aria-label="Choose market"
          onPointerEnter={hoverOpen}
          onPointerLeave={hoverClose}
          // Pressing the name while hovering has already opened it must not
          // shut it again — the press means "I want this", not "undo that".
          // It keeps the list up and hands over the keyboard, which is the one
          // thing a hover deliberately does not do.
          onClick={(event) => {
            if (!open || !openedByHover.current) return
            event.preventDefault()
            openedByHover.current = false
            searchRef.current?.focus()
          }}
          className="flex max-w-full items-center gap-1.5 rounded-md px-1 py-0.5 font-bold transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <span className="truncate">{selected.symbol}-PERP</span>
          <ChevronDownIcon className="size-3.5 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={8}
        onPointerEnter={clearHover}
        onPointerLeave={hoverClose}
        // Hovering must not take the keyboard. Opened by hand it still lands
        // in the search box, which is where somebody who pressed the button
        // wants to be; opened by a passing pointer, focus stays where it was.
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          // Pressed the button: land in the search box, which is what it is
          // for. Drifted over it: leave the keyboard where it was.
          if (!openedByHover.current) searchRef.current?.focus()
        }}
        style={
          borderColor
            ? ({ "--border": borderColor } as React.CSSProperties)
            : undefined
        }
        className="flex h-[min(72vh,640px)] w-[min(94vw,960px)] max-w-none flex-col gap-0 overflow-hidden rounded-xl p-0 ring-border"
      >
        <div className="flex flex-col gap-3 border-b p-3">
          <div className="relative">
            <SearchIcon className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={searchRef}
              type="search"
              value={query}
              placeholder="Search markets"
              aria-label="Search markets"
              className="h-10 rounded-lg bg-muted pl-9 shadow-none"
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-1" role="tablist">
            {PICKER_VIEWS.map((item) => (
              <PickerTab
                key={item.value}
                active={view === item.value}
                onClick={() => {
                  setView(item.value)
                  setCategory("all")
                }}
              >
                {item.label}
              </PickerTab>
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
              <PickerTab
                key={item.value}
                active={category === item.value}
                onClick={() => setCategory(item.value)}
                className="py-2"
              >
                {item.label}
              </PickerTab>
            ))}
          </div>
        ) : null}

        <ScrollArea className="min-h-0 flex-1">
          <Table className="min-w-[760px] text-xs [&_td:first-child]:pl-3 [&_td:last-child]:pr-3 [&_th:first-child]:pl-3 [&_th:last-child]:pr-3">
            <TableHeader className="sticky top-0 z-10 [&_th]:!shadow-none">
              <TableRow className="border-b">
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
              {visible.map((row) => (
                <MarketPickerRow
                  key={row.key}
                  row={row}
                  selected={row.key === selected.key}
                  favorite={favorites.has(row.key)}
                  onToggleFavorite={() => onToggleFavorite(row.key)}
                  onSelect={() => {
                    onSelect(row.key)
                    setOpen(false)
                  }}
                />
              ))}
            </TableBody>
          </Table>
          {visible.length === 0 ? (
            <div className="p-8 text-center text-xs text-muted-foreground">
              No matching markets.
            </div>
          ) : null}
        </ScrollArea>

        <div className="border-t px-3 py-2 text-xs text-muted-foreground">
          {visible.length} market{visible.length === 1 ? "" : "s"}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function PickerTab({
  active,
  className,
  children,
  onClick,
}: {
  active: boolean
  className?: string
  children: React.ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "border-b-2 px-1 py-1.5 text-xs font-medium transition-colors",
        active
          ? "border-primary text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground",
        className
      )}
    >
      {children}
    </button>
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

function MarketPickerRow({
  row,
  selected,
  favorite,
  onToggleFavorite,
  onSelect,
}: {
  row: MarketRow
  selected: boolean
  favorite: boolean
  onToggleFavorite: () => void
  onSelect: () => void
}) {
  const live = useLiveFigures(row.key)
  const price = live?.price ?? row.price
  const change = live?.change24h ?? row.change24h
  const funding = live?.fundingHourly ?? row.fundingHourly
  const volume = live?.volume24hUsd ?? row.volume24hUsd
  const openInterest = live?.openInterestUsd ?? row.openInterestUsd

  return (
    <TableRow
      data-state={selected ? "selected" : undefined}
      rowAction={onSelect}
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return
        event.preventDefault()
        onSelect()
      }}
    >
      <TableCell className="py-2 pl-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label={favorite ? "Remove from favorites" : "Add to favorites"}
            aria-pressed={favorite}
            onClick={onToggleFavorite}
            className="rounded p-0.5 text-muted-foreground/50 hover:text-amber-500 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <StarIcon
              className={cn(
                "size-4",
                favorite && "fill-amber-500 text-amber-500"
              )}
            />
          </button>
          <span className="font-semibold">
            {displaySymbol(row.symbol)}-USDC
          </span>
          {row.maxLeverage !== null ? (
            <span className="rounded bg-primary/10 px-1.5 py-0.5 text-primary">
              {row.maxLeverage}×
            </span>
          ) : null}
          {row.subExchange ? (
            <span className="rounded bg-primary/10 px-1.5 py-0.5 text-primary">
              {row.subExchange}
            </span>
          ) : null}
        </div>
      </TableCell>
      <TableCell className="font-mono tabular-nums">
        {formatPrice(price)}
      </TableCell>
      <TableCell
        className={cn(
          "font-mono tabular-nums",
          change === null ? "text-muted-foreground" : moneyTone(change)
        )}
      >
        {change === null ? "—" : formatChange(change)}
      </TableCell>
      <TableCell className="font-mono tabular-nums">
        {funding === null ? "—" : formatFunding(funding)}
      </TableCell>
      <TableCell className="font-mono tabular-nums">
        {formatCompactUsd(volume)}
      </TableCell>
      <TableCell className="font-mono tabular-nums">
        {openInterest === null ? "—" : formatCompactUsd(openInterest)}
      </TableCell>
    </TableRow>
  )
}

function displaySymbol(symbol: string): string {
  return symbol.includes(":") ? symbol.slice(symbol.indexOf(":") + 1) : symbol
}

function sortValue(
  row: MarketRow,
  key: Exclude<PickerSortKey, "market">
): number {
  switch (key) {
    case "price":
      return row.price
    case "change":
      return row.change24h ?? 0
    case "funding":
      return row.fundingHourly ?? 0
    case "volume":
      return row.volume24hUsd
    case "openInterest":
      return row.openInterestUsd ?? 0
  }
}
