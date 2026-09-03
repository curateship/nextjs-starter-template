import * as React from "react"
import { EyeIcon } from "lucide-react"

import type { ChartOptionsControl } from "@/components/trade/use-chart-options"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
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
import {
  DEFAULT_CHART_OPTIONS,
  type ChartOptions,
  type ChartOptionToggle,
  readChartType,
} from "@/lib/trade/chart-options"
import { TRADING_ZONES, readTradingZone } from "@/lib/trade/chart-timezone"

const CHART_OPTIONS: { key: ChartOptionToggle; label: string }[] = [
  { key: "grid", label: "Chart grid" },
  { key: "volume", label: "Volume" },
  { key: "crosshair", label: "Crosshair" },
]
const ACTIVITY_OPTIONS: { key: ChartOptionToggle; label: string }[] = [
  { key: "orderArrows", label: "Order arrows" },
  { key: "drawings", label: "Your drawings" },
]

function ToggleRows({
  options,
  values,
  onChange,
}: {
  options: { key: ChartOptionToggle; label: string }[]
  values: ChartOptions
  onChange: (key: ChartOptionToggle, checked: boolean) => void
}) {
  return (
    <div className="grid">
      {options.map(({ key, label }) => (
        <label
          key={key}
          htmlFor={`chart-option-${key}`}
          className="flex h-7 cursor-pointer items-center gap-2 rounded-md px-2 text-sm hover:bg-muted/60"
        >
          <Checkbox
            id={`chart-option-${key}`}
            checked={values[key]}
            onCheckedChange={(checked) => onChange(key, checked === true)}
          />
          {label}
        </label>
      ))}
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-2 pt-4 pb-1 text-xs font-medium text-muted-foreground first:pt-2">
      {children}
    </div>
  )
}

export function ChartOptionsMenu({
  control,
  trigger,
  nested = false,
}: {
  control: ChartOptionsControl
  trigger?: React.ReactElement
  /** Places the dropdown beside a trigger inside another chart menu. */
  nested?: boolean
}) {
  const [open, setOpen] = React.useState(false)
  const [trades, setTrades] = React.useState(
    control.options.orderArrowTrades?.toString() ?? ""
  )

  function openMenu(next: boolean) {
    if (next) setTrades(control.options.orderArrowTrades?.toString() ?? "")
    setOpen(next)
  }

  const tradesInvalid =
    trades !== "" &&
    (!Number.isSafeInteger(Number(trades)) || Number(trades) <= 0)

  // Every change lands as it is made — a dropdown has no Save button, and the
  // chart behind it shows the result at once. The trades count only lands
  // while it is a usable number; a half-typed value changes nothing.
  function setToggle(key: ChartOptionToggle, checked: boolean) {
    control.replace({ ...control.options, [key]: checked })
  }

  function setTradesValue(value: string) {
    setTrades(value)
    const amount = value === "" ? null : Number(value)
    if (amount === null || (Number.isSafeInteger(amount) && amount > 0)) {
      control.replace({ ...control.options, orderArrowTrades: amount })
    }
  }

  function reset() {
    setTrades(DEFAULT_CHART_OPTIONS.orderArrowTrades?.toString() ?? "")
    control.replace(DEFAULT_CHART_OPTIONS)
  }

  return (
    <Popover open={open} onOpenChange={openMenu}>
      {trigger ? (
        <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      ) : (
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="View options"
                className="bg-muted/60 dark:bg-muted/60"
              >
                <EyeIcon className="size-4" />
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent>View options</TooltipContent>
        </Tooltip>
      )}
      <PopoverContent
        side={nested ? "right" : "bottom"}
        align={nested ? "start" : "end"}
        sideOffset={nested ? 8 : 4}
        className="w-72 gap-0 p-2"
      >
        <SectionLabel>Chart</SectionLabel>
        <div className="grid gap-2 px-2 pb-2">
          <FieldLabel htmlFor="chart-option-type">Chart type</FieldLabel>
          <Select
            value={control.options.chartType}
            onValueChange={(chartType) =>
              control.replace({
                ...control.options,
                chartType: readChartType(chartType),
              })
            }
          >
            <SelectTrigger id="chart-option-type" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="candles">Candles</SelectItem>
              <SelectItem value="line">Line</SelectItem>
              <SelectItem value="heikin-ashi">Heikin-Ashi</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <ToggleRows
          options={CHART_OPTIONS}
          values={control.options}
          onChange={setToggle}
        />
        <SectionLabel>Your activity</SectionLabel>
        <ToggleRows
          options={ACTIVITY_OPTIONS}
          values={control.options}
          onChange={setToggle}
        />
        {control.options.orderArrows ? (
          <div className="grid gap-2 px-2 pt-4">
            <FieldLabel
              htmlFor="chart-option-order-arrow-trades"
              hint="Enter how many of the newest finished trades should keep their arrows. Leave this empty to show every finished trade."
            >
              Previous trades
            </FieldLabel>
            <Input
              id="chart-option-order-arrow-trades"
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              placeholder="All"
              value={trades}
              aria-invalid={tradesInvalid}
              onChange={(event) => setTradesValue(event.target.value)}
            />
          </div>
        ) : null}
        <SectionLabel>
          <FieldLabel
            htmlFor="chart-option-zone"
            hint="Every time on the chart uses this clock, including the axis and session starts."
          >
            Timezone
          </FieldLabel>
        </SectionLabel>
        <div className="px-2">
          <Select
            value={control.options.zone}
            onValueChange={(zone) =>
              control.replace({
                ...control.options,
                zone: readTradingZone(zone),
              })
            }
          >
            <SelectTrigger id="chart-option-zone" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TRADING_ZONES.map((zone) => (
                <SelectItem key={zone.id} value={zone.id}>
                  {zone.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="-mx-2 mt-2 border-t px-2 pt-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full justify-start"
            onClick={reset}
          >
            Reset to defaults
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
