import type { CandleBar } from "@/lib/protocols/contracts"
import { DEFAULT_CHART_OPTIONS } from "@/lib/trade/chart-options"
import type { TradeFlowRunSpec } from "@/lib/trade/flow-run"
import { baseDashes } from "@/lib/trade/indicators/base"
import { emaIndicator } from "@/lib/trade/indicators/ema"
import { indicatorPaint } from "@/lib/trade/indicators/registry"

/** The indicator a run chart draws from the settings frozen at switch-on. */
export function flowRunIndicatorPaint(
  spec: TradeFlowRunSpec,
  bars: readonly CandleBar[]
) {
  if (spec.strategy.kind === "signals") {
    return indicatorPaint(spec.strategy.indicators, [...bars], {
      zone: DEFAULT_CHART_OPTIONS.zone,
      interval: spec.strategy.interval,
    })
  }
  if (spec.strategy.kind === "emaGrid") {
    return emaIndicator.compute(
      [...bars],
      {
        show20: false,
        show50: false,
        show200: true,
        period200: spec.strategy.settings.emaPeriod,
        showSignals: false,
      },
      {
        zone: DEFAULT_CHART_OPTIONS.zone,
        interval: spec.strategy.interval,
      }
    )
  }
  return {
    lines: [],
    dashes: baseDashes([...bars], spec.strategy.params.baseDetection),
    // No arrows. The base indicator marks every candle that confirmed a
    // level, which reads as an order beside the fill arrows already there.
    marks: [],
    boxes: [],
  }
}
