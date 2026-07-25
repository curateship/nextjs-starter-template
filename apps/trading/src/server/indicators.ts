import { randomUUID } from "node:crypto"

import { eq } from "drizzle-orm"

import {
  BOLLINGER_MODES,
  DEFAULT_INDICATORS,
  EMA_LINES,
  INDICATOR_PARAM_FIELDS,
  PRICE_ACTION_PATTERNS,
  QQE_MA_TYPES,
  QQE_RSI_SOURCES,
  type IndicatorConfig,
} from "@/lib/trading/indicators-config"
import { isSessionKey, type SessionKey } from "@/lib/trading/sessions"
import { db, type CustomShellDb } from "@/server/db"
import { tradingIndicatorSettings } from "@/server/schema"

const now = () => new Date()

type IndicatorRow = typeof tradingIndicatorSettings.$inferSelect

/** A stored row overlaid on its default (defaults win for id/type/session shape). */
function overlay(def: IndicatorConfig, row: IndicatorRow): IndicatorConfig {
  const config: IndicatorConfig = {
    id: def.id,
    type: def.type,
    enabled: row.enabled,
    pinned: row.pinned,
    // Defaults first so params added after the row was saved appear.
    params: { ...def.params, ...row.params },
  }
  if (row.name) config.name = row.name
  if (row.color) config.color = row.color
  if (row.colors && Object.keys(row.colors).length > 0) {
    config.colors = row.colors
  }
  if (def.type === "session") {
    config.session = isSessionKey(row.session) ? row.session : (def.session as SessionKey)
  }
  return config
}

/** The user's indicators: DEFAULT_INDICATORS with any stored rows overlaid. */
export async function listUserIndicators(
  userId: string,
  database: CustomShellDb = db
): Promise<IndicatorConfig[]> {
  const rows = await database
    .select()
    .from(tradingIndicatorSettings)
    .where(eq(tradingIndicatorSettings.userId, userId))
  const byId = new Map(rows.map((row) => [row.indicatorId, row]))
  return DEFAULT_INDICATORS.map((def) => {
    const row = byId.get(def.id)
    return row ? overlay(def, row) : def
  })
}

export type UpsertIndicatorInput = {
  id: string
  enabled: boolean
  pinned: boolean
  params: Record<string, number>
  name?: string
  color?: string
  colors?: Record<string, string>
  session?: SessionKey
}

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/

