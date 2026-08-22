import { ChartNoAxesCombinedIcon } from "lucide-react"

import { IndicatorRow } from "@/components/trade/indicator-fields"
import type { ChartIndicators } from "@/components/trade/use-indicators"
import { Button } from "@/components/ui/button"
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
import type { IndicatorContext } from "@/lib/trade/indicators/contract"
import { INDICATOR_LIST, indicatorsOn } from "@/lib/trade/indicators/registry"

/**
 * The Indicators dropdown, in the market header beside the timeframe.
 *
 * There is no indicators page and no dashboard behind this. An indicator is a
 * chart control — a way of reading the candles in front of you — so switching
 * one on and setting it up both happen here, in one place, without leaving the
 * chart you are looking at.
 *
 * The menu is built from the library rather than written out, and the form
 * itself lives in `indicator-fields.tsx` because the Signals step draws the same
 * one. Adding an indicator to `registry.ts` puts it in this list with its own
 * settings, and nothing in this file changes.
 */
export function IndicatorsMenu({
  indicators,
  context,
}: {
  indicators: ChartIndicators
  /** What the chart below is set to — its clock and its timeframe. */
  context: IndicatorContext
}) {
  const on = indicatorsOn(indicators.settings)

  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              aria-label={on ? `Indicators, ${on} on` : "Indicators"}
              className="relative px-2 text-xs"
            >
              <ChartNoAxesCombinedIcon className="size-4 sm:hidden" />
              <span className="hidden sm:inline">
                Indicators{on ? ` (${on})` : ""}
              </span>
              {on ? (
                <span className="absolute top-0.5 right-0.5 text-[9px] leading-none sm:hidden">
                  {on}
                </span>
              ) : null}
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>Indicators</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" className="w-80 gap-1">
        {INDICATOR_LIST.map((module) => (
          <IndicatorRow
            key={module.kind}
            module={module}
            state={indicators.settings[module.kind]}
            context={context}
            onOpenChange={(next) => indicators.setOpen(module.kind, next)}
            onCardOpenChange={(title, next) =>
              indicators.setCardOpen(module.kind, title, next)
            }
            onToggle={(next) => indicators.toggle(module.kind, next)}
            onSet={(key, value) =>
              indicators.setParam(module.kind, key, value)
            }
            onReset={() => indicators.reset(module.kind)}
          />
        ))}
      </PopoverContent>
    </Popover>
  )
}
