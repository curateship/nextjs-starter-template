import { Buffer } from "node:buffer"

import {
  and,
  count,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  lt,
  max,
  or,
} from "drizzle-orm"

import type {
  MarketScannerAlertItem,
  MarketScannerRule,
  MarketScannerRuleInput,
  MarketScannerRuleItem,
} from "@/lib/market-scanner"
import { db, type CustomShellDb } from "@/server/db"
import { marketScannerAlerts, marketScannerRules } from "@/server/schema"
import { now, uuid } from "@/server/util"

export async function getMarketScannerRules(
  userId: string,
  database: CustomShellDb = db
) {
  const rules = await database
    .select()
    .from(marketScannerRules)
    .where(eq(marketScannerRules.userId, userId))
    .orderBy(desc(marketScannerRules.updatedAt))
  return rules.map(serializeRule)
}

export async function getMarketScannerAlertsPage(
  userId: string,
  options: { limit: number; cursor?: string },
  database: CustomShellDb = db
) {
  const limit = Math.max(1, Math.min(100, options.limit))
  const cursor = options.cursor ? decodeAlertCursor(options.cursor) : null
  const cursorFilter = cursor
    ? or(
        lt(marketScannerAlerts.occurredAt, cursor.occurredAt),
        and(
          eq(marketScannerAlerts.occurredAt, cursor.occurredAt),
          lt(marketScannerAlerts.id, cursor.id)
        )
      )
    : undefined
  const [rows, [unread]] = await Promise.all([
    database
      .select()
      .from(marketScannerAlerts)
      .where(
        and(eq(marketScannerAlerts.userId, userId), cursorFilter)
      )
      .orderBy(
        desc(marketScannerAlerts.occurredAt),
        desc(marketScannerAlerts.id)
      )
      .limit(limit + 1),
    database
      .select({ value: count() })
      .from(marketScannerAlerts)
      .where(
        and(
          eq(marketScannerAlerts.userId, userId),
          isNull(marketScannerAlerts.readAt)
        )
      ),
  ])

  const pageRows = rows.slice(0, limit)
  const last = pageRows.at(-1)
  return {
    alerts: pageRows.map(serializeAlert),
    unreadCount: unread?.value ?? 0,
    nextCursor:
      rows.length > limit && last
        ? encodeAlertCursor(last.occurredAt, last.id)
        : null,
  }
}

function encodeAlertCursor(occurredAt: Date, id: string) {
  return Buffer.from(
    JSON.stringify({ occurredAt: occurredAt.toISOString(), id })
  ).toString("base64url")
}

function decodeAlertCursor(cursor: string) {
  try {
    if (cursor.length > 1_024) throw new Error()
    const value = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"))
    const occurredAt = new Date(value.occurredAt)
    if (
      typeof value.id !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value.id
      ) ||
      !Number.isFinite(occurredAt.getTime())
    ) {
      throw new Error()
    }
    return { occurredAt, id: value.id }
  } catch {
    throw new Error("Invalid alert cursor")
  }
}

export async function listEnabledMarketScannerRules(
  database: CustomShellDb = db
): Promise<MarketScannerRuleItem[]> {
  const rows = await database
    .select()
    .from(marketScannerRules)
    .where(eq(marketScannerRules.enabled, true))
  return rows.map(serializeRule)
}

export async function markMarketScannerRulesEvaluated(
  ruleIds: string[],
  evaluatedAt: Date,
  database: CustomShellDb = db
) {
  if (ruleIds.length === 0) return
  await database
    .update(marketScannerRules)
    .set({ lastEvaluatedAt: evaluatedAt })
    .where(inArray(marketScannerRules.id, ruleIds))
}

