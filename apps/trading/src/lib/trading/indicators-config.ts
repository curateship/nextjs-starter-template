/**
 * Price-chart indicator configuration: the set the toolbar toggles/edits and
 * the price chart renders. Kept UI-framework-free so both can import it.
 */

export type IndicatorType =
  | "ema"
  | "vwap"
  | "bollinger"
  | "rsi"
  | "macd"
  | "base"
  | "nycSession"

export type IndicatorConfig = {
  /** Stable key; disambiguates multiple EMAs (e.g. "ema-20" / "ema-50"). */
  id: string
  type: IndicatorType
  enabled: boolean
  /** Numeric params keyed by name (period, k, fast, slow, signal). */
  params: Record<string, number>
  /** Optional override for the indicator's primary line color. */
  color?: string
}

export const DEFAULT_INDICATORS: IndicatorConfig[] = [
  { id: "ema-20", type: "ema", enabled: false, params: { period: 20 } },
  { id: "ema-50", type: "ema", enabled: false, params: { period: 50 } },
  { id: "vwap", type: "vwap", enabled: false, params: {} },
  {
    id: "bollinger",
    type: "bollinger",
    enabled: false,
    params: { period: 20, k: 2 },
  },
  { id: "rsi", type: "rsi", enabled: false, params: { period: 14 } },
  {
    id: "macd",
    type: "macd",
    enabled: false,
    params: { fast: 12, slow: 26, signal: 9 },
  },
  {
    id: "base",
    type: "base",
    enabled: false,
    params: { basePeriods: 36, pumpPeriods: 8 },
  },
  { id: "nyc-session", type: "nycSession", enabled: false, params: {} },
]

/** Editable numeric params per indicator type, in display order. */
export const INDICATOR_PARAM_FIELDS: Record<
  IndicatorType,
  { key: string; label: string; step?: number }[]
> = {
  ema: [{ key: "period", label: "Period" }],
  vwap: [],
  bollinger: [
    { key: "period", label: "Period" },
    { key: "k", label: "StdDev", step: 0.5 },
  ],
  rsi: [{ key: "period", label: "Period" }],
  macd: [
    { key: "fast", label: "Fast" },
    { key: "slow", label: "Slow" },
    { key: "signal", label: "Signal" },
  ],
  base: [
    { key: "basePeriods", label: "Base periods" },
    { key: "pumpPeriods", label: "Pump periods" },
  ],
  nycSession: [],
}

export const INDICATOR_LABELS: Record<IndicatorType, string> = {
  ema: "EMA",
  vwap: "VWAP",
  bollinger: "Bollinger",
  rsi: "RSI",
  macd: "MACD",
  base: "Base",
  nycSession: "NYC Session",
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
  nycSession: { light: "#2962ff", dark: "#2962ff" },
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
