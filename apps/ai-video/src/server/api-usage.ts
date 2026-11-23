import { and, desc, eq, inArray, lt, or, sql, type SQL } from "drizzle-orm"

import { db, type AiVideoDb } from "@/server/db"
import {
  API_USAGE_DEFAULT_COST_PER_CREDIT_USD,
  API_USAGE_DEFAULT_LIMIT_KEY,
  API_USAGE_LIMIT_MAX,
  API_USAGE_LIMIT_MIN,
  API_USAGE_LIMIT_RANGE_MESSAGE,
  API_USAGE_USER_LIMIT_KEY_PREFIX,
} from "@/lib/api-usage-constants"
import { requireAppOrigin } from "@/server/origin"
import {
  aiVideoApiUsageAlerts,
  aiVideoApiUsageEvents,
  aiVideoApiUsageLimits,
  aiVideoNotifications,
  aiVideoSettings,
  aiVideoUsers,
  type AiVideoApiUsageLimit,
  type AiVideoApiUsageEvent,
  type AiVideoUser,
} from "@/server/schema"
import { now, requireAdminUser, requireUser, uuid } from "@/server/security"
import { filterNotificationRecipients } from "@/server/notification-preferences"
import { publishNotificationCreated } from "@/server/notification-events"
import {
  apiUsagePeriodStart,
  apiUsageStatus,
  creditsForApiUsageFeature,
  estimateApiUsageCostUsd,
  wouldCrossUsageThreshold,
  type ApiUsageAlertLevel,
  type ApiUsageEventStatus,
  type ApiUsageFeature,
  type ApiUsageLimitStatus,
  type ApiUsageProvider,
} from "@/server/api-usage-policy"

const DEFAULT_PAGE_SIZE = 20
const MAX_PAGE_SIZE = 100
const CURSOR_SEPARATOR = "|"
const DEFAULT_SETTINGS_KEY = "default"

export type ApiUsageAction = {
  provider: ApiUsageProvider
  feature: ApiUsageFeature
  model?: string | null
  metadata?: Record<string, unknown>
}

export type ApiUsageSummary = {
  period_start: string
  period_end: string
  used_credits: number
  limit_credits: number
  remaining_credits: number
  status: ApiUsageLimitStatus
  limit_source: "default" | "override"
}

export type ApiUsageEventItem = {
  id: string
  user_id: string
  user_name: string
  user_email: string
  provider: ApiUsageProvider
  feature: ApiUsageFeature
  model: string | null
  credits: number
  status: ApiUsageEventStatus
  created_at: string
}

export type ApiUsageEventPage = {
  events: ApiUsageEventItem[]
  next_cursor: string | null
}

export type ApiUsageAdminEventItem = ApiUsageEventItem & {
  estimated_cost_usd: number
}

export type ApiUsageAdminEventPage = {
  events: ApiUsageAdminEventItem[]
  next_cursor: string | null
  cost_per_credit_usd: number
}

export type ApiUsageAdminUser = {
  user_id: string
  user_name: string
  user_email: string
  used_credits: number
  limit_credits: number
  remaining_credits: number
  estimated_used_cost_usd: number
  estimated_limit_cost_usd: number
  estimated_remaining_cost_usd: number
  status: ApiUsageLimitStatus
  override_credits: number | null
  blocked_count: number
}

export type ApiUsageDailyPoint = {
  date: string
  provider: ApiUsageProvider
  credits: number
  estimated_cost_usd: number
}

export type ApiUsageAdminDashboard = {
  summary: ApiUsageSummary & {
    total_limit_credits: number
    users_near_cap: number
    blocked_attempts: number
    cost_per_credit_usd: number
    estimated_used_cost_usd: number
    estimated_total_limit_cost_usd: number
    estimated_remaining_cost_usd: number
  }
  users: ApiUsageAdminUser[]
  daily: ApiUsageDailyPoint[]
}

export async function withApiUsage<T>(
  userId: string,
  action: ApiUsageAction,
  run: () => Promise<T>
) {
  const eventId = await reserveApiUsageEvent(userId, action)

  try {
    return await run()
  } catch (error) {
    await markApiUsageEventFailed(eventId)
    throw error
  }
}

