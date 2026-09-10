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
import { formatChange } from "@/lib/trade/format"
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

  /*
    Pins sit BESIDE the normal navigation, never instead of it.

    They used to replace it: pinning a market took the section's links out of
    the header, so the way to the other protocols vanished the moment somebody
    used the pin. The header's own row is a flex line with a gap, so returning
    both puts the links first and the chips after them, and the links keep
    their own overflow menu.
  */
  return (
    <>
      {fallback}
      {pins.length ? (
        <ScrollArea className="max-w-full min-w-0">
          <nav
            aria-label="Pinned markets"
            className="flex w-max items-center gap-1"
          >
            {pins.map((key) => {
              const quote = quotes.find((item) => item.key === key)
              const symbol = quote?.symbol ?? marketSymbol(key)
              const ref = parseMarketKey(key)!
              const label = `${symbol}, ${ref.protocol}, ${ref.network}`
              const change = quote?.change24h ?? null
              return (
                /*
                  ONE hovered surface for the whole chip, the same height as a
                  navigation link beside it.

                  The market and the unpin cross used to be two buttons, each
                  shading only itself: hovering the name lit a short pill that
                  stopped before the cross, and the cross lit a second one. The
                  hover now belongs to this wrapper — `h-8 rounded-md
                  hover:bg-muted`, the same three the top-left links use — and
                  the two controls inside paint no background of their own.
                */
                <div
                  key={key}
                  className="inline-flex h-8 min-w-0 items-center gap-1 rounded-md pr-1 pl-2.5 text-sm font-medium transition-all hover:bg-muted"
                >
                  {/*
                    No tooltip on the chip.

                    It named the protocol, the network and the price, and it
                    covered the row under the header every time the pointer
                    crossed a pin on its way somewhere else. The chip already
                    says the two things worth knowing, and the chart it opens
                    says the rest. `aria-label` still carries the full
                    description for a screen reader.
                  */}
                  <Link
                    to={marketChartHref(key)!}
                    aria-label={`Open ${label} chart`}
                    className="inline-flex min-w-0 items-center gap-1 rounded-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    <span className="max-w-16 truncate">{symbol}</span>
                    {/*
                      The day's change, and no price anywhere. The price was
                      the longest thing on the chip and the least looked at,
                      and the chart this opens is where it is read now.

                      The figure sits right after the symbol, sized to what it
                      says. It had a fixed-width column for a while, which
                      right-aligned a short percentage and left a visible hole
                      between the two. `tabular-nums` is what actually holds
                      the row steady: every digit is the same width, so a
                      figure ticking from -2.15% to -2.17% moves nothing.
                    */}
                    <span
                      className={`hidden font-mono tabular-nums xl:inline ${change === null ? "text-muted-foreground" : moneyTone(change)}`}
                    >
                      {change === null ? "—" : formatChange(change)}
                    </span>
                  </Link>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        disabled={busy}
                        aria-label={`Unpin ${label} from header`}
                        onClick={() => void store.setPin(key, false)}
                        className="inline-flex size-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50"
                      >
                        <XIcon className="size-3" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>
                      {busy
                        ? "Saving header pins"
                        : `Unpin ${symbol} from header`}
                    </TooltipContent>
                  </Tooltip>
                </div>
              )
            })}
          </nav>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      ) : null}
      {failed ? (
        <Button variant="ghost" size="sm" onClick={() => void store.refresh()}>
          Retry header pins
        </Button>
      ) : null}
    </>
  )
}
