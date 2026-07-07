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
import type { StrategyType } from "@/lib/strategies/params"

export function StrategyParamFields({
  strategy,
  values,
  disabled,
  onChange,
  mid = 0,
}: {
  strategy: StrategyType
  values: ParamValues
  disabled: boolean
  onChange: (key: string, value: string) => void
  /** Live mid price of the market; enables the % hints. */
  mid?: number
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
      <div key={key} className="grid gap-2 sm:col-span-2">
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
          ])}
          {(values.stopMode ?? "trailing") === "base" ? (
            <>
              {text("basePeriods", "Base periods (scan for low)")}
              {text("pumpPeriods", "Pump periods (hold to confirm)")}
            </>
          ) : (
            text("trailingStopPct", "Trailing stop % (optional)")
          )}
          {text("orderSizeUsd", "Order size (USD)")}
          {select("direction", "Direction", [
            ["both", "Long & short"],
            ["long", "Long only"],
            ["short", "Short only"],
          ])}
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
  value,
  disabled,
  onChange,
}: {
  label: string
  value: number
  disabled: boolean
  onChange: (value: number) => void
}) {
  return (
    <Field label={label}>
      <Input
        value={String(value)}
        inputMode="decimal"
        disabled={disabled}
        onChange={(event) => {
          const next = Number(event.target.value)
          if (Number.isFinite(next)) onChange(next)
        }}
      />
    </Field>
  )
}
