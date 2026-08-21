import { IndicatorRow } from "@/components/trade/indicator-fields"
import type { ChartIndicators } from "@/components/trade/use-indicators"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
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
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          // The chart's own control strip, not a form: it sits beside the
          // timeframe buttons and matches their height rather than the 32px
          // every field on a page uses. A control a third taller than the row
          // it is in would read as belonging to something else.
          className="h-6 px-2 text-xs"
        >
          Indicators{on ? ` (${on})` : ""}
        </Button>
      </PopoverTrigger>
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
