import * as React from "react"
import { BellIcon, LayoutGridIcon, StarIcon } from "lucide-react"

import {
  WorkspacePanelTab,
  WorkspacePanelTabsHeader,
} from "@/components/shared/workspace-panel-header"
import { ErrorBanner } from "@/components/ui/error-banner"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { TableSortButton } from "@/components/ui/table"
import { Tabs, TabsContent } from "@/components/ui/tabs"
import { formatChange } from "@/lib/trade/format"
import type { MarketCatalog, MarketRow } from "@/lib/protocols/contracts"
import { cn } from "@/lib/utils"

/**
 * All is the whole catalog — in this app the panel *is* the market list, so a
 * brand-new account still sees a market to pick. Fav is the starred set, and
 * Watch will be the markets with an alert once alerts exist.
 */
type MarketTab = "all" | "fav" | "watch"

type SortKey = "vol" | "change"

/**
 * The left panel: every market the connected exchanges list, and the ways
 * you slice them.
 *
 * Shaped like the automation canvas's palette, its sibling on the other
 * workspace: the underline tab row is the top of the panel, the sort row sits
 * under it, the list fills the middle, and the search is the bottom bar.
 *
 * Handed rows and callbacks; it neither knows nor asks which exchange a row
 * came from. The source line by the search is the only place an exchange's
 * name appears, and it arrives as data.
 */
export function MarketListPanel({
  catalogs,
  marketsError,
  favorites,
  selectedKey,
  onSelect,
  onToggleFavorite,
  onRetry,
}: {
  catalogs: MarketCatalog[]
  /** The exchange call failed at load; shown in place of rows. */
  marketsError: string | null
  favorites: ReadonlySet<string>
  selectedKey: string | null
  onSelect: (key: string) => void
  onToggleFavorite: (key: string) => void
  onRetry: () => void
}) {
  const [tab, setTab] = React.useState<MarketTab>("all")
  const [query, setQuery] = React.useState("")
  const [sort, setSort] = React.useState<{ key: SortKey; desc: boolean }>({
    key: "vol",
    desc: true,
  })

  // Clicking the sorted column flips it; clicking the other column takes
  // over, biggest first.
  const toggleSort = (key: SortKey) =>
    setSort((current) =>
      current.key === key
        ? { ...current, desc: !current.desc }
        : { key, desc: true }
    )

  const rows = React.useMemo(
    () => catalogs.flatMap((catalog) => catalog.rows),
    [catalogs]
  )

  const visible = React.useMemo(() => {
    const trimmed = query.trim().toUpperCase()
    let list = rows.filter(
      (row) =>
        // A market nobody trades is noise — unless it is yours: the selected
        // market and every starred one stay visible at zero volume.
        (row.volume24hUsd > 0 ||
          row.key === selectedKey ||
          favorites.has(row.key)) &&
        (!trimmed || row.symbol.toUpperCase().includes(trimmed))
    )
    if (tab === "fav") list = list.filter((row) => favorites.has(row.key))

    const direction = sort.desc ? -1 : 1
    return [...list].sort((a, b) => {
      const [va, vb] =
        sort.key === "vol"
          ? [a.volume24hUsd, b.volume24hUsd]
          : [a.change24h ?? 0, b.change24h ?? 0]
      return (va - vb) * direction
    })
  }, [rows, query, tab, sort, favorites, selectedKey])

  const sourceLabels = catalogs
    .map((catalog) => `${catalog.protocolLabel} ${catalog.networkLabel}`)
    .join(", ")

  const list = (
    <ScrollArea className="h-full">
      {marketsError ? (
        <div className="p-3">
          <ErrorBanner message={marketsError} onRetry={onRetry} />
        </div>
      ) : visible.length === 0 ? (
        <p className="px-3 py-8 text-center text-xs text-muted-foreground">
          {query.trim()
            ? "No market matches that search."
            : tab === "fav"
              ? "Nothing starred yet. Star a market and it stays here."
              : "The exchange listed no markets."}
        </p>
      ) : (
        <div className="flex flex-col p-1">
          {visible.map((row) => (
            <MarketRowLine
              key={row.key}
              row={row}
              selected={row.key === selectedKey}
              favorite={favorites.has(row.key)}
              onSelect={() => onSelect(row.key)}
              onToggleFavorite={() => onToggleFavorite(row.key)}
            />
          ))}
        </div>
      )}
    </ScrollArea>
  )

  /** The tabs that cannot have rows yet say what they are waiting for. */
  const waiting = (message: string) => (
    <p className="px-3 py-8 text-center text-xs text-muted-foreground">
      {message}
    </p>
  )

  return (
    <Tabs
      value={tab}
      onValueChange={(value) => setTab(value as MarketTab)}
      className="h-full min-h-0 flex-1 gap-0 overflow-hidden bg-card"
    >
      {/* Row one: the same underline tab row as the automation palette. */}
      <div className="shrink-0 overflow-x-auto">
        <WorkspacePanelTabsHeader>
          <WorkspacePanelTab
            value="all"
            icon={<LayoutGridIcon className="size-4" />}
            label="All"
          />
          <WorkspacePanelTab
            value="fav"
            icon={<StarIcon className="size-4 fill-current" />}
            label="Fav"
          />
          <WorkspacePanelTab
            value="watch"
            icon={<BellIcon className="size-4" />}
            label="Watch"
          />
        </WorkspacePanelTabsHeader>
      </div>

      {/* Row two: the sort, drawn as the column headers it sorts — the same
          sort buttons every dashboard table uses. Left header over the
          symbols, right header over the changes. */}
      {/* Scrolls sideways at the narrowest drags rather than wrapping a
          label onto two lines. */}
      <div className="flex shrink-0 items-center justify-between gap-2 overflow-x-auto border-b border-foreground/10 px-3 text-muted-foreground">
        {/* Stays at the small size on every screen — the table default steps
            up to text-sm on wide screens, which overpowers a 16%-wide panel. */}
        <TableSortButton
          active={sort.key === "vol"}
          direction={sort.desc ? "desc" : "asc"}
          onClick={() => toggleSort("vol")}
          className="whitespace-nowrap sm:text-xs"
        >
          Market / 24h Vol
        </TableSortButton>
        <TableSortButton
          active={sort.key === "change"}
          direction={sort.desc ? "desc" : "asc"}
          onClick={() => toggleSort("change")}
          // Reversed so the label sits flush right under the change column
          // and the arrow points in toward the middle.
          className="flex-row-reverse whitespace-nowrap sm:text-xs"
        >
          Change 24h
        </TableSortButton>
      </div>

      <TabsContent value="all" className="min-h-0 flex-1">
        {list}
      </TabsContent>
      <TabsContent value="fav" className="min-h-0 flex-1">
        {list}
      </TabsContent>
      <TabsContent value="watch" className="min-h-0 flex-1">
        {waiting(
          "Markets you have an alert on. Alerts are not built yet — when they are, this fills in."
        )}
      </TabsContent>

      {/* The bottom bar: the search. Its placeholder names the exchange, so
          what the list covers is on screen without spending a row on it. */}
      <div className="shrink-0 border-t border-foreground/10 p-2">
        <Input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={
            sourceLabels ? `Search ${sourceLabels}` : "No exchange connected"
          }
          aria-label={
            sourceLabels ? `Search ${sourceLabels}` : "Search markets"
          }
          className="h-8"
        />
      </div>
    </Tabs>
  )
}

