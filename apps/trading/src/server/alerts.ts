import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lt,
  max,
  or,
  type SQL,
} from "drizzle-orm"

import type {
  AlertEventItem,
  AlertLogFilters,
  AlertRuleInput,
  AlertRuleItem,
} from "@/lib/alerts"
import { db, type CustomShellDb } from "@/server/db"
import { alertEvents, alertRules } from "@/server/schema"
import { now, uuid } from "@/server/util"

export async function getAlertRules(
  userId: string,
  database: CustomShellDb = db
) {
  const rows = await database
    .select()
    .from(alertRules)
    .where(eq(alertRules.userId, userId))
    .orderBy(desc(alertRules.updatedAt))
  return rows.map(serializeRule)
}

export async function listActiveAlertRules(
  database: CustomShellDb = db
): Promise<AlertRuleItem[]> {
  const rows = await database
    .select()
    .from(alertRules)
    .where(eq(alertRules.status, "active"))
  return rows.map(serializeRule)
}

export async function getAlertEventsPage(
  userId: string,
  filters: AlertLogFilters = {},
  database: CustomShellDb = db
) {
  const page = Math.max(1, filters.page ?? 1)
  const pageSize = Math.max(1, Math.min(100, filters.pageSize ?? 25))
  const conditions: SQL[] = [eq(alertEvents.userId, userId)]
  const search = filters.search?.trim()
  if (search) {
    const pattern = `%${search}%`
    const searchCondition = or(
      ilike(alertEvents.alertName, pattern),
      ilike(alertEvents.coin, pattern),
      ilike(alertEvents.title, pattern)
    )
    if (searchCondition) conditions.push(searchCondition)
  }
  if (filters.coin) conditions.push(eq(alertEvents.coin, filters.coin))
  if (filters.kind) conditions.push(eq(alertEvents.kind, filters.kind))
  if (filters.read === "read") conditions.push(isNotNull(alertEvents.readAt))
  if (filters.read === "unread") conditions.push(isNull(alertEvents.readAt))
  const where = and(...conditions)
  const direction = filters.dir === "asc" ? asc : desc
  const sortColumn =
    filters.sortBy === "market"
      ? alertEvents.coin
      : filters.sortBy === "alert"
        ? alertEvents.alertName
        : filters.sortBy === "condition"
          ? alertEvents.kind
          : filters.sortBy === "observed"
            ? alertEvents.observed
            : filters.sortBy === "read"
              ? alertEvents.readAt
              : alertEvents.occurredAt

  const [rows, [total], [unread], markets] = await Promise.all([
    database
      .select()
      .from(alertEvents)
      .where(where)
      .orderBy(direction(sortColumn), direction(alertEvents.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    database.select({ value: count() }).from(alertEvents).where(where),
    database
      .select({ value: count() })
      .from(alertEvents)
      .where(and(eq(alertEvents.userId, userId), isNull(alertEvents.readAt))),
    database
      .select({ coin: alertEvents.coin })
      .from(alertEvents)
      .where(eq(alertEvents.userId, userId))
      .groupBy(alertEvents.coin)
      .orderBy(asc(alertEvents.coin)),
  ])

  return {
    items: rows.map(serializeEvent),
    page,
    pageSize,
    total: total?.value ?? 0,
    unreadCount: unread?.value ?? 0,
    markets: markets.map((row) => row.coin),
  }
}

export async function getAlertEventsPoll(
  userId: string,
  limit = 10,
  database: CustomShellDb = db
) {
  const [rows, [unread]] = await Promise.all([
    database
      .select()
      .from(alertEvents)
      .where(eq(alertEvents.userId, userId))
      .orderBy(desc(alertEvents.occurredAt), desc(alertEvents.id))
      .limit(Math.max(1, Math.min(50, limit))),
    database
      .select({ value: count() })
      .from(alertEvents)
      .where(and(eq(alertEvents.userId, userId), isNull(alertEvents.readAt))),
  ])
  return {
    events: rows.map(serializeEvent),
    unreadCount: unread?.value ?? 0,
  }
}

export async function createAlertRule(
  userId: string,
  input: AlertRuleInput,
  database: CustomShellDb = db
): Promise<AlertRuleItem> {
  const timestamp = now()
  const values = ruleValues(userId, input, timestamp)
  const firstSlot = (Number.parseInt(values.id.slice(0, 8), 16) % 100) + 1
  for (let offset = 0; offset < 100; offset += 1) {
    const ruleSlot = ((firstSlot - 1 + offset) % 100) + 1
    const [created] = await database
      .insert(alertRules)
      .values({ ...values, ruleSlot })
      .onConflictDoNothing({
        target: [alertRules.userId, alertRules.ruleSlot],
      })
      .returning()
    if (created) return serializeRule(created)
  }
  throw new Error("You can save up to 100 alerts.")
}

export async function updateAlertRule(
  userId: string,
  ruleId: string,
  input: AlertRuleInput,
  database: CustomShellDb = db
): Promise<AlertRuleItem> {
  const [updated] = await database
    .update(alertRules)
    .set({
      ...conditionValues(input),
      name: input.name,
      message: input.message ?? null,
      coin: input.coin,
      triggerMode: input.triggerMode,
      cooldown: input.triggerMode === "repeat" ? input.cooldown : null,
      lastEvaluatedAt: null,
      updatedAt: now(),
    })
    .where(and(eq(alertRules.id, ruleId), eq(alertRules.userId, userId)))
    .returning()
  if (!updated) throw new Error("Alert not found")
  return serializeRule(updated)
}

export async function pauseAlertRule(
  userId: string,
  ruleId: string,
  database: CustomShellDb = db
) {
  const [updated] = await database
    .update(alertRules)
    .set({ status: "paused", updatedAt: now() })
    .where(
      and(
        eq(alertRules.id, ruleId),
        eq(alertRules.userId, userId),
        inArray(alertRules.status, ["active", "paused"])
      )
    )
    .returning()
  if (!updated) throw new Error("Alert not found")
  return serializeRule(updated)
}

export async function activateAlertRule(
  userId: string,
  ruleId: string,
  database: CustomShellDb = db
) {
  const [updated] = await database
    .update(alertRules)
    .set({ status: "active", lastEvaluatedAt: null, updatedAt: now() })
    .where(and(eq(alertRules.id, ruleId), eq(alertRules.userId, userId)))
    .returning()
  if (!updated) throw new Error("Alert not found")
  return serializeRule(updated)
}

export async function deleteAlertRule(
  userId: string,
  ruleId: string,
  database: CustomShellDb = db
) {
  const [deleted] = await database
    .delete(alertRules)
    .where(and(eq(alertRules.id, ruleId), eq(alertRules.userId, userId)))
    .returning({ id: alertRules.id })
  if (!deleted) throw new Error("Alert not found")
  return deleted
}

export async function markAlertRulesEvaluated(
  ruleIds: string[],
  evaluatedAt: Date,
  database: CustomShellDb = db
) {
  if (ruleIds.length === 0) return
  await database
    .update(alertRules)
    .set({ lastEvaluatedAt: evaluatedAt })
    .where(
      and(inArray(alertRules.id, ruleIds), eq(alertRules.status, "active"))
    )
}

export async function listAlertRuleTriggerTimes(database: CustomShellDb = db) {
  const rows = await database
    .select({
      ruleId: alertEvents.ruleId,
      coin: alertEvents.coin,
      occurredAt: max(alertEvents.occurredAt),
    })
    .from(alertEvents)
    .where(isNotNull(alertEvents.ruleId))
    .groupBy(alertEvents.ruleId, alertEvents.coin)
  return rows.flatMap((row) =>
    row.ruleId && row.occurredAt
      ? [{ ruleId: row.ruleId, coin: row.coin, occurredAt: row.occurredAt }]
      : []
  )
}

export async function recordAlertEvent(
  input: {
    rule: AlertRuleItem
    observed: number
    occurredAt: Date
    eventKey: string
  },
  database: CustomShellDb = db
) {
  return database.transaction(async (transaction) => {
    const [current] = await transaction
      .select({ status: alertRules.status, updatedAt: alertRules.updatedAt })
      .from(alertRules)
      .where(
        and(
          eq(alertRules.id, input.rule.id),
          eq(alertRules.userId, input.rule.userId)
        )
      )
      .for("update")
    if (
      current?.status !== "active" ||
      current.updatedAt.toISOString() !== input.rule.updatedAt
    )
      return null

    const { title, body } = eventText(input.rule, input.observed)
    const [created] = await transaction
      .insert(alertEvents)
      .values({
        id: uuid(),
        userId: input.rule.userId,
        ruleId: input.rule.id,
        eventKey: input.eventKey,
        alertName: input.rule.name,
        message: input.rule.message ?? null,
        coin: input.rule.coin,
        ...conditionValues(input.rule),
        triggerMode: input.rule.triggerMode,
        cooldown:
          input.rule.triggerMode === "repeat" ? input.rule.cooldown : null,
        observed: String(input.observed),
        title,
        body,
        occurredAt: input.occurredAt,
        createdAt: now(),
      })
      .onConflictDoNothing({
        target: [alertEvents.userId, alertEvents.eventKey],
      })
      .returning()
    if (!created) return null

    await transaction
      .update(alertRules)
      .set({
        status: input.rule.triggerMode === "once" ? "triggered" : "active",
        lastTriggeredAt: input.occurredAt,
        lastEvaluatedAt: input.occurredAt,
        updatedAt: now(),
      })
      .where(
        and(
          eq(alertRules.id, input.rule.id),
          eq(alertRules.userId, input.rule.userId)
        )
      )

    return serializeEvent(created)
  })
}

export async function markAlertEventRead(
  userId: string,
  eventId: string,
  database: CustomShellDb = db
) {
  const readAt = now()
  const [updated] = await database
    .update(alertEvents)
    .set({ readAt })
    .where(and(eq(alertEvents.id, eventId), eq(alertEvents.userId, userId)))
    .returning({ id: alertEvents.id })
  if (!updated) throw new Error("Alert event not found")
  return { id: updated.id, readAt: readAt.toISOString() }
}

export async function markAllAlertEventsRead(
  userId: string,
  database: CustomShellDb = db
) {
  const readAt = now()
  const rows = await database
    .update(alertEvents)
    .set({ readAt })
    .where(and(eq(alertEvents.userId, userId), isNull(alertEvents.readAt)))
    .returning({ id: alertEvents.id })
  return { ids: rows.map((row) => row.id), readAt: readAt.toISOString() }
}

export async function clearAlertEvents(
  userId: string,
  database: CustomShellDb = db
) {
  const rows = await database
    .delete(alertEvents)
    .where(eq(alertEvents.userId, userId))
    .returning({ id: alertEvents.id })
  return { count: rows.length }
}

export async function pruneAlertEvents(
  cutoff: Date,
  database: CustomShellDb = db
) {
  const rows = await database
    .delete(alertEvents)
    .where(lt(alertEvents.occurredAt, cutoff))
    .returning({ id: alertEvents.id })
  return { count: rows.length }
}

function ruleValues(userId: string, input: AlertRuleInput, timestamp: Date) {
  return {
    id: uuid(),
    userId,
    name: input.name,
    message: input.message ?? null,
    coin: input.coin,
    ...conditionValues(input),
    triggerMode: input.triggerMode,
    cooldown: input.triggerMode === "repeat" ? input.cooldown : null,
    status: "active",
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

function conditionValues(input: AlertRuleInput | AlertRuleItem) {
  return {
    kind: input.kind,
    operator: input.kind === "price_level" ? input.operator : null,
    direction: input.kind === "price_move" ? input.direction : null,
    level: input.kind === "price_level" ? String(input.level) : null,
    percent: input.kind === "price_move" ? String(input.percent) : null,
    multiplier: input.kind === "volume_spike" ? String(input.multiplier) : null,
    window: input.kind === "price_level" ? null : input.window,
  }
}

function serializeRule(row: typeof alertRules.$inferSelect): AlertRuleItem {
  const shared = {
    id: row.id,
    userId: row.userId,
    name: row.name,
    ...(row.message ? { message: row.message } : {}),
    coin: row.coin,
    status: row.status as AlertRuleItem["status"],
    lastEvaluatedAt: row.lastEvaluatedAt?.toISOString() ?? null,
    lastTriggeredAt: row.lastTriggeredAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
  const trigger =
    row.triggerMode === "repeat"
      ? {
          triggerMode: "repeat" as const,
          cooldown: row.cooldown as Extract<
            AlertRuleInput,
            { triggerMode: "repeat" }
          >["cooldown"],
        }
      : { triggerMode: "once" as const }
  if (row.kind === "price_level") {
    return {
      ...shared,
      ...trigger,
      kind: "price_level",
      level: Number(row.level),
      operator: row.operator as Extract<
        AlertRuleInput,
        { kind: "price_level" }
      >["operator"],
    }
  }
  if (row.kind === "price_move") {
    return {
      ...shared,
      ...trigger,
      kind: "price_move",
      direction: row.direction as "up" | "down",
      percent: Number(row.percent),
      window: row.window as Extract<
        AlertRuleInput,
        { kind: "price_move" }
      >["window"],
    }
  }
  return {
    ...shared,
    ...trigger,
    kind: "volume_spike",
    multiplier: Number(row.multiplier),
    window: row.window as Extract<
      AlertRuleInput,
      { kind: "volume_spike" }
    >["window"],
  }
}

function serializeEvent(row: typeof alertEvents.$inferSelect): AlertEventItem {
  return {
    id: row.id,
    ruleId: row.ruleId,
    alertName: row.alertName,
    message: row.message,
    coin: row.coin,
    kind: row.kind as AlertEventItem["kind"],
    operator: row.operator as AlertEventItem["operator"],
    direction: row.direction as AlertEventItem["direction"],
    level: row.level === null ? null : Number(row.level),
    percent: row.percent === null ? null : Number(row.percent),
    multiplier: row.multiplier === null ? null : Number(row.multiplier),
    window: row.window as AlertEventItem["window"],
    triggerMode: row.triggerMode as AlertEventItem["triggerMode"],
    cooldown: row.cooldown as AlertEventItem["cooldown"],
    observed: Number(row.observed),
    title: row.title,
    body: row.body,
    occurredAt: row.occurredAt.toISOString(),
    readAt: row.readAt?.toISOString() ?? null,
  }
}

function eventText(rule: AlertRuleItem, observed: number) {
  if (rule.kind === "price_level") {
    const direction =
      rule.operator === "crossing_up"
        ? "crossed upward through"
        : rule.operator === "crossing_down"
          ? "crossed downward through"
          : "crossed"
    return {
      title: `${rule.coin} ${direction} ${rule.level}`,
      body: rule.message ?? `${rule.name} fired at ${observed}.`,
    }
  }
  if (rule.kind === "price_move") {
    return {
      title: `${rule.coin} ${rule.direction === "up" ? "rose" : "fell"} ${Math.abs(observed).toFixed(2)}% in ${rule.window}`,
      body:
        rule.message ??
        `${rule.name} fires after a ${rule.percent}% move ${rule.direction}.`,
    }
  }
  return {
    title: `${rule.coin} volume reached ${observed.toFixed(1)}× normal in ${rule.window}`,
    body:
      rule.message ??
      `${rule.name} fires at ${rule.multiplier}× normal volume.`,
  }
}
