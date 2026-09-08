import * as React from "react"
import {
  ChevronDownIcon,
  GripVerticalIcon,
  PinIcon,
  PinOffIcon,
  Loader2Icon,
  SearchIcon,
} from "lucide-react"

import { Popover as PopoverPrimitive } from "radix-ui"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

import { CautionBadge } from "@/components/trade/caution-badge"
import { MarketFolderStar } from "@/components/trade/market-folder-star"
import { MarketIcon } from "@/components/trade/market-icon"
import { Button } from "@/components/ui/button"

import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSortButton,
} from "@/components/ui/table"
import type {
  MarketCategory,
  MarketPickerCapabilities,
  MarketRow,
} from "@/lib/protocols/contracts"
import {
  marketPickerViews,
  type MarketPickerSortKey,
  type MarketPickerView,
} from "@/lib/trade/market-picker-options"
import { formatChange, formatCompactUsd } from "@/lib/trade/format"
import { getMarketsErrorMessage } from "@/lib/api/trade/markets"
import { useLiveFigures } from "@/lib/trade/live-market"
import { moneyTone } from "@/lib/trade/money-tone"
import {
  favFolder,
  type MarketFolder,
  type MarketFolderActions,
} from "@/lib/trade/market-folders"
import { cn } from "@/lib/utils"

type TradFiCategory =
  | "all"
  | Extract<MarketCategory, "stocks" | "indices" | "commodities" | "forex">

const PICKER_VIEW_LABELS: Record<MarketPickerView, string> = {
  favorites: "Favorites",
  all: "All",
  crypto: "Crypto",
  tradfi: "TradFi",
  hip3: "HIP-3",
  trending: "Trending",
}

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
 * The market picker owns display filters and sorting. Market selection and
 * saved stars stay with the workspace.
 */
