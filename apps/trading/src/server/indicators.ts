import { randomUUID } from "node:crypto"

import { eq } from "drizzle-orm"

import {
  DEFAULT_INDICATORS,
  EMA_TOGGLES,
  INDICATOR_PARAM_FIELDS,
  PRICE_ACTION_PATTERNS,
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
  session?: SessionKey
}

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
    for (const toggle of EMA_TOGGLES) {
      const value = input.params[toggle.key]
      if (value !== undefined && value !== 0 && value !== 1) {
        throw new Error(`Invalid EMA parameter: ${toggle.key}`)
      }
    }
    for (const field of INDICATOR_PARAM_FIELDS.ema) {
      const value = input.params[field.key]
      if (
        value !== undefined &&
        (!Number.isFinite(value) || value < 2 || !Number.isInteger(value))
      ) {
        throw new Error(`Invalid EMA parameter: ${field.key}`)
      }
    }
  }
  // Store only the params this indicator type defines — never arbitrary keys.
  const paramKeys = [
    ...INDICATOR_PARAM_FIELDS[def.type].map((field) => field.key),
    ...(def.type === "priceAction"
      ? PRICE_ACTION_PATTERNS.map((pattern) => pattern.key)
      : []),
    ...(def.type === "ema" ? EMA_TOGGLES.map((toggle) => toggle.key) : []),
  ]
  const params = Object.fromEntries(
    paramKeys
      .filter((key) => input.params[key] !== undefined)
      .map((key) => [key, input.params[key]])
  )
  const values = {
    userId,
    indicatorId: def.id,
    type: def.type,
    name: input.name?.trim() || null,
    enabled: input.enabled,
    pinned: input.pinned,
    params,
    color: input.color ?? null,
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
