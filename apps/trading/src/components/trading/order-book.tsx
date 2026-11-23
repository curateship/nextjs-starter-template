import * as React from "react"

import { formatPrice, pct } from "@/lib/format"
import { useL2Book } from "@/lib/hl/hooks"
import type { TradingNetwork } from "@/lib/hl/network"
import { cn } from "@/lib/utils"

const LEVELS = 11

export function OrderBook({
  network,
  coin,
  onPriceClick,
}: {
  network: TradingNetwork
  coin: string
  onPriceClick?: (px: string) => void
}) {
  const book = useL2Book(network, coin)

  const { bids, asks, maxTotal, spread, spreadPct } = React.useMemo(() => {
    const bidLevels = book?.levels[0]?.slice(0, LEVELS) ?? []
    const askLevels = book?.levels[1]?.slice(0, LEVELS) ?? []
    const withTotals = (levels: { px: string; sz: string }[]) => {
      let running = 0
      return levels.map((level) => {
        running += Number(level.sz)
        return { ...level, total: running }
      })
    }
    const bidRows = withTotals(bidLevels)
    const askRows = withTotals(askLevels)
    const max = Math.max(
      bidRows[bidRows.length - 1]?.total ?? 0,
      askRows[askRows.length - 1]?.total ?? 0,
      1
    )
    const bestBid = Number(bidLevels[0]?.px ?? 0)
    const bestAsk = Number(askLevels[0]?.px ?? 0)
    const mid = (bestBid + bestAsk) / 2
    return {
      bids: bidRows,
      asks: askRows,
      maxTotal: max,
      spread: bestAsk && bestBid ? bestAsk - bestBid : 0,
      spreadPct: mid ? ((bestAsk - bestBid) / mid) * 100 : 0,
    }
  }, [book])

  return (
    <div className="flex h-full flex-col text-xs">
      <div className="grid grid-cols-3 gap-x-2 border-b px-3 py-1.5 text-[11px] font-medium text-muted-foreground">
        <span>Price</span>
        <span className="text-right">Size</span>
        <span className="text-right">Total</span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col justify-end overflow-hidden">
        {[...asks].reverse().map((level) => (
          <BookRow
            key={`a-${level.px}`}
            side="ask"
            px={level.px}
            sz={level.sz}
            total={level.total}
            maxTotal={maxTotal}
            onClick={onPriceClick}
          />
        ))}
      </div>
      <div className="flex items-center justify-between border-y bg-muted/40 px-3 py-1 font-mono text-[11px] tabular-nums">
        <span className="text-muted-foreground">Spread</span>
        <span>
          {formatPrice(spread)}{" "}
          <span className="text-muted-foreground">
            ({pct(spreadPct, 3)})
          </span>
        </span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {bids.map((level) => (
          <BookRow
            key={`b-${level.px}`}
            side="bid"
            px={level.px}
            sz={level.sz}
            total={level.total}
            maxTotal={maxTotal}
            onClick={onPriceClick}
          />
        ))}
      </div>
      {!book ? (
        <div className="border-t px-3 py-2 text-center text-[11px] text-muted-foreground">
          Waiting for {coin} book…
        </div>
      ) : null}
    </div>
  )
}

function BookRow({
  side,
  px,
  sz,
  total,
  maxTotal,
  onClick,
}: {
  side: "bid" | "ask"
  px: string
  sz: string
  total: number
  maxTotal: number
  onClick?: (px: string) => void
}) {
  const depth = Math.min(100, (total / maxTotal) * 100)
  return (
    <button
      type="button"
      onClick={() => onClick?.(px)}
      className="relative grid shrink-0 grid-cols-3 gap-x-2 px-3 py-[3px] text-left font-mono tabular-nums hover:bg-muted/60"
    >
      <span
        aria-hidden
        className={cn(
          "absolute inset-y-0 right-0",
          side === "bid" ? "bg-emerald-500/10" : "bg-red-500/10"
        )}
        style={{ width: `${depth}%` }}
      />
      <span
        className={cn(
          "relative",
          side === "bid" ? "text-emerald-600" : "text-red-500"
        )}
      >
        {formatPrice(px)}
      </span>
      <span className="relative text-right">{sz}</span>
      <span className="relative text-right text-muted-foreground">
        {total.toLocaleString("en-US", { maximumFractionDigits: 2 })}
      </span>
    </button>
  )
}
