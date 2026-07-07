import * as React from "react"
import { ChevronDownIcon, InfoIcon } from "lucide-react"

import {
  StrategyParamFields,
  type ParamSection,
} from "@/components/bots/strategy-param-fields"
import type { ParamValues } from "@/components/bots/strategy-params-form"
import { Label } from "@/components/ui/label"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { STRATEGY_LABELS, type StrategyType } from "@/lib/strategies/params"

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