export async function listMarketScannerRuleTriggerTimes(
  database: CustomShellDb = db
) {
  const rows = await database
    .select({
      ruleId: marketScannerAlerts.ruleId,
      coin: marketScannerAlerts.coin,
      occurredAt: max(marketScannerAlerts.occurredAt),
    })
    .from(marketScannerAlerts)
    .where(isNotNull(marketScannerAlerts.ruleId))
    .groupBy(marketScannerAlerts.ruleId, marketScannerAlerts.coin)
  return rows.flatMap((row) =>
    row.ruleId && row.occurredAt
      ? [{ ruleId: row.ruleId, coin: row.coin, occurredAt: row.occurredAt }]
      : []
  )
}

export async function createMarketScannerRule(
  userId: string,
  input: MarketScannerRuleInput,
  database: CustomShellDb = db
): Promise<MarketScannerRuleItem> {
  const timestamp = now()
  const values = ruleValues(userId, input, timestamp)
  for (let ruleSlot = 1; ruleSlot <= 100; ruleSlot += 1) {
    const [created] = await database
      .insert(marketScannerRules)
      .values({ ...values, ruleSlot })
      .onConflictDoNothing({
        target: [marketScannerRules.userId, marketScannerRules.ruleSlot],
      })
      .returning()
    if (created) return serializeRule(created)
  }
  throw new Error("You can save up to 100 scanner rules.")
}

export async function updateMarketScannerRule(
  userId: string,
  ruleId: string,
  input: MarketScannerRuleInput,
  database: CustomShellDb = db
): Promise<MarketScannerRuleItem> {
  const [updated] = await database
    .update(marketScannerRules)
    .set({
      name: input.name,
      kind: input.kind,
      direction: input.kind === "price_move" ? input.direction : null,
      threshold: String(input.threshold),
      marketScope: input.marketScope,
      markets: input.marketScope === "selected" ? input.markets : [],
      window: input.window,
      cooldown: input.cooldown,
      enabled: input.enabled,
      lastEvaluatedAt: null,
      updatedAt: now(),
    })
    .where(
      and(
        eq(marketScannerRules.id, ruleId),
        eq(marketScannerRules.userId, userId)
      )
    )
    .returning()
  if (!updated) throw new Error("Rule not found")
  return serializeRule(updated)
}

export async function deleteMarketScannerRule(
  userId: string,
  ruleId: string,
  database: CustomShellDb = db
) {
  const [deleted] = await database
    .delete(marketScannerRules)
    .where(
      and(
        eq(marketScannerRules.id, ruleId),
        eq(marketScannerRules.userId, userId)
      )
    )
    .returning({ id: marketScannerRules.id })
  if (!deleted) throw new Error("Rule not found")
  return deleted
}

export async function insertMarketScannerAlert(
  input: {
    rule: MarketScannerRule
    coin: string
    observed: number
    occurredAt: Date
    eventKey?: string
  },
  database: CustomShellDb = db
) {
  const { rule, coin, observed, occurredAt } = input
  const rising = rule.direction === "up"
  const title =
    rule.kind === "volume_spike"
      ? `${coin} volume reached ${observed.toFixed(1)}× normal in ${rule.window}`
      : `${coin} ${rising ? "rose" : "fell"} ${Math.abs(observed).toFixed(2)}% in ${rule.window}`
  const body =
    rule.kind === "volume_spike"
      ? `${rule.name} triggers at ${rule.threshold}× normal volume.`
      : `${rule.name} triggers when ${coin} moves ${rule.threshold}% ${rising ? "up" : "down"}.`
  const createdAt = now()
  const [created] = await database
    .insert(marketScannerAlerts)
    .values({
      id: uuid(),
      userId: rule.userId,
      ruleId: rule.id,
      eventKey: input.eventKey ?? `${rule.id}:${coin}:${occurredAt.getTime()}`,
      ruleName: rule.name,
      kind: rule.kind,
      direction: rule.direction ?? null,
      coin,
      window: rule.window,
      threshold: String(rule.threshold),
      observed: String(observed),
      title,
      body,
      data: { marketScope: rule.marketScope },
      occurredAt,
      createdAt,
    })
    .onConflictDoNothing({
      target: [marketScannerAlerts.userId, marketScannerAlerts.eventKey],
    })
    .returning()
  if (!created) return null

  await database
    .update(marketScannerRules)
    .set({ lastTriggeredAt: occurredAt, lastEvaluatedAt: occurredAt })
    .where(
      and(
        eq(marketScannerRules.id, rule.id),
        eq(marketScannerRules.userId, rule.userId)
      )
    )

  return serializeAlert(created)
}

