import * as React from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type {
  AutomationBacktestSettings,
  AutomationProtection,
} from "@/lib/automations/automation"
import type { StrategyInterval } from "@/lib/strategies/kinds/contract"

import {
  backtestSettingsToValues,
  parseAutomationBacktestSettings,
  parseAutomationProtection,
  type AutomationBacktestValues,
} from "./automation-settings"
import {
  AutomationBacktestCard,
  AutomationProtectionCard,
} from "./automation-settings-fields"

const INTERVALS: StrategyInterval[] = ["1m", "5m", "15m", "1h", "4h", "1d"]

export function AutomationCanvasSettingsDialog({
  open,
  interval,
  protection,
  backtest,
  onOpenChange,
  onApply,
}: {
  open: boolean
  interval: StrategyInterval
  protection: AutomationProtection
  backtest: AutomationBacktestSettings
  onOpenChange: (open: boolean) => void
  onApply: (settings: {
    interval: StrategyInterval
    protection: AutomationProtection
    backtest: AutomationBacktestSettings
  }) => void
}) {
  const [draftInterval, setDraftInterval] = React.useState(interval)
  const [takeProfit, setTakeProfit] = React.useState("")
  const [stopLoss, setStopLoss] = React.useState("")
  const [backtestValues, setBacktestValues] =
    React.useState<AutomationBacktestValues>(() =>
      backtestSettingsToValues(backtest)
    )
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open) return
    setDraftInterval(interval)
    setTakeProfit(
      protection.takeProfitPct === undefined
        ? ""
        : String(protection.takeProfitPct)
    )
    setStopLoss(
      protection.stopLossPct === undefined ? "" : String(protection.stopLossPct)
    )
    setBacktestValues(backtestSettingsToValues(backtest))
    setError(null)
  }, [backtest, interval, open, protection])

  const apply = () => {
    const parsed = parseAutomationProtection({
      takeProfitPct: takeProfit,
      stopLossPct: stopLoss,
    })
    if (!parsed.protection) return setError(parsed.error)
    const parsedBacktest = parseAutomationBacktestSettings(backtestValues)
    if (!parsedBacktest.backtest) return setError(parsedBacktest.error)

    onApply({
      interval: draftInterval,
      protection: parsed.protection,
      backtest: parsedBacktest.backtest,
    })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent variant="admin" className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Automation settings</DialogTitle>
          <DialogDescription>
            Set when this Automation runs and how every action is protected.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <Card size="sm">
            <CardHeader>
              <CardTitle>Schedule</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-1.5">
                <Label htmlFor="canvas-automation-timeframe">Timeframe</Label>
                <Select
                  value={draftInterval}
                  onValueChange={(value) =>
                    setDraftInterval(value as StrategyInterval)
                  }
                >
                  <SelectTrigger id="canvas-automation-timeframe" className="h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {INTERVALS.map((value) => (
                      <SelectItem key={value} value={value}>
                        {value}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <AutomationProtectionCard
            idPrefix="canvas-automation"
            values={{ takeProfitPct: takeProfit, stopLossPct: stopLoss }}
            onChange={(next) => {
              setTakeProfit(next.takeProfitPct)
              setStopLoss(next.stopLossPct)
            }}
          />

          <AutomationBacktestCard
            idPrefix="canvas-automation"
            values={backtestValues}
            onChange={setBacktestValues}
          />

          {error ? (
            <div
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </div>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={apply}>
            Apply settings
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
