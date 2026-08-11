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
import {
  marketBelongsInTab,
  type MarketTab,
} from "@/lib/trade/market-tabs"
import { formatChange, formatCompactUsd } from "@/lib/trade/format"
import { useLiveFigures } from "@/lib/trade/live-market"
import {
  type MarketCatalog,
  type MarketRow,
  type NetworkId,
} from "@/lib/protocols/contracts"
import { cn } from "@/lib/utils"

/**
 * Fav is the starred set and the one the panel opens on — the markets you
 * actually trade are a short list, and scrolling past hundreds of others to
 * reach them every time is the wrong default. All is the whole catalog, one
 * click away, and where stars are put on in the first place. Watch is every
 * listed market with a smart order still working.
 */
type SortKey = "vol" | "change"

/** Which way a column starts when you first click it: biggest first, both. */
const SORT_STARTS_DESC: Record<SortKey, boolean> = {
  vol: true,
  change: true,
}

/**
 * The one set of columns the header row and every market row are both drawn
 * with — same side padding, same gap between columns. Written once because the
 * whole point is that the two agree; two copies would drift apart the first
 * time either was touched.
 *
 * 16px each side, the same gutter the other panels' headers use, so the list
 * sits in from the card's edge rather than up against it. The rows are inside
 * a container with its own `p-1`, so their buttons carry 12px to reach it.
 */
const ROW_COLUMNS = "gap-1 px-4"
const ROW_COLUMNS_INSIDE_LIST = "gap-1 px-3"

/**
 * The width the day's-move column reserves. Set by the widest thing in it,
 * which is the "Change 24h" header rather than any pill — with the column
 * fixed, the pills line up under that label without needing a width of their
 * own.
 */
const CHANGE_COLUMN = "w-[5.5rem]"

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
  network,
  favorites,
  watched,
  selectedKey,
  onSelect,
  onRetry,
}: {
  catalogs: MarketCatalog[]
  /** The exchange call failed at load; shown in place of rows. */
  marketsError: string | null
  /** Which network the whole page is on — testnet wears its label row. */
  network: NetworkId
  /** Which markets are starred — read only; the star itself is in the header. */
  favorites: ReadonlySet<string>
  /** Which markets currently have an active smart order in any wallet. */
  watched: ReadonlySet<string>
  selectedKey: string | null
  onSelect: (key: string) => void
  onRetry: () => void
}) {
  const [tab, setTab] = React.useState<MarketTab>("fav")
  const [query, setQuery] = React.useState("")
  const [sort, setSort] = React.useState<{ key: SortKey; desc: boolean }>({
    key: "vol",
    desc: true,
  })
  // Clicking the sorted column flips it; clicking another column takes over at
  // the direction that column starts in.
  const toggleSort = (key: SortKey) =>
    setSort((current) =>
      current.key === key
        ? { ...current, desc: !current.desc }
        : { key, desc: SORT_STARTS_DESC[key] }
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
        // market and every starred or watched one stays visible at zero volume.
        (row.volume24hUsd > 0 ||
          row.key === selectedKey ||
          favorites.has(row.key) ||
          watched.has(row.key)) &&
        (!trimmed || row.symbol.toUpperCase().includes(trimmed))
    )
    list = list.filter((row) =>
      marketBelongsInTab(tab, row.key, favorites, watched)
    )
    const direction = sort.desc ? -1 : 1
    return [...list].sort((a, b) => {
      const [va, vb] =
        sort.key === "vol"
          ? [a.volume24hUsd, b.volume24hUsd]
          : [a.change24h ?? 0, b.change24h ?? 0]
      return (va - vb) * direction
    })
  }, [rows, query, tab, sort, favorites, watched, selectedKey])

  const sourceLabels = catalogs
    .map((catalog) => `${catalog.protocolLabel} ${catalog.networkLabel}`)
    .join(", ")

  const list = (
    // `[&>div]:block!` because Radix wraps what it is given in a `display:
    // table` box, which sizes itself to its widest row instead of to the
    // panel — a long symbol would then push the change pill out of sight
    // rather than being truncated.
    <ScrollArea className="h-full" viewportClassName="[&>div]:block!">
      {marketsError ? (
        <div className="p-3">
          <ErrorBanner message={marketsError} onRetry={onRetry} />
        </div>
      ) : visible.length === 0 ? (
        <p className="px-3 py-8 text-center text-xs text-muted-foreground">
          {query.trim()
            ? "No market matches that search."
            : tab === "fav"
              ? "Nothing starred yet. Open a market and press the star beside its name — it stays here."
              : tab === "watch"
                ? "No active smart orders yet. Place one from a chart and its market appears here."
              : "The exchange listed no markets."}
        </p>
      ) : (
        <div className="flex flex-col p-1">
          {visible.map((row) => (
            <MarketRowLine
              key={row.key}
              row={row}
              selected={row.key === selectedKey}
              onSelect={() => onSelect(row.key)}
            />
          ))}
        </div>
      )}
    </ScrollArea>
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
            value="fav"
            icon={<StarIcon className="size-4 fill-current" />}
            label="Fav"
          />
          <WorkspacePanelTab
            value="all"
            icon={<LayoutGridIcon className="size-4" />}
            label="All"
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
          symbols, middle over the kinds, right header over the changes. */}
      {/* Scrolls sideways at the narrowest drags rather than wrapping a
          label onto two lines. */}
      {/* The headers use the row's own columns — same padding, same gap, the
          first one stretching and the last one at the fixed CHANGE_COLUMN
          width — so every label sits over the values it names. Spreading them
          evenly instead lines up only the left one. */}
      <div
        className={cn(
          "flex shrink-0 items-center overflow-x-auto border-b text-muted-foreground",
          ROW_COLUMNS
        )}
      >
        {/* Stays at the small size on every screen — the table default steps
            up to text-sm on wide screens, which overpowers a narrow panel. The
            label-to-arrow gap is tightened for the same reason. */}
        <TableSortButton
          active={sort.key === "vol"}
          direction={sort.desc ? "desc" : "asc"}
          onClick={() => toggleSort("vol")}
          className="flex-1 gap-1 whitespace-nowrap sm:text-xs"
        >
          24h Vol
        </TableSortButton>
        <TableSortButton
          active={sort.key === "change"}
          direction={sort.desc ? "desc" : "asc"}
          onClick={() => toggleSort("change")}
          // Reversed so the label sits flush right over the pills and the
          // arrow points in toward the middle.
          className={cn(
            "shrink-0 flex-row-reverse gap-1 whitespace-nowrap sm:text-xs",
            CHANGE_COLUMN
          )}
        >
          Change 24h
        </TableSortButton>
      </div>

      <TabsContent value="fav" className="min-h-0 flex-1">
        {list}
      </TabsContent>
      <TabsContent value="all" className="min-h-0 flex-1">
        {list}
      </TabsContent>
      <TabsContent value="watch" className="min-h-0 flex-1">
        {list}
      </TabsContent>

      {/* The practice network has no switch on screen any more — paper
          wallets are the everyday practice path, and the rehearsal gate the
          switch existed for has been passed (decided 9 Aug 2026, in
          `testnet-mode.md`). The door is the address (`?network=testnet`, or
          any testnet market's link — a testnet row in the bottom panel still
          works). While the page IS on testnet, this row says so, always —
          the labelling rule outlives the switch. */}
      {network === "testnet" ? (
        <div className="shrink-0 border-t bg-amber-500/10 px-3 py-1.5">
          <span className="block truncate text-xs font-medium text-amber-700 dark:text-amber-400">
            Testnet — practice network, pretend money.
          </span>
        </div>
      ) : null}

      {/* The search names the exchange, so what the list covers stays clear
          without spending another row or control on it. */}
      <div className="shrink-0 border-t p-2">
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
          className="h-8 min-w-0"
        />
      </div>
    </Tabs>
  )
}

