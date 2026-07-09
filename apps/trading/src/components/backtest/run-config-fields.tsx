import * as React from "react"
import { ChevronDownIcon, InfoIcon } from "lucide-react"

import {
  RiskFieldsGrid,
  StrategyParamFields,
  type ParamSection,
} from "@/components/bots/strategy-param-fields"
import type { ParamValues } from "@/components/bots/strategy-params-form"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  DEFAULT_BACKTEST_RISK_PARAMS,
  DEFAULT_RISK_PARAMS,
  riskParamsSchema,
  STRATEGY_LABELS,
  type RiskParams,
  type StrategyType,
} from "@/lib/strategies/params"
import { cn } from "@/lib/utils"

/** Per-order notional, pulled from whichever size field the strategy uses. */
export function orderSizeFromValues(values: ParamValues): number {
  return (
    Number(
      values.orderSizeUsd ||
        values.sizePerLevelUsd ||
        values.baseOrderUsd ||
        values.fixedUsd ||
        ""
    ) || 0
  )
}

/** Tooltip text translating a bps cost into % and $ for the given order size. */
export function feeCostTip(bpsStr: string, orderSizeUsd: number): string {
  const bps = Number(bpsStr)
  if (!Number.isFinite(bps)) return "Enter a value in basis points (1 bps = 0.01%)."
  const pct = bps / 100
  if (orderSizeUsd > 0) {
    const dollars = (orderSizeUsd * bps) / 10_000
    return `${bps} bps = ${pct}% ≈ $${dollars.toFixed(2)} per $${orderSizeUsd.toLocaleString()} order`
  }
  return `${bps} bps = ${pct}% — set an order size to see the $ cost`
}

/** Tooltip text for a value entered directly as a percent. */
export function feePctTip(pctStr: string, orderSizeUsd: number): string {
  const pct = Number(pctStr)
  if (!Number.isFinite(pct) || pctStr.trim() === "")
    return "Optional. A flat % applied to every fill, overriding taker + maker."
  if (orderSizeUsd > 0) {
    const dollars = (orderSizeUsd * pct) / 100
    return `${pct}% = ${pct * 100} bps ≈ $${dollars.toFixed(2)} per $${orderSizeUsd.toLocaleString()} order`
  }
  return `${pct}% = ${pct * 100} bps — set an order size to see the $ cost`
}

/**
 * A field label with an (i) icon that reveals a $/% translation on hover. Must
 * render inside a `TooltipProvider`.
 */
export function FeeLabel({ text, tip }: { text: string; tip: string }) {
  return (
    <div className="flex items-center gap-1">
      <Label>{text}</Label>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={`${text} info`}
            className="text-muted-foreground hover:text-foreground"
          >
            <InfoIcon className="size-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent>{tip}</TooltipContent>
      </Tooltip>
    </div>
  )
}

/**
 * The strategy's parameters rendered as collapsible cards — QQE splits into
 * core / consolidation / exits; every other strategy is a single card. The
 * order-size ("size") section is intentionally omitted so callers can place it
 * in their general-settings card.
 */
export function StrategyParamCards({
  strategy,
  values,
  disabled,
  mid = 0,
  onChange,
}: {
  strategy: StrategyType
  values: ParamValues
  disabled: boolean
  mid?: number
  onChange: (key: string, value: string) => void
}) {
  const [collapsed, setCollapsed] = React.useState<Record<string, boolean>>({})

  const cards: { title: string; section?: ParamSection }[] =
    strategy === "qqe"
      ? [
          { title: `${STRATEGY_LABELS[strategy]} parameters`, section: "core" },
          { title: "Consolidation", section: "consolidation" },
          { title: "Swing Low & High", section: "swing" },
          { title: "Take profit & stop loss", section: "exits" },
        ]
      : [{ title: `${STRATEGY_LABELS[strategy]} parameters` }]

  return (
    <>
      {cards.map((group) => {
        const open = !collapsed[group.title]
        return (
          <div key={group.title} className="grid gap-3 rounded-lg border p-4">
            <button
              type="button"
              className="flex items-center justify-between text-left"
              onClick={() =>
                setCollapsed((current) => ({
                  ...current,
                  [group.title]: !current[group.title],
                }))
              }
            >
              <Label className="cursor-pointer">{group.title}</Label>
              <ChevronDownIcon
                className={`size-4 text-muted-foreground transition-transform ${
                  open ? "" : "-rotate-90"
                }`}
              />
            </button>
            {open ? (
              <div className="grid gap-4 sm:grid-cols-3">
                <StrategyParamFields
                  strategy={strategy}
                  values={values}
                  disabled={disabled}
                  mid={mid}
                  section={group.section}
                  onChange={onChange}
                />
              </div>
            ) : null}
          </div>
        )
      })}
    </>
  )
}

