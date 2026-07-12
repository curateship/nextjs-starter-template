import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import type { AutomationBacktestValues } from "./automation-settings"

/** Starting capital + costs card; these ride on the automation itself. */
export function AutomationBacktestCard({
  idPrefix,
  values,
  disabled,
  onChange,
}: {
  idPrefix: string
  values: AutomationBacktestValues
  disabled?: boolean
  onChange: (values: AutomationBacktestValues) => void
}) {
  const field = (
    key: keyof AutomationBacktestValues,
    label: string,
    max: number,
    step: number
  ) => (
    <div className="grid gap-1.5">
      <Label htmlFor={`${idPrefix}-${key}`}>{label}</Label>
      <Input
        id={`${idPrefix}-${key}`}
        type="number"
        min={0}
        max={max}
        step={step}
        inputMode="decimal"
        value={values[key]}
        disabled={disabled}
        onChange={(event) =>
          onChange({ ...values, [key]: event.target.value })
        }
      />
    </div>
  )

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Backtest defaults</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        {field("startingEquity", "Starting capital (USD, per market)", 100_000_000, 100)}
        <div className="grid gap-4 sm:grid-cols-3">
          {field("takerFeeBps", "Taker fee (bps)", 50, 0.1)}
          {field("makerFeeBps", "Maker fee (bps)", 50, 0.1)}
          {field("slippageBps", "Slippage (bps)", 100, 0.1)}
        </div>
        <p className="text-xs text-muted-foreground">
          Every backtest of this Automation uses these amounts, so results stay
          comparable run to run.
        </p>
      </CardContent>
    </Card>
  )
}