export async function markMarketScannerAlertRead(
  userId: string,
  alertId: string,
  database: CustomShellDb = db
) {
  const readAt = now()
  const [updated] = await database
    .update(marketScannerAlerts)
    .set({ readAt })
    .where(
      and(
        eq(marketScannerAlerts.id, alertId),
        eq(marketScannerAlerts.userId, userId)
      )
    )
    .returning({ id: marketScannerAlerts.id })
  if (!updated) throw new Error("Alert not found")
  return { id: updated.id, readAt: readAt.toISOString() }
}

export async function markAllMarketScannerAlertsRead(
  userId: string,
  database: CustomShellDb = db
) {
  const readAt = now()
  const rows = await database
    .update(marketScannerAlerts)
    .set({ readAt })
    .where(
      and(
        eq(marketScannerAlerts.userId, userId),
        isNull(marketScannerAlerts.readAt)
      )
    )
    .returning({ id: marketScannerAlerts.id })
  return { ids: rows.map((row) => row.id), readAt: readAt.toISOString() }
}

export async function deleteAllMarketScannerAlerts(
  userId: string,
  database: CustomShellDb = db
) {
  return database.transaction(async (transaction) => {
    const rows = await transaction
      .delete(marketScannerAlerts)
      .where(eq(marketScannerAlerts.userId, userId))
      .returning({ id: marketScannerAlerts.id })
    await transaction
      .update(marketScannerRules)
      .set({ lastTriggeredAt: null })
      .where(eq(marketScannerRules.userId, userId))
    return { count: rows.length }
  })
}

function ruleValues(userId: string, input: MarketScannerRuleInput, timestamp: Date) {
  return {
    id: uuid(),
    userId,
    name: input.name,
    kind: input.kind,
    direction: input.kind === "price_move" ? input.direction : null,
    threshold: String(input.threshold),
    marketScope: input.marketScope,
    markets: input.marketScope === "selected" ? input.markets : [],
    window: input.window,
    cooldown: input.cooldown,
    enabled: input.enabled,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

function serializeRule(row: typeof marketScannerRules.$inferSelect): MarketScannerRuleItem {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    kind: row.kind as MarketScannerRuleItem["kind"],
    direction: (row.direction as MarketScannerRuleItem["direction"]) ?? undefined,
    threshold: Number(row.threshold),
    marketScope: row.marketScope as MarketScannerRuleItem["marketScope"],
    markets: row.markets as string[],
    window: row.window as MarketScannerRuleItem["window"],
    cooldown: row.cooldown as MarketScannerRuleItem["cooldown"],
    enabled: row.enabled,
    lastEvaluatedAt: row.lastEvaluatedAt?.toISOString() ?? null,
    lastTriggeredAt: row.lastTriggeredAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

function serializeAlert(
  row: typeof marketScannerAlerts.$inferSelect
): MarketScannerAlertItem {
  return {
    id: row.id,
    ruleId: row.ruleId,
    ruleName: row.ruleName,
    kind: row.kind as MarketScannerAlertItem["kind"],
    direction: row.direction as MarketScannerAlertItem["direction"],
    coin: row.coin,
    window: row.window as MarketScannerAlertItem["window"],
    threshold: Number(row.threshold),
    observed: Number(row.observed),
    title: row.title,
    body: row.body,
    occurredAt: row.occurredAt.toISOString(),
    readAt: row.readAt?.toISOString() ?? null,
  }
}
