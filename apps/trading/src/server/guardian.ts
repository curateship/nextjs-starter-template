import { and, eq, inArray, isNull } from "drizzle-orm"

import {
  createEmptyGuardianWatch,
  type GuardianAction,
  type GuardianConfig,
  type GuardianWatch,
} from "@/lib/trading/guardian"
import { db, type CustomShellDb } from "@/server/db"
import { tradingBotGuardians } from "@/server/schema"
import { now } from "@/server/util"

export type GuardianStatus = GuardianConfig & {
  trippedAt: string | null
  trippedReason: string | null
}

type GuardianRow = typeof tradingBotGuardians.$inferSelect

const toNumber = (value: string | null): number | null =>
  value === null ? null : Number(value)

function defaultStatus(): GuardianStatus {
  return {
    enabled: false,
    dailyLossLimitUsd: null,
    dailyLossLimitPct: null,
    maxDrawdownPct: null,
    action: "pause_all",
    trippedAt: null,
    trippedReason: null,
  }
}

function serializeStatus(row: GuardianRow): GuardianStatus {
  return {
    enabled: row.enabled,
    dailyLossLimitUsd: toNumber(row.dailyLossLimitUsd),
    dailyLossLimitPct: toNumber(row.dailyLossLimitPct),
    maxDrawdownPct: toNumber(row.maxDrawdownPct),
    action: row.action as GuardianAction,
    trippedAt: row.trippedAt?.toISOString() ?? null,
    trippedReason: row.trippedReason,
  }
}

export async function getGuardianStatus(
  userId: string,
  database: CustomShellDb = db
): Promise<GuardianStatus> {
  const [row] = await database
    .select()
    .from(tradingBotGuardians)
    .where(eq(tradingBotGuardians.userId, userId))
    .limit(1)
  return row ? serializeStatus(row) : defaultStatus()
}

/**
 * Saves the limits and action, and restarts the watch (baselines and streak)
 * from the next clean reading. Deliberately never touches the tripped latch —
 * re-arming is its own explicit action.
 */
export async function saveGuardianConfig(
  userId: string,
  config: GuardianConfig,
  database: CustomShellDb = db
): Promise<GuardianStatus> {
  const updatedAt = now()
  const values = {
    enabled: config.enabled,
    dailyLossLimitUsd:
      config.dailyLossLimitUsd === null ? null : String(config.dailyLossLimitUsd),
    dailyLossLimitPct:
      config.dailyLossLimitPct === null ? null : String(config.dailyLossLimitPct),
    maxDrawdownPct:
      config.maxDrawdownPct === null ? null : String(config.maxDrawdownPct),
    action: config.action,
    dayDate: null,
    dayStartEquity: null,
    peakEquity: null,
    breachStreak: 0,
    updatedAt,
  }
  const [row] = await database
    .insert(tradingBotGuardians)
    .values({ userId, ...values })
    .onConflictDoUpdate({ target: tradingBotGuardians.userId, set: values })
    .returning()
  return serializeStatus(row)
}

/**
 * Clears the tripped latch and restarts the watch from the next reading, so
 * a loss that already happened today cannot instantly re-trip. Does NOT
 * resume any bots — resuming stays a manual, per-bot decision.
 */
export async function rearmGuardian(
  userId: string,
  database: CustomShellDb = db
): Promise<GuardianStatus> {
  const [row] = await database
    .update(tradingBotGuardians)
    .set({
      trippedAt: null,
      trippedReason: null,
      dayDate: null,
      dayStartEquity: null,
      peakEquity: null,
      breachStreak: 0,
      updatedAt: now(),
    })
    .where(eq(tradingBotGuardians.userId, userId))
    .returning()
  return row ? serializeStatus(row) : defaultStatus()
}

// ——— Worker side (bot worker's guardian monitor) ———

export type ArmedGuardian = {
  userId: string
  limits: {
    dailyLossLimitUsd: number | null
    dailyLossLimitPct: number | null
    maxDrawdownPct: number | null
  }
  action: GuardianAction
  watch: GuardianWatch
}

/** Guardians worth evaluating this tick: enabled and not already tripped. */
export async function loadArmedGuardians(
  userIds: string[],
  database: CustomShellDb = db
): Promise<ArmedGuardian[]> {
  if (userIds.length === 0) return []
  const rows = await database
    .select()
    .from(tradingBotGuardians)
    .where(
      and(
        inArray(tradingBotGuardians.userId, userIds),
        eq(tradingBotGuardians.enabled, true),
        isNull(tradingBotGuardians.trippedAt)
      )
    )
  return rows.map((row) => ({
    userId: row.userId,
    limits: {
      dailyLossLimitUsd: toNumber(row.dailyLossLimitUsd),
      dailyLossLimitPct: toNumber(row.dailyLossLimitPct),
      maxDrawdownPct: toNumber(row.maxDrawdownPct),
    },
    action: row.action as GuardianAction,
    watch: row.dayDate
      ? {
          dayDate: row.dayDate,
          dayStartEquity: toNumber(row.dayStartEquity),
          peakEquity: toNumber(row.peakEquity),
          breachStreak: row.breachStreak,
        }
      : createEmptyGuardianWatch(),
  }))
}

export async function persistGuardianWatch(
  userId: string,
  watch: GuardianWatch,
  database: CustomShellDb = db
): Promise<void> {
  await database
    .update(tradingBotGuardians)
    .set({
      dayDate: watch.dayDate,
      dayStartEquity:
        watch.dayStartEquity === null ? null : String(watch.dayStartEquity),
      peakEquity: watch.peakEquity === null ? null : String(watch.peakEquity),
      breachStreak: watch.breachStreak,
      updatedAt: now(),
    })
    .where(eq(tradingBotGuardians.userId, userId))
}

/**
 * Atomically latches the tripped state. The `tripped_at is null` guard makes
 * this fire exactly once per trip no matter how many workers race — only the
 * caller that gets a row back may enqueue the global command and the alert.
 */
export async function tripGuardian(
  userId: string,
  reason: string,
  database: CustomShellDb = db
): Promise<Date | null> {
  const trippedAt = now()
  const [latched] = await database
    .update(tradingBotGuardians)
    .set({ trippedAt, trippedReason: reason, updatedAt: trippedAt })
    .where(
      and(
        eq(tradingBotGuardians.userId, userId),
        isNull(tradingBotGuardians.trippedAt)
      )
    )
    .returning({ userId: tradingBotGuardians.userId })
  return latched ? trippedAt : null
}