/**
 * One market. Two buttons side by side — the star, then the row — because a
 * button inside a button is not HTML, and the keyboard should reach both.
 */
function MarketRowLine({
  row,
  selected,
  favorite,
  onSelect,
  onToggleFavorite,
}: {
  row: MarketRow
  selected: boolean
  favorite: boolean
  onSelect: () => void
  onToggleFavorite: () => void
}) {
  return (
    <div
      className={cn(
        "group flex items-center rounded-lg",
        selected && "bg-muted"
      )}
    >
      <button
        type="button"
        aria-label={
          favorite ? `Unstar ${row.symbol}` : `Star ${row.symbol}`
        }
        aria-pressed={favorite}
        onClick={onToggleFavorite}
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
          // Revealed by hover or keyboard focus — but a finger has neither,
          // so on touch screens the star is simply always there.
          favorite
            ? "text-amber-500"
            : "text-transparent group-hover:text-muted-foreground focus-visible:text-muted-foreground pointer-coarse:text-muted-foreground"
        )}
      >
        <StarIcon
          className="size-3.5"
          fill={favorite ? "currentColor" : "none"}
        />
      </button>
      <button
        type="button"
        onClick={onSelect}
        aria-current={selected ? "true" : undefined}
        className="flex h-9 min-w-0 flex-1 items-center justify-between gap-2 rounded-md pr-2 text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <span className="truncate text-sm font-medium">{row.symbol}</span>
        {/* Just the day's move, in a soft pill of its colour — the price
            belongs to the market header. A market with no yesterday price
            shows a plain dash, not a zero in a pill. */}
        <span
          className={cn(
            "shrink-0 text-xs tabular-nums",
            row.change24h === null
              ? "text-muted-foreground"
              : cn(
                  "rounded-full px-2 py-0.5",
                  row.change24h >= 0
                    ? "bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400"
                    : "bg-destructive/10 text-destructive dark:bg-destructive/20"
                )
          )}
        >
          {row.change24h === null ? "—" : formatChange(row.change24h)}
        </span>
      </button>
    </div>
  )
}
