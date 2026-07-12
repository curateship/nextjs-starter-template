import { evaluateAutomation } from "@/lib/automations/evaluate"
import type {
  IndicatorCandle,
  IndicatorOutput,
} from "@/lib/indicators/contract"
import type { StrategyConfig } from "./strategy-config"

const EMPTY_OUTPUT: IndicatorOutput = {
  paint: { indicators: [], lines: [], zones: [], barColors: [] },
  signals: [],
}

/** Chart paint and entry signals for any strategy kind over the same candles. */
export function computeStrategyOutput(
  candles: IndicatorCandle[],
  config: StrategyConfig
): IndicatorOutput {
  if (config.kind === "automation") {
    const evaluated = evaluateAutomation(candles, config)
    return {
      paint: evaluated.paint,
      signals: evaluated.actions.flatMap((action) =>
        action.action === "close" || action.action === "reverse"
          ? []
          : [
              {
                time: action.time,
                side:
                  action.action === "buy"
                    ? ("buy" as const)
                    : ("sell" as const),
              },
            ]
      ),
    }
  }
  return EMPTY_OUTPUT
}