export async function getCurrentUserApiUsageSummary(): Promise<ApiUsageSummary> {
  const user = await requireUser()
  return getUserUsageSummary(user.id)
}

export async function listCurrentUserApiUsageEvents({
  cursor,
  limit,
}: {
  cursor?: string
  limit?: number
} = {}): Promise<ApiUsageEventPage> {
  const user = await requireUser()
  return listApiUsageEvents({ userId: user.id, cursor, limit })
}

export async function getAdminApiUsageDashboard(): Promise<ApiUsageAdminDashboard> {
  await requireAdminUser()
  const periodStart = apiUsagePeriodStart()
  const periodEnd = apiUsagePeriodEnd(periodStart)

  const dailyDate = sql<string>`to_char(${aiVideoApiUsageEvents.createdAt} at time zone 'UTC', 'YYYY-MM-DD')`
  const [users, limitRows, usageRows, dailyRows, costPerCreditUsd] =
    await Promise.all([
      db.select().from(aiVideoUsers),
      db.select().from(aiVideoApiUsageLimits),
      db
        .select({
          userId: aiVideoApiUsageEvents.userId,
          usedCredits: sql<number>`coalesce(sum(case when ${aiVideoApiUsageEvents.status} <> 'blocked' then ${aiVideoApiUsageEvents.credits} else 0 end), 0)::int`,
          blockedCount: sql<number>`coalesce(sum(case when ${aiVideoApiUsageEvents.status} = 'blocked' then 1 else 0 end), 0)::int`,
        })
        .from(aiVideoApiUsageEvents)
        .where(eq(aiVideoApiUsageEvents.periodStart, periodStart))
        .groupBy(aiVideoApiUsageEvents.userId),
      db
        .select({
          date: dailyDate,
          provider: aiVideoApiUsageEvents.provider,
          credits: sql<number>`coalesce(sum(${aiVideoApiUsageEvents.credits}), 0)::int`,
        })
        .from(aiVideoApiUsageEvents)
        .where(
          and(
            eq(aiVideoApiUsageEvents.periodStart, periodStart),
            sql`${aiVideoApiUsageEvents.status} <> 'blocked'`
          )
        )
        .groupBy(dailyDate, aiVideoApiUsageEvents.provider),
      getApiUsageCostPerCreditUsd(),
    ])

  const defaultLimit = requireDefaultApiUsageLimit(limitRows)
  const overrideByUserId = new Map(
    limitRows
      .filter((row) => row.userId)
      .map((row) => [row.userId as string, row.monthlyCredits])
  )
  const usageByUserId = new Map(
    usageRows.map((row) => [
      row.userId,
      {
        usedCredits: row.usedCredits,
        blockedCount: row.blockedCount,
      },
    ])
  )

  const dashboardUsers = users.map((user) => {
    const usage = usageByUserId.get(user.id) ?? {
      usedCredits: 0,
      blockedCount: 0,
    }
    const limit = overrideByUserId.get(user.id) ?? defaultLimit
    return serializeAdminUser(
      user,
      usage.usedCredits,
      limit,
      costPerCreditUsd,
      {
        overrideCredits: overrideByUserId.get(user.id) ?? null,
        blockedCount: usage.blockedCount,
      }
    )
  })
  const usedCredits = dashboardUsers.reduce(
    (total, user) => total + user.used_credits,
    0
  )
  const totalLimitCredits = dashboardUsers.reduce(
    (total, user) => total + user.limit_credits,
    0
  )
  const blockedAttempts = dashboardUsers.reduce(
    (total, user) => total + user.blocked_count,
    0
  )
  const remainingCredits = Math.max(0, totalLimitCredits - usedCredits)

  return {
    summary: {
      period_start: periodStart.toISOString(),
      period_end: periodEnd.toISOString(),
      used_credits: usedCredits,
      limit_credits: defaultLimit,
      total_limit_credits: totalLimitCredits,
      remaining_credits: remainingCredits,
      status: apiUsageStatus(usedCredits, Math.max(1, totalLimitCredits)),
      limit_source: "default",
      users_near_cap: dashboardUsers.filter(
        (user) => user.status === "warning" || user.status === "blocked"
      ).length,
      blocked_attempts: blockedAttempts,
      cost_per_credit_usd: costPerCreditUsd,
      estimated_used_cost_usd: estimateApiUsageCostUsd(
        usedCredits,
        costPerCreditUsd
      ),
      estimated_total_limit_cost_usd: estimateApiUsageCostUsd(
        totalLimitCredits,
        costPerCreditUsd
      ),
      estimated_remaining_cost_usd: estimateApiUsageCostUsd(
        remainingCredits,
        costPerCreditUsd
      ),
    },
    users: dashboardUsers.sort((a, b) => b.used_credits - a.used_credits),
    daily: dailyRows
      .map((row) => ({
        date: row.date,
        provider: row.provider as ApiUsageProvider,
        credits: row.credits,
        estimated_cost_usd: estimateApiUsageCostUsd(
          row.credits,
          costPerCreditUsd
        ),
      }))
      .sort((a, b) => a.date.localeCompare(b.date)),
  }
}