/** Creates or updates the user's row for one known indicator. */
export async function upsertUserIndicator(
  userId: string,
  input: UpsertIndicatorInput,
  database: CustomShellDb = db
): Promise<IndicatorConfig> {
  const def = DEFAULT_INDICATORS.find((entry) => entry.id === input.id)
  if (!def) throw new Error(`Unknown indicator: ${input.id}`)
  if (def.type === "priceAction") {
    for (const pattern of PRICE_ACTION_PATTERNS) {
      const value = input.params[pattern.key]
      if (value !== undefined && value !== 0 && value !== 1) {
        throw new Error(`Invalid Price Action parameter: ${pattern.key}`)
      }
    }
    for (const field of INDICATOR_PARAM_FIELDS.priceAction) {
      const value = input.params[field.key]
      if (
        value !== undefined &&
        (!Number.isFinite(value) ||
          value <= 0 ||
          (field.key !== "wickBodyRatio" && !Number.isInteger(value)))
      ) {
        throw new Error(`Invalid Price Action parameter: ${field.key}`)
      }
    }
  }
  if (def.type === "ema") {
    for (const line of EMA_LINES) {
      const toggle = input.params[line.toggleKey]
      if (toggle !== undefined && toggle !== 0 && toggle !== 1) {
        throw new Error(`Invalid EMA parameter: ${line.toggleKey}`)
      }
      const period = input.params[line.periodKey]
      if (
        period !== undefined &&
        (!Number.isFinite(period) ||
          period < 2 ||
          period > 400 ||
          !Number.isInteger(period))
      ) {
        throw new Error(`Invalid EMA parameter: ${line.periodKey}`)
      }
    }
  }
  if (def.type === "bollinger") {
    const mode = input.params.mode
    if (
      mode !== undefined &&
      (!Number.isInteger(mode) || mode < 0 || mode >= BOLLINGER_MODES.length)
    ) {
      throw new Error("Invalid Bollinger parameter: mode")
    }
  }
  if (def.type === "qqe") {
    const inRange = (key: string, max: number) => {
      const value = input.params[key]
      return (
        value === undefined ||
        (Number.isInteger(value) && value >= 0 && value < max)
      )
    }
    if (!inRange("maType", QQE_MA_TYPES.length)) {
      throw new Error("Invalid QQE parameter: maType")
    }
    if (!inRange("rsiSource", QQE_RSI_SOURCES.length)) {
      throw new Error("Invalid QQE parameter: rsiSource")
    }
    const flag = input.params.consolidationFilter
    if (flag !== undefined && flag !== 0 && flag !== 1) {
      throw new Error("Invalid QQE parameter: consolidationFilter")
    }
    for (const key of [
      "rsiPeriod",
      "rsiSmoothing",
      "qqeFactor",
      "threshold",
      "loopbackPeriod",
      "minConsolidationLen",
      "swingLookback",
    ]) {
      const value = input.params[key]
      if (value !== undefined && (!Number.isFinite(value) || value <= 0)) {
        throw new Error(`Invalid QQE parameter: ${key}`)
      }
    }
  }
  if (def.type === "fairValueGap") {
    const size = input.params.minGapSize
    if (size !== undefined && (!Number.isFinite(size) || size < 0)) {
      throw new Error("Invalid Fair Value Gap parameter: minGapSize")
    }
    const flag = input.params.showFilled
    if (flag !== undefined && flag !== 0 && flag !== 1) {
      throw new Error("Invalid Fair Value Gap parameter: showFilled")
    }
  }
  if (def.type === "base") {
    // Ranges mirror the Base module's paramsSchema, so a value stored from the
    // chart card is always one the indicator can actually run with.
    const ranges: Record<string, [number, number]> = {
      basePeriods: [4, 500],
      pumpPeriods: [1, 499],
      formedMinBars: [1, 1000],
    }
    for (const [key, [min, max]] of Object.entries(ranges)) {
      const value = input.params[key]
      if (
        value !== undefined &&
        (!Number.isInteger(value) || value < min || value > max)
      ) {
        throw new Error(`Invalid Base parameter: ${key}`)
      }
    }
    const higher = input.params.formedRequireHigherBase
    if (higher !== undefined && higher !== 0 && higher !== 1) {
      throw new Error("Invalid Base parameter: formedRequireHigherBase")
    }
    for (const key of ["formedShowLong", "formedShowShort"]) {
      const value = input.params[key]
      if (value !== undefined && value !== 0 && value !== 1) {
        throw new Error(`Invalid Base parameter: ${key}`)
      }
    }
  }
  if (def.type === "trendline") {
    const lookback = input.params.swingLookback
    if (
      lookback !== undefined &&
      (!Number.isInteger(lookback) || lookback < 2 || lookback > 400)
    ) {
      throw new Error("Invalid Trendline Break parameter: swingLookback")
    }
    const confirmationBars = input.params.confirmationBars
    if (
      confirmationBars !== undefined &&
      (!Number.isInteger(confirmationBars) ||
        confirmationBars < 1 ||
        confirmationBars > 20)
    ) {
      throw new Error("Invalid Trendline Break parameter: confirmationBars")
    }
    const buffer = input.params.breakBuffer
    if (
      buffer !== undefined &&
      (!Number.isFinite(buffer) || buffer < 0 || buffer > 10)
    ) {
      throw new Error("Invalid Trendline Break parameter: breakBuffer")
    }
    const flag = input.params.requireCounterSlope
    if (flag !== undefined && flag !== 0 && flag !== 1) {
      throw new Error("Invalid Trendline Break parameter: requireCounterSlope")
    }
  }
  // Store only the params this indicator type defines — never arbitrary keys.
  const paramKeys = [
    ...INDICATOR_PARAM_FIELDS[def.type].map((field) => field.key),
    ...(def.type === "priceAction"
      ? PRICE_ACTION_PATTERNS.map((pattern) => pattern.key)
      : []),
    ...(def.type === "ema"
      ? EMA_LINES.flatMap((line) => [line.periodKey, line.toggleKey])
      : []),
  ]
  const params = Object.fromEntries(
    paramKeys
      .filter((key) => input.params[key] !== undefined)
      .map((key) => [key, input.params[key]])
  )
  // Per-line colors: only the keys this type defines, only valid hex.
  const colorEntries =
    def.type === "ema" && input.colors
      ? EMA_LINES.flatMap((line) => {
          const value = input.colors?.[line.key]
          return value && HEX_COLOR.test(value) ? [[line.key, value]] : []
        })
      : []
  const values = {
    userId,
    indicatorId: def.id,
    type: def.type,
    name: input.name?.trim() || null,
    enabled: input.enabled,
    pinned: input.pinned,
    params,
    color: input.color ?? null,
    colors:
      colorEntries.length > 0 ? Object.fromEntries(colorEntries) : null,
    session: def.type === "session" ? (input.session ?? "nyse") : null,
    updatedAt: now(),
  }
  const [row] = await database
    .insert(tradingIndicatorSettings)
    .values({ ...values, id: randomUUID(), createdAt: values.updatedAt })
    .onConflictDoUpdate({
      target: [
        tradingIndicatorSettings.userId,
        tradingIndicatorSettings.indicatorId,
      ],
      set: values,
    })
    .returning()
  return overlay(def, row)
}
