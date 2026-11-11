import * as React from "react"
import { EllipsisVerticalIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { DatePicker } from "@/components/ui/date-picker"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Switch } from "@/components/ui/switch"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { GraphOverlays, GraphWindow } from "@/lib/trade/backtest/graph"
import { cn } from "@/lib/utils"

const LINES: { key: keyof GraphOverlays; label: string; swatch: string }[] = [
  { key: "offPeak", label: "Off peak", swatch: "bg-red-600 dark:bg-red-400" },
  { key: "liquidations", label: "Liquidations", swatch: "bg-red-600 dark:bg-red-400" },
  { key: "inCoins", label: "In markets", swatch: "bg-teal-600 dark:bg-teal-400" },
]

/**
 * The Graph's ⋮, last in the middle header before the right panel's reopen
 * button: its three lines as on and off switches, then From, To and Reset
 * (Tyler, 10 Nov 2026: "add a 3 vertical dot dropdown here and move the [line
 * switches] but make it a swicher to check on and off. Move the from, to and
 * reset as well"). A popover rather than a menu, so a date picked in From or
 * To does not shut it.
 */
export function GraphMenu({
  overlays,
  onOverlays,
  window,
  onWindow,
}: {
  overlays: GraphOverlays
  onOverlays: (change: (old: GraphOverlays) => GraphOverlays) => void
  window: GraphWindow
  onWindow: (next: GraphWindow) => void
}) {
  const [open, setOpen] = React.useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button type="button" variant="ghost" size="icon-sm" aria-label="Graph options">
              <EllipsisVerticalIcon className="size-4" />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>Graph options</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" className="grid w-60 gap-3 p-3">
        <div className="grid gap-2">
          <p className="text-xs font-medium text-muted-foreground">Lines</p>
          {LINES.map((line) => {
            const id = `graph-line-${line.key}`
            return (
              <label key={line.key} htmlFor={id} className="flex items-center gap-2 text-sm">
                <span className={cn("inline-block size-2 shrink-0 rounded-full", line.swatch)} />
                <span className="min-w-0 flex-1 truncate">{line.label}</span>
                <Switch
                  id={id}
                  checked={overlays[line.key]}
                  onCheckedChange={(on) => onOverlays((old) => ({ ...old, [line.key]: on }))}
                />
              </label>
            )
          })}
        </div>
        <div className="grid gap-2 border-t pt-3">
          <p className="text-xs font-medium text-muted-foreground">Dates</p>
          <DatePicker
            value={window.from === null ? undefined : new Date(window.from)}
            placeholder="From"
            className="h-8 text-xs"
            onChange={(date) => onWindow({ ...window, from: date ? date.getTime() : null, sel: null })}
          />
          <DatePicker
            value={window.to === null ? undefined : new Date(window.to)}
            placeholder="To"
            className="h-8 text-xs"
            onChange={(date) => onWindow({ ...window, to: date ? date.getTime() : null, sel: null })}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8"
            // Never disabled: a button that is the way out of a state should
            // still be pressable when you are not sure you are in it.
            onClick={() => onWindow({ preset: "all", from: null, to: null, sel: null })}
          >
            Reset
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
