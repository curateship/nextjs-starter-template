/**
 * Price-chart indicator configuration: the set the toolbar toggles/edits and
 * the price chart renders. Kept UI-framework-free so both can import it.
 */

import { sessionLabel, type SessionKey } from "@/lib/trading/sessions"

export type IndicatorType =
  | "ema"
  | "bollinger"
  | "rsi"
  | "macd"
  | "base"
  | "session"
  | "priceAction"
  | "qqe"
  | "fairValueGap"
  | "trendline"

/**
 * QQE's two enum params are stored as a numeric INDEX into these lists (chart
 * params are all numbers, like the 0/1 booleans). {@link qqeChartToModuleParams}
 * maps them back to the QQE module's string enums. Keep in sync with the module
 * schema in src/lib/indicators/defs/qqe.ts.
 */
export const QQE_MA_TYPES = [
  "ALMA", "EMA", "DEMA", "TEMA", "WMA", "VWMA", "SMA", "SMMA", "HMA", "LSMA", "PEMA",
] as const
export const QQE_RSI_SOURCES = [
  "close", "open", "high", "low", "hl2", "hlc3", "ohlc4",
] as const

/** Bollinger signal modes, stored on the chart as a numeric index (like QQE's
 * enums). Keep in sync with the module schema in defs/bollinger.ts. */
export const BOLLINGER_MODES = ["revert", "breakout"] as const

export type IndicatorConfig = {
  /** Stable key; disambiguates multiple EMAs (e.g. "ema-20" / "ema-50"). */
  id: string
  type: IndicatorType
  enabled: boolean
  /**
   * Pinned indicators are the working set the trade chart shows and toggles.
   * Optional because strategy-derived chart overlays never carry it; stored
   * user settings always do.
   */
  pinned?: boolean
  /** Optional user rename; empty/undefined falls back to the default label. */
  name?: string
  /** Numeric params keyed by name (period, k, fast, slow, signal). */
  params: Record<string, number>
  /** Optional override for the indicator's primary line color. */
  color?: string
  /** Per-line color overrides for multi-line indicators (EMA: fast/slow/third). */
  colors?: Record<string, string>
  /** Which session the Sessions indicator draws (type "session" only). */
  session?: SessionKey
}

export const DEFAULT_INDICATORS: IndicatorConfig[] = [
  // One EMA indicator with up to three lines — the SAME settings shape the
  // EMA Cross strategy uses, so chart and strategy always match. Each line
  // gets its own settings card and its own color (the `colors` map); the two
  // fastest switched-on lines drive the chart's cross arrows.
  {
    id: "ema",
    type: "ema",
    enabled: false,
    pinned: false,
    params: {
      fast: 20,
      slow: 50,
      third: 200,
      showFast: 1,
      showSlow: 1,
      showThird: 1,
    },
  },
  {
    id: "bollinger",
    type: "bollinger",
    enabled: false,
    pinned: false,
    // mode indexes BOLLINGER_MODES (0 = revert) — same signal rule the
    // Bollinger strategy node runs.
    params: { period: 20, k: 2, mode: 0 },
  },
  {
    id: "rsi",
    type: "rsi",
    enabled: false,
    pinned: false,
    params: { period: 14, overbought: 70, oversold: 30 },
  },
  {
    id: "macd",
    type: "macd",
    enabled: false,
    pinned: false,
    params: { fast: 12, slow: 26, signal: 9 },
  },
  {
    id: "base",
    type: "base",
    enabled: false,
    pinned: false,
    // Base forming only — the crack settings live on the automation's Base node
    // for the DCA ladder to read; nothing the chart paints uses them.
    params: {
      basePeriods: 36,
      pumpPeriods: 8,
      formedWithinPct: 1,
      formedValidBars: 40,
      // Booleans ride as 0/1 in chart configs.
      formedRequireRising: 1,
    },
  },
  {
    id: "session",
    type: "session",
    enabled: false,
    pinned: false,
    params: {},
    session: "nyse",
  },
  {
    id: "price-action",
    type: "priceAction",
    enabled: false,
    pinned: false,
    params: {
      bullHammer: 1,
      bearShootingStar: 1,
      bullEngulfing: 1,
      bearEngulfing: 1,
      bullSweep: 1,
      bearSweep: 1,
      bullBos: 1,
      bearBos: 1,
      wickBodyRatio: 2,
      extremeLookback: 5,
      sweepLookback: 20,
      swingLookback: 5,
    },
  },
  {
    id: "qqe",
    type: "qqe",
    enabled: false,
    pinned: false,
    // Mirrors qqeIndicator.defaultParams; enums stored as indices into
    // QQE_MA_TYPES / QQE_RSI_SOURCES, booleans as 0/1.
    params: {
      rsiPeriod: 14,
      rsiSmoothing: 5,
      qqeFactor: 4.238,
      threshold: 10,
      maType: 1, // EMA
      rsiSource: 0, // close
      consolidationFilter: 1,
      loopbackPeriod: 50,
      minConsolidationLen: 5,
      swingLookback: 50,
    },
  },
  {
    id: "fair-value-gap",
    type: "fairValueGap",
    enabled: false,
    pinned: false,
    // Mirrors fairValueGapIndicator.defaultParams; showFilled stored as 0/1.
    params: { minGapSize: 1, showFilled: 1 },
  },
  {
    id: "trendline",
    type: "trendline",
    enabled: false,
    pinned: false,
    params: {
      swingLookback: 30,
      confirmationBars: 2,
      breakBuffer: 0.1,
      requireCounterSlope: 1,
    },
  },
]

