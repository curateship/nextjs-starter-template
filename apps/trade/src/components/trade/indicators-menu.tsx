import * as React from "react"
import { ChartNoAxesCombinedIcon, SettingsIcon } from "lucide-react"

import { IndicatorSettingsCards } from "@/components/trade/indicator-fields"
import type { ChartIndicators } from "@/components/trade/use-indicators"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { ColorSwatch } from "@/components/ui/color-swatch"
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import type {
  IndicatorContext,
  IndicatorModule,
  IndicatorParams,
} from "@/lib/trade/indicators/contract"
import {
  defaultIndicatorSettings,
  defaultParamsOf,
  INDICATOR_LIST,
  indicatorsOn,
} from "@/lib/trade/indicators/registry"

function IndicatorMark({
  module,
  params,
}: {
  module: IndicatorModule
  params: IndicatorParams
}) {
  const colors = module.fields.flatMap((field) => {
    if (field.kind !== "color") return []
    const value = params[field.key]
    return [typeof value === "string" ? value : field.fallback]
  })
  if (colors.length > 0) {
    return (
      <span aria-hidden="true" className="flex items-center gap-1">
        {colors.slice(0, 3).map((color, index) => (
          <span
            key={`${color}-${index}`}
            className="size-3 rounded-full"
            style={{ backgroundColor: color }}
          />
        ))}
      </span>
    )
  }
  if (module.kind === "orb") {
    return (
      <span
        aria-hidden="true"
        className="h-4 w-8 rounded-sm border-2 border-teal-600 bg-teal-500/10"
      />
    )
  }
  return (
    <span aria-hidden="true" className="flex w-8 flex-col gap-1">
      <span className="h-0.5 rounded-full bg-emerald-600" />
      <span className="h-0.5 rounded-full bg-rose-600" />
    </span>
  )
}

const EMA_ROWS = [
  { show: "show20", period: "period20", color: "color20" },
  { show: "show50", period: "period50", color: "color50" },
  { show: "show200", period: "period200", color: "color200" },
] as const

function EmaSettingsCards({
  draft,
  onSet,
}: {
  draft: IndicatorParams
  onSet: (key: string, value: number | boolean | string) => void
}) {
  const period = (key: string) => Number(draft[key])
  const pairLabels = {
    "fast-medium": `${period("period20")} × ${period("period50")}`,
    "fast-slow": `${period("period20")} × ${period("period200")}`,
    "medium-slow": `${period("period50")} × ${period("period200")}`,
  }

  return (
    <>
      <Card size="sm">
        <CardHeader>
          <CardTitle>Lines</CardTitle>
          <p className="text-sm text-muted-foreground">
            Each line can be hidden, re-timed and recoloured on its own.
          </p>
        </CardHeader>
        <CardContent className="grid gap-4">
          {EMA_ROWS.map((row) => {
            const shown = draft[row.show] === true
            const color = String(draft[row.color])
            const value = period(row.period)
            return (
              <div
                key={row.show}
                className="grid grid-cols-[6rem_3.5rem_5rem] items-center gap-2 sm:grid-cols-[10rem_5rem_8rem]"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <Checkbox
                    id={`ema-${row.show}`}
                    checked={shown}
                    onCheckedChange={(checked) =>
                      onSet(row.show, checked === true)
                    }
                  />
                  <label
                    htmlFor={`ema-${row.show}`}
                    className="flex min-w-0 items-center gap-1.5 text-xs sm:gap-2 sm:text-sm"
                  >
                    <span
                      aria-hidden="true"
                      className="h-1 w-4 shrink-0 rounded-full sm:w-6"
                      style={{ backgroundColor: shown ? color : undefined }}
                    />
                    <span className="truncate">EMA {value}</span>
                  </label>
                </div>
                <Input
                  aria-label={`EMA ${value} candle period`}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={1_000}
                  value={value}
                  disabled={!shown}
                  onChange={(event) => {
                    const next = Number(event.target.value)
                    if (Number.isInteger(next) && next >= 1 && next <= 1_000)
                      onSet(row.period, next)
                  }}
                />
                <div className="flex min-w-0 items-center gap-1 sm:gap-2">
                  <ColorSwatch
                    aria-label={`EMA ${value} color`}
                    value={color}
                    disabled={!shown}
                    className="w-8 sm:w-12"
                    onChange={(event) => onSet(row.color, event.target.value)}
                  />
                  <span className="truncate text-xs text-muted-foreground sm:text-sm">
                    {color.replace("#", "").toUpperCase()}
                  </span>
                </div>
              </div>
            )
          })}
        </CardContent>
      </Card>
      <Card size="sm">
        <CardHeader>
          <CardTitle>Signals</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="flex items-center justify-between gap-4">
            <label htmlFor="ema-cross-signals" className="text-sm">
              Cross signals
            </label>
            <Switch
              id="ema-cross-signals"
              checked={draft.showSignals === true}
              onCheckedChange={(checked) => onSet("showSignals", checked)}
            />
          </div>
          <div className="flex items-center justify-between gap-4">
            <label
              htmlFor="ema-signal-pair"
              className="text-sm text-muted-foreground"
            >
              Arrow when these cross
            </label>
            <Select
              value={String(draft.signalPair)}
              onValueChange={(value) => onSet("signalPair", value)}
              disabled={draft.showSignals !== true}
            >
              <SelectTrigger id="ema-signal-pair">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(pairLabels).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>
    </>
  )
}

