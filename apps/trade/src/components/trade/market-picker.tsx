import * as React from "react"
import { z } from "zod"
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
import { Button } from "@/components/ui/button"

import { DashboardToolbarSearch } from "@/components/shared/dashboard-toolbar"
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
import {
  MARKET_CATEGORIES,
  type MarketCategory,
  type MarketPickerCapabilities,
  type MarketRow,
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
import { useEffectBeforePaint } from "@/lib/hooks/use-effect-before-paint"

const FILTER_STORAGE_KEY = "trade-market-picker-filters"
const filterSchema = z.object({
  views: z.array(z.enum(["favorites", "crypto", "tradfi", "hip3", "trending"])),
  categories: z.array(z.enum(["stocks", "indices", "commodities", "forex"])),
})
type PickerFilters = z.infer<typeof filterSchema>

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
  inline = false,
}: {
  rows: MarketRow[]
  selected: MarketRow
  capabilities: MarketPickerCapabilities
  folders: readonly MarketFolder[]
  folderActions: MarketFolderActions
  onSelect: (key: string) => void
  /**
   * The list drawn straight into the page, with no button and no popover:
   * the bottom bar's Browse panel under 1280px (Tyler, 13 Nov 2026).
   * It cannot be pinned or dragged there, and the table fits the panel's width.
   */
  inline?: boolean
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
  // A click opens the list, never a hover (Tyler, 15 Oct 2026: "make it
  // click dropdown instead").
  const searchRef = React.useRef<HTMLInputElement>(null)
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
  const [filters, setFilters] = React.useState<PickerFilters>({
    views: [],
    categories: [],
  })
  const { views, categories } = filters
  useEffectBeforePaint(() => {
    try {
      const saved = window.localStorage.getItem(FILTER_STORAGE_KEY)
      if (!saved) return
      const parsed = filterSchema.safeParse(JSON.parse(saved))
      if (parsed.success) setFilters(parsed.data)
    } catch {
      // Blocked storage or an unreadable preference leaves all markets visible.
    }
  }, [])
  const chooseFilters = (next: PickerFilters) => {
    setFilters(next)
    try {
      window.localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(next))
    } catch {
      // Filters still work for this visit when the browser refuses storage.
    }
  }
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

  const list = (
    <>
      <div className="flex flex-wrap items-center gap-2 border-b p-3">
        {inline ? null : (
          <>
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
          </>
        )}
        {/* The box itself, not a magnifier that reveals one. Typing was the
            commonest thing done here and it cost a press to reach, with the
            field then taking a row of its own under the toolbar (Tyler,
            14 Sep 2026). */}
        <DashboardToolbarSearch
          ref={searchRef}
          className="sm:flex-1"
          inputClassName="sm:w-full lg:w-full"
          value={query}
          placeholder="Search markets"
          aria-label="Search markets"
          onChange={(event) => setQuery(event.target.value)}
        />
        <DropdownMenu
          modal={false}
          open={filtersOpen}
          onOpenChange={(next) => {
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
          >
            <DropdownMenuCheckboxItem
              checked={activeViews.length === 0}
              onSelect={(event) => event.preventDefault()}
              onCheckedChange={() => {
                chooseFilters({ views: [], categories: [] })
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
                    chooseFilters({
                      ...filters,
                      views: checked
                        ? [...views, view]
                        : views.filter((item) => item !== view),
                    })
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
                      chooseFilters({
                        ...filters,
                        categories:
                          value === "all"
                            ? []
                            : checked
                              ? [...categories, value]
                              : categories.filter((item) => item !== value),
                      })
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
          className={cn(
            !inline && "min-w-[28rem]",
            "table-fixed text-xs [&_td:first-child]:pl-3 [&_td:last-child]:pr-3 [&_th:first-child]:pl-3 [&_th:last-child]:pr-3"
          )}
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
                narrow={inline}
              />
              <PickerTableHead
                label="Volume"
                sortKey="volume"
                sort={sort}
                onSort={toggleSort}
                narrow={inline}
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
        {marketsCounted(visible)}
      </div>
    </>
  )

  if (inline) {
    return (
      // Room on top for the bottom bar panel's knob.
      <section aria-label="Markets" className="flex min-h-0 flex-1 flex-col pt-3">
        {list}
      </section>
    )
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) {
          setPinnedAt(null)
          setQuery("")
        }
      }}
    >
      <PopoverTrigger asChild>
        {/* Drawn as a search box, the shared toolbar search's look, that opens
            the market list with its own search box ready to type in (Tyler,
            10 Nov 2026: "turn the browse button into a search box and
            clicking it will open the browse market modal"). It is 30%
            narrower than the toolbar search ("reduce the search field by
            30%"). */}
        <button
          ref={triggerRef}
          type="button"
          aria-label="Browse market"
          className="flex h-8 w-[126px] min-w-0 shrink items-center gap-2 rounded-lg border border-input bg-transparent px-2.5 text-left text-sm text-muted-foreground transition-colors outline-none hover:bg-muted/50 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-expanded:border-ring lg:w-[168px] dark:bg-input/30"
        >
          <SearchIcon className="size-4 shrink-0" aria-hidden />
          <span className="truncate">Search markets</span>
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
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          // Opened from the header's search box, so the typing carries on in
          // the list's own box.
          searchRef.current?.focus()
        }}
        // Keep the catalogue compact on a desktop while still capping it to
        // the viewport on a narrow screen.
        className="flex h-[min(72vh,640px)] w-[28rem] max-w-[94vw] flex-col gap-0 overflow-hidden rounded-xl p-0"
      >
        {list}
      </PopoverContent>
    </Popover>
  )
}