/** Chart QQE params (numeric/index form) → the QQE module's typed params. */
export function qqeChartToModuleParams(
  params: Record<string, number>
): Record<string, number | string | boolean> {
  return {
    rsiPeriod: params.rsiPeriod,
    rsiSmoothing: params.rsiSmoothing,
    qqeFactor: params.qqeFactor,
    threshold: params.threshold,
    maType: QQE_MA_TYPES[params.maType] ?? "EMA",
    rsiSource: QQE_RSI_SOURCES[params.rsiSource] ?? "close",
    consolidationFilter: (params.consolidationFilter ?? 1) !== 0,
    loopbackPeriod: params.loopbackPeriod,
    minConsolidationLen: params.minConsolidationLen,
    swingLookback: params.swingLookback,
  }
}

/** Chart Bollinger params (mode as index) → the module's typed params. */
export function bollingerChartToModuleParams(
  params: Record<string, number>
): Record<string, number | string> {
  return {
    period: params.period ?? 20,
    k: params.k ?? 2,
    mode: BOLLINGER_MODES[params.mode] ?? "revert",
  }
}

/** Chart Price Action params (0/1 pattern flags) → the module's typed params. */
export function priceActionChartToModuleParams(
  params: Record<string, number>
): Record<string, number | boolean> {
  return {
    bullHammer: (params.bullHammer ?? 1) !== 0,
    bearShootingStar: (params.bearShootingStar ?? 1) !== 0,
    bullEngulfing: (params.bullEngulfing ?? 1) !== 0,
    bearEngulfing: (params.bearEngulfing ?? 1) !== 0,
    bullSweep: (params.bullSweep ?? 1) !== 0,
    bearSweep: (params.bearSweep ?? 1) !== 0,
    bullBos: (params.bullBos ?? 1) !== 0,
    bearBos: (params.bearBos ?? 1) !== 0,
    wickBodyRatio: params.wickBodyRatio ?? 2,
    extremeLookback: params.extremeLookback ?? 5,
    sweepLookback: params.sweepLookback ?? 20,
    swingLookback: params.swingLookback ?? 5,
  }
}

/** Chart Fair Value Gap params (numeric form) → the FVG module's typed params. */
export function fairValueGapChartToModuleParams(
  params: Record<string, number>
): Record<string, number | string | boolean> {
  return {
    minGapSize: params.minGapSize ?? 1,
    showFilled: (params.showFilled ?? 1) !== 0,
  }
}

/** Chart Base params → the Base module's typed params. Only the base-forming
 * settings are on the chart card; the crack and respect-filter settings belong to
 * the DCA node, so they fall back to the module's own defaults here. */