/**
 * One market: what it is called, what kind of thing it is, and the day's move.
 * The whole row is the one button — the star that used to sit at its left edge
 * now lives in the market header, where it is always on screen.
 */
function MarketRowLine({
  row,
  selected,
  onSelect,
}: {
  row: MarketRow
  selected: boolean
  onSelect: () => void
}) {
  // Subscribed per row, so a tick repaints exactly the rows whose numbers
  // moved. The list's ORDER stays on the loaded snapshot on purpose — rows
  // shuffling under the pointer every second would be worse than a sort
  // that catches up on the next refetch.
  const live = useLiveFigures(row.key)
  const change24h = live?.change24h ?? row.change24h
  const volume24hUsd = live?.volume24hUsd ?? row.volume24hUsd

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "flex h-9 min-w-0 items-center rounded-lg text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        ROW_COLUMNS_INSIDE_LIST,
        selected ? "bg-muted" : "hover:bg-muted/50"
      )}
    >
      {/* The name gives way first, and carries its full self in a title —
          a long sub-exchange symbol must not push the day's move off the
          panel. The day's volume sits beside it, quiet, because it is what
          the list is sorted by: the order stops being a mystery. */}
      <span className="flex min-w-0 flex-1 items-baseline gap-1.5">
        <span
          title={row.symbol}
          className="min-w-0 truncate text-sm font-medium"
        >
          {row.symbol}
        </span>
        <span className="shrink-0 text-xs text-muted-foreground/60 tabular-nums">
          {formatCompactUsd(volume24hUsd)}
        </span>
      </span>
      {/* Just the day's move, in a soft pill of its colour — the price
          belongs to the market header. A market with no yesterday price
          shows a plain dash, not a zero in a pill. The column is fixed and the
          pill sits at its right edge, so pills of different lengths still end
          in a straight line under the header. */}
      <span className={cn("flex shrink-0 justify-end", CHANGE_COLUMN)}>
        <span
          className={cn(
            "text-xs tabular-nums",
            change24h === null
              ? "text-muted-foreground"
              : cn(
                  "rounded-full px-2 py-0.5",
                  change24h >= 0
                    ? "bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400"
                    : "bg-destructive/10 text-destructive dark:bg-destructive/20"
                )
          )}
        >
          {change24h === null ? "—" : formatChange(change24h)}
        </span>
      </span>
    </button>
  )
}
