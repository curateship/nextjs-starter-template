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
import type { AutomationBacktestSettings } from "@/lib/automations/automation"
import { normalizeAutomationType } from "@/lib/automations/automation-types"
import type { AutomationInterval } from "@/lib/strategies/kinds/contract"

import {
  backtestSettingsToValues,
  parseAutomationBacktestSettings,
  type AutomationBacktestValues,
} from "./automation-settings"
import { AutomationBacktestCard } from "./automation-settings-fields"
import { AutomationTypeSelect } from "./automation-type-select"

const INTERVALS: AutomationInterval[] = ["1m", "5m", "15m", "1h", "4h", "1d"]

export function AutomationCanvasSettingsDialog({
  open,
  type,
  interval,
  backtest,
  knownTypes = [],
  onOpenChange,
  onApply,
}: {
  open: boolean
  type: string
  interval: AutomationInterval
  backtest: AutomationBacktestSettings
  knownTypes?: readonly string[]
  onOpenChange: (open: boolean) => void
  onApply: (settings: {
    type: string
    interval: AutomationInterval
    backtest: AutomationBacktestSettings
  }) => void
}) {
  const [draftType, setDraftType] = React.useState(type)
  const [draftInterval, setDraftInterval] = React.useState(interval)
  const [backtestValues, setBacktestValues] =
    React.useState<AutomationBacktestValues>(() =>
      backtestSettingsToValues(backtest)
    )
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open) return
    setDraftType(type)
    setDraftInterval(interval)
    setBacktestValues(backtestSettingsToValues(backtest))
    setError(null)
  }, [backtest, interval, open, type])

  const apply = () => {
    const parsedBacktest = parseAutomationBacktestSettings(backtestValues)
    if (!parsedBacktest.backtest) return setError(parsedBacktest.error)

    onApply({
      type: normalizeAutomationType(draftType),
      interval: draftInterval,
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
            Set when this Automation runs and its backtest defaults. Take Profit
            and Stop Loss are canvas nodes now — hang them off a Long or Short.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <Card size="sm">
            <CardHeader>
              <CardTitle>Schedule</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="canvas-automation-type">Type</Label>
                <AutomationTypeSelect
                  id="canvas-automation-type"
                  value={draftType}
                  knownTypes={knownTypes}
                  onChange={setDraftType}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="canvas-automation-timeframe">Timeframe</Label>
                <Select
                  value={draftInterval}
                  onValueChange={(value) =>
                    setDraftInterval(value as AutomationInterval)
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
