import { Button } from "@/components/ui/button"
import * as React from "react"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { marketChartHref } from "@/lib/protocols/contracts"
import { moneyTone } from "@/lib/trade/money-tone"
import { formatChange, formatCompactUsd, formatPrice } from "@/lib/trade/format"
import { marketPace } from "@/lib/trade/market-discovery"
import type { ExplorerView } from "@/lib/trade/market-explorer"
import type { ExplorerRow } from "./explorer-rows"

export function ExplorerMap({
  rows,
  view,
  pending = false,
  failed = false,
  retry,
}: {
  pending?: boolean
  failed?: boolean
  retry?: () => void
  rows: ExplorerRow[]
  view: ExplorerView
}) {
  const retryRef = React.useRef(retry)
  React.useEffect(() => {
    retryRef.current = retry
  }, [retry])
  const latest = React.useRef(rows)
  const [shown, setShown] = React.useState(rows)
  React.useEffect(() => {
    latest.current = rows
  })
  React.useEffect(() => {
    const reduced = matchMedia("(prefers-reduced-motion: reduce)")
    let last = 0
    const timer = setInterval(() => {
      if (document.hidden || (reduced.matches && Date.now() - last < 10_000))
        return
      last = Date.now()
      setShown(latest.current)
    }, 2000)
    return () => clearInterval(timer)
  }, [])
  const keys = rows
    .flatMap((row) => [row.key, ...row.children.map((child) => child.key)])
    .join("|")
  return React.useMemo(() => {
    const currentKeys = new Set(keys.split("|"))
    const markets = shown
      .flatMap((row) => (row.children.length ? row.children : [row]))
      .filter((row) => currentKeys.has(row.key))
      .sort((a, b) => b.volume24hUsd - a.volume24hUsd)
      .slice(0, 400)
    const maximum = Math.max(1, ...markets.map((row) => row.volume24hUsd))
    const groups = new Map<string, ExplorerRow[]>()
    for (const row of markets) {
      const members = groups.get(row.venue.protocolLabel) ?? []
      members.push(row)
      groups.set(row.venue.protocolLabel, members)
    }
    return (
      <ScrollArea
        className="min-h-0 flex-1 border-t"
        viewportClassName="h-full"
      >
        <div className="grid gap-3 p-3" aria-label="Market map">
          <p className="text-sm text-muted-foreground">
            {markets.length} busiest markets, up to 400. Square area follows 24h
            volume. Colour shows the chosen price move.
          </p>
          {!markets.length && (
            <div role="status">
              {pending ? (
                "Loading markets…"
              ) : failed ? (
                <>
                  The exchanges did not answer.{" "}
                  <Button
                    variant="outline"
                    onClick={() => retryRef.current?.()}
                  >
                    Try again
                  </Button>
                </>
              ) : (
                "0 markets match"
              )}
            </div>
          )}
          {[...groups].map(([venue, members]) => (
            <section key={venue} aria-label={venue} className="grid gap-2">
              <h2 className="text-sm font-medium">{venue}</h2>
              <div className="flex flex-wrap items-start gap-1">
                {members.map((row) => {
                  const move =
                    view.mapWindow === "24h"
                      ? row.change24h
                      : (row.windows[
                          view.mapWindow === "5s"
                            ? 5
                            : view.mapWindow === "1m"
                              ? 60
                              : 300
                        ]?.fraction ?? null)
                  const size = Math.max(
                    8,
                    Math.round(
                      Math.sqrt(Math.max(0, row.volume24hUsd) / maximum) * 160
                    )
                  )
                  return (
                    <MapSquare
                      key={row.key}
                      href={marketChartHref(row.key)}
                      symbol={row.symbol}
                      venue={venue}
                      move={move}
                      size={size}
                      price={row.price}
                      volume={row.volume24hUsd}
                      pace={marketPace(row.volume24hUsd, row.windows[60])}
                    />
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      </ScrollArea>
    )
  }, [shown, keys, view.mapWindow, pending, failed])
}

const MapSquare = React.memo(function MapSquare({
  href,
  symbol,
  venue,
  move,
  size,
  price,
  volume,
  pace,
}: {
  href: string | null
  symbol: string
  venue: string
  move: number | null
  size: number
  price: number
  volume: number
  pace: number | null
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <a
          href={href ?? undefined}
          tabIndex={0}
          aria-label={`${symbol} on ${venue}, ${move === null ? "waiting for samples" : formatChange(move)}`}
          style={{
            width: size,
            height: size,
            backgroundColor: move
              ? `color-mix(in srgb, currentColor ${Math.min(30, 8 + Math.abs(move) * 1000)}%, transparent)`
              : undefined,
          }}
          className={`flex shrink-0 items-center justify-center truncate rounded-sm border text-xs ${moneyTone(move ?? 0) ?? "bg-muted"}`}
        >
          {size >= 24 && <span className="truncate px-1">{symbol}</span>}
        </a>
      </TooltipTrigger>
      <TooltipContent>
        <div className="grid gap-1">
          <span>
            {venue} · {symbol}
          </span>
          <span>Price {formatPrice(price)}</span>
          <span className={moneyTone(move ?? 0)}>
            Move {move === null ? "—" : formatChange(move)}
          </span>
          <span>24h volume {formatCompactUsd(volume)}</span>
          <span>Pace {pace === null ? "—" : `${pace.toFixed(1)}× usual`}</span>
        </div>
      </TooltipContent>
    </Tooltip>
  )
})