/** What each kind of market is called when the footer counts it. */
const CATEGORY_WORDS: Record<MarketCategory, string> = {
  crypto: "crypto",
  stocks: "stock",
  indices: "index",
  commodities: "commodity",
  forex: "FX",
  other: "other",
}

/**
 * The footer's count, broken down by what the markets are: "95 crypto and 44
 * stock markets".
 *
 * **One number could not answer the question it was asked.** A list filtered
 * to stocks and a list of everything both said "96 markets", so the line said
 * how long the list was and nothing about what was in it (Tyler, 14 Sep 2026).
 *
 * Kinds keep the catalogue's own order — crypto first — so the sentence does
 * not reshuffle itself as prices move a market in or out.
 */
export function marketsCounted(rows: readonly MarketRow[]): string {
  const counts = new Map<MarketCategory, number>()
  for (const row of rows) {
    counts.set(row.category, (counts.get(row.category) ?? 0) + 1)
  }
  const word = rows.length === 1 ? "market" : "markets"
  const parts = MARKET_CATEGORIES.filter((category) =>
    counts.get(category)
  ).map((category) => `${counts.get(category)} ${CATEGORY_WORDS[category]}`)
  if (parts.length === 0) return `0 ${word}`
  if (parts.length === 1) return `${parts[0]} ${word}`
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]} ${word}`
}

function PickerTableHead({
  label,
  sortKey,
  sort,
  onSort,
  narrow = false,
}: {
  label: string
  sortKey: MarketPickerSortKey
  sort: { key: MarketPickerSortKey; dir: "asc" | "desc" }
  onSort: (key: MarketPickerSortKey) => void
  /** The figures' columns pulled in, so a phone-wide list keeps the name. */
  narrow?: boolean
}) {
  return (
    <TableHead
      className={cn(
        "h-9 px-2 text-xs text-muted-foreground",
        sortKey === "change" && (narrow ? "w-20" : "w-28"),
        sortKey === "volume" && (narrow ? "w-20" : "w-24")
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
          <span
            className="min-w-0 truncate font-semibold"
            title={`${displaySymbol(row.symbol)}-${row.quoteAsset}`}
          >
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
