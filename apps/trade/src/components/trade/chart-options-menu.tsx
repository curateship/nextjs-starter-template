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
import type { ChartOptionToggle } from "@/lib/trade/chart-options"
import { TRADING_ZONES, readTradingZone } from "@/lib/trade/chart-timezone"
import { showErrorToast } from "@/lib/toast/error-toast"

const OPTIONS: { key: ChartOptionToggle; label: string }[] = [
  { key: "grid", label: "Chart grid" },
  { key: "volume", label: "Volume" },
  { key: "crosshair", label: "Crosshair" },
  { key: "orderArrows", label: "Order arrows" },
  { key: "drawings", label: "Your drawings" },
]

function PreviousTradesInput({ control }: { control: ChartOptionsControl }) {
  const [draft, setDraft] = React.useState(
    control.options.orderArrowTrades?.toString() ?? ""
  )
  const [invalid, setInvalid] = React.useState(false)

  function changeDraft(value: string) {
    setDraft(value)
    if (value === "") {
      setInvalid(false)
      control.setOrderArrowTrades(null)
      return
    }

    const amount = /^\d+$/.test(value) ? Number(value) : Number.NaN
    const valid = Number.isSafeInteger(amount) && amount > 0
    setInvalid(!valid)
    if (valid) control.setOrderArrowTrades(amount)
  }

  return (
    <div className="grid gap-2">
      <FieldLabel
        htmlFor="chart-option-order-arrow-trades"
        hint="Enter how many of the newest finished trades should keep their arrows. Leave this empty to show every finished trade. Fills from a position that is still open always stay visible."
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
        value={draft}
        aria-invalid={invalid}
        onChange={(event) => changeDraft(event.target.value)}
        onBlur={() => {
          if (invalid) {
            showErrorToast(
              "Previous trades must be a whole number greater than zero."
            )
          }
        }}
      />
    </div>
  )
}

/**
 * The eye beside Indicators: which supporting chart parts are shown, and which
 * clock the chart is on.
 *
 * The clock is here rather than on each indicator on purpose. There is one of
 * it, and the time axis, the crosshair and every session boundary all read it,
 * so a box drawn at 09:30 and an axis labelled 09:30 are the same 09:30.
 */
export function ChartOptionsMenu({
  control,
}: {
  control: ChartOptionsControl
}) {
  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="View options"
            >
              <EyeIcon className="size-4" />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>View options</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" className="w-56 gap-3">
        <p className="text-sm font-medium">View options</p>
        <div className="grid gap-3">
          {OPTIONS.map(({ key, label }) => {
            const id = `chart-option-${key}`
            return (
              <div key={key} className="flex items-center gap-2">
                <Checkbox
                  id={id}
                  checked={control.options[key]}
                  onCheckedChange={(checked) =>
                    control.setOption(key, checked === true)
                  }
                />
                <label htmlFor={id} className="text-sm leading-none">
                  {label}
                </label>
              </div>
            )
          })}
        </div>
        {control.options.orderArrows ? (
          <PreviousTradesInput control={control} />
        ) : null}
        <div className="grid gap-2 border-t pt-3">
          <FieldLabel
            htmlFor="chart-option-zone"
            hint="Every time on the chart is read on this clock — the axis, the crosshair, and where a trading session starts. Daylight saving is followed, so a summer date and a winter date shift by different amounts against UTC."
          >
            Timezone
          </FieldLabel>
          <Select
            value={control.options.zone}
            onValueChange={(zone) => control.setZone(readTradingZone(zone))}
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
      </PopoverContent>
    </Popover>
  )
}