export function baseChartToModuleParams(
  params: Record<string, number>
): Record<string, number | boolean> {
  return {
    basePeriods: params.basePeriods ?? 36,
    pumpPeriods: params.pumpPeriods ?? 8,
    formedWithinPct: params.formedWithinPct ?? 1,
    formedValidBars: params.formedValidBars ?? 40,
    formedRequireRising: (params.formedRequireRising ?? 1) !== 0,
    crackPct: 2.5,
    maxCrackBars: 4,
    respectFilterEnabled: false,
    respectLookbackMonths: 6,
    minRespectPct: 80,
    recoveryTargetPct: -2,
  }
}

export function trendlineChartToModuleParams(
  params: Record<string, number>
): Record<string, number | boolean> {
  return {
    swingLookback: params.swingLookback ?? 30,
    confirmationBars: params.confirmationBars ?? 2,
    breakBuffer: params.breakBuffer ?? 0.1,
    requireCounterSlope: (params.requireCounterSlope ?? 1) !== 0,
  }
}

/** The EMA indicator's three lines: per-line period/toggle params, the color
 * key in `config.colors`, and the palette slot each line defaults to. */
export const EMA_LINES = [
  {
    key: "fast",
    toggleKey: "showFast",
    periodKey: "fast",
    slot: "ema-fast",
    label: "EMA 1",
  },
  {
    key: "slow",
    toggleKey: "showSlow",
    periodKey: "slow",
    slot: "ema-slow",
    label: "EMA 2",
  },
  {
    key: "third",
    toggleKey: "showThird",
    periodKey: "third",
    slot: "ema-third",
    label: "EMA 3",
  },
] as const

export type EmaLineDef = (typeof EMA_LINES)[number]

/** The chart lines an EMA config draws: switched-on entries with a valid period. */
export function emaLines(params: Record<string, number>): EmaLineDef[] {
  return EMA_LINES.filter((line) => {
    const period = params[line.periodKey]
    const on = (params[line.toggleKey] ?? 1) !== 0
    return on && Number.isFinite(period) && period >= 2
  })
}

export const PRICE_ACTION_PATTERNS = [
  { side: "bull", key: "bullHammer", label: "Hammer" },
  { side: "bull", key: "bullEngulfing", label: "Engulfing" },
  { side: "bull", key: "bullSweep", label: "Liquidity sweep" },
  { side: "bull", key: "bullBos", label: "Break of structure" },
  { side: "bear", key: "bearShootingStar", label: "Shooting star" },
  { side: "bear", key: "bearEngulfing", label: "Engulfing" },
  { side: "bear", key: "bearSweep", label: "Liquidity sweep" },
  { side: "bear", key: "bearBos", label: "Break of structure" },
] as const

/**
 * Editable params per indicator type, in display order. Fields are numeric by
 * default; `kind: "select"` renders a dropdown over `options` (stored as the
 * option index) and `kind: "boolean"` a checkbox (stored as 0/1).
 */
export type IndicatorParamFieldDef = {
  key: string
  label: string
  step?: number
  description?: string
  kind?: "number" | "select" | "boolean"
  options?: readonly string[]
}

export const INDICATOR_PARAM_FIELDS: Record<
  IndicatorType,
  IndicatorParamFieldDef[]
