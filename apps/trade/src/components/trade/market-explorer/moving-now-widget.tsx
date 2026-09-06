import * as React from "react"

import { DashboardCardHeader } from "@/components/shared/dashboard-card-header"
import { Button } from "@/components/ui/button"
import { CardTitle } from "@/components/ui/card"
import { TableSurface } from "@/components/ui/table"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import { LoadingRow } from "@/components/ui/loading-row"
import {
  loadMarketExplorer,
  type ExplorerOpening,
} from "@/lib/api/trade/market-explorer"
import { marketChartHref } from "@/lib/protocols/contracts"
import { formatChange, formatCompactUsd } from "@/lib/trade/format"
import { marketHistory, useLiveFiguresMap } from "@/lib/trade/live-market"
import { DEFAULT_EXPLORER_VIEW } from "@/lib/trade/market-explorer"
import { moneyTone } from "@/lib/trade/money-tone"
import { explorerRows, sortExplorerRows } from "./explorer-rows"
import { StreamedVenue } from "./streamed-venue"
import {
  useExplorerClock,
  useExplorerLive,
  useExplorerVenues,
} from "./use-explorer"

export function MovingNowWidget({ className }: { className?: string }) {
  const [opening, setOpening] = React.useState<ExplorerOpening | null>(null)
  const [failed, setFailed] = React.useState(false)
  const [attempt, setAttempt] = React.useState(0)
  React.useEffect(() => {
    let alive = true
    void loadMarketExplorer()
      .then((answer) => {
        if (alive) setOpening(answer)
      })
      .catch(() => {
        if (alive) setFailed(true)
      })
    return () => {
      alive = false
    }
  }, [attempt])
  return (
    <TableSurface className={cn("flex min-h-0 flex-col", className)}>
      <DashboardCardHeader>
        <CardTitle>Moving now</CardTitle>
        <a className="ml-auto text-sm underline" href="/admin/markets">
          All markets
        </a>
      </DashboardCardHeader>
      <ScrollArea className="min-h-0 flex-1">
        <div className="p-3">
          {opening ? (
            <MovingNowList opening={opening} />
          ) : failed ? (
            <p>
              Markets could not load.{" "}
              <Button
                variant="ghost"
                onClick={() => {
                  setFailed(false)
                  setAttempt((value) => value + 1)
                }}
              >
                Try again
              </Button>
            </p>
          ) : (
            <LoadingRow label="Loading markets…" />
          )}
        </div>
      </ScrollArea>
    </TableSurface>
  )
}
function MovingNowList({ opening }: { opening: ExplorerOpening }) {
  const now = useExplorerClock()
  const { venues, accept, retry, retrying, pending } =
    useExplorerVenues(opening)
  const catalogs = useExplorerLive(venues, retry)
  const figures = useLiveFiguresMap(
    catalogs.flatMap((catalog) => catalog.rows.map((row) => row.key))
  )
  const view = { ...DEFAULT_EXPLORER_VIEW, sort: "traded1m" as const }
  const rows = sortExplorerRows(
    explorerRows(venues, figures, marketHistory, now, view),
    view
  )
    .filter((row) => row.windows[60])
    .slice(0, 10)
  return (
    <>
      {opening.venues.map((venue) => (
        <StreamedVenue key={venue.protocol} venue={venue} accept={accept} />
      ))}
      {rows.length ? (
        <ol className="grid gap-2">
          {rows.map((row) => (
            <li
              key={row.key}
              className="flex items-center justify-between gap-2 text-sm"
            >
              <a
                className="truncate hover:underline"
                href={marketChartHref(row.key) ?? "/admin/markets"}
              >
                {row.symbol} · {row.venue.protocolLabel}
              </a>
              <span className="whitespace-nowrap tabular-nums">
                {formatCompactUsd(row.windows[60]!.traded)} est.{" "}
                <span className={moneyTone(row.windows[60]!.fraction)}>
                  {formatChange(row.windows[60]!.fraction)}
                </span>
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-muted-foreground">
          {pending
            ? "Loading markets…"
            : "Waiting for one uninterrupted minute of live figures."}
        </p>
      )}
      {venues
        .filter((venue) => venue.message)
        .map((venue) => (
          <p key={venue.protocol} className="text-sm">
            {venue.protocolLabel} did not answer.{" "}
            <Button
              variant="ghost"
              aria-busy={retrying.has(venue.protocol)}
              aria-label={`Try ${venue.protocolLabel} again`}
              onClick={() => void retry(venue.protocol)}
            >
              Try again
            </Button>
          </p>
        ))}
    </>
  )
}
