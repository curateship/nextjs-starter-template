import * as React from "react"

import {
  pctFromMid,
  perGridHint,
  type ParamValues,
} from "@/components/bots/strategy-params-form"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { RiskParams, StrategyType } from "@/lib/strategies/params"

/**
 * QQE fields split into cardable groups so callers can render the consolidation
 * and stop-loss controls as their own cards, separate from the core params.
 */
export type ParamSection =
  | "core"
  | "consolidation"
  | "swing"
  | "exits"
  | "size"

export function StrategyParamFields({
  strategy,
  values,
  disabled,
  onChange,
  mid = 0,
  section,
}: {
  strategy: StrategyType
  values: ParamValues
  disabled: boolean
  onChange: (key: string, value: string) => void
  /** Live mid price of the market; enables the % hints. */
  mid?: number
  /**
   * For QQE, render only one group of fields. Omit to render everything (the
   * default used by callers that show all params in a single card).
   */
  section?: ParamSection
}) {
  const text = (
    key: string,
    label: string,
    placeholder = "",
    hint?: string
  ) => (
    <Field key={key} label={label}>
      <div className="relative">
        <Input
          value={values[key] ?? ""}
          placeholder={placeholder}
          inputMode="decimal"
          disabled={disabled}
          className={hint ? "pr-24" : undefined}
          onChange={(event) => onChange(key, event.target.value.trim())}
        />
        {hint ? (
          <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 font-mono text-[11px] text-muted-foreground tabular-nums">
            {hint}
          </span>
        ) : null}
      </div>
    </Field>
  )
  const select = (key: string, label: string, options: [string, string][]) => (
    <Field key={key} label={label}>
      <Select
        value={values[key] ?? options[0][0]}
        disabled={disabled}
        onValueChange={(value) => onChange(key, value)}
      >
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map(([value, label]) => (
            <SelectItem key={value} value={value}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  )
  const togglePrice = (
    key: string,
    label: string,
    suggestFactor: number
  ) => {
    const enabled = (values[key] ?? "") !== ""
    return (
      <div key={key} className="grid gap-2 sm:col-span-full">
        <div className="flex items-center gap-2">
          <Checkbox
            id={`toggle-${key}`}
            checked={enabled}
            disabled={disabled}
            onCheckedChange={(checked) =>
              onChange(
                key,
                checked === true
                  ? mid > 0
                    ? (mid * suggestFactor).toPrecision(5)
                    : "0"
                  : ""
              )
            }
          />
          <Label htmlFor={`toggle-${key}`} className="text-xs">
            {label}
          </Label>
        </div>
        {enabled ? (
          <div className="relative">
            <Input
              value={values[key] ?? ""}
              inputMode="decimal"
              disabled={disabled}
              className="pr-20"
              onChange={(event) => onChange(key, event.target.value.trim())}
            />
            <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 font-mono text-[11px] text-muted-foreground tabular-nums">
              {pctFromMid(values[key], mid)}
            </span>
          </div>
        ) : null}
      </div>
    )
  }

  const check = (key: string, label: string) => (
    <div key={key} className="flex items-center gap-2 sm:col-span-full">
      <Checkbox
        id={`check-${key}`}
        checked={values[key] === "true"}
        disabled={disabled}
        onCheckedChange={(checked) =>
          onChange(key, checked === true ? "true" : "false")
        }
      />
      <Label htmlFor={`check-${key}`} className="text-xs">
        {label}
      </Label>
    </div>
  )

  switch (strategy) {
    case "grid":
      return (
        <>
          {text("lowerPx", "Lower price", "1500", pctFromMid(values.lowerPx, mid))}
          {text("upperPx", "Upper price", "2500", pctFromMid(values.upperPx, mid))}
          {text("levels", "Grid quantity (2–100)", "", perGridHint(values))}
          {text("sizePerLevelUsd", "Size per level (USD)")}
          {select("side", "Direction", [
            ["both", "Neutral (both sides)"],
            ["long_only", "Long only"],
            ["short_only", "Short only"],
          ])}
          {togglePrice("takeProfitPx", "Take profit (exit entire position)", 1.1)}
          {togglePrice("stopLossPx", "Stop loss (exit entire position)", 0.9)}
        </>
      )
    case "dca":
      return (
        <>
          {select("direction", "Direction", [
            ["long", "Long"],
            ["short", "Short"],
          ])}
          {text("baseOrderUsd", "Base order (USD)")}
          {text("safetyOrderUsd", "Safety order (USD)")}
          {text("maxSafetyOrders", "Max safety orders")}
          {text("priceStepPct", "Price deviation % (first safety)")}
          {text("stepMultiplier", "Step multiplier")}
          {text("sizeMultiplier", "Size multiplier")}
          {text("takeProfitPct", "Take profit %")}
          {text("stopLossPct", "Stop loss % (optional)")}
        </>
      )
    case "momentum":
      return (
        <>
          {select("signal", "Signal", [
            ["ema_cross", "EMA cross"],
            ["rsi", "RSI"],
            ["breakout", "Breakout"],
          ])}
          {select("interval", "Candle interval", [
            ["1m", "1m"],
            ["5m", "5m"],
            ["15m", "15m"],
            ["1h", "1h"],
            ["4h", "4h"],
            ["1d", "1d"],
          ])}
          {values.signal === "ema_cross" ? (
            <>
              {text("emaFast", "EMA fast period")}
              {text("emaSlow", "EMA slow period")}
            </>
          ) : null}
          {values.signal === "rsi" ? (
            <>
              {text("rsiPeriod", "RSI period")}
              {text("rsiBuyBelow", "Buy when RSI below")}
              {text("rsiSellAbove", "Sell when RSI above")}
            </>
          ) : null}
          {values.signal === "breakout"
            ? text("breakoutLookback", "Breakout lookback (candles)")
            : null}
          {select("stopMode", "Stop / exit", [
            ["trailing", "Trailing stop %"],
            ["base", "QFL base break"],
            ["atr", "ATR trailing stop"],
          ])}
          {(values.stopMode ?? "trailing") === "base" ? (
            <>
              {text("basePeriods", "Base periods (scan for low)")}
              {text("pumpPeriods", "Pump periods (hold to confirm)")}
            </>
          ) : (values.stopMode ?? "trailing") === "atr" ? (
            <>
              {text("atrPeriod", "ATR period")}
              {text("atrStopMult", "ATR stop multiple")}
            </>
          ) : (
            text("trailingStopPct", "Trailing stop % (optional)")
          )}
          {values.signal === "ema_cross"
            ? check("reentry", "Re-enter trend after a stop-out")
            : null}
          {values.reentry === "true" && values.signal === "ema_cross"
            ? text("maxReentries", "Max re-entries per trend (optional)")
            : null}
          {text("adxMin", "Min ADX to enter (optional filter)")}
          {values.adxMin ? text("adxPeriod", "ADX period") : null}
          {check("macdFilter", "Require MACD histogram agreement")}
          {text("volTargetPct", "Vol target %/day (scales size down, optional)")}
          {text("orderSizeUsd", "Order size (USD)")}
          {select("direction", "Direction", [
            ["both", "Long & short"],
            ["long", "Long only"],
            ["short", "Short only"],
          ])}
        </>
      )
    case "qqe": {
      const consolidation = (
        <>
          {check("consolidationFilter", "Consolidation filter")}
          {text("loopbackPeriod", "Loopback period")}
          {text("minConsolidationLen", "Min consolidation length")}
          {check("paintConsolidation", "Paint consolidation area")}
          {values.paintConsolidation === "true"
            ? text("zoneColor", "Zone color (hex)", "#2962ff")
            : null}
        </>
      )
      const swingStop = values.swingStopLoss === "true"
      const swing = (
        <>
          {check("paintSwings", "Show swing high/low on chart")}
          {text("swingLookback", "Swing lookback")}
          {check("swingStopLoss", "Use swing low/high as stop loss (overrides SL %)")}
          {swingStop ? (
            <>
              {text("swingScanBars", "Base scan bars")}
              {text("swingConfirmBars", "Base confirm bars (hold)")}
            </>
          ) : null}
        </>
      )
      const exits = (
        <>
          {text("takeProfitPct", "Take profit % (optional)")}
          {check("trendReentry", "Re-enter trend after exit (continuation candle)")}
          {values.trendReentry === "true"
            ? text("maxReentries", "Max re-entries per trend (optional)")
            : null}
          {swingStop ? (
            <Field label="Stop loss % (optional)">
              <Input value="Overridden by swing stop" disabled readOnly />
            </Field>
          ) : (
            text("stopLossPct", "Stop loss % (optional)")
          )}
        </>
      )
      const size = text("orderSizeUsd", "Order size (USD)")
      if (section === "consolidation") return consolidation
      if (section === "swing") return swing
      if (section === "exits") return exits
      if (section === "size") return size
      return (
        <>
          {select("interval", "Candle interval", [
            ["1m", "1m"],
            ["5m", "5m"],
            ["15m", "15m"],
            ["1h", "1h"],
            ["4h", "4h"],
            ["1d", "1d"],
          ])}
          {text("rsiPeriod", "RSI length")}
          {text("rsiSmoothing", "RSI smoothing")}
          {text("qqeFactor", "Fast QQE factor")}
          {text("threshold", "Threshold")}
          {select("maType", "MA type", [
            ["EMA", "EMA"],
            ["SMA", "SMA"],
            ["WMA", "WMA"],
            ["VWMA", "VWMA"],
            ["SMMA", "SMMA"],
            ["DEMA", "DEMA"],
            ["TEMA", "TEMA"],
            ["HMA", "HMA"],
            ["LSMA", "LSMA"],
            ["ALMA", "ALMA"],
            ["PEMA", "PEMA"],
          ])}
          {values.maType === "LSMA" ? text("lsmaOffset", "LSMA offset") : null}
          {values.maType === "ALMA" ? (
            <>
              {text("almaOffset", "ALMA offset")}
              {text("almaSigma", "ALMA sigma")}
            </>
          ) : null}
          {select("rsiSource", "RSI source", [
            ["close", "Close"],
            ["open", "Open"],
            ["high", "High"],
            ["low", "Low"],
            ["hl2", "HL2"],
            ["hlc3", "HLC3"],
            ["ohlc4", "OHLC4"],
          ])}
          {check("colorBars", "Color bars by QQE state")}
          {/* Size, consolidation & exits render as their own cards; when no
              section filter is applied (single-card callers) include them
              inline so nothing is dropped. */}
          {section === undefined ? (
            <>
              {size}
              {consolidation}
              {swing}
              {exits}
            </>
          ) : null}
        </>
      )
    }
    case "vwap":
      return (
        <>
          {select("mode", "Mode", [
            ["reversion", "Mean reversion (bands)"],
            ["cross", "VWAP cross (trend)"],
          ])}
          {select("interval", "Candle interval", [
            ["1m", "1m"],
            ["5m", "5m"],
            ["15m", "15m"],
            ["1h", "1h"],
            ["4h", "4h"],
            ["1d", "1d"],
          ])}
          {(values.mode ?? "reversion") === "reversion" ? (
            <>
              {text("bandK", "Band width (σ)")}
              {select("exitAt", "Exit target", [
                ["vwap", "VWAP line"],
                ["band", "Opposite band"],
              ])}
            </>
          ) : null}
          {text("orderSizeUsd", "Order size (USD)")}
          {select("direction", "Direction", [
            ["both", "Long & short"],
            ["long", "Long only"],
            ["short", "Short only"],
          ])}
          {text("takeProfitPct", "Take profit % (optional)")}
          {text("stopLossPct", "Stop loss % (optional)")}
        </>
      )
    case "copy":
      return (
        <>
          {text("sourceAddress", "Source address", "0x…")}
          {select("sizeMode", "Sizing", [
            ["ratio", "Ratio of source size"],
            ["fixed_usd", "Fixed USD per fill"],
          ])}
          {values.sizeMode === "ratio"
            ? text("ratio", "Ratio (1 = same size)")
            : text("fixedUsd", "Fixed USD per fill")}
          {text("marketsFilter", "Markets filter (comma separated, optional)")}
          {text("maxSlippageBps", "Max slippage (bps)")}
        </>
      )
  }
}

export function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="grid gap-2">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  )
}

