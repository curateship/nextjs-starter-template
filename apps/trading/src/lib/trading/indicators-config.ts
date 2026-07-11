/**
 * Price-chart indicator configuration: the set the toolbar toggles/edits and
 * the price chart renders. Kept UI-framework-free so both can import it.
 */

import { sessionLabel, type SessionKey } from "@/lib/trading/sessions"

export type IndicatorType =
  | "ema"
  | "vwap"
  | "bollinger"
  | "rsi"
  | "macd"
  | "base"
  | "session"
  | "priceAction"

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
  /** Which session the Sessions indicator draws (type "session" only). */
  session?: SessionKey
}

export const DEFAULT_INDICATORS: IndicatorConfig[] = [
  { id: "ema-20", type: "ema", enabled: false, pinned: false, params: { period: 20 } },
  { id: "ema-50", type: "ema", enabled: false, pinned: false, params: { period: 50 } },
  { id: "vwap", type: "vwap", enabled: false, pinned: false, params: {} },
  {
    id: "bollinger",
    type: "bollinger",
    enabled: false,
    pinned: false,
    params: { period: 20, k: 2 },
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
    params: { basePeriods: 36, pumpPeriods: 8 },
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
]

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

/** Editable numeric params per indicator type, in display order. */
export const INDICATOR_PARAM_FIELDS: Record<
  IndicatorType,
  { key: string; label: string; step?: number; description?: string }[]
> = {
  ema: [{ key: "period", label: "Period" }],
  vwap: [],
  bollinger: [
    { key: "period", label: "Period" },
    { key: "k", label: "StdDev", step: 0.5 },
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
    { key: "basePeriods", label: "Base periods" },
    { key: "pumpPeriods", label: "Pump periods" },
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
}

export const INDICATOR_LABELS: Record<IndicatorType, string> = {
  ema: "EMA",
  vwap: "VWAP",
  bollinger: "Bollinger",
  rsi: "RSI",
  macd: "MACD",
  base: "Base",
  session: "Sessions",
  priceAction: "Price Action",
}

/** The label shown for an indicator: user rename, or the default label. */
export function indicatorDisplayName(config: IndicatorConfig): string {
  const custom = config.name?.trim()
  if (custom) return custom
  const label = INDICATOR_LABELS[config.type]
  return config.type === "ema" ? `${label} ${config.params.period}` : label
}

/** Short human summary of an indicator's settings (e.g. "Period 14 · Overbought 70"). */
export function indicatorSettingsSummary(config: IndicatorConfig): string {
  if (config.type === "session") return sessionLabel(config.session ?? "nyse")
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
  return INDICATOR_PARAM_FIELDS[config.type]
    .map((field) => `${field.label} ${config.params[field.key]}`)
    .join(" · ")
}

/** Oscillators render in their own sub-pane; everything else overlays pane 0. */
export const OSCILLATORS: IndicatorType[] = ["rsi", "macd"]

type ThemeHex = { light: string; dark: string }

/** Hardcoded palette (LWC can't parse the app's oklch tokens). */
const PALETTE: Record<string, ThemeHex> = {
  "ema-20": { light: "#2563eb", dark: "#60a5fa" },
  "ema-50": { light: "#ea580c", dark: "#fb923c" },
  // Strategy-derived EMAs on the backtest chart.
  "ema-fast": { light: "#2563eb", dark: "#60a5fa" },
  "ema-slow": { light: "#ea580c", dark: "#fb923c" },
  vwap: { light: "#7c3aed", dark: "#a78bfa" },
  "bollinger-mid": { light: "#0891b2", dark: "#22d3ee" },
  "bollinger-band": { light: "#94a3b8", dark: "#64748b" },
  rsi: { light: "#7c3aed", dark: "#a78bfa" },
  "macd-line": { light: "#2563eb", dark: "#60a5fa" },
  "macd-signal": { light: "#ea580c", dark: "#fb923c" },
  base: { light: "#0d9488", dark: "#2dd4bf" },
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
      return config.id
    case "bollinger":
      return "bollinger-mid"
    case "macd":
      return "macd-line"
    default:
      return config.type
  }
}
