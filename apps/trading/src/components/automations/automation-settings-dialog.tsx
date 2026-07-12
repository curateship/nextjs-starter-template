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
  getAutomation,
  getAutomationErrorMessage,
  saveAutomation,
  type AutomationDetail,
  type AutomationListItem,
} from "@/lib/api/automations"
import type { StrategyInterval } from "@/lib/strategies/kinds/contract"

import {
  backtestSettingsToValues,
  buildAutomationSettingsSave,
  type AutomationSettingsValues,
} from "./automation-settings"
import {
  AutomationBacktestCard,
  AutomationProtectionCard,
} from "./automation-settings-fields"

const INTERVALS: StrategyInterval[] = ["1m", "5m", "15m", "1h", "4h", "1d"]

export function AutomationSettingsDialog({
  target,
  onOpenChange,
  onSaved,
}: {
  target: AutomationListItem | null
  onOpenChange: (open: boolean) => void
  onSaved: (automation: AutomationDetail) => void
}) {
  if (!target) return null
  return (
    <AutomationSettingsDialogForm
      key={target.id}
      target={target}
      onOpenChange={onOpenChange}
      onSaved={onSaved}
    />
  )
}

function AutomationSettingsDialogForm({
  target,
  onOpenChange,
  onSaved,
}: {
  target: AutomationListItem
  onOpenChange: (open: boolean) => void
  onSaved: (automation: AutomationDetail) => void
}) {
  const [detail, setDetail] = React.useState<AutomationDetail | null>(null)
  const [values, setValues] = React.useState<AutomationSettingsValues>({
    name: target.name,
    interval: target.interval,
    takeProfitPct: "",
    stopLossPct: "",
    startingEquity: "",
    takerFeeBps: "",
    makerFeeBps: "",
    slippageBps: "",
  })
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    let cancelled = false
    void getAutomation(target.id)
      .then((automation) => {
        if (cancelled) return
        setDetail(automation)
        setValues({
          name: automation.name,
          interval: automation.interval,
          takeProfitPct:
            automation.protection.takeProfitPct === undefined
              ? ""
              : String(automation.protection.takeProfitPct),
          stopLossPct:
            automation.protection.stopLossPct === undefined
              ? ""
              : String(automation.protection.stopLossPct),
          ...backtestSettingsToValues(automation.backtest),
        })
      })
      .catch((loadError) => {
        if (!cancelled) setError(getAutomationErrorMessage(loadError))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [target.id])

  const update = <K extends keyof AutomationSettingsValues>(
    key: K,
    value: AutomationSettingsValues[K]
  ) => setValues((current) => ({ ...current, [key]: value }))

  const save = async () => {
    if (!detail || saving) return
    setError(null)
    const result = buildAutomationSettingsSave(detail, values)
    if (!result.payload) {
      setError(result.error)
      return
    }
    setSaving(true)
    try {
      const saved = await saveAutomation(result.payload)
      onSaved(saved)
      onOpenChange(false)
    } catch (saveError) {
      setError(getAutomationErrorMessage(saveError))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!saving) onOpenChange(open)
      }}
    >
      <DialogContent variant="admin" className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Automation settings</DialogTitle>
          <DialogDescription>
            Update the reusable setup without changing its canvas nodes.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <Card size="sm">
            <CardHeader>
              <CardTitle>General settings</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5 sm:col-span-2">
                <Label htmlFor="automation-settings-name">Name</Label>
                <Input
                  id="automation-settings-name"
                  value={values.name}
                  maxLength={80}
                  disabled={loading || saving}
                  onChange={(event) => update("name", event.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="automation-settings-timeframe">Timeframe</Label>
                <Select
                  value={values.interval}
                  disabled={loading || saving}
                  onValueChange={(value) =>
                    update("interval", value as StrategyInterval)
                  }
                >
                  <SelectTrigger id="automation-settings-timeframe" className="h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {INTERVALS.map((interval) => (
                      <SelectItem key={interval} value={interval}>
                        {interval}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <AutomationProtectionCard
            idPrefix="automation-settings"
            values={values}
            disabled={loading || saving}
            onChange={(next) => setValues((current) => ({ ...current, ...next }))}
          />

          <AutomationBacktestCard
            idPrefix="automation-settings"
            values={values}
            disabled={loading || saving}
            onChange={(next) => setValues((current) => ({ ...current, ...next }))}
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
          <Button
            type="button"
            variant="outline"
            disabled={saving}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={loading || saving || !detail}
            onClick={() => void save()}
          >
            {loading || saving ? (
              <Loader2Icon className="size-4 animate-spin" />
            ) : null}
            Save settings
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