export function MarketPicker({
  rows,
  selected,
  capabilities,
  folders,
  folderActions,
  onSelect,
  venueLabel,
  onSearchBeyond,
}: {
  rows: MarketRow[]
  selected: MarketRow
  capabilities: MarketPickerCapabilities
  folders: readonly MarketFolder[]
  folderActions: MarketFolderActions
  onSelect: (key: string) => void
  /** The venue's printed name, for the lookup button: "Find … on Solana". */
  venueLabel: string
  /**
   * Looks a market up on the venue when the search matches nothing loaded.
   * Offered only where the catalogue's `picker.search` is true. The rows it
   * answers with are already folded into `rows` by the caller.
   */
  onSearchBeyond?: (query: string) => Promise<MarketRow[]>
}) {
  const triggerRef = React.useRef<HTMLButtonElement>(null)
  const [open, setOpen] = React.useState(false)
  const [filtersOpen, setFiltersOpen] = React.useState(false)
  const contentRef = React.useRef<HTMLDivElement>(null)
  const [pinnedAt, setPinnedAt] = React.useState<{
    x: number
    y: number
  } | null>(null)
  const [searchShown, setSearchShown] = React.useState(false)
  const drag = React.useRef<{ x: number; y: number } | null>(null)
  const anchor = React.useMemo(
    () => ({
      current: {
        getBoundingClientRect: () =>
          new DOMRect(pinnedAt?.x ?? 0, pinnedAt?.y ?? 0, 0, 0),
      },
    }),
    [pinnedAt]
  )
  const moveTo = React.useCallback((x: number, y: number) => {
    const bounds = contentRef.current?.getBoundingClientRect()
    if (!bounds) return
    setPinnedAt({
      x: Math.max(8, Math.min(x, window.innerWidth - bounds.width - 8)),
      y: Math.max(8, Math.min(y, window.innerHeight - bounds.height - 8)),
    })
  }, [])
  React.useEffect(() => {
    if (!pinnedAt) return
    const resize = () => moveTo(pinnedAt.x, pinnedAt.y)
    window.addEventListener("resize", resize)
    return () => window.removeEventListener("resize", resize)
  }, [pinnedAt, moveTo])
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
    if (event.pointerType !== "mouse" || pinnedAt || filtersOpen) return
    clearHover()
    hoverTimer.current = setTimeout(() => setOpen(false), 220)
  }
  React.useEffect(() => clearHover, [])
  const [query, setQuery] = React.useState("")
  /**
   * The lookup on the venue: not yet asked, asking, or what it said. Keyed
   * to the query it was asked for, so typing on clears it.
   */
  const [lookup, setLookup] = React.useState<{
    query: string
    state: "asking" | "nothing" | "failed"
    note?: string
  } | null>(null)
  const lookupFor = lookup?.query === query.trim() ? lookup : null
  /**
   * Keys of coins somebody went and found on the venue.
   *
   * **A found coin is never hidden for being quiet.** The list below drops a
   * row with no volume, which is right for a catalogue of thousands and
   * wrong for the one coin a person just asked for by name: the lookup
   * succeeded, the row arrived, and the picker swallowed it without a word.
   * Solana had 900 coins of 3,189 with no day's figures at all.
   */
  const [foundKeys, setFoundKeys] = React.useState<ReadonlySet<string>>(
    () => new Set()
  )
  const askVenue = async () => {
    const asked = query.trim()
    if (!onSearchBeyond || asked.length < 2) return
    setLookup({ query: asked, state: "asking" })
    try {
      const found = await onSearchBeyond(asked)
      setFoundKeys((was) => {
        const next = new Set(was)
        for (const row of found) next.add(row.key)
        return next
      })
      setLookup(found.length === 0 ? { query: asked, state: "nothing" } : null)
    } catch (error) {
      setLookup({
        query: asked,
        state: "failed",
        note: getMarketsErrorMessage(error),
      })
    }
  }
  const [views, setViews] = React.useState<Exclude<MarketPickerView, "all">[]>(
    []
  )
  const [categories, setCategories] = React.useState<TradFiCategory[]>([])
  const [sort, setSort] = React.useState<{
    key: MarketPickerSortKey
    dir: "asc" | "desc"
  }>({ key: "volume", dir: "desc" })
  const pickerViews = React.useMemo(
    () => marketPickerViews(capabilities, rows),
    [capabilities, rows]
  )
  const activeViews = React.useMemo(
    () => views.filter((view) => pickerViews.includes(view)),
    [views, pickerViews]
  )

  const visible = React.useMemo(() => {
    const trimmed = query.trim().toUpperCase()
    // Built once: the two places below both ask whether a row is saved, and
    // Hyperliquid's list is 1,300 rows long against a folder of up to 500.
    const favKeys = new Set(favFolder(folders)?.marketKeys ?? [])
    let list = rows.filter(
      (row) =>
        (row.volume24hUsd > 0 ||
          row.key === selected.key ||
          favKeys.has(row.key) ||
          foundKeys.has(row.key)) &&
        (!trimmed ||
          row.symbol.toUpperCase().includes(trimmed) ||
          displaySymbol(row.symbol).toUpperCase().includes(trimmed))
    )

    if (activeViews.length > 0) {
      const trendingKeys = activeViews.includes("trending")
        ? new Set(
            [...list]
              .sort((a, b) => b.volume24hUsd - a.volume24hUsd)
              .slice(0, 50)
              .map((row) => row.key)
          )
        : new Set<string>()
      list = list.filter((row) =>
        activeViews.some((view) => {
          switch (view) {
            case "favorites":
              return favKeys.has(row.key)
            case "crypto":
              return row.category === "crypto"
            case "tradfi":
              return (
                TRADFI_CATEGORY_SET.has(row.category) &&
                (categories.length === 0 ||
                  categories.some((category) => category === row.category))
              )
            case "hip3":
              return row.subExchange !== null
            case "trending":
              return trendingKeys.has(row.key)
          }
        })
      )
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
  }, [
    sort,
    activeViews,
    categories,
    folders,
    foundKeys,
    query,
    rows,
    selected.key,
  ])

  const toggleSort = (key: MarketPickerSortKey) =>
    setSort((current) =>
      current.key === key
        ? { key, dir: current.dir === "desc" ? "asc" : "desc" }
        : { key, dir: key === "market" ? "asc" : "desc" }
    )

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) {
          clearHover()
          setPinnedAt(null)
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
            setSearchShown(true)
            searchRef.current?.focus()
          }}
          className="flex h-full max-w-full min-w-0 items-center gap-1.5 rounded-l-lg px-2.5 font-bold transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <MarketIcon symbol={selected.symbol} iconUrl={selected.iconUrl} />
          <span className="truncate">
            {displaySymbol(selected.symbol)}-{selected.quoteAsset}
          </span>
          {selected.maxLeverage !== null ? (
            <span className="shrink-0 text-xs font-medium text-muted-foreground">
              {selected.maxLeverage}×
            </span>
          ) : null}
          <ChevronDownIcon className="size-3.5 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      {pinnedAt ? <PopoverPrimitive.Anchor virtualRef={anchor} /> : null}
      <PopoverContent
        ref={contentRef}
        aria-label="Markets"
        align="start"
        side="bottom"
        avoidCollisions={!pinnedAt}
        collisionPadding={8}
        sideOffset={pinnedAt ? 0 : 8}
        onInteractOutside={(event) => {
          if (pinnedAt || filtersOpen) event.preventDefault()
        }}
        onPointerEnter={clearHover}
        onPointerLeave={hoverClose}
        // A hover leaves keyboard focus alone; a click focuses the panel.
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          if (!openedByHover.current) contentRef.current?.focus()
        }}
        // Keep the catalogue compact on a desktop while still capping it to
        // the viewport on a narrow screen.
        className="flex h-[min(72vh,640px)] w-[28rem] max-w-[94vw] flex-col gap-0 overflow-hidden rounded-xl p-0"
      >
        <div className="flex flex-wrap items-center gap-2 border-b p-3">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Drag markets"
                aria-disabled={!pinnedAt}
                className={cn(
                  "touch-none",
                  pinnedAt
                    ? "cursor-grab active:cursor-grabbing"
                    : "cursor-default text-muted-foreground"
                )}
                onPointerDown={(event) => {
                  if (!pinnedAt || event.button !== 0) return
                  clearHover()
                  drag.current = {
                    x: event.clientX - pinnedAt.x,
                    y: event.clientY - pinnedAt.y,
                  }
                  event.currentTarget.setPointerCapture(event.pointerId)
                }}
                onPointerMove={(event) => {
                  if (drag.current)
                    moveTo(
                      event.clientX - drag.current.x,
                      event.clientY - drag.current.y
                    )
                }}
                onPointerUp={(event) => {
                  drag.current = null
                  if (event.currentTarget.hasPointerCapture(event.pointerId))
                    event.currentTarget.releasePointerCapture(event.pointerId)
                }}
                onLostPointerCapture={() => {
                  drag.current = null
                }}
                onPointerCancel={() => {
                  drag.current = null
                }}
                onKeyDown={(event) => {
                  if (
                    !pinnedAt ||
                    ![
                      "ArrowLeft",
                      "ArrowRight",
                      "ArrowUp",
                      "ArrowDown",
                    ].includes(event.key)
                  )
                    return
                  event.preventDefault()
                  moveTo(
                    pinnedAt.x +
                      (event.key === "ArrowLeft"
                        ? -20
                        : event.key === "ArrowRight"
                          ? 20
                          : 0),
                    pinnedAt.y +
                      (event.key === "ArrowUp"
                        ? -20
                        : event.key === "ArrowDown"
                          ? 20
                          : 0)
                  )
                }}
              >
                <GripVerticalIcon />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {pinnedAt
                ? "Drag or use arrow keys to move"
                : "Pin markets to enable dragging"}
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label={pinnedAt ? "Unpin markets" : "Pin markets"}
                aria-pressed={!!pinnedAt}
                onClick={() => {
                  clearHover()
                  const bounds = contentRef.current?.getBoundingClientRect()
                  setPinnedAt(
                    pinnedAt || !bounds ? null : { x: bounds.x, y: bounds.y }
                  )
                }}
              >
                {pinnedAt ? <PinOffIcon /> : <PinIcon />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {pinnedAt ? "Unpin markets" : "Pin markets"}
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Search markets"
                aria-expanded={searchShown}
                onClick={() => {
                  if (searchShown) setQuery("")
                  setSearchShown((shown) => !shown)
                }}
              >
                <SearchIcon />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Search markets</TooltipContent>
          </Tooltip>
          <DropdownMenu
            modal={false}
            open={filtersOpen}
            onOpenChange={(next) => {
              clearHover()
              setFiltersOpen(next)
            }}
          >
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                className="ml-auto"
                aria-label="Filter markets"
              >
                {activeViews.length
                  ? `Filters (${activeViews.length})`
                  : "All markets"}
                <ChevronDownIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="min-w-44"
              onPointerEnter={clearHover}
            >
              <DropdownMenuCheckboxItem
                checked={activeViews.length === 0}
                onSelect={(event) => event.preventDefault()}
                onCheckedChange={() => {
                  setViews([])
                  setCategories([])
                }}
              >
                All markets
              </DropdownMenuCheckboxItem>
              <DropdownMenuSeparator />
              {pickerViews
                .filter((view) => view !== "all")
                .map((view) => (
                  <DropdownMenuCheckboxItem
                    key={view}
                    checked={activeViews.includes(view)}
                    onSelect={(event) => event.preventDefault()}
                    onCheckedChange={(checked) =>
                      setViews((current) =>
                        checked
                          ? [...current, view]
                          : current.filter((item) => item !== view)
                      )
                    }
                  >
                    {PICKER_VIEW_LABELS[view]}
                  </DropdownMenuCheckboxItem>
                ))}
              {activeViews.includes("tradfi") ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>TradFi categories</DropdownMenuLabel>
                  {TRADFI_CATEGORIES.map(({ value, label }) => (
                    <DropdownMenuCheckboxItem
                      key={value}
                      checked={
                        value === "all"
                          ? categories.length === 0
                          : categories.includes(value)
                      }
                      onSelect={(event) => event.preventDefault()}
                      onCheckedChange={(checked) =>
                        setCategories((current) =>
                          value === "all"
                            ? []
                            : checked
                              ? [...current, value]
                              : current.filter((item) => item !== value)
                        )
                      }
                    >
                      {label}
                    </DropdownMenuCheckboxItem>
                  ))}
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {searchShown ? (
          <div className="border-b p-3">
            <Input
              ref={searchRef}
              autoFocus
              type="search"
              value={query}
              placeholder="Search markets"
              aria-label="Search markets"
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
        ) : null}
        {/*
         * The `ScrollArea` viewport is the one box that scrolls both ways, so
         * the sticky heading sticks to it. `Table`'s own sideways-scrolling
         * container is switched off (`overflow-visible`) — two nested scroll
         * boxes was what once left the viewport 10,889px tall with a heading
         * that scrolled away. Same shape as `TradeTablePanel`.
         */}
        <ScrollArea
          // Not `flex-1`: it shrinks to whatever room is left and scrolls, but
          // it never stretches past its rows, so "No matching markets" stays
          // under the heading instead of at the bottom of an empty window.
          className="min-h-0"
          viewportClassName="h-full"
        >
          <Table
            containerClassName="overflow-visible"
            className="min-w-[28rem] table-fixed text-xs [&_td:first-child]:pl-3 [&_td:last-child]:pr-3 [&_th:first-child]:pl-3 [&_th:last-child]:pr-3"
          >
            {/* Opaque, because rows now slide underneath it: the muted tint is
              half-transparent and only read correctly while nothing was behind
              it. Mixed with the window's own surface so it holds in dark mode. */}
            <TableHeader className="sticky top-0 z-10 [&_th]:bg-[color-mix(in_oklab,var(--muted)_50%,var(--popover))]">
              <TableRow>
                <PickerTableHead
                  label="Market"
                  sortKey="market"
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
                  label="Volume"
                  sortKey="volume"
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
                  folders={folders}
                  folderActions={folderActions}
                  // The list stays up after a pick. Putting one market
                  // after another on the chart is a single pass down the
                  // rows, not a reopen each time. Moving the pointer off the
                  // panel closes it, and so does Escape.
                  onSelect={() => onSelect(row.key)}
                />
              ))}
            </TableBody>
          </Table>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
        {visible.length === 0 ? (
          <div className="flex flex-col items-center gap-3 p-8 text-center text-xs text-muted-foreground">
            <span>No matching markets.</span>
            {/* An open network lists more coins than any list holds, so a
                miss here is an offer to ask the venue itself, by name or
                address. Offered, not automatic: each lookup spends one of
                the minute's requests. */}
            {capabilities.search &&
            onSearchBeyond &&
            query.trim().length >= 2 ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  disabled={lookupFor?.state === "asking"}
                  onClick={() => void askVenue()}
                >
                  {lookupFor?.state === "asking" ? (
                    <Loader2Icon className="size-4 animate-spin" />
                  ) : (
                    <SearchIcon className="size-4" />
                  )}
                  Find "{query.trim()}" on {venueLabel}
                </Button>
                {lookupFor?.state === "nothing" ? (
                  <span>
                    Nothing on {venueLabel} is called that. A coin with no price
                    is left out too.
                  </span>
                ) : lookupFor?.state === "failed" ? (
                  <span>{lookupFor.note}</span>
                ) : null}
              </>
            ) : null}
          </div>
        ) : null}

        <div className="border-t px-3 py-2 text-xs text-muted-foreground">
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
  sortKey: MarketPickerSortKey
  sort: { key: MarketPickerSortKey; dir: "asc" | "desc" }
  onSort: (key: MarketPickerSortKey) => void
}) {
  return (
    <TableHead
      className={cn(
        "h-9 px-2 text-xs text-muted-foreground",
        sortKey === "change" && "w-28",
        sortKey === "volume" && "w-24"
      )}
    >
      <TableSortButton
        className="gap-0"
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
  folders,
  folderActions,
  onSelect,
}: {
  row: MarketRow
  selected: boolean
  folders: readonly MarketFolder[]
  folderActions: MarketFolderActions
  onSelect: () => void
}) {
  const live = useLiveFigures(row.key)
  const change = live?.change24h ?? row.change24h
  const volume = live?.volume24hUsd ?? row.volume24hUsd

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
      <TableCell className="overflow-hidden py-2 pl-3">
        <div className="flex min-w-0 items-center gap-2 overflow-hidden">
          <MarketFolderStar
            compact
            symbol={row.symbol}
            marketKey={row.key}
            folders={folders}
            busy={folderActions.busy}
            onQuickAdd={() => folderActions.quickAdd(row.key)}
            onToggle={(folderId, saved) =>
              folderActions.toggle(row.key, folderId, saved)
            }
            onCreate={(name) => folderActions.create(row.key, name)}
          />
          <span className="min-w-0 truncate font-semibold">
            {displaySymbol(row.symbol)}-{row.quoteAsset}
          </span>
          {row.caution ? <CautionBadge caution={row.caution} /> : null}
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
      <TableCell
        className={cn(
          "font-mono tabular-nums",
          change === null ? "text-muted-foreground" : moneyTone(change)
        )}
      >
        {change === null ? "—" : formatChange(change)}
      </TableCell>
      <TableCell className="font-mono tabular-nums">
        {formatCompactUsd(volume)}
      </TableCell>
    </TableRow>
  )
}

function displaySymbol(symbol: string): string {
  return symbol.includes(":") ? symbol.slice(symbol.indexOf(":") + 1) : symbol
}

function sortValue(
  row: MarketRow,
  key: Exclude<MarketPickerSortKey, "market">
): number {
  switch (key) {
    case "change":
      return row.change24h ?? 0
    case "volume":
      return row.volume24hUsd
  }
}