function IndicatorDialog({
  module,
  indicators,
  context,
  open,
  onOpenChange,
}: {
  module: IndicatorModule
  indicators: ChartIndicators
  context: IndicatorContext
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const saved = indicators.settings[module.kind].params
  const [draft, setDraft] = React.useState<IndicatorParams>(saved)

  function save() {
    for (const [key, value] of Object.entries(draft)) {
      if (saved[key] !== value) indicators.setParam(module.kind, key, value)
    }
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent variant="admin" className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{module.label}</DialogTitle>
          <DialogDescription>{module.description}</DialogDescription>
        </DialogHeader>
        <DialogBody>
          {module.kind === "ema" ? (
            <EmaSettingsCards
              draft={draft}
              onSet={(key, value) =>
                setDraft((current) => ({ ...current, [key]: value }))
              }
            />
          ) : (
            <IndicatorSettingsCards
              module={module}
              params={draft}
              context={context}
              idPrefix={`indicator-dialog-${module.kind}`}
              onSet={(key, value) =>
                setDraft((current) => ({ ...current, [key]: value }))
              }
            />
          )}
        </DialogBody>
        <DialogFooter>
          {module.fields.length > 0 ? (
            <Button
              type="button"
              variant="ghost"
              className="mr-auto"
              onClick={() => setDraft(defaultParamsOf(module.kind))}
            >
              Reset to defaults
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="button" onClick={save}>
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function IndicatorsMenu({
  indicators,
  context,
}: {
  indicators: ChartIndicators
  context: IndicatorContext
}) {
  const on = indicatorsOn(indicators.settings)
  const [editing, setEditing] = React.useState<string | null>(null)
  return (
    <>
      <Popover>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                aria-label={on ? `Indicators, ${on} on` : "Indicators"}
                className="relative bg-muted/60 dark:bg-muted/60"
              >
                <ChartNoAxesCombinedIcon className="size-4" />
                {on ? (
                  <span className="absolute -top-1 -right-1 flex size-3 items-center justify-center rounded-full bg-foreground text-[8px] leading-none text-background">
                    {on}
                  </span>
                ) : null}
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent>Indicators</TooltipContent>
        </Tooltip>
        <PopoverContent align="end" className="w-80 gap-0 p-2">
          <div className="grid gap-1">
            {INDICATOR_LIST.map((module) => {
              const state = indicators.settings[module.kind]
              return (
                <div
                  key={module.kind}
                  className="flex h-8 items-center gap-2 rounded-md px-1.5 hover:bg-muted/60"
                >
                  <Switch
                    checked={state.on}
                    onCheckedChange={(next) =>
                      indicators.toggle(module.kind, next)
                    }
                    aria-label={`${state.on ? "Hide" : "Show"} ${module.label}`}
                  />
                  <span className="min-w-0 flex-1 truncate text-xs font-medium">
                    {module.label}
                  </span>
                  <IndicatorMark module={module} params={state.params} />
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Settings for ${module.label}`}
                        onClick={() => setEditing(module.kind)}
                      >
                        <SettingsIcon className="size-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Settings</TooltipContent>
                  </Tooltip>
                </div>
              )
            })}
          </div>
          <div className="-mx-2 mt-2 flex items-center border-t px-3 pt-2 text-xs text-muted-foreground">
            <span>
              {on} of {INDICATOR_LIST.length} on
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="ml-auto"
              onClick={() => indicators.replace(defaultIndicatorSettings())}
            >
              Reset all
            </Button>
          </div>
        </PopoverContent>
      </Popover>
      {INDICATOR_LIST.map((module) =>
        editing === module.kind ? (
          <IndicatorDialog
            key={module.kind}
            module={module}
            indicators={indicators}
            context={context}
            open
            onOpenChange={(open) => setEditing(open ? module.kind : null)}
          />
        ) : null
      )}
    </>
  )
}