> = {
  // EMA renders its own per-line cards in the settings dialog (EMA_LINES),
  // not this generic field list.
  ema: [],
  bollinger: [
    { key: "period", label: "Period" },
    { key: "k", label: "StdDev", step: 0.5 },
    {
      key: "mode",
      label: "Mode",
      kind: "select",
      options: BOLLINGER_MODES,
      description:
        "Revert fades a move beyond a band back to the middle; Breakout follows a close through a band.",
    },
  ],
  rsi: [
    { key: "period", label: "Period" },
    { key: "overbought", label: "Overbought" },
    { key: "oversold", label: "Oversold" },
  ],
  macd: [
    { key: "fast", label: "Fast" },
    { key: "slow", label: "Slow" },
    { key: "signal", label: "Signal" },
  ],
  base: [
    {
      key: "basePeriods",
      label: "Base periods",
      description:
        "How many candles back to search for the lowest low that forms a base.",
    },
    {
      key: "pumpPeriods",
      label: "Pump periods",
      description:
        "How many candles the new low must hold before the base counts as confirmed. A green up arrow prints on the candle that confirms it.",
    },
    {
      key: "formedWithinPct",
      label: "Formed within %",
      step: 0.1,
      description:
        "How close to the base a candle must close for the formed-base arrow to print. Once a base is confirmed the arrow waits for the first candle back at the base and skips anything further away.",
    },
    {
      key: "formedValidBars",
      label: "Valid for (candles)",
      description:
        "How long a base keeps waiting for price to come back. If no candle closes near the base within this many candles of it being confirmed, that base goes stale and never prints an arrow.",
    },
    {
      key: "formedRequireRising",
      label: "Only rising signals",
      kind: "boolean",
      description:
        "Only draw an arrow that sits above the previous base's arrow, confirming the trend is stepping up. Bases that would print lower are still tracked as the yardstick, they just aren't drawn.",
    },
  ],
  session: [],
  priceAction: [
    {
      key: "wickBodyRatio",
      label: "Wick/body ratio",
      step: 0.5,
      description:
        "The wick must be this many times larger than the candle body. Higher values require a stronger Hammer or Shooting Star.",
    },
    {
      key: "extremeLookback",
      label: "Extreme lookback",
      description:
        "Hammer and Shooting Star must be the lowest or highest candle across this many earlier candles. Higher values require a clearer local extreme.",
    },
    {
      key: "sweepLookback",
      label: "Sweep lookback",
      description:
        "A liquidity sweep must take out the high or low from this many earlier candles, then close back inside the range.",
    },
    {
      key: "swingLookback",
      label: "Swing lookback",
      description:
        "A swing high or low must stand out against this many candles on each side. Higher values find fewer, larger breaks of structure later.",
    },
  ],
  qqe: [
    { key: "rsiPeriod", label: "RSI period" },
    { key: "rsiSmoothing", label: "RSI smoothing" },
    { key: "qqeFactor", label: "QQE factor", step: 0.1 },
    { key: "threshold", label: "Threshold", step: 0.5 },
    { key: "maType", label: "MA type", kind: "select", options: QQE_MA_TYPES },
    {
      key: "rsiSource",
      label: "RSI source",
      kind: "select",
      options: QQE_RSI_SOURCES,
    },
    {
      key: "consolidationFilter",
      label: "Consolidation filter",
      kind: "boolean",
      description:
        "Ignore trend flips that happen inside a sideways chop zone.",
    },
    { key: "loopbackPeriod", label: "Consolidation lookback" },
    { key: "minConsolidationLen", label: "Min consolidation bars" },
    { key: "swingLookback", label: "Swing lookback" },
  ],
  fairValueGap: [
    {
      key: "minGapSize",
      label: "Min gap size %",
      step: 0.1,
      description:
        "Smallest imbalance to draw, as a % of price. Bigger keeps only the major gaps and ignores the tiny ones that just mean chop.",
    },
    {
      key: "showFilled",
      label: "Show filled gaps",
      kind: "boolean",
      description:
        "Keep showing a gap (dimmed) after price fills it, or hide it once filled.",
    },
  ],
  trendline: [
    {
      key: "swingLookback",
      label: "Swing lookback",
      description:
        "How big a swing must be to anchor the line. Bigger values catch only major turns.",
    },
    {
      key: "confirmationBars",
      label: "Confirmation bars",
      description:
        "How many candles must hold after a swing before its line can be traded. Smaller values react sooner.",
    },
    {
      key: "breakBuffer",
      label: "Break buffer %",
      step: 0.1,
      description: "How far past the line a candle must close to count, in %.",
    },
    {
      key: "requireCounterSlope",
      label: "Require trend flip",
      kind: "boolean",
      description: "Only trade breaks that flip the recent trend.",
    },
  ],
}

export const INDICATOR_LABELS: Record<IndicatorType, string> = {
  ema: "EMA",
  bollinger: "Bollinger",
  rsi: "RSI",
  macd: "MACD",
  base: "Base",
  session: "Sessions",
  priceAction: "Price Action",
  qqe: "QQE",
  fairValueGap: "Fair Value Gap",
  trendline: "Trendline Break",
}

/** The label shown for an indicator: user rename, or the default label. */
export function indicatorDisplayName(config: IndicatorConfig): string {
  const custom = config.name?.trim()
  if (custom) return custom
  const label = INDICATOR_LABELS[config.type]
  if (config.type !== "ema") return label
  const periods = emaLines(config.params).map((line) => config.params[line.periodKey])
  return periods.length > 0 ? `${label} ${periods.join("/")}` : label
}

