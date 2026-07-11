import { randomUUID } from "node:crypto"

import { eq } from "drizzle-orm"

import {
  DEFAULT_INDICATORS,
  INDICATOR_PARAM_FIELDS,
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
  // Store only the params this indicator type defines — never arbitrary keys.
  const params = Object.fromEntries(
    INDICATOR_PARAM_FIELDS[def.type]
      .filter((field) => input.params[field.key] !== undefined)
      .map((field) => [field.key, input.params[field.key]])
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
