import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import * as React from "react"
import { useExplorerHoldings } from "./use-explorer-holdings"
import { ExplorerArrivalStrip } from "./explorer-arrivals"
import { ExplorerMap } from "./explorer-map"
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
  const [lastVisit] = React.useState(opening.prefs.lastVisit)
  const now = useExplorerClock()
  const { prefs, change } = useExplorerPrefs(opening.prefs, true)
  const { venues, accept, retry, retrying, pending } = useExplorerVenues(
    opening,
    prefs.current.exchanges
  )
  const catalogs = useExplorerLive(venues, retry)
  const figures = useLiveFiguresMap(
    catalogs.flatMap((catalog) => catalog.rows.map((row) => row.key))
  )
  const [folderNotice, setFolderNotice] = React.useState("")
  const folders = useExplorerFolders(prefs.current.exchanges, (name) => {
    if (prefs.current.folder !== name) return
    const current = { ...prefs.current, folder: "" }
    change({
      ...prefs,
      current,
      views: prefs.views.map((one) =>
        one.id === prefs.activeView ? { ...one, view: current } : one
      ),
    })
    setFolderNotice(
      `Folder ${name} was deleted. The folder filter was cleared.`
    )
  })
  const holdings = useExplorerHoldings()
  const folderNames = [
    ...new Set(
      Object.values(folders.folders).flatMap(
        (list) =>
          list?.map((folder) => (folder.isFav ? "Fav" : folder.name)) ?? []
      )
    ),
  ].sort()
  const rows = explorerRows(
    venues,
    figures,
    marketHistory,
    now,
    prefs.current,
    { folders: folders.folders, marks: holdings.marks }
  )
  const count = catalogs.reduce((sum, catalog) => sum + catalog.rows.length, 0)
  const hidden = venues.reduce((sum, venue) => sum + venue.hidden, 0)
  return (
    <TableSurface className="flex min-h-0 min-w-0 flex-1 flex-col">
      {opening.venues.map((venue) => (
        <StreamedVenue key={venue.protocol} venue={venue} accept={accept} />
      ))}
      <div className="min-w-0 shrink-0">
        <ExplorerControls
          folderNames={folderNames}
          prefs={prefs}
          change={change}
          opening={opening}
          venues={venues}
          summary={<Badge variant="secondary">{count.toLocaleString()}</Badge>}
          status={
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost">
                  Status
                  {holdings.error ||
                  holdings.failed > 0 ||
                  catalogs.some((catalog) => catalog.firstSeenError) ||
                  venues.some((venue) => venue.message)
                    ? " · needs attention"
                    : ` · ${catalogs.length} exchanges`}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80">
                <div className="grid gap-3">
                  <span
                    className="font-mono text-xs text-muted-foreground sm:text-sm"
                    aria-live="polite"
                  >
                    {count.toLocaleString()} markets · {catalogs.length}{" "}
                    exchanges
                    {hidden > 0
                      ? ` · ${hidden.toLocaleString()} hidden by volume setting`
                      : ""}
                    {folderNotice ? ` · ${folderNotice}` : ""}
                    {holdings.loading ? " · Wallets loading" : ""}
                    {holdings.failed > 0
                      ? ` · ${holdings.failed} wallet${holdings.failed === 1 ? "" : "s"} did not answer`
                      : ""}
                    {holdings.error
                      ? " · Wallet holdings could not be loaded"
                      : ""}
                    {catalogs.some((catalog) => catalog.firstSeenError)
                      ? " · First-seen dates unavailable"
                      : ""}
                    {pending > 0 ? ` · ${pending} exchanges loading` : ""}
                  </span>
                  <ScrollArea
                    className="min-w-0"
                    viewportClassName="pb-2 sm:pb-0"
                  >
                    <div
                      className="flex flex-wrap items-center gap-2"
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
                              {retrying.has(venue.protocol)
                                ? "Trying…"
                                : "Try again"}
                            </Button>
                          )}
                        </Badge>
                      ))}
                    </div>
                    <ScrollBar orientation="horizontal" />
                  </ScrollArea>
                </div>
              </PopoverContent>
            </Popover>
          }
        />
      </div>
      <ExplorerArrivalStrip
        sound={prefs.discoverySound}
        rows={rows}
        view={prefs.current}
      />
      {prefs.current.layout === "map" ? (
        <ExplorerMap
          key={JSON.stringify(prefs.current)}
          rows={rows}
          view={prefs.current}
          pending={pending > 0 || (prefs.current.onlyMine && holdings.loading)}
          failed={!count && venues.some((venue) => !!venue.message)}
          retry={() => {
            for (const venue of venues.filter((venue) => venue.message))
              void retry(venue.protocol)
          }}
        />
      ) : (
        <ExplorerTable
          lastVisit={lastVisit}
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
          pending={
            pending > 0 ||
            (prefs.current.onlyMine && holdings.loading) ||
            (!count && retrying.size > 0)
          }
          failed={!count && venues.some((venue) => !!venue.message)}
          retry={() => {
            for (const venue of venues.filter((venue) => venue.message))
              void retry(venue.protocol)
          }}
          folders={folders}
        />
      )}
    </TableSurface>
  )
}
