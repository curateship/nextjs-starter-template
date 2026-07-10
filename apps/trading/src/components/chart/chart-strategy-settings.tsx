import type { ChartStrategyState } from "@/components/chart/chart-strategy"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
  type IndicatorParamValue,
} from "@/lib/indicators/registry"

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
 * Settings for a picked indicator: its real parameters (the same values the
 * strategy engine would trade on) plus chart display toggles.
 */
export function IndicatorSettingsDialog({
  open,
  onOpenChange,
  state,
  onChange,
  hideParams = false,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  state: ChartStrategyState
  onChange: (next: ChartStrategyState) => void
  /** Bot charts: the indicator params are the bot's snapshot — not editable here. */
  hideParams?: boolean
}) {
  const selection = state.indicator
  if (!selection) return null
  const module = INDICATORS[selection.type]
  const extraToggles = INDICATOR_TOGGLES[selection.type] ?? []

  const setParam = (key: string, value: IndicatorParamValue) =>
    onChange({
      ...state,
      indicator: { ...selection, params: { ...selection.params, [key]: value } },
    })

  const renderField = (field: IndicatorParamField) => {
    const value = selection.params[field.key]
    if (field.kind === "boolean") {
      return (
        <label
          key={field.key}
          className="flex cursor-pointer items-center gap-2 text-xs"
        >
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
            <SelectTrigger className="w-40 text-xs">
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
        <Label htmlFor={`ind-${field.key}`} className="text-xs">
          {field.label}
        </Label>
        <Input
          id={`ind-${field.key}`}
          type="number"
          step={field.step}
          value={typeof value === "number" ? value : Number(value ?? 0)}
          className="h-8 w-28 text-xs"
          onChange={(event) => setParam(field.key, Number(event.target.value))}
        />
      </div>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>{module.label}</DialogTitle>
          <DialogDescription>{module.description}</DialogDescription>
        </DialogHeader>
        <div className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto px-6 py-4">
          {hideParams ? null : (
            <div className="grid grid-cols-2 gap-3">
              {module.paramFields.map(renderField)}
            </div>
          )}
          <div className={hideParams ? undefined : "border-t pt-3"}>
            <div className="mb-2 text-[11px] font-medium text-muted-foreground">
              Display
            </div>
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
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
