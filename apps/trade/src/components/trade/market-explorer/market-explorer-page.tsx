import { useTradePageTitle } from "@/app/page-title"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { TableSurface } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import type {
  ExplorerOpening,
  ExplorerVenue,
} from "@/lib/api/trade/market-explorer"
import { MADE_MONEY, WARNING } from "@/lib/trade/money-tone"
import { getLiveAdapter } from "@/lib/protocols/live-registry"
import {
  liveVenueStatus,
  marketHistory,
  useLiveFiguresMap,
} from "@/lib/trade/live-market"
import { StreamedVenue } from "./streamed-venue"
import { ExplorerControls } from "./explorer-controls"
import { explorerRows } from "./explorer-rows"
import { useExplorerFolders } from "./use-explorer-folders"
import { ExplorerTable } from "./explorer-table"
import {
  useExplorerClock,
  useExplorerLive,
  useExplorerPrefs,
  useExplorerVenues,
} from "./use-explorer"

function venueFreshness(venue: ExplorerVenue, now: number) {
  const catalog = venue.catalog
  if (!catalog) return "unavailable"
  if (getLiveAdapter(catalog.protocol)?.watchFigures) {
    const status = liveVenueStatus(catalog, now)
    return status === "stale" ? "reconnecting" : status
  }
  return catalog.priceRefresh
    ? `${catalog.priceRefresh.everyMs / 1000} sec`
    : "1 min"
}
export function MarketExplorerPage({ opening }: { opening: ExplorerOpening }) {
  useTradePageTitle("Markets")
  const now = useExplorerClock()
  const { prefs, change } = useExplorerPrefs(opening.prefs)
  const { venues, accept, retry, retrying, pending } = useExplorerVenues(
    opening,
    prefs.current.exchanges
  )
  const catalogs = useExplorerLive(venues, retry)
  const figures = useLiveFiguresMap(
    catalogs.flatMap((catalog) => catalog.rows.map((row) => row.key))
  )
  const folders = useExplorerFolders(prefs.current.exchanges)
  const rows = explorerRows(venues, figures, marketHistory, now, prefs.current)
  const count = catalogs.reduce((sum, catalog) => sum + catalog.rows.length, 0)
  const hidden = venues.reduce((sum, venue) => sum + venue.hidden, 0)
  return (
    <TableSurface className="flex min-h-0 min-w-0 flex-1 flex-col">
      {opening.venues.map((venue) => (
        <StreamedVenue key={venue.protocol} venue={venue} accept={accept} />
      ))}
      <div className="grid min-w-0 shrink-0 gap-3 p-3 sm:gap-4 sm:p-5 lg:p-6">
        <ExplorerControls
          prefs={prefs}
          change={change}
          opening={opening}
          venues={venues}
          summary={
            <span
              className="font-mono text-xs text-muted-foreground sm:text-sm"
              aria-live="polite"
            >
              {count.toLocaleString()} markets · {catalogs.length} exchanges
              {hidden > 0
                ? ` · ${hidden.toLocaleString()} hidden by volume setting`
                : ""}
              {pending > 0 ? ` · ${pending} exchanges loading` : ""}
            </span>
          }
        />
        <ScrollArea className="min-w-0" viewportClassName="pb-2 sm:pb-0">
          <div
            className="flex w-max items-center gap-2 sm:w-auto sm:flex-wrap"
            aria-label="Market feeds"
          >
            <span className="mr-1 font-mono text-xs tracking-wider text-muted-foreground">
              FEEDS
            </span>
            {venues.map((venue) => (
              <Badge
                key={venue.protocol}
                variant="outline"
                className="h-auto min-h-6 gap-1.5 border bg-muted/40 py-1"
                title={
                  venue.message ??
                  (venue.catalog?.priceRefresh
                    ? `Prices refresh for the busiest ${venue.catalog.priceRefresh.mostMarkets} markets`
                    : undefined)
                }
              >
                <span
                  aria-hidden="true"
                  className={`size-1.5 shrink-0 rounded-full bg-current ${venue.message ? "text-destructive" : ["connecting", "reconnecting"].includes(venueFreshness(venue, now)) ? WARNING : MADE_MONEY}`}
                />
                {venue.protocolLabel}
                <span className="font-mono font-normal text-muted-foreground">
                  {venueFreshness(venue, now)}
                </span>
                {venue.message && (
                  <Button
                    variant="ghost"
                    aria-busy={retrying.has(venue.protocol)}
                    aria-label={`Try ${venue.protocolLabel} again`}
                    onClick={() => void retry(venue.protocol)}
                  >
                    {retrying.has(venue.protocol) ? "Trying…" : "Try again"}
                  </Button>
                )}
              </Badge>
            ))}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </div>
      <ExplorerTable
        catalogVersion={catalogs
          .map((catalog) => `${catalog.protocol}:${catalog.rows.length}`)
          .join("|")}
        rows={rows}
        view={prefs.current}
        changeView={(current) =>
          change({
            ...prefs,
            current,
            views: prefs.views.map((view) =>
              view.id === prefs.activeView ? { ...view, view: current } : view
            ),
          })
        }
        pending={pending > 0 || (!count && retrying.size > 0)}
        failed={!count && venues.some((venue) => !!venue.message)}
        retry={() => {
          for (const venue of venues.filter((venue) => venue.message))
            void retry(venue.protocol)
        }}
        folders={folders}
      />
    </TableSurface>
  )
}