export function RiskField({
  label,
  help,
  value,
  disabled,
  onChange,
}: {
  label: string
  help?: string
  value: number
  disabled: boolean
  onChange: (value: number) => void
}) {
  return (
    <Field label={label}>
      <div className="grid gap-1">
        <Input
          value={String(value)}
          inputMode="decimal"
          disabled={disabled}
          onChange={(event) => {
            const next = Number(event.target.value)
            if (Number.isFinite(next)) onChange(next)
          }}
        />
        {help ? <div className="text-[11px] text-muted-foreground">{help}</div> : null}
      </div>
    </Field>
  )
}

export function RiskFieldsGrid({
  risk,
  busy,
  onChange,
}: {
  risk: RiskParams
  busy: boolean
  onChange: (risk: RiskParams) => void
}) {
  return (
    <>
      <RiskField
        label="Max money in one market"
        help="Caps how large one market can get."
        value={risk.maxPositionNotionalUsd}
        disabled={busy}
        onChange={(value) => onChange({ ...risk, maxPositionNotionalUsd: value })}
      />
      <RiskField
        label="Max leverage"
        help="1 means no borrowed size."
        value={risk.maxLeverage}
        disabled={busy}
        onChange={(value) => onChange({ ...risk, maxLeverage: value })}
      />
      <RiskField
        label="Daily loss stop"
        help="Stops after this much loss in one day."
        value={risk.dailyLossLimitUsd}
        disabled={busy}
        onChange={(value) => onChange({ ...risk, dailyLossLimitUsd: value })}
      />
      <RiskField
        label="Account drawdown stop"
        help="Stops if the account falls this far from its high."
        value={risk.maxDrawdownPct}
        disabled={busy}
        onChange={(value) => onChange({ ...risk, maxDrawdownPct: value })}
      />
      <RiskField
        label="Max open orders"
        help="Caps resting orders at one time."
        value={risk.maxOpenOrders}
        disabled={busy}
        onChange={(value) => onChange({ ...risk, maxOpenOrders: value })}
      />
      <RiskField
        label="Pause after losses"
        help="0 means never pause for a loss streak."
        value={risk.cooldownLosses}
        disabled={busy}
        onChange={(value) => onChange({ ...risk, cooldownLosses: value })}
      />
      <RiskField
        label="Pause length"
        help="Minutes to wait after the loss streak."
        value={risk.cooldownMinutes}
        disabled={busy}
        onChange={(value) => onChange({ ...risk, cooldownMinutes: value })}
      />
    </>
  )
}
