import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import type {
  AutomationBacktestValues,
  AutomationProtectionValues,
} from "./automation-settings"

/** Take profit / stop loss card shared by the create + settings dialogs. */
export function AutomationProtectionCard({
  idPrefix,
  values,
  disabled,
  onChange,
}: {
  idPrefix: string
  values: AutomationProtectionValues
  disabled?: boolean
  onChange: (values: AutomationProtectionValues) => void
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Protection</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor={`${idPrefix}-take-profit`}>Take profit %</Label>
          <Input
            id={`${idPrefix}-take-profit`}
            type="number"
            min={0}
            step={0.1}
            placeholder="Off"
            value={values.takeProfitPct}
            disabled={disabled}
            onChange={(event) =>
              onChange({ ...values, takeProfitPct: event.target.value })
            }
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${idPrefix}-stop-loss`}>Stop loss %</Label>
          <Input
            id={`${idPrefix}-stop-loss`}
            type="number"
            min={0}
            step={0.1}
            placeholder="Off"
            value={values.stopLossPct}
            disabled={disabled}
            onChange={(event) =>
              onChange({ ...values, stopLossPct: event.target.value })
            }
          />
        </div>
      </CardContent>
    </Card>
  )
}

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
