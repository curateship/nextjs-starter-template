import * as React from "react"
import { Loader2Icon } from "lucide-react"

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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  createAutomation,
  getAutomationErrorMessage,
  type AutomationDetail,
} from "@/lib/api/automations"
import { DEFAULT_AUTOMATION_BACKTEST_SETTINGS } from "@/lib/automations/automation"
import type { StrategyInterval } from "@/lib/strategies/kinds/contract"

import {
  backtestSettingsToValues,
  parseAutomationBacktestSettings,
  parseAutomationProtection,
  type AutomationBacktestValues,
  type AutomationProtectionValues,
} from "./automation-settings"
import {
  AutomationBacktestCard,
  AutomationProtectionCard,
} from "./automation-settings-fields"

const INTERVALS: StrategyInterval[] = ["1m", "5m", "15m", "1h", "4h", "1d"]
const EMPTY_PROTECTION: AutomationProtectionValues = {
  takeProfitPct: "",
  stopLossPct: "",
}
const DEFAULT_BACKTEST_VALUES = backtestSettingsToValues(
  DEFAULT_AUTOMATION_BACKTEST_SETTINGS
)

export function CreateAutomationDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (automation: AutomationDetail) => void
}) {
  const [name, setName] = React.useState("")
  const [interval, setInterval] = React.useState<StrategyInterval>("15m")
  const [protection, setProtection] =
    React.useState<AutomationProtectionValues>(EMPTY_PROTECTION)
  const [backtest, setBacktest] = React.useState<AutomationBacktestValues>(
    DEFAULT_BACKTEST_VALUES
  )
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const reset = () => {
    setName("")
    setInterval("15m")
    setProtection(EMPTY_PROTECTION)
    setBacktest(DEFAULT_BACKTEST_VALUES)
    setError(null)
  }

  const changeOpen = (next: boolean) => {
    if (!next) reset()
    onOpenChange(next)
  }

  const submit = async () => {
    const trimmedName = name.trim()
    if (!trimmedName) {
      setError("Give this automation a name.")
      return
    }
    const parsedProtection = parseAutomationProtection(protection)
    if (!parsedProtection.protection) {
      setError(parsedProtection.error)
      return
    }
    const parsedBacktest = parseAutomationBacktestSettings(backtest)
    if (!parsedBacktest.backtest) {
      setError(parsedBacktest.error)
      return
    }
    setBusy(true)
    setError(null)
    try {
      const automation = await createAutomation({
        name: trimmedName,
        interval,
        protection: parsedProtection.protection,
        backtest: parsedBacktest.backtest,
      })
      changeOpen(false)
      onCreated(automation)
    } catch (createError) {
      setError(getAutomationErrorMessage(createError))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!busy) changeOpen(next)
      }}
    >
      <DialogContent variant="admin" className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create Automation</DialogTitle>
          <DialogDescription>
            Name the reusable rule and choose the candle timeframe it evaluates.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <Card size="sm">
            <CardHeader>
              <CardTitle>Automation</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="automation-name">Name</Label>
                <Input
                  id="automation-name"
                  autoFocus
                  maxLength={80}
                  value={name}
                  placeholder="Momentum confirmation"
                  onChange={(event) => setName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void submit()
                  }}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="automation-timeframe">Timeframe</Label>
                <Select
                  value={interval}
                  onValueChange={(value) =>
                    setInterval(value as StrategyInterval)
                  }
                >
                  <SelectTrigger
                    id="automation-timeframe"
                    className="h-8 w-full"
                  >
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
            idPrefix="create-automation"
            values={protection}
            disabled={busy}
            onChange={setProtection}
          />
          <AutomationBacktestCard
            idPrefix="create-automation"
            values={backtest}
            disabled={busy}
            onChange={setBacktest}
          />
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => changeOpen(false)}
          >
            Cancel
          </Button>
          <Button type="button" disabled={busy} onClick={() => void submit()}>
            {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
            Continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
