import { Loader2Icon } from "lucide-react"

import {
  num,
  price as fmtPrice,
  signedUsd,
  toneClass,
  usd,
} from "@/components/backtest/backtest-format"
import { Field } from "@/components/bots/strategy-param-fields"
import {
  pctFromMid,
  type ParamValues,
} from "@/components/bots/strategy-params-form"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { BotDetailResponse, BotMarketState } from "@/lib/api/bots"
import type { StrategyType } from "@/lib/strategies/params"
import { cn } from "@/lib/utils"

/** TP/SL/exit orders among the bot's resting orders. */
const PROTECTIVE_PURPOSE = /:(tp|stop|exit)(\b|$|:)/

/**
 * Right rail of the bot workspace: live KPIs, the current position, and the
 * editable stop-loss / take-profit controls. Applying uses the existing
 * update path — the bot restarts its logic with the new protection while the
 * position and all other parameters stay untouched.
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
  strategy: StrategyType
  market: string
  mode: "paper" | "live"
  draft: ParamValues
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
              Protective Orders — editable
            </span>
            <ProtectiveFields
              strategy={strategy}
              draft={draft}
              busy={busy}
              mid={mid}
              long={long}
              entryPx={entryPx}
              anchorPx={anchorPxOf(state)}
              onDraftChange={onDraftChange}
            />
            {error ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-2.5 py-1.5 text-[11px] text-destructive">
                {error}
              </div>
            ) : null}
            {strategy !== "copy" ? (
              <>
                <Button
                  type="button"
                  size="sm"
                  className="w-full"
                  disabled={!dirty || busy}
                  onClick={onApply}
                >
                  {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
                  {strategy === "momentum" ? "Update Stop" : "Update SL / TP"}
                </Button>
                <p className="text-[10px] leading-snug text-muted-foreground">
                  Applies to the running bot in a few seconds — it re-derives
                  its protective orders from the new levels. Position and
                  strategy parameters are untouched.
                </p>
              </>
            ) : null}
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

/** DCA safety ladder anchor from the strategy's runtime state. */
function anchorPxOf(state: BotMarketState | null): number {
  const strategyState = (state?.strategy_state ?? {}) as {
    anchorPx?: number | null
  }
  return Number(strategyState.anchorPx ?? 0)
}

function ProtectiveFields({
  strategy,
  draft,
  busy,
  mid,
  long,
  entryPx,
  anchorPx,
  onDraftChange,
}: {
  strategy: StrategyType
  draft: ParamValues
  busy: boolean
  mid: number
  long: boolean
  entryPx: number
  anchorPx: number
  onDraftChange: (key: string, value: string) => void
}) {
  const pctInput = (
    key: string,
    label: string,
    hint: string,
    disabled = false
  ) => (
    <Field label={label}>
      <div className="relative">
        <Input
          value={draft[key] ?? ""}
          inputMode="decimal"
          disabled={busy || disabled}
          className={hint ? "pr-24" : undefined}
          onChange={(event) => onDraftChange(key, event.target.value.trim())}
        />
        {hint ? (
          <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 font-mono text-[11px] text-muted-foreground tabular-nums">
            {hint}
          </span>
        ) : null}
      </div>
    </Field>
  )

  /** "→ 2,590.0" target-price preview for a % level off a reference price. */
  const targetHint = (key: string, ref: number, above: boolean) => {
    const pct = Number(draft[key])
    if (!(pct > 0) || !(ref > 0)) return ""
    const px = above ? ref * (1 + pct / 100) : ref * (1 - pct / 100)
    return `→ ${fmtPrice(px)}`
  }

  switch (strategy) {
    case "grid":
      return (
        <>
          {pctInput(
            "takeProfitPx",
            "Take profit price (empty = none)",
            pctFromMid(draft.takeProfitPx, mid)
          )}
          {pctInput(
            "stopLossPx",
            "Stop loss price (empty = none)",
            pctFromMid(draft.stopLossPx, mid)
          )}
        </>
      )
    case "dca":
      return (
        <>
          {pctInput(
            "takeProfitPct",
            "Take profit % (from avg entry)",
            targetHint("takeProfitPct", entryPx, long)
          )}
          {pctInput(
            "stopLossPct",
            "Stop loss % (empty = none)",
            targetHint("stopLossPct", anchorPx, !long)
          )}
        </>
      )
    case "momentum": {
      const stopMode = draft.stopMode === "base" ? "base" : "trailing"
      return (
        <>
          <Field label="Stop / exit">
            <Select
              value={stopMode}
              disabled={busy}
              onValueChange={(value) => onDraftChange("stopMode", value)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="trailing">Trailing stop %</SelectItem>
                <SelectItem value="base">QFL base break</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          {stopMode === "trailing" ? (
            pctInput(
              "trailingStopPct",
              "Trailing stop % (empty = none)",
              targetHint("trailingStopPct", anchorPx || entryPx, !long)
            )
          ) : (
            <>
              {pctInput("basePeriods", "Base periods (scan for low)", "")}
              {pctInput("pumpPeriods", "Pump periods (hold to confirm)", "")}
            </>
          )}
        </>
      )
    }
    case "qqe": {
      const swingStop = draft.swingStopLoss === "true"
      return (
        <>
          {pctInput(
            "takeProfitPct",
            "Take profit % (empty = none)",
            targetHint("takeProfitPct", entryPx, long)
          )}
          {swingStop ? (
            <Field label="Stop loss %">
              <Input value="Overridden by swing stop" disabled readOnly />
            </Field>
          ) : (
            pctInput(
              "stopLossPct",
              "Stop loss % (empty = none)",
              targetHint("stopLossPct", entryPx, !long)
            )
          )}
          <div className="flex items-center gap-2">
            <Checkbox
              id="oc-swing-stop"
              checked={swingStop}
              disabled={busy}
              onCheckedChange={(checked) =>
                onDraftChange("swingStopLoss", checked === true ? "true" : "false")
              }
            />
            <Label htmlFor="oc-swing-stop" className="text-xs">
              Use swing low/high as stop loss
            </Label>
          </div>
        </>
      )
    }
    case "vwap":
      return (
        <>
          {pctInput(
            "takeProfitPct",
            "Take profit % (empty = none)",
            targetHint("takeProfitPct", entryPx, long)
          )}
          {pctInput(
            "stopLossPct",
            "Stop loss % (empty = none)",
            targetHint("stopLossPct", entryPx, !long)
          )}
        </>
      )
    case "copy":
      return (
        <div className="rounded-lg border border-dashed p-4 text-center text-[11px] text-muted-foreground">
          Copy bots mirror the source wallet — no TP/SL of their own.
        </div>
      )
  }
}

function Kpi({
  label,
  value,
  sub,
  tone,
}: {
  label: string
  value: string
  sub: string
  tone?: number
}) {
  return (
    <Card size="sm">
      <CardContent className="flex flex-col gap-1">
        <span className="text-[10px] text-muted-foreground">{label}</span>
        <span
          className={cn(
            "font-mono text-base font-semibold",
            tone !== undefined ? toneClass(tone) : undefined
          )}
        >
          {value}
        </span>
        <span className="font-mono text-[9px] text-muted-foreground">{sub}</span>
      </CardContent>
    </Card>
  )
}

function Row({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: number
}) {
  return (
    <div className="flex justify-between text-[11px]">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={cn(
          "font-mono",
          tone !== undefined ? toneClass(tone) : "text-foreground/80"
        )}
      >
        {value}
      </span>
    </div>
  )
}
