import { EyeIcon } from "lucide-react"

import type { ChartOptionsControl } from "@/components/trade/use-chart-options"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { FieldLabel } from "@/components/ui/field-label"
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

const OPTIONS: { key: ChartOptionToggle; label: string }[] = [
  { key: "grid", label: "Chart grid" },
  { key: "volume", label: "Volume" },
  { key: "crosshair", label: "Crosshair" },
  { key: "orderArrows", label: "Order arrows" },
  { key: "drawings", label: "Your drawings" },
]

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
              size="icon-xs"
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
