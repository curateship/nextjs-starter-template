import { EyeIcon } from "lucide-react"

import type { ChartOptionsControl } from "@/components/trade/use-chart-options"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import type { ChartOptions } from "@/lib/trade/chart-options"

const OPTIONS: { key: keyof ChartOptions; label: string }[] = [
  { key: "grid", label: "Chart grid" },
  { key: "volume", label: "Volume" },
  { key: "crosshair", label: "Crosshair" },
]

/** The eye beside Indicators controls which supporting chart parts are shown. */
export function ChartOptionsMenu({ control }: { control: ChartOptionsControl }) {
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
      <PopoverContent align="end" className="w-48 gap-3">
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
      </PopoverContent>
    </Popover>
  )
}