/** True when two risk-param sets are field-for-field identical. */
export function sameRiskParams(a: RiskParams, b: RiskParams) {
  return (
    a.maxPositionNotionalUsd === b.maxPositionNotionalUsd &&
    a.maxLeverage === b.maxLeverage &&
    a.dailyLossLimitUsd === b.dailyLossLimitUsd &&
    a.maxDrawdownPct === b.maxDrawdownPct &&
    a.maxOpenOrders === b.maxOpenOrders &&
    a.cooldownLosses === b.cooldownLosses &&
    a.cooldownMinutes === b.cooldownMinutes
  )
}

/** Human-readable validation error for a risk-param set, or null if valid. */
export function riskErrorMessage(risk: RiskParams): string | null {
  const parsed = riskParamsSchema.safeParse(risk)
  if (parsed.success) return null
  return parsed.error.issues
    .map((issue) =>
      issue.path.length
        ? `${issue.path.join(".")}: ${issue.message}`
        : issue.message
    )
    .join(" · ")
}

/**
 * The "Risk controls" card shared by the New Run dialog and the template
 * editor: research-mode vs. live-style presets plus the editable risk fields.
 */
export function RiskControlsCard({
  risk,
  onChange,
  busy,
  description,
}: {
  risk: RiskParams
  onChange: (risk: RiskParams) => void
  busy: boolean
  description?: React.ReactNode
}) {
  const riskMode = sameRiskParams(risk, DEFAULT_BACKTEST_RISK_PARAMS)
    ? "research"
    : sameRiskParams(risk, DEFAULT_RISK_PARAMS)
      ? "live"
      : "custom"
  return (
    <div className="grid gap-4 rounded-lg border p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Label>Risk controls</Label>
          {description ? (
            <div className="mt-1 text-[11px] text-muted-foreground">
              {description}
            </div>
          ) : null}
        </div>
        {riskMode === "custom" ? (
          <div className="rounded-full border bg-muted/30 px-2.5 py-1 text-[11px] text-muted-foreground">
            Custom
          </div>
        ) : null}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => onChange(DEFAULT_BACKTEST_RISK_PARAMS)}
          className={cn(
            "grid rounded-md border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60",
            riskMode === "research"
              ? "border-primary bg-primary/10"
              : "hover:bg-muted/40"
          )}
        >
          <span className="text-sm font-medium">Research mode</span>
          <span className="mt-1 text-[11px] text-muted-foreground">
            Keeps safety stops out of the way so the backtest shows the
            strategy's real ups and downs.
          </span>
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => onChange(DEFAULT_RISK_PARAMS)}
          className={cn(
            "grid rounded-md border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60",
            riskMode === "live"
              ? "border-primary bg-primary/10"
              : "hover:bg-muted/40"
          )}
        >
          <span className="text-sm font-medium">Live-style stops</span>
          <span className="mt-1 text-[11px] text-muted-foreground">
            Uses the same protective stops a live bot would use, including
            drawdown and cooldown limits.
          </span>
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {riskMode !== "research" ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => onChange(DEFAULT_BACKTEST_RISK_PARAMS)}
          >
            Reset to research mode
          </Button>
        ) : null}
        {riskMode !== "live" ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => onChange(DEFAULT_RISK_PARAMS)}
          >
            Reset to live-style stops
          </Button>
        ) : null}
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <RiskFieldsGrid risk={risk} busy={busy} onChange={onChange} />
      </div>
    </div>
  )
}
