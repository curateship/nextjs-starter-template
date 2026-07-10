import * as React from "react"
import { Loader2Icon } from "lucide-react"

import { SettingsFields } from "@/components/strategies/settings-fields"
import { Button } from "@/components/ui/button"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { IndicatorParamField } from "@/lib/indicators/contract"
import {
  INDICATORS,
  INDICATOR_IDS,
  type IndicatorId,
  type IndicatorParamValue,
} from "@/lib/indicators/registry"
import { saveStrategy, type StrategyListItem } from "@/lib/api/strategies"
import { DEFAULT_STRATEGY_SETTINGS } from "@/lib/strategies/settings"
import {
  strategyConfigSchema,
  type StrategyConfig,
} from "@/lib/strategies/strategy-config"

const INTERVALS = ["1m", "5m", "15m", "1h", "4h", "1d"] as const

function defaultConfig(): StrategyConfig {
  return {
    v: 2,
    interval: "15m",
    indicator: {
      type: "qqe",
      params: {
        ...(INDICATORS.qqe.defaultParams as Record<string, IndicatorParamValue>),
      },
    },
    settings: { ...DEFAULT_STRATEGY_SETTINGS },
  }
}

/**
 * Create/edit one saved strategy: a name, the indicator (with its real
 * parameters — the same numbers the engine will trade on), and the universal
 * settings block.
 */
export function StrategyEditorDialog({
  open,
  target,
  onOpenChange,
  onSaved,
}: {
  open: boolean
  /** null = create new. */
  target: StrategyListItem | null
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}) {
  const [name, setName] = React.useState("")
  const [config, setConfig] = React.useState<StrategyConfig>(defaultConfig)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open) return
    setName(target?.name ?? "")
    setConfig(target ? target.config : defaultConfig())
    setError(null)
  }, [open, target])

  const module = INDICATORS[config.indicator.type]

  const pickIndicator = (type: IndicatorId) =>
    setConfig((current) => ({
      ...current,
      indicator: {
        type,
        params: {
          ...(INDICATORS[type].defaultParams as Record<string, IndicatorParamValue>),
        },
      },
    }))

  const setParam = (key: string, value: IndicatorParamValue) =>
    setConfig((current) => ({
      ...current,
      indicator: {
        ...current.indicator,
        params: { ...current.indicator.params, [key]: value },
      },
    }))

  const renderField = (field: IndicatorParamField) => {
    const value = config.indicator.params[field.key]
    if (field.kind === "boolean") {
      return (
        <label key={field.key} className="flex cursor-pointer items-center gap-2 text-xs">
          <Checkbox
            checked={Boolean(value)}
            onCheckedChange={(checked) => setParam(field.key, checked === true)}
          />
          {field.label}
        </label>
      )
    }
    if (field.kind === "select" && field.options) {
      return (
        <div key={field.key} className="grid gap-1.5">
          <Label className="text-xs">{field.label}</Label>
          <Select
            value={String(value ?? "")}
            onValueChange={(next) => setParam(field.key, next)}
          >
            <SelectTrigger className="text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {field.options.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )
    }
    return (
      <div key={field.key} className="grid gap-1.5">
        <Label htmlFor={`sp-${field.key}`} className="text-xs">
          {field.label}
        </Label>
        <Input
          id={`sp-${field.key}`}
          type="number"
          step={field.step}
          value={typeof value === "number" ? value : Number(value ?? 0)}
          className="h-8 text-xs"
          onChange={(event) => setParam(field.key, Number(event.target.value))}
        />
      </div>
    )
  }

  async function save() {
    setError(null)
    if (!name.trim()) {
      setError("Give the strategy a name.")
      return
    }
    const parsed = strategyConfigSchema.safeParse(config)
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid configuration")
      return
    }
    setBusy(true)
    try {
      await saveStrategy({
        strategyId: target?.id,
        name: name.trim(),
        config: parsed.data,
      })
      onOpenChange(false)
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent variant="admin" className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{target ? "Edit strategy" : "New strategy"}</DialogTitle>
          <DialogDescription>
            A strategy is an indicator plus one settings block. The chart
            paints exactly what it trades on.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="flex max-h-[65vh] flex-col gap-4 overflow-y-auto">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="strategy-name" className="text-xs">
                Name
              </Label>
              <Input
                id="strategy-name"
                value={name}
                placeholder="e.g. QQE 15m BTC"
                className="h-8 text-xs"
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">Timeframe</Label>
              <Select
                value={config.interval}
                onValueChange={(interval) =>
                  setConfig((current) => ({
                    ...current,
                    interval: interval as StrategyConfig["interval"],
                  }))
                }
              >
                <SelectTrigger className="text-xs">
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
          </div>

          <div className="grid gap-1.5">
            <Label className="text-xs">Indicator</Label>
            <Select
              value={config.indicator.type}
              onValueChange={(type) => pickIndicator(type as IndicatorId)}
            >
              <SelectTrigger className="text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {INDICATOR_IDS.map((id) => (
                  <SelectItem key={id} value={id}>
                    {INDICATORS[id].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">{module.description}</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {module.paramFields.map(renderField)}
          </div>

          <div className="border-t pt-3">
            <div className="mb-2 text-[11px] font-medium text-muted-foreground">
              Trade settings
            </div>
            <SettingsFields
              value={config.settings}
              onChange={(settings) =>
                setConfig((current) => ({ ...current, settings }))
              }
            />
          </div>

          {error ? (
            <p className="text-xs text-destructive">{error}</p>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" disabled={busy} onClick={() => void save()}>
            {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
            {target ? "Save changes" : "Create strategy"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
