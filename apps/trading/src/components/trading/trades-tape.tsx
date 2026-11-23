import { formatPrice } from "@/lib/format"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useTrades } from "@/lib/hl/hooks"
import type { TradingNetwork } from "@/lib/hl/network"
import { cn } from "@/lib/utils"

export function TradesTape({
  network,
  coin,
}: {
  network: TradingNetwork
  coin: string
}) {
  const trades = useTrades(network, coin)

  return (
    <div className="flex h-full flex-col text-xs">
      <div className="grid grid-cols-3 gap-x-2 border-b px-3 py-1.5 text-[11px] font-medium text-muted-foreground">
        <span>Price</span>
        <span className="text-right">Size</span>
        <span className="text-right">Time</span>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div>
          {trades.map((trade) => (
            <div
              key={trade.tid}
              className="grid grid-cols-3 gap-x-2 px-3 py-[3px] font-mono tabular-nums"
            >
              <span
                className={cn(
                  trade.side === "B" ? "text-emerald-600" : "text-red-500"
                )}
              >
                {formatPrice(trade.px)}
              </span>
              <span className="text-right">{trade.sz}</span>
              <span className="text-right text-muted-foreground">
                {new Date(trade.time).toLocaleTimeString("en-US", {
                  hour12: false,
                })}
              </span>
            </div>
          ))}
          {trades.length === 0 ? (
            <div className="px-3 py-8 text-center text-[11px] text-muted-foreground">
              Waiting for trades…
            </div>
          ) : null}
        </div>
      </ScrollArea>
    </div>
  )
}