export async function listAdminApiUsageEvents({
  cursor,
  limit,
  userId,
}: {
  cursor?: string
  limit?: number
  userId?: string
} = {}): Promise<ApiUsageAdminEventPage> {
  await requireAdminUser()
  const [page, costPerCreditUsd] = await Promise.all([
    listApiUsageEvents({ cursor, limit, userId }),
    getApiUsageCostPerCreditUsd(),
  ])
  return {
    ...page,
    cost_per_credit_usd: costPerCreditUsd,
    events: page.events.map((event) => ({
      ...event,
      estimated_cost_usd: estimateApiUsageCostUsd(
        event.credits,
        costPerCreditUsd,
        event.status
      ),
    })),
  }
}

export async function saveUserApiUsageLimitForCurrentUser(
  userId: string,
  monthlyCredits: number | null
) {
  requireAppOrigin()
  await requireAdminUser()
  const [user] = await db
    .select({ id: aiVideoUsers.id })
    .from(aiVideoUsers)
    .where(eq(aiVideoUsers.id, userId))
    .limit(1)
  if (!user) {
    throw new Error("User not found")
  }

  const limitKey = userLimitKey(userId)
  if (monthlyCredits == null) {
    await db
      .delete(aiVideoApiUsageLimits)
      .where(eq(aiVideoApiUsageLimits.key, limitKey))
    return { userId, monthlyCredits: null }
  }

  await upsertApiUsageLimit(limitKey, userId, monthlyCredits)
  return { userId, monthlyCredits: cleanMonthlyCredits(monthlyCredits) }
}

export async function getDefaultApiUsageLimit(database: AiVideoDb = db) {
  const rows = await database
    .select({
      key: aiVideoApiUsageLimits.key,
      monthlyCredits: aiVideoApiUsageLimits.monthlyCredits,
    })
    .from(aiVideoApiUsageLimits)
    .where(eq(aiVideoApiUsageLimits.key, API_USAGE_DEFAULT_LIMIT_KEY))
  return requireDefaultApiUsageLimit(rows)
}

export async function setDefaultApiUsageLimit(
  monthlyCredits: number,
  database: AiVideoDb = db
) {
  return upsertApiUsageLimit(
    API_USAGE_DEFAULT_LIMIT_KEY,
    null,
    monthlyCredits,
    database
  )
}

async function getApiUsageCostPerCreditUsd(database: AiVideoDb = db) {
  const [row] = await database
    .select({ settings: aiVideoSettings.settings })
    .from(aiVideoSettings)
    .where(eq(aiVideoSettings.key, DEFAULT_SETTINGS_KEY))
    .limit(1)
  const settings = row?.settings
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
    return API_USAGE_DEFAULT_COST_PER_CREDIT_USD
  }
  const rate = (settings as { apiUsageCostPerCreditUsd?: unknown })
    .apiUsageCostPerCreditUsd
  return typeof rate === "number" && Number.isFinite(rate) && rate >= 0
    ? rate
    : API_USAGE_DEFAULT_COST_PER_CREDIT_USD
}