/** Short human summary of an indicator's settings (e.g. "Period 14 · Overbought 70"). */
export function indicatorSettingsSummary(config: IndicatorConfig): string {
  if (config.type === "session") return sessionLabel(config.session ?? "nyse")
  if (config.type === "ema") {
    const lines = emaLines(config.params)
    return lines.length > 0
      ? lines.map((line) => `EMA ${config.params[line.periodKey]}`).join(" · ")
      : "All lines off"
  }
  if (config.type === "priceAction") {
    const bullish = PRICE_ACTION_PATTERNS.filter(
      (pattern) =>
        pattern.side === "bull" &&
        (config.params[pattern.key] ?? 1) !== 0
    ).length
    const bearish = PRICE_ACTION_PATTERNS.filter(
      (pattern) =>
        pattern.side === "bear" &&
        (config.params[pattern.key] ?? 1) !== 0
    ).length
    return `${bullish} bullish · ${bearish} bearish`
  }
  if (config.type === "qqe") {
    const ma = QQE_MA_TYPES[config.params.maType] ?? "EMA"
    const filtered = (config.params.consolidationFilter ?? 1) !== 0
    return `RSI ${config.params.rsiPeriod} · ${ma} · ${filtered ? "filtered" : "raw"}`
  }
  if (config.type === "fairValueGap") {
    return `Min ${config.params.minGapSize ?? 1}%`
  }
  if (config.type === "trendline") {
    return `Swing ${config.params.swingLookback ?? 30} · Confirm ${config.params.confirmationBars ?? 2} · Buffer ${config.params.breakBuffer ?? 0.1}%`
  }
  return INDICATOR_PARAM_FIELDS[config.type]
    .map((field) => {
      const value = config.params[field.key]
      if (field.kind === "select" && field.options) {
        return `${field.label} ${field.options[value] ?? value}`
      }
      if (field.kind === "boolean") return `${field.label} ${value ? "on" : "off"}`
      return `${field.label} ${value}`
    })
    .join(" · ")
}

/** Oscillators render in their own sub-pane; everything else overlays pane 0. */
export const OSCILLATORS: IndicatorType[] = ["rsi", "macd"]

type ThemeHex = { light: string; dark: string }

/** Hardcoded palette (LWC can't parse the app's oklch tokens). */
const PALETTE: Record<string, ThemeHex> = {
  "ema-fast": { light: "#2563eb", dark: "#60a5fa" },
  "ema-slow": { light: "#ea580c", dark: "#fb923c" },
  "ema-third": { light: "#16a34a", dark: "#4ade80" },
  "bollinger-mid": { light: "#0891b2", dark: "#22d3ee" },
  "bollinger-band": { light: "#94a3b8", dark: "#64748b" },
  rsi: { light: "#7c3aed", dark: "#a78bfa" },
  "macd-line": { light: "#2563eb", dark: "#60a5fa" },
  "macd-signal": { light: "#ea580c", dark: "#fb923c" },
  base: { light: "#0d9488", dark: "#2dd4bf" },
  // QQE paints its own green/red trend bars; this is just the dashboard swatch.
  qqe: { light: "#7c3aed", dark: "#a78bfa" },
  // FVG paints its own green/red gap boxes; this is just the dashboard swatch.
  fairValueGap: { light: "#65a30d", dark: "#a3e635" },
  trendline: { light: "#f23645", dark: "#f23645" },
  // Session shading swatch; the chart applies its own translucency.
  session: { light: "#2962ff", dark: "#2962ff" },
  guide: { light: "rgba(100, 116, 139, 0.45)", dark: "rgba(148, 163, 184, 0.4)" },
}

/** Theme-aware color for a series slot, falling back to a muted guide hue. */
export function indicatorColor(slot: string, isDark: boolean): string {
  const hex = PALETTE[slot] ?? PALETTE.guide
  return isDark ? hex.dark : hex.light
}

/** Palette slot of an indicator's primary line (what `config.color` overrides). */
export function primaryColorSlot(config: IndicatorConfig): string {
  switch (config.type) {
    case "ema":
      return "ema-fast"
    case "bollinger":
      return "bollinger-mid"
    case "macd":
      return "macd-line"
    default:
      return config.type
  }
}
