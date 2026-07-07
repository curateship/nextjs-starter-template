import { PlusIcon } from "lucide-react"

import { StrategyParamFields } from "@/components/bots/strategy-param-fields"
import type { ParamValues } from "@/components/bots/strategy-params-form"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { STRATEGY_LABELS, type StrategyType } from "@/lib/strategies/params"

/**
 * The tweak surface for the loaded run: its strategy params plus window and
 * equity. Edits here feed Re-run Backtest. Without a run it's a New Run CTA.
 */
export function StrategyInputs({
  strategy,
  values,
  disabled,
  readOnly = false,
  mid,
  windowDays,
  maxWindowDays,
  equity,
  costs,
  onChange,
  onWindowChange,
  onEquityChange,
  onCostsChange,
  onReset,
  onNewRun,
}: {
  strategy: StrategyType | null
  values: ParamValues
  disabled: boolean
  /** Loaded run — inputs are a read-only snapshot, no Reset. */
  readOnly?: boolean
  mid: number
  windowDays: string
  /** Largest lookback the current interval can fetch (interval-aware). */
  maxWindowDays: number
  equity: string
  /** Fee/slippage assumptions in bps (form strings). */
  costs: { taker: string; maker: string; slippage: string }
  onChange: (key: string, value: string) => void
  onWindowChange: (value: string) => void
  onEquityChange: (value: string) => void
  onCostsChange: (key: "taker" | "maker" | "slippage", value: string) => void
  onReset?: () => void
  onNewRun: () => void
}) {
  if (!strategy) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-4 text-center">
        <p className="text-xs text-muted-foreground">
          Create a run to configure a strategy and see its results here.
        </p>
        <Button size="sm" className="gap-1.5" onClick={onNewRun}>
          <PlusIcon className="size-3.5" />
          New Run
        </Button>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between border-b px-3 py-2.5">
        <span className="text-[11px] font-semibold text-foreground/80">
          Inputs · {STRATEGY_LABELS[strategy]}
        </span>
        {readOnly ? (
          <span className="text-[10px] text-muted-foreground">Read-only</span>
        ) : onReset ? (
          <button
            type="button"
            onClick={onReset}
            className="text-[10px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            Reset
          </button>
        ) : null}
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="grid content-start gap-3 p-3">
        <div className="grid gap-2">
          <Label className="text-xs">
            Date range (days back, 1–{maxWindowDays})
          </Label>
          <Input
            value={windowDays}
            inputMode="numeric"
            disabled={disabled}
            onChange={(event) => onWindowChange(event.target.value.trim())}
          />
        </div>
        <div className="grid gap-2">
          <Label className="text-xs">Starting equity (USD)</Label>
          <Input
            value={equity}
            inputMode="decimal"
            disabled={disabled}
            onChange={(event) => onEquityChange(event.target.value.trim())}
          />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="grid gap-2">
            <Label className="text-xs">Taker bps</Label>
            <Input
              value={costs.taker}
              inputMode="decimal"
              disabled={disabled}
              onChange={(event) => onCostsChange("taker", event.target.value.trim())}
            />
          </div>
          <div className="grid gap-2">
            <Label className="text-xs">Maker bps</Label>
            <Input
              value={costs.maker}
              inputMode="decimal"
              disabled={disabled}
              onChange={(event) => onCostsChange("maker", event.target.value.trim())}
            />
          </div>
          <div className="grid gap-2">
            <Label className="text-xs">Slip bps</Label>
            <Input
              value={costs.slippage}
              inputMode="decimal"
              disabled={disabled}
              onChange={(event) =>
                onCostsChange("slippage", event.target.value.trim())
              }
            />
          </div>
        </div>
        <div className="my-1 h-px bg-border" />
        <StrategyParamFields
          strategy={strategy}
          values={values}
          disabled={disabled}
          mid={mid}
          onChange={onChange}
        />
        </div>
      </ScrollArea>
    </div>
  )
}
