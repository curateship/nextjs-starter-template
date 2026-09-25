import { formatPrice, pct, signedUsd, usd } from "@/lib/format"
import { BotStatusBadge } from "@/components/bots/bot-status-badge"
import { Kpi, MarkPriceInline } from "@/components/kpi"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { BotDetailResponse, BotMarketState } from "@/lib/api/bots"
import { cn } from "@/lib/utils"

/** TP/SL/exit orders among the bot's resting orders. */
const PROTECTIVE_PURPOSE = /:(tp|stop|exit)(\b|$|:)/

/**
 * Left summary rail of a live bot run: identity + status + the selected
 * market's live price, the four account KPIs, and the resting protective
 * orders. Mirrors the backtest workspace's summary panel, fed live.
 */
export function BotSummaryPanel({
  bot,
  state,
  stats,
  openOrders,
  selectedMarket,
  markPrice,
  dayChangePct,
}: {
  bot: BotDetailResponse["bot"]
  state: BotMarketState | null
  stats: BotDetailResponse["stats"]
  /** Selected market's resting orders. */
  openOrders: BotDetailResponse["open_orders"]
  selectedMarket: string
  markPrice: number
  dayChangePct: number | null
}) {
  const winRate =
    stats.wins + stats.losses > 0
      ? (stats.wins / (stats.wins + stats.losses)) * 100
      : null
  const protective = openOrders.filter((order) =>
    PROTECTIVE_PURPOSE.test(order.purpose)
  )
  const sourceType =
    bot.params.kind === "automation" ? "Automation" : "Strategy"
  const sourceName = bot.source_name ?? sourceType
  const interval =
    "interval" in bot.params ? String(bot.params.interval) : "tick"
  const quickInfo = [
    `running ${formatRunningFor(bot.created_at)}`,
    `${sourceName} · ${interval}`,
    `${stats.trade_count} fills`,
  ].join(" · ")

  return (
    <ScrollArea className="h-full min-h-0">
      <div className="flex flex-col">
        <div className="flex flex-col gap-2 border-b p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="font-medium">
              {sourceType}
            </Badge>
            <Badge variant={bot.mode === "live" ? "default" : "secondary"}>
              {bot.mode}
            </Badge>
            <BotStatusBadge bot={bot} />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-bold">{selectedMarket}</span>
            <MarkPriceInline
              markPrice={markPrice}
              dayChangePct={dayChangePct}
              className="leading-tight"
            />
          </div>
          <span className="font-mono text-[11px] text-muted-foreground">
            {quickInfo}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2 p-3">
          <Kpi
            label="Realized PnL"
            value={signedUsd(stats.realized_pnl)}
            sub="since start"
            tone={stats.realized_pnl}
          />
          <Kpi
            label="Win Rate"
            value={winRate !== null ? pct(winRate, 0) : "—"}
            sub={`${stats.wins}W / ${stats.losses}L`}
          />
          <Kpi
            label="Equity"
            value={
              state?.paper_cash !== null && state?.paper_cash !== undefined
                ? usd(state.paper_cash)
                : "—"
            }
            sub={
              state?.peak_equity
                ? `peak ${usd(state.peak_equity)}`
                : bot.mode === "live"
                  ? "live wallet"
                  : "cash"
            }
          />
          <Kpi
            label="Daily PnL"
            value={state ? signedUsd(state.daily_realized_pnl) : "—"}
            sub="resets daily"
            tone={state?.daily_realized_pnl}
          />
        </div>

        {protective.length > 0 ? (
          <div className="flex flex-col gap-2 px-3 pb-3">
            <span className="text-[11px] font-semibold text-foreground/80">
              Resting protective orders
            </span>
            {protective.map((order) => (
              <div
                key={order.id}
                className="flex items-center justify-between text-[10.5px]"
              >
                <span
                  className={cn(
                    "font-mono font-semibold",
                    order.side === "buy" ? "text-emerald-600" : "text-red-500"
                  )}
                >
                  {order.purpose.split(":").pop()?.toUpperCase()}{" "}
                  {order.side.toUpperCase()}
                </span>
                <span className="font-mono">
                  {order.sz} @ {order.px ? formatPrice(Number(order.px)) : "mkt"}
                </span>
                <span className="rounded border px-1 py-px text-[9px] text-muted-foreground">
                  {order.status}
                </span>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </ScrollArea>
  )
}

/** "12d 4h" / "3h" / "<1h" since the bot was created. */
function formatRunningFor(createdAt: string): string {
  const ms = Date.now() - Date.parse(createdAt)
  if (!(ms > 0)) return "<1h"
  const hours = Math.floor(ms / 3_600_000)
  if (hours < 1) return "<1h"
  const days = Math.floor(hours / 24)
  if (days < 1) return `${hours}h`
  const rem = hours % 24
  return rem > 0 ? `${days}d ${rem}h` : `${days}d`
}
