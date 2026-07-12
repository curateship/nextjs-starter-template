import * as React from "react"
import { Loader2Icon } from "lucide-react"

import type { ChartStrategyState } from "@/components/chart/chart-strategy"
import { QuickTestResults } from "@/components/chart/quick-test-dialog"
import { StrategyConfigFields } from "@/components/strategies/strategy-config-fields"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
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
import { saveStrategySettings } from "@/lib/api/strategies"
import { runQuickTest, type QuickTestResponse } from "@/lib/api/quick-test"
import { INDICATORS } from "@/lib/indicators/registry"
import type { SignalStrategyConfig } from "@/lib/strategies/strategy-config"

type StrategyToggle = { key: keyof ChartStrategyState; label: string }

/** Display toggles relevant per indicator (beyond signals, which all have). */
const INDICATOR_TOGGLES: Record<string, StrategyToggle[]> = {
  qqe: [
    { key: "showZones", label: "Consolidation zones" },
    { key: "showSwings", label: "Swing high / low" },
    { key: "showBarColors", label: "Bar colors" },
  ],
}

/**
 * The chart's strategy settings modal: the EXACT settings form the Strategies
 * dashboard edits (same component, same save), plus the chart-only Display
 * card, plus Quick Test — days to test in the footer, results inline.
 */
export function IndicatorSettingsDialog({
  open,
  onOpenChange,
  state,
  onChange,
  config,
  onConfigChange,
  pinned = false,
  network,
  market,
  onQuickTestResult,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  state: ChartStrategyState
  onChange: (next: ChartStrategyState) => void
  /** The strategy's saved config — the same record the Strategies page edits.
   * Omitted on bot charts (the bot's snapshot is not editable here). */
  config?: SignalStrategyConfig
  onConfigChange?: (next: SignalStrategyConfig) => void
  /** The strategy's saved pin flag, preserved on save. */
  pinned?: boolean
  /** Quick test context — the chart's data source. */
  network?: "mainnet" | "testnet"
  market?: string
  /** Fired with each finished quick test so the chart can paint its trades. */
  onQuickTestResult?: (response: QuickTestResponse | null) => void
}) {
  const [windowDays, setWindowDays] = React.useState("30")
  const [busy, setBusy] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [response, setResponse] = React.useState<QuickTestResponse | null>(null)

  // A fresh open starts without a stale result from the last visit.
  React.useEffect(() => {
    if (!open) return
    setError(null)
    setResponse(null)
  }, [open])

  const selection = state.indicator
  if (!selection) return null
  const module = INDICATORS[selection.type]
  const extraToggles = INDICATOR_TOGGLES[selection.type] ?? []

  async function save() {
    if (!config) return
    setError(null)
    setSaving(true)
    try {
      await saveStrategySettings({
        strategyType: config.indicator.type,
        config,
        pinned,
      })
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Saving settings failed")
    } finally {
      setSaving(false)
    }
  }

  async function runTest() {
    if (!config || !network || !market) return
    setError(null)
    setBusy(true)
    try {
      const days = Math.max(1, Number(windowDays) || 30)
      const res = await runQuickTest({
        network,
        market,
        windowDays: days,
        config,
      })
      setResponse(res)
      onQuickTestResult?.(res)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Test failed")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (busy || saving) return
        onOpenChange(next)
      }}
    >
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>{module.label}</DialogTitle>
          {/* The settings form repeats the description; don't show it twice. */}
          {config ? null : (
            <DialogDescription>{module.description}</DialogDescription>
          )}
        </DialogHeader>
        <DialogBody>
          {config && onConfigChange ? (
            // The Strategies dashboard's settings form, verbatim — one shared
            // component editing one shared save.
            <Card size="sm">
              <CardHeader>
                <CardTitle>Default settings</CardTitle>
                <CardDescription>
                  These settings are the starting point for this strategy.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <StrategyConfigFields
                  value={config}
                  lockedType={config.indicator.type}
                  onChange={(next) =>
                    next.kind === "signal" ? onConfigChange(next) : undefined
                  }
                />
              </CardContent>
            </Card>
          ) : null}
          <Card size="sm">
            <CardHeader>
              <CardTitle>Display</CardTitle>
            </CardHeader>
            <CardContent>
            <div className="grid gap-2">
              <label className="flex cursor-pointer items-center gap-2 text-xs">
                <Checkbox
                  checked={state.showSignals}
                  onCheckedChange={(checked) =>
                    onChange({ ...state, showSignals: checked === true })
                  }
                />
                Signal arrows
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-xs">
                <Checkbox
                  checked={state.showIndicators}
                  onCheckedChange={(checked) =>
                    onChange({ ...state, showIndicators: checked === true })
                  }
                />
                Indicator lines
              </label>
              {extraToggles.map((toggle) => (
                <label
                  key={toggle.key}
                  className="flex cursor-pointer items-center gap-2 text-xs"
                >
                  <Checkbox
                    checked={Boolean(state[toggle.key])}
                    onCheckedChange={(checked) =>
                      onChange({ ...state, [toggle.key]: checked === true })
                    }
                  />
                  {toggle.label}
                </label>
              ))}
              <div className="grid gap-1.5 pt-1">
                <Label htmlFor="ind-max-signals" className="text-xs">
                  Max recent signals
                </Label>
                <Input
                  id="ind-max-signals"
                  type="number"
                  min={1}
                  max={500}
                  value={state.maxSignals}
                  className="h-8 w-28 text-xs"
                  onChange={(event) =>
                    onChange({
                      ...state,
                      maxSignals: Math.max(0, Number(event.target.value) || 0),
                    })
                  }
                />
              </div>
            </div>
            </CardContent>
          </Card>
          {response?.result ? <QuickTestResults result={response.result} /> : null}
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
        </DialogBody>
        {config && onConfigChange ? (
          <DialogFooter>
            <div className="mr-auto flex items-center gap-2">
              <Label
                htmlFor="strat-test-days"
                className="text-xs whitespace-nowrap"
              >
                Days to test
              </Label>
              <Input
                id="strat-test-days"
                inputMode="numeric"
                value={windowDays}
                className="h-8 w-20 text-xs"
                onChange={(event) => setWindowDays(event.target.value.trim())}
              />
            </div>
            <Button
              variant="outline"
              disabled={busy || saving}
              onClick={() => void runTest()}
            >
              {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
              {response ? "Quick test again" : "Quick test"}
            </Button>
            <Button disabled={busy || saving} onClick={() => void save()}>
              {saving ? <Loader2Icon className="size-4 animate-spin" /> : null}
              Save
            </Button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
