import * as React from "react"
import { Link } from "@tanstack/react-router"
import { XIcon } from "lucide-react"

import type { AppHeaderLeftContentProps } from "@/lib/app-options"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  marketChartHref,
  marketSymbol,
  parseMarketKey,
} from "@/lib/protocols/contracts"
import { formatChange, formatPrice } from "@/lib/trade/format"
import { moneyTone } from "@/lib/trade/money-tone"
import { usePinnedMarkets } from "@/lib/trade/use-pinned-markets"
import { useHidePnlSync } from "@/lib/trade/use-hide-pnl-sync"

export default function PinnedMarketsHeader({
  fallback,
}: AppHeaderLeftContentProps) {
  const { pins, quotes, busy, failed, store } = usePinnedMarkets()
  // Not about pinned markets at all. This is the app's own control on the
  // signed-in header, so it is the one component drawn on every screen — and
  // the saved Hide profit and loss choice has to reach the page before any
  // figure is painted, whether or not anybody opens the settings cog.
  useHidePnlSync()
  React.useEffect(() => {
    let running = false
    const refresh = () => {
      if (document.visibilityState !== "visible" || running) return
      running = true
      void store.refresh().finally(() => {
        running = false
      })
    }
    const visibility = () => {
      store.clearPrices()
      if (document.visibilityState === "visible") refresh()
    }
    refresh()
    const timer = window.setInterval(refresh, 15_000)
    document.addEventListener("visibilitychange", visibility)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener("visibilitychange", visibility)
      store.clearPrices()
    }
  }, [store, busy])

  if (!pins.length)
    return (
      <>
        {fallback}
        {failed ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void store.refresh()}
          >
            Retry header pins
          </Button>
        ) : null}
      </>
    )
  return (
    <ScrollArea className="min-w-0 max-w-full">
      <nav
        aria-label="Pinned markets"
        className="flex w-max items-center gap-1"
      >
        {pins.map((key) => {
          const quote = quotes.find((item) => item.key === key)
          const symbol = quote?.symbol ?? marketSymbol(key)
          const ref = parseMarketKey(key)!
          const label = `${symbol}, ${ref.protocol}, ${ref.network}`
          const price = quote?.price ?? null
          const change = quote?.change24h ?? null
          return (
            <div key={key} className="flex min-w-0 items-center">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    asChild
                    variant="ghost"
                    size="sm"
                    className="min-w-0 gap-1 px-1"
                  >
                    <Link
                      to={marketChartHref(key)!}
                      aria-label={`Open ${label} chart`}
                    >
                      <span className="max-w-16 truncate">{symbol}</span>
                      <span className="hidden font-mono tabular-nums xl:inline">
                        {price === null ? "—" : formatPrice(price)}
                      </span>
                      <span
                        className={`hidden font-mono tabular-nums xl:inline ${change === null ? "text-muted-foreground" : moneyTone(change)}`}
                      >
                        {change === null ? "—" : formatChange(change)}
                      </span>
                    </Link>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {label}
                  {price === null
                    ? ". Price unavailable."
                    : `, ${formatPrice(price)}`}
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    disabled={busy}
                    aria-label={`Unpin ${label} from header`}
                    onClick={() => void store.setPin(key, false)}
                  >
                    <XIcon className="size-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {busy ? "Saving header pins" : `Unpin ${symbol} from header`}
                </TooltipContent>
              </Tooltip>
            </div>
          )
        })}
      </nav>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  )
}