async function reserveApiUsageEvent(userId: string, action: ApiUsageAction) {
  const periodStart = apiUsagePeriodStart()
  const credits = creditsForApiUsageFeature(action.feature)
  const result = await db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`${userId}:${periodStart.toISOString()}`})::bigint)`
    )

    const { limitCredits } = await getApiUsageLimit(userId, tx)
    const usedCredits = await getUsedCredits(userId, periodStart, tx)
    const nextCredits = usedCredits + credits
    const createdAt = now()

    if (nextCredits > limitCredits) {
      await tx.insert(aiVideoApiUsageEvents).values({
        id: uuid(),
        userId,
        provider: action.provider,
        feature: action.feature,
        model: action.model ?? null,
        credits,
        status: "blocked",
        periodStart,
        metadata: cleanUsageMetadata(action.metadata),
        createdAt,
      })
      await createApiUsageAlert({
        userId,
        periodStart,
        level: "blocked",
        usedCredits,
        limitCredits,
        database: tx,
      })
      return { blocked: true as const }
    }

    const [event] = await tx
      .insert(aiVideoApiUsageEvents)
      .values({
        id: uuid(),
        userId,
        provider: action.provider,
        feature: action.feature,
        model: action.model ?? null,
        credits,
        status: "success",
        periodStart,
        metadata: cleanUsageMetadata(action.metadata),
        createdAt,
      })
      .returning({ id: aiVideoApiUsageEvents.id })

    if (!event) {
      throw new Error("API usage event was not created")
    }

    for (const level of ["warning", "blocked"] as const) {
      if (
        wouldCrossUsageThreshold(usedCredits, nextCredits, limitCredits, level)
      ) {
        await createApiUsageAlert({
          userId,
          periodStart,
          level,
          usedCredits: nextCredits,
          limitCredits,
          database: tx,
        })
      }
    }

    return { blocked: false as const, eventId: event.id }
  })

  if (result.blocked) {
    throw new Error("API usage limit reached. Try again next month.")
  }
  return result.eventId
}

async function markApiUsageEventFailed(eventId: string) {
  await db
    .update(aiVideoApiUsageEvents)
    .set({ status: "failed" })
    .where(eq(aiVideoApiUsageEvents.id, eventId))
}

async function getUserUsageSummary(userId: string): Promise<ApiUsageSummary> {
  const periodStart = apiUsagePeriodStart()
  const periodEnd = apiUsagePeriodEnd(periodStart)
  const [{ limitCredits, source }, usedCredits] = await Promise.all([
    getApiUsageLimit(userId),
    getUsedCredits(userId, periodStart),
  ])

  return {
    period_start: periodStart.toISOString(),
    period_end: periodEnd.toISOString(),
    used_credits: usedCredits,
    limit_credits: limitCredits,
    remaining_credits: Math.max(0, limitCredits - usedCredits),
    status: apiUsageStatus(usedCredits, limitCredits),
    limit_source: source,
  }
}

async function listApiUsageEvents({
  cursor,
  limit = DEFAULT_PAGE_SIZE,
  userId,
}: {
  cursor?: string
  limit?: number
  userId?: string
}): Promise<ApiUsageEventPage> {
  const pageSize = Math.min(Math.max(1, limit), MAX_PAGE_SIZE)
  const conditions: SQL[] = []

  if (userId) {
    conditions.push(eq(aiVideoApiUsageEvents.userId, userId))
  }
  if (cursor) {
    const [createdAtValue, id] = cursor.split(CURSOR_SEPARATOR)
    const createdAt = new Date(createdAtValue ?? "")
    if (!createdAtValue || !id || Number.isNaN(createdAt.getTime())) {
      throw new Error("Invalid API usage cursor")
    }
    const cursorCondition = or(
      lt(aiVideoApiUsageEvents.createdAt, createdAt),
      and(
        eq(aiVideoApiUsageEvents.createdAt, createdAt),
        lt(aiVideoApiUsageEvents.id, id)
      )
    )
    if (cursorCondition) {
      conditions.push(cursorCondition)
    }
  }

  const whereCondition = conditions.length ? and(...conditions) : undefined
  const rows = whereCondition
    ? await db
        .select({
          event: aiVideoApiUsageEvents,
          user: aiVideoUsers,
        })
        .from(aiVideoApiUsageEvents)
        .innerJoin(
          aiVideoUsers,
          eq(aiVideoApiUsageEvents.userId, aiVideoUsers.id)
        )
        .where(whereCondition)
        .orderBy(
          desc(aiVideoApiUsageEvents.createdAt),
          desc(aiVideoApiUsageEvents.id)
        )
        .limit(pageSize + 1)
    : await db
        .select({
          event: aiVideoApiUsageEvents,
          user: aiVideoUsers,
        })
        .from(aiVideoApiUsageEvents)
        .innerJoin(
          aiVideoUsers,
          eq(aiVideoApiUsageEvents.userId, aiVideoUsers.id)
        )
        .orderBy(
          desc(aiVideoApiUsageEvents.createdAt),
          desc(aiVideoApiUsageEvents.id)
        )
        .limit(pageSize + 1)
  const pageRows = rows.slice(0, pageSize)
  const lastRow = pageRows.at(-1)?.event

  return {
    events: pageRows.map((row) => serializeUsageEvent(row.event, row.user)),
    next_cursor:
      rows.length > pageSize && lastRow
        ? `${lastRow.createdAt.toISOString()}${CURSOR_SEPARATOR}${lastRow.id}`
        : null,
  }
}

async function getApiUsageLimit(
  userId: string,
  database: AiVideoDb = db
): Promise<{ limitCredits: number; source: "default" | "override" }> {
  const rows = await database
    .select()
    .from(aiVideoApiUsageLimits)
    .where(
      inArray(aiVideoApiUsageLimits.key, [
        API_USAGE_DEFAULT_LIMIT_KEY,
        userLimitKey(userId),
      ])
    )

  const limitKey = userLimitKey(userId)
  const override = rows.find((row) => row.key === limitKey)
  if (override) {
    return { limitCredits: override.monthlyCredits, source: "override" }
  }
  const defaultLimit = requireDefaultApiUsageLimit(rows)
  return {
    limitCredits: defaultLimit,
    source: "default",
  }
}

function requireDefaultApiUsageLimit(
  rows: Pick<AiVideoApiUsageLimit, "key" | "monthlyCredits">[]
) {
  const defaultLimit = rows.find(
    (row) => row.key === API_USAGE_DEFAULT_LIMIT_KEY
  )
  if (!defaultLimit) {
    throw new Error(
      "Default API usage limit is missing. Run the latest database migrations."
    )
  }
  return defaultLimit.monthlyCredits
}

async function getUsedCredits(
  userId: string,
  periodStart: Date,
  database: AiVideoDb = db
) {
  const [row] = await database
    .select({
      credits: sql<number>`coalesce(sum(case when ${aiVideoApiUsageEvents.status} <> 'blocked' then ${aiVideoApiUsageEvents.credits} else 0 end), 0)::int`,
    })
    .from(aiVideoApiUsageEvents)
    .where(
      and(
        eq(aiVideoApiUsageEvents.userId, userId),
        eq(aiVideoApiUsageEvents.periodStart, periodStart)
      )
    )
  return row?.credits ?? 0
}

async function createApiUsageAlert({
  userId,
  periodStart,
  level,
  usedCredits,
  limitCredits,
  database,
}: {
  userId: string
  periodStart: Date
  level: ApiUsageAlertLevel
  usedCredits: number
  limitCredits: number
  database: AiVideoDb
}) {
  const createdAt = now()
  const [alert] = await database
    .insert(aiVideoApiUsageAlerts)
    .values({
      id: uuid(),
      userId,
      periodStart,
      level,
      createdAt,
    })
    .onConflictDoNothing()
    .returning({ id: aiVideoApiUsageAlerts.id })

  if (!alert) return

  const admins = await database
    .select({ id: aiVideoUsers.id })
    .from(aiVideoUsers)
    .where(eq(aiVideoUsers.role, "admin"))
  const recipientIds = await filterNotificationRecipients(
    Array.from(new Set([userId, ...admins.map((admin) => admin.id)])),
    "api_usage_alert",
    { apiUsageLevel: level },
    database
  )
  if (recipientIds.length === 0) return

  await database.insert(aiVideoNotifications).values(
    recipientIds.map((recipientUserId) => ({
      id: uuid(),
      recipientUserId,
      actorUserId: userId,
      feedbackId: null,
      type: "api_usage_alert",
      feedbackVoteId: null,
      feedbackCommentId: null,
      creatorId: null,
      creatorNewVideoCount: null,
      apiUsageLevel: level,
      apiUsagePeriodStart: periodStart,
      apiUsageUsedCredits: usedCredits,
      apiUsageLimitCredits: limitCredits,
      readAt: null,
      createdAt,
    }))
  )

  for (const recipientUserId of recipientIds) {
    await publishNotificationCreated(recipientUserId, database)
  }
}

async function upsertApiUsageLimit(
  key: string,
  userId: string | null,
  monthlyCredits: number,
  database: AiVideoDb = db
) {
  const credits = cleanMonthlyCredits(monthlyCredits)
  const ts = now()
  await database
    .insert(aiVideoApiUsageLimits)
    .values({
      key,
      userId,
      monthlyCredits: credits,
      createdAt: ts,
      updatedAt: ts,
    })
    .onConflictDoUpdate({
      target: aiVideoApiUsageLimits.key,
      set: { monthlyCredits: credits, updatedAt: ts },
    })
  return credits
}

function serializeAdminUser(
  user: AiVideoUser,
  usedCredits: number,
  limitCredits: number,
  costPerCreditUsd: number,
  {
    overrideCredits,
    blockedCount,
  }: { overrideCredits: number | null; blockedCount: number }
): ApiUsageAdminUser {
  const remainingCredits = Math.max(0, limitCredits - usedCredits)
  return {
    user_id: user.id,
    user_name: user.name,
    user_email: user.email,
    used_credits: usedCredits,
    limit_credits: limitCredits,
    remaining_credits: remainingCredits,
    estimated_used_cost_usd: estimateApiUsageCostUsd(
      usedCredits,
      costPerCreditUsd
    ),
    estimated_limit_cost_usd: estimateApiUsageCostUsd(
      limitCredits,
      costPerCreditUsd
    ),
    estimated_remaining_cost_usd: estimateApiUsageCostUsd(
      remainingCredits,
      costPerCreditUsd
    ),
    status: apiUsageStatus(usedCredits, limitCredits),
    override_credits: overrideCredits,
    blocked_count: blockedCount,
  }
}

function serializeUsageEvent(
  event: AiVideoApiUsageEvent,
  user: AiVideoUser
): ApiUsageEventItem {
  return {
    id: event.id,
    user_id: event.userId,
    user_name: user.name,
    user_email: user.email,
    provider: event.provider as ApiUsageProvider,
    feature: event.feature as ApiUsageFeature,
    model: event.model,
    credits: event.credits,
    status: event.status as ApiUsageEventStatus,
    created_at: event.createdAt.toISOString(),
  }
}

function apiUsagePeriodEnd(periodStart: Date) {
  return new Date(
    Date.UTC(periodStart.getUTCFullYear(), periodStart.getUTCMonth() + 1, 1)
  )
}

function userLimitKey(userId: string) {
  return `${API_USAGE_USER_LIMIT_KEY_PREFIX}${userId}`
}

function cleanMonthlyCredits(value: number) {
  if (!Number.isFinite(value)) {
    throw new Error("Monthly credits must be a number")
  }
  const credits = Math.round(value)
  if (credits < API_USAGE_LIMIT_MIN || credits > API_USAGE_LIMIT_MAX) {
    throw new Error(API_USAGE_LIMIT_RANGE_MESSAGE)
  }
  return credits
}

function cleanUsageMetadata(value: Record<string, unknown> | undefined) {
  if (!value) return {}
  return Object.fromEntries(
    Object.entries(value).filter(
      ([, entry]) =>
        entry == null ||
        typeof entry === "string" ||
        typeof entry === "number" ||
        typeof entry === "boolean"
    )
  )
}
