import * as React from "react"
import { SearchIcon } from "lucide-react"

import { formatPriceDisplay } from "@/components/trading/format"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useAllMids, useMarketRows } from "@/lib/hl/hooks"
import type { TradingNetwork } from "@/lib/hl/network"
import { cn } from "@/lib/utils"

export function MarketWatchlist({
  network,
  selected,
  onSelect,
}: {
  network: TradingNetwork
  selected: string
  onSelect: (coin: string) => void
}) {
  const rows = useMarketRows(network)
  const mids = useAllMids(network)
  const [query, setQuery] = React.useState("")

  const visible = React.useMemo(() => {
    const trimmed = query.trim().toUpperCase()
    const filtered = trimmed
      ? rows.filter((row) => row.coin.toUpperCase().includes(trimmed))
      : rows
    return [...filtered].sort(
      (a, b) => Number(b.dayNtlVlm) - Number(a.dayNtlVlm)
    )
  }, [rows, query])

  return (
    <div className="flex h-full flex-col">
      <div className="border-b p-2">
        <div className="relative">
          <SearchIcon className="absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            placeholder="Search markets"
            className="h-8 pl-7 text-xs"
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
      </div>
      <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 border-b px-3 py-1.5 text-[11px] font-medium text-muted-foreground">
        <span>Market</span>
        <span className="text-right">Price</span>
        <span className="w-14 text-right">24h</span>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div>
          {visible.map((row) => {
            const mid = mids[row.coin] ?? row.markPx
            const change = dayChangePct(mid, row.prevDayPx)
            return (
              <button
                key={row.coin}
                type="button"
                onClick={() => onSelect(row.coin)}
                className={cn(
                  "grid w-full grid-cols-[1fr_auto_auto] items-center gap-x-3 px-3 py-1.5 text-left text-xs hover:bg-muted/50",
                  selected === row.coin && "bg-muted"
                )}
              >
                <span className="flex min-w-0 items-baseline gap-1.5">
                  <span className="truncate font-medium">{row.coin}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {row.maxLeverage}x
                  </span>
                </span>
                <span className="text-right font-mono tabular-nums">
                  {formatPriceDisplay(mid)}
                </span>
                <span
                  className={cn(
                    "w-14 text-right font-mono tabular-nums",
                    change >= 0 ? "text-emerald-600" : "text-red-500"
                  )}
                >
                  {change >= 0 ? "+" : ""}
                  {change.toFixed(2)}%
                </span>
              </button>
            )
          })}
          {visible.length === 0 ? (
            <div className="px-3 py-8 text-center text-xs text-muted-foreground">
              {rows.length === 0 ? "Loading markets…" : "No matches."}
            </div>
          ) : null}
        </div>
      </ScrollArea>
    </div>
  )
}

function dayChangePct(mid: string, prevDayPx: string): number {
  const current = Number(mid)
  const previous = Number(prevDayPx)
  if (!previous || !Number.isFinite(current)) return 0
  return ((current - previous) / previous) * 100
}
