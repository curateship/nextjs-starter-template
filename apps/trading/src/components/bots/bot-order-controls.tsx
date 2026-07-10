import { Loader2Icon } from "lucide-react"

import {
  num,
  price as fmtPrice,
  signedUsd,
  usd,
} from "@/components/backtest/backtest-format"
import { Kpi, Row } from "@/components/kpi"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { BotDetailResponse, BotMarketState } from "@/lib/api/bots"
import type { BotStrategyType } from "@/lib/strategies/params"
import { cn } from "@/lib/utils"

/** TP/SL/exit orders among the bot's resting orders. */
const PROTECTIVE_PURPOSE = /:(tp|stop|exit)(\b|$|:)/

/**
 * Right rail of the bot workspace: live KPIs, the current position, and the
 * editable stop-loss / take-profit controls. Applying uses the existing
 * update path — the bot restarts its logic with the new protection while the
 * position and all other parameters stay untouched. Archived legacy bots are
 * read-only, so they show their state without the editor.
 */
export function BotOrderControls({
  strategy,
  market,
  mode,
  draft,
  dirty,
  busy,
  error,
  mid,
  state,
  stats,
  openOrders,
  onDraftChange,
  onApply,
}: {
  strategy: BotStrategyType
  market: string
  mode: "paper" | "live"
  draft: Record<string, string>
  dirty: boolean
  busy: boolean
  error: string | null
  mid: number
  state: BotMarketState | null
  stats: BotDetailResponse["stats"]
  openOrders: BotDetailResponse["open_orders"]
  onDraftChange: (key: string, value: string) => void
  onApply: () => void
}) {
  const editable = strategy === "signal"
  const position = state?.paper_position
  const hasPosition = Boolean(position && Number(position.szi) !== 0)
  const long = hasPosition ? Number(position!.szi) > 0 : true
  const entryPx = hasPosition ? Number(position!.entryPx) : 0
  const uPnl =
    hasPosition && mid > 0 ? (mid - entryPx) * Number(position!.szi) : 0
  const winRate =
    stats.wins + stats.losses > 0
      ? (stats.wins / (stats.wins + stats.losses)) * 100
      : null
  const protective = openOrders.filter((order) =>
    PROTECTIVE_PURPOSE.test(order.purpose)
  )

  /** "→ 2,590.0" target-price preview for a % level off the entry price. */
  const targetHint = (key: string, above: boolean) => {
    const pct = Number(draft[key])
    if (!(pct > 0) || !(entryPx > 0)) return ""
    const px = above ? entryPx * (1 + pct / 100) : entryPx * (1 - pct / 100)
    return `→ ${fmtPrice(px)}`
  }

  const pctInput = (key: string, label: string, hint: string) => (
    <div className="flex flex-col gap-1">
      <Label className="text-[11px] text-muted-foreground">{label}</Label>
      <div className="relative">
        <Input
          value={draft[key] ?? ""}
          inputMode="decimal"
          disabled={busy}
          className={hint ? "pr-24" : undefined}
          onChange={(event) => onDraftChange(key, event.target.value.trim())}
        />
        {hint ? (
          <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 font-mono text-[11px] text-muted-foreground tabular-nums">
            {hint}
          </span>
        ) : null}
      </div>
    </div>
  )

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between border-b px-3 py-2.5">
        <span className="text-[11px] font-semibold text-foreground/80">
          Order Controls
        </span>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col">
          <div className="grid grid-cols-2 gap-2 p-3">
            <Kpi
              label="Realized PnL"
              value={signedUsd(stats.realized_pnl)}
              sub="since start"
              tone={stats.realized_pnl}
            />
            <Kpi
              label="Win Rate"
              value={winRate !== null ? `${winRate.toFixed(0)}%` : "—"}
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
                  : mode === "live"
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

          <div className="flex flex-col gap-2 px-3 pb-3">
            <span className="text-[11px] font-semibold text-foreground/80">
              Current Position
            </span>
            {hasPosition ? (
              <Card size="sm">
                <CardContent className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <span
                      className={cn(
                        "text-xs font-semibold",
                        long ? "text-emerald-600" : "text-red-500"
                      )}
                    >
                      {long ? "Long" : "Short"}
                    </span>
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {num(Math.abs(Number(position!.szi)), 4)} {market}
                    </span>
                  </div>
                  <Row label="Entry" value={fmtPrice(entryPx)} />
                  <Row label="Mark" value={mid > 0 ? fmtPrice(mid) : "—"} />
                  <Row label="Unreal. P&L" value={signedUsd(uPnl)} tone={uPnl} />
                </CardContent>
              </Card>
            ) : (
              <div className="rounded-lg border border-dashed p-4 text-center text-[11px] text-muted-foreground">
                Flat — no open position
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2 px-3 pb-3">
            <span className="text-[11px] font-semibold text-foreground/80">
              {editable ? "Protective Orders — editable" : "Protective Orders"}
            </span>
            {editable ? (
              <>
                {pctInput(
                  "takeProfitPct",
                  "Take profit % (empty = none)",
                  targetHint("takeProfitPct", long)
                )}
                {pctInput(
                  "stopLossPct",
                  "Stop loss % (empty = none)",
                  targetHint("stopLossPct", !long)
                )}
                {error ? (
                  <div className="rounded-md border border-destructive/30 bg-destructive/10 px-2.5 py-1.5 text-[11px] text-destructive">
                    {error}
                  </div>
                ) : null}
                <Button
                  type="button"
                  size="sm"
                  className="w-full"
                  disabled={!dirty || busy}
                  onClick={onApply}
                >
                  {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
                  Update SL / TP
                </Button>
                <p className="text-[10px] leading-snug text-muted-foreground">
                  Applies to the running bot in a few seconds — it re-derives
                  its protective orders from the new levels. Position and
                  strategy parameters are untouched. You can also drag the
                  TP/SL lines on the chart, or right-click the chart to add
                  one — both save instantly.
                </p>
              </>
            ) : (
              <div className="rounded-lg border border-dashed p-4 text-center text-[11px] text-muted-foreground">
                This bot is archived — its protection can no longer be edited.
              </div>
            )}
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
                    {order.sz} @ {order.px ? fmtPrice(Number(order.px)) : "mkt"}
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
    </div>
  )
}
