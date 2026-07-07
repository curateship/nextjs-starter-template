import type { StrategyParams, StrategyType } from "@/lib/strategies/params"

export type ParamValues = Record<string, string>

export const PARAM_DEFAULTS: Record<StrategyType, ParamValues> = {
  grid: {
    lowerPx: "",
    upperPx: "",
    levels: "10",
    sizePerLevelUsd: "100",
    side: "both",
    stopLossPx: "",
    takeProfitPx: "",
  },
  dca: {
    direction: "long",
    baseOrderUsd: "100",
    safetyOrderUsd: "100",
    maxSafetyOrders: "5",
    priceStepPct: "1.5",
    stepMultiplier: "1.2",
    sizeMultiplier: "1.5",
    takeProfitPct: "1.5",
    stopLossPct: "",
  },
  momentum: {
    signal: "ema_cross",
    interval: "15m",
    emaFast: "12",
    emaSlow: "26",
    rsiPeriod: "14",
    rsiBuyBelow: "30",
    rsiSellAbove: "70",
    breakoutLookback: "20",
    stopMode: "trailing",
    trailingStopPct: "2",
    basePeriods: "36",
    pumpPeriods: "8",
    orderSizeUsd: "250",
    direction: "both",
  },
  qqe: {
    interval: "15m",
    rsiPeriod: "14",
    rsiSmoothing: "5",
    qqeFactor: "4.238",
    threshold: "10",
    maType: "EMA",
    lsmaOffset: "0",
    almaOffset: "0.85",
    almaSigma: "6",
    rsiSource: "close",
    colorBars: "true",
    consolidationFilter: "true",
    loopbackPeriod: "50",
    minConsolidationLen: "5",
    paintConsolidation: "true",
    zoneColor: "#2962ff",
    orderSizeUsd: "250",
    takeProfitPct: "",
    stopLossPct: "",
  },
  copy: {
    sourceAddress: "",
    sizeMode: "ratio",
    ratio: "1",
    fixedUsd: "100",
    marketsFilter: "",
    maxSlippageBps: "50",
  },
}

/** Strategies whose signal interval must match the backtest timeframe. */
export const INTERVAL_STRATEGIES: StrategyType[] = ["momentum", "qqe"]

/** Inverse of buildParams — string form values from stored params. */
export function paramsToValues(params: StrategyParams): ParamValues {
  const defaults = PARAM_DEFAULTS[params.strategyType]
  const values: ParamValues = { ...defaults }
  for (const [key, value] of Object.entries(params)) {
    if (key === "strategyType" || value === undefined || value === null) {
      continue
    }
    values[key] = Array.isArray(value) ? value.join(", ") : String(value)
  }
  return values
}

export function buildParams(
  strategy: StrategyType,
  values: ParamValues
): StrategyParams | Record<string, unknown> {
  const num = (key: string) =>
    values[key] === "" || values[key] === undefined
      ? undefined
      : Number(values[key])
  const str = (key: string) => (values[key] === "" ? undefined : values[key])

  switch (strategy) {
    case "grid":
      return {
        strategyType: "grid",
        lowerPx: values.lowerPx,
        upperPx: values.upperPx,
        levels: num("levels"),
        sizePerLevelUsd: num("sizePerLevelUsd"),
        side: values.side,
        stopLossPx: str("stopLossPx"),
        takeProfitPx: str("takeProfitPx"),
      }
    case "dca":
      return {
        strategyType: "dca",
        direction: values.direction,
        baseOrderUsd: num("baseOrderUsd"),
        safetyOrderUsd: num("safetyOrderUsd"),
        maxSafetyOrders: num("maxSafetyOrders"),
        priceStepPct: num("priceStepPct"),
        stepMultiplier: num("stepMultiplier"),
        sizeMultiplier: num("sizeMultiplier"),
        takeProfitPct: num("takeProfitPct"),
        stopLossPct: num("stopLossPct"),
      }
    case "momentum": {
      const stopMode = values.stopMode === "base" ? "base" : "trailing"
      return {
        strategyType: "momentum",
        signal: values.signal,
        interval: values.interval,
        emaFast: num("emaFast"),
        emaSlow: num("emaSlow"),
        rsiPeriod: num("rsiPeriod"),
        rsiBuyBelow: num("rsiBuyBelow"),
        rsiSellAbove: num("rsiSellAbove"),
        breakoutLookback: num("breakoutLookback"),
        stopMode,
        // Only the active stop's params are sent, so switching modes is clean.
        trailingStopPct: stopMode === "trailing" ? num("trailingStopPct") : undefined,
        basePeriods: stopMode === "base" ? num("basePeriods") : undefined,
        pumpPeriods: stopMode === "base" ? num("pumpPeriods") : undefined,
        orderSizeUsd: num("orderSizeUsd"),
        direction: values.direction,
      }
    }
    case "qqe":
      return {
        strategyType: "qqe",
        interval: values.interval,
        rsiPeriod: num("rsiPeriod"),
        rsiSmoothing: num("rsiSmoothing"),
        qqeFactor: num("qqeFactor"),
        threshold: num("threshold"),
        maType: values.maType,
        // Only the active MA's tuning params are sent, like momentum's stops.
        lsmaOffset: values.maType === "LSMA" ? num("lsmaOffset") : undefined,
        almaOffset: values.maType === "ALMA" ? num("almaOffset") : undefined,
        almaSigma: values.maType === "ALMA" ? num("almaSigma") : undefined,
        rsiSource: values.rsiSource,
        colorBars: values.colorBars === "true",
        consolidationFilter: values.consolidationFilter === "true",
        loopbackPeriod: num("loopbackPeriod"),
        minConsolidationLen: num("minConsolidationLen"),
        paintConsolidation: values.paintConsolidation === "true",
        zoneColor: str("zoneColor"),
        orderSizeUsd: num("orderSizeUsd"),
        takeProfitPct: num("takeProfitPct"),
        stopLossPct: num("stopLossPct"),
      }
    case "copy":
      return {
        strategyType: "copy",
        sourceAddress: values.sourceAddress,
        sizeMode: values.sizeMode,
        ratio: values.sizeMode === "ratio" ? num("ratio") : undefined,
        fixedUsd: values.sizeMode === "fixed_usd" ? num("fixedUsd") : undefined,
        marketsFilter: values.marketsFilter
          ? values.marketsFilter
              .split(",")
              .map((coin) => coin.trim())
              .filter(Boolean)
          : undefined,
        maxSlippageBps: num("maxSlippageBps"),
      }
  }
}

/** "+76.10%" / "−36.80%" distance of a price from the live mid. */
export function pctFromMid(value: string | undefined, mid: number): string {
  const px = Number(value)
  if (!(px > 0) || !(mid > 0)) return ""
  const pct = (px / mid - 1) * 100
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`
}

/** "3.42%–5.19% per grid" for the current range and level count. */
export function perGridHint(values: ParamValues): string {
  const lower = Number(values.lowerPx)
  const upper = Number(values.upperPx)
  const levels = Number(values.levels)
  if (!(lower > 0) || !(upper > lower) || !(levels >= 2)) return ""
  const step = (upper - lower) / (levels - 1)
  const minPct = (step / upper) * 100
  const maxPct = (step / lower) * 100
  return `${minPct.toFixed(2)}%–${maxPct.toFixed(2)}% per grid`
}
