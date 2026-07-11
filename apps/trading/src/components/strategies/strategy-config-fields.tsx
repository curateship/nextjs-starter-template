import { SettingsFields } from "@/components/strategies/settings-fields"
import { Checkbox } from "@/components/ui/checkbox"
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
import {
  defaultStrategyConfig,
  STRATEGY_EDITOR_TYPE_IDS,
  strategyKindOf,
  strategyTypeDescription,
  strategyTypeLabel,
  strategyTypeOf,
  type StrategyConfig,
  type StrategyTypeId,
} from "@/lib/strategies/strategy-config"

const INTERVALS = ["1m", "5m", "15m", "1h", "4h", "1d"] as const

/**
 * THE strategy config form — timeframe, strategy type, and the type's own
 * fields (an indicator's params + the universal settings block, or a
 * self-contained kind's fields off its registry card). Shared by the template
 * editor and the backtest re-run dialog so a template really is just a saved
 * starting point: both places edit the identical full config.
 */
export function StrategyConfigFields({
  value,
  onChange,
}: {
  value: StrategyConfig
  onChange: (next: StrategyConfig) => void
}) {
  const kind = strategyKindOf(value)

  const pickType = (type: StrategyTypeId) => {
    const next = defaultStrategyConfig(type, value.interval)
    // Switching indicators keeps the settings block the user already tuned.
    if (next.kind === "signal" && value.kind === "signal") {
      next.settings = value.settings
    }
    onChange(next)
  }

  const setIndicatorParam = (key: string, param: IndicatorParamValue) => {
    if (value.kind !== "signal") return
    onChange({
      ...value,
      indicator: {
        ...value.indicator,
        params: { ...value.indicator.params, [key]: param },
      },
    })
  }

  const setKindParam = (key: string, param: IndicatorParamValue) => {
    const next = kind.setParam?.(value as never, key, param)
    if (next) onChange(next as StrategyConfig)
  }

  const renderField = (
    field: IndicatorParamField,
    fieldValue: IndicatorParamValue | undefined,
    setParam: (key: string, param: IndicatorParamValue) => void
  ) => {
    if (field.kind === "boolean") {
      return (
        <label key={field.key} className="flex cursor-pointer items-center gap-2 text-xs">
          <Checkbox
            checked={Boolean(fieldValue)}
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
            value={String(fieldValue ?? "")}
            onValueChange={(next) => setParam(field.key, next)}
          >
            <SelectTrigger className="h-8 text-xs">
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
          value={typeof fieldValue === "number" ? fieldValue : Number(fieldValue ?? 0)}
          className="h-8 text-xs"
          onChange={(event) => setParam(field.key, Number(event.target.value))}
        />
      </div>
    )
  }

  const kindParams = kind.params?.(value as never)
  const editorNote = kind.editorNote?.(value as never)

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label className="text-xs">Timeframe</Label>
          <Select
            value={value.interval}
            onValueChange={(interval) =>
              onChange({
                ...value,
                interval: interval as StrategyConfig["interval"],
              })
            }
          >
            <SelectTrigger className="h-8 text-xs">
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
        <div className="grid gap-1.5">
          <Label className="text-xs">Strategy</Label>
          <Select
            value={strategyTypeOf(value)}
            onValueChange={(type) => pickType(type as StrategyTypeId)}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STRATEGY_EDITOR_TYPE_IDS.map((id) => (
                <SelectItem key={id} value={id}>
                  {strategyTypeLabel(id)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">
        {strategyTypeDescription(strategyTypeOf(value))}
      </p>

      {value.kind === "signal" ? (
        // The signal kind's form is bespoke: the picked indicator's own
        // fields plus the universal settings block.
        <>
          <div className="grid grid-cols-2 gap-3">
            {INDICATORS[value.indicator.type].paramFields.map((field) =>
              renderField(
                field,
                value.indicator.params[field.key],
                setIndicatorParam
              )
            )}
          </div>

          <div className="border-t pt-3">
            <div className="mb-2 text-[11px] font-medium text-muted-foreground">
              Trade settings
            </div>
            <SettingsFields
              value={value.settings}
              onChange={(settings) =>
                value.kind === "signal"
                  ? onChange({ ...value, settings })
                  : undefined
              }
            />
          </div>
        </>
      ) : (
        // Every other kind renders generically off its registry card.
        <>
          <div className="grid grid-cols-2 gap-3">
            {(kind.paramFields ?? []).map((field) =>
              renderField(field, kindParams?.[field.key], setKindParam)
            )}
          </div>
          {editorNote ? (
            <p className="rounded-md border bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
              {editorNote}
            </p>
          ) : null}
        </>
      )}
    </div>
  )
}
