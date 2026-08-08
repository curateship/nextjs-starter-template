import { and, desc, eq, gte, inArray, sql } from "drizzle-orm"

import {
  aiAllowanceCentsFromFeatures,
  aiCostCents,
  aiUnitCostCents,
  isUnitPricedModel,
  type AiProvider,
  type AiUsageRange,
} from "@/lib/ai/ai-models"
import { db } from "@/server/db"
import { publishNotificationCreated } from "@/server/notifications/events"
import { resolveEntitlements } from "@/server/billing/entitlements"
import { getDefaultPlan } from "@/server/billing/plans"
import {
  customShellAiAllowanceOverrides,
  customShellAiUsageAlerts,
  customShellAiUsageEvents,
  customShellNotifications,
  customShellPlans,
  customShellSubscriptions,
  customShellUsers,
} from "@/server/schema"
import { now, uuid } from "@/server/auth/security"

// The meter every AI call runs through. Two rules hold everything together:
// every call site uses `runAiCall` (never the provider directly), and only
// `recordAiUsage` writes the table. Recording must never break the call it
// measures — a failed write is logged and swallowed, the AI result still
// comes back.

export type AiUsageStatus = "success" | "failed" | "blocked"

/**
 * The one place the month a call belongs to is worked out: the first day of
 * the call's UTC month, as a date string. Everything that groups usage by
 * month — this table, the dashboard, the monthly limits — goes through here.
 */
export function aiUsageMonthStart(at: Date): string {
  const month = String(at.getUTCMonth() + 1).padStart(2, "0")
  return `${at.getUTCFullYear()}-${month}-01`
}

export type AiUsageEntry = {
  /** Null for a call nobody owns (a system job); rows also go null if the account is later deleted. */
  userId: string | null
  provider: AiProvider
  model: string
  /** Which button or flow spent the money, e.g. "key-test". */
  feature: string
  inputTokens: number
  outputTokens: number
  /**
   * How much of whatever this model is charged by was used — characters read
   * aloud, pictures made, seconds of video. Left out for the usual case, where
   * the price comes from the tokens above.
   */
  units?: number
  status: AiUsageStatus
  metadata?: Record<string, unknown>
}

/**
 * What one call cost, in whole cents. A model charged by what it makes is
 * priced by its units; everything else by its tokens. A blocked call never
 * reached the provider, so it cost nothing whichever kind it is.
 */
export function aiUsageCostCents(
  entry: Pick<
    AiUsageEntry,
    "model" | "inputTokens" | "outputTokens" | "units" | "status"
  >
): number {
  if (entry.status === "blocked") return 0
  if (isUnitPricedModel(entry.model)) {
    return aiUnitCostCents(entry.model, entry.units ?? 0)
  }
  return aiCostCents(entry.model, entry.inputTokens, entry.outputTokens)
}

/** Writes one usage row. Never throws — the call being measured comes first. */
export async function recordAiUsage(entry: AiUsageEntry): Promise<void> {
  try {
    const at = now()
    await db.insert(customShellAiUsageEvents).values({
      id: uuid(),
      userId: entry.userId,
      provider: entry.provider,
      model: entry.model,
      feature: entry.feature,
      inputTokens: entry.inputTokens,
      outputTokens: entry.outputTokens,
      costCents: aiUsageCostCents(entry),
      status: entry.status,
      monthStart: aiUsageMonthStart(at),
      // The units are kept beside the row rather than in a column of their
      // own: they are the working-out behind the cost, not something anything
      // adds up.
      metadata:
        entry.units === undefined
          ? (entry.metadata ?? {})
          : { ...entry.metadata, units: entry.units },
      createdAt: at,
    })
  } catch (error) {
    // Losing a meter reading is bad; failing the user's call over it is
    // worse. Log loudly so a dead meter cannot stay quiet.
    console.error("AI usage row was not recorded", entry.feature, error)
  }
}

export type AiCallUsage = {
  inputTokens: number
  outputTokens: number
  /** For a model charged by what it makes rather than by the token. */
  units?: number
}

/**
 * Runs one AI call with the meter on. The callback does the provider work
 * and returns its result plus the token counts from the provider's response;
 * a throw records a `failed` row (with zero tokens — the provider billed
 * nothing it reported) and rethrows unchanged.
 */
export async function runAiCall<T>(
  context: Omit<AiUsageEntry, "inputTokens" | "outputTokens" | "status">,
  call: () => Promise<{ result: T; usage: AiCallUsage }>
): Promise<T> {
  // The allowance gate. Living inside the wrapper means no call site can
  // forget it. A call nobody owns (null userId) has no allowance to check.
  if (context.userId) {
    try {
      await checkAiAllowance(context.userId)
    } catch (error) {
      if (isAiLimitError(error)) {
        // The wall was hit: the dashboard should show that, so the refusal
        // is a row too — zero tokens, zero cost, status "blocked".
        await recordAiUsage({
          ...context,
          inputTokens: 0,
          outputTokens: 0,
          status: "blocked",
        })
        throw error
      }
      // The gate itself broke (not the same as the limit being reached).
      // The user's call comes first, same as the meter: log loudly, let it
      // through. If the database is down enough to break this read, nothing
      // else in the app is standing either.
      console.error("AI allowance check could not run", error)
    }
  }

  try {
    const { result, usage } = await call()
    await recordAiUsage({
      ...context,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      units: usage.units,
      status: "success",
    })
    // Now that this call's cost is on the books, see whether it pushed the
    // month over 80% or 100% and say so — once. Never breaks the call.
    if (context.userId) {
      await sendAiAllowanceWarnings(context.userId)
    }
    return result
  } catch (error) {
    await recordAiUsage({
      ...context,
      inputTokens: 0,
      outputTokens: 0,
      status: "failed",
      metadata: {
        ...context.metadata,
        error: error instanceof Error ? error.message : String(error),
      },
    })
    throw error
  }
}

// ---------------------------------------------------------------------------
// The monthly allowance. A plan can carry one (the "aiDollars" key on its
// features, in dollars a month), one person can be given their own instead,
// and no setting anywhere means no ceiling — never a ceiling of zero. The
// gate runs inside `runAiCall`, so no call site can skip it.

export function isAiLimitError(error: unknown): boolean {
  return error instanceof Error && error.message.includes("AI_LIMIT_REACHED")
}

/**
 * Each person's monthly AI allowance in whole cents, or null for no ceiling:
 * their own override when they have one, otherwise whatever their plan's
 * features say. Batched, because the admin dashboard asks about a whole
 * table of people at once and the plan rule must be the same one
 * entitlements uses everywhere else.
 */
export async function aiAllowanceCentsForUsers(
  userIds: string[]
): Promise<Map<string, number | null>> {
  const allowances = new Map<string, number | null>()
  if (!userIds.length) return allowances

  const [overrides, subscriptions, defaultPlan] = await Promise.all([
    db
      .select()
      .from(customShellAiAllowanceOverrides)
      .where(inArray(customShellAiAllowanceOverrides.userId, userIds)),
    db
      .select()
      .from(customShellSubscriptions)
      .where(inArray(customShellSubscriptions.userId, userIds)),
    getDefaultPlan(),
  ])

  const planIds = Array.from(
    new Set(
      subscriptions.flatMap((subscription) =>
        subscription.planId ? [subscription.planId] : []
      )
    )
  )
  const plans = planIds.length
    ? await db
        .select()
        .from(customShellPlans)
        .where(inArray(customShellPlans.id, planIds))
    : []

  const overrideByUser = new Map(
    overrides.map((row) => [row.userId, row.monthlyCents])
  )
  const subscriptionByUser = new Map(
    subscriptions.map((row) => [row.userId, row])
  )
  const planById = new Map(plans.map((row) => [row.id, row]))

  for (const userId of userIds) {
    const override = overrideByUser.get(userId)
    if (override !== undefined) {
      allowances.set(userId, override)
      continue
    }

    const subscription = subscriptionByUser.get(userId) ?? null
    const paidPlan = subscription?.planId
      ? (planById.get(subscription.planId) ?? null)
      : null
    // The same active-subscription rule as everywhere else, so the limit and
    // the billing pages can never disagree about which plan somebody is on.
    const entitlements = resolveEntitlements(subscription, paidPlan, defaultPlan)
    allowances.set(userId, aiAllowanceCentsFromFeatures(entitlements.features))
  }

  return allowances
}

export async function getAiAllowanceCents(
  userId: string
): Promise<number | null> {
  const allowances = await aiAllowanceCentsForUsers([userId])
  return allowances.get(userId) ?? null
}

/** What this person's AI calls have cost so far in one month, in cents. */
export async function aiMonthSpendCents(
  userId: string,
  monthStart: string
): Promise<number> {
  const events = customShellAiUsageEvents
  const [row] = await db
    .select({ costCents: sql<string>`coalesce(sum(${events.costCents}), 0)` })
    .from(events)
    .where(and(eq(events.userId, userId), eq(events.monthStart, monthStart)))

  return Number(row?.costCents ?? 0)
}

/**
 * The gate: throws `AI_LIMIT_REACHED` when this month's spend has reached the
 * ceiling, so the call never reaches the provider. No ceiling means no gate.
 *
 * Two calls arriving at the same instant can both pass the read and both
 * run — the ceiling can be overshot by at most one call's cost. Accepted on
 * purpose: the alternative is a lock around every AI call, and the warning
 * below still fires exactly once either way.
 */
export async function checkAiAllowance(userId: string): Promise<void> {
  const allowanceCents = await getAiAllowanceCents(userId)
  if (allowanceCents === null) return

  const monthStart = aiUsageMonthStart(now())
  const spentCents = await aiMonthSpendCents(userId, monthStart)
  if (spentCents >= allowanceCents) {
    // Hitting the wall is the moment to say so — even when the wall was hit
    // because an admin lowered the ceiling mid-month.
    await noteAiAlertOnce(userId, monthStart, "reached")
    throw new Error("AI_LIMIT_REACHED")
  }
}

/**
 * After a successful call lands on the books: did it push the month past 80%
 * or 100%? Each level fires once per person per month — the unique index on
 * the alerts table decides who among a burst of parallel calls sends it.
 * Never throws; a warning that could not be sent must not fail the call.
 */
async function sendAiAllowanceWarnings(userId: string): Promise<void> {
  try {
    const allowanceCents = await getAiAllowanceCents(userId)
    // Zero is left to the gate: with a ceiling of nothing, no call ever
    // succeeds, so there is no spend to warn about.
    if (allowanceCents === null || allowanceCents === 0) return

    const monthStart = aiUsageMonthStart(now())
    const spentCents = await aiMonthSpendCents(userId, monthStart)

    if (spentCents >= allowanceCents) {
      await noteAiAlertOnce(userId, monthStart, "reached")
    } else if (spentCents * 5 >= allowanceCents * 4) {
      // 80%, kept in whole cents: spent/allowance >= 4/5 without dividing.
      await noteAiAlertOnce(userId, monthStart, "warning")
    }
  } catch (error) {
    console.error("AI allowance warning was not sent", error)
  }
}

/**
 * Sends one warning notification, at most once per person per month per
 * level. The alerts row is claimed first with an insert the unique index can
 * refuse; only the caller whose insert went in sends the notification, so a
 * burst of calls crossing 80% together produces exactly one notice.
 */
async function noteAiAlertOnce(
  userId: string,
  monthStart: string,
  level: "warning" | "reached"
): Promise<void> {
  try {
    const claimed = await db
      .insert(customShellAiUsageAlerts)
      .values({ id: uuid(), userId, monthStart, level, createdAt: now() })
      .onConflictDoNothing()
      .returning({ id: customShellAiUsageAlerts.id })

    if (!claimed.length) return

    await db.insert(customShellNotifications).values({
      id: uuid(),
      recipientUserId: userId,
      type: level === "warning" ? "ai_limit_warning" : "ai_limit_reached",
      createdAt: now(),
    })
    await publishNotificationCreated(userId)
  } catch (error) {
    console.error("AI allowance notice was not recorded", level, error)
  }
}

// ---------------------------------------------------------------------------
// The dashboard's reading of the meter. Aggregation happens in SQL, leaning on
// the (user, month) and (month, created_at) indexes, so a heavy month never
// gets pulled into memory row by row.

// The ranges themselves live in `lib/ai/ai-models.ts` so the browser can import
// them without dragging this module — and the database driver — along.

/** Where each range starts, counted back from `at`. */
export function aiUsageRangeStart(range: AiUsageRange, at: Date): Date {
  if (range === "month") return new Date(`${aiUsageMonthStart(at)}T00:00:00Z`)
  const days = range === "30d" ? 30 : 90
  return new Date(at.getTime() - days * 24 * 60 * 60 * 1000)
}

export type AiUsageTotals = {
  costCents: number
  calls: number
  tokens: number
  failed: number
}

export type AiUsageDay = { day: string; costCents: number }

export type AiUsagePersonRow = {
  /** Null when the account was deleted — the spend survives, anonymous. */
  userId: string | null
  name: string
  email: string
  calls: number
  tokens: number
  costCents: number
  lastUsedAt: Date
  /**
   * Their monthly ceiling in cents, null for no ceiling — and always about
   * THIS month, whatever range the table is showing, because that is the
   * month the ceiling applies to.
   */
  allowanceCents: number | null
  /** What this month has cost so far, the number the ceiling is judged against. */
  monthSpentCents: number
}

export type AiUsageFeatureRow = {
  feature: string
  calls: number
  tokens: number
  costCents: number
}

export type AiUsageModelRow = {
  provider: string
  model: string
  calls: number
  tokens: number
  costCents: number
}

export type AiUsageDashboard = {
  range: AiUsageRange
  totals: AiUsageTotals
  daily: AiUsageDay[]
  byPerson: AiUsagePersonRow[]
  byFeature: AiUsageFeatureRow[]
  byModel: AiUsageModelRow[]
}

export async function loadAiUsageDashboard(
  range: AiUsageRange
): Promise<AiUsageDashboard> {
  const events = customShellAiUsageEvents
  const at = now()
  const start = aiUsageRangeStart(range, at)
  const inRange = gte(events.createdAt, start)

  const [totalsRow] = await db
    .select({
      costCents: sql<string>`coalesce(sum(${events.costCents}), 0)`,
      calls: sql<string>`count(*)`,
      tokens: sql<string>`coalesce(sum(${events.inputTokens} + ${events.outputTokens}), 0)`,
      failed: sql<string>`count(*) filter (where ${events.status} = 'failed')`,
    })
    .from(events)
    .where(inRange)

  const dailyRows = await db
    .select({
      day: sql<string>`to_char(${events.createdAt} at time zone 'UTC', 'YYYY-MM-DD')`,
      costCents: sql<string>`coalesce(sum(${events.costCents}), 0)`,
    })
    .from(events)
    .where(inRange)
    .groupBy(sql`1`)

  const personRows = await db
    .select({
      userId: events.userId,
      name: customShellUsers.name,
      email: customShellUsers.email,
      calls: sql<string>`count(*)`,
      tokens: sql<string>`coalesce(sum(${events.inputTokens} + ${events.outputTokens}), 0)`,
      costCents: sql<string>`coalesce(sum(${events.costCents}), 0)`,
      lastUsedAt: sql<string>`max(${events.createdAt})`,
    })
    .from(events)
    .leftJoin(customShellUsers, eq(events.userId, customShellUsers.id))
    .where(inRange)
    .groupBy(events.userId, customShellUsers.name, customShellUsers.email)

  const featureRows = await db
    .select({
      feature: events.feature,
      calls: sql<string>`count(*)`,
      tokens: sql<string>`coalesce(sum(${events.inputTokens} + ${events.outputTokens}), 0)`,
      costCents: sql<string>`coalesce(sum(${events.costCents}), 0)`,
    })
    .from(events)
    .where(inRange)
    .groupBy(events.feature)

  const modelRows = await db
    .select({
      provider: events.provider,
      model: events.model,
      calls: sql<string>`count(*)`,
      tokens: sql<string>`coalesce(sum(${events.inputTokens} + ${events.outputTokens}), 0)`,
      costCents: sql<string>`coalesce(sum(${events.costCents}), 0)`,
    })
    .from(events)
    .where(inRange)
    .groupBy(events.provider, events.model)

  // The allowance column: each shown person's ceiling, and what this month —
  // not the shown range — has cost them, because the ceiling is monthly.
  const personIds = personRows.flatMap((row) => (row.userId ? [row.userId] : []))
  const monthStart = aiUsageMonthStart(at)
  const [allowances, monthRows] = await Promise.all([
    aiAllowanceCentsForUsers(personIds),
    personIds.length
      ? db
          .select({
            userId: events.userId,
            costCents: sql<string>`coalesce(sum(${events.costCents}), 0)`,
          })
          .from(events)
          .where(
            and(
              inArray(events.userId, personIds),
              eq(events.monthStart, monthStart)
            )
          )
          .groupBy(events.userId)
      : Promise.resolve([]),
  ])
  const monthSpendByUser = new Map(
    monthRows.map((row) => [row.userId, Number(row.costCents)])
  )

  // Every day in the range appears in the chart, spend or none — a gap in a
  // spend chart reads as missing data, not as a quiet day.
  const spendByDay = new Map(
    dailyRows.map((row) => [row.day, Number(row.costCents)])
  )
  const daily: AiUsageDay[] = []
  for (
    let day = new Date(`${isoDay(start)}T00:00:00Z`);
    isoDay(day) <= isoDay(at);
    day = new Date(day.getTime() + 24 * 60 * 60 * 1000)
  ) {
    daily.push({ day: isoDay(day), costCents: spendByDay.get(isoDay(day)) ?? 0 })
  }

  return {
    range,
    totals: {
      costCents: Number(totalsRow?.costCents ?? 0),
      calls: Number(totalsRow?.calls ?? 0),
      tokens: Number(totalsRow?.tokens ?? 0),
      failed: Number(totalsRow?.failed ?? 0),
    },
    daily,
    byPerson: personRows.map((row) => ({
      userId: row.userId,
      // A deleted account's spend stays on the books; say so plainly.
      name: row.name ?? "Deleted account",
      email: row.email ?? "",
      calls: Number(row.calls),
      tokens: Number(row.tokens),
      costCents: Number(row.costCents),
      lastUsedAt: new Date(row.lastUsedAt),
      // A deleted account has nobody left to limit.
      allowanceCents: row.userId
        ? (allowances.get(row.userId) ?? null)
        : null,
      monthSpentCents: row.userId
        ? (monthSpendByUser.get(row.userId) ?? 0)
        : 0,
    })),
    byFeature: featureRows.map((row) => ({
      feature: row.feature,
      calls: Number(row.calls),
      tokens: Number(row.tokens),
      costCents: Number(row.costCents),
    })),
    byModel: modelRows.map((row) => ({
      provider: row.provider,
      model: row.model,
      calls: Number(row.calls),
      tokens: Number(row.tokens),
      costCents: Number(row.costCents),
    })),
  }
}

/** The UTC calendar day a moment falls on, as YYYY-MM-DD. */
function isoDay(at: Date): string {
  return at.toISOString().slice(0, 10)
}

// ---------------------------------------------------------------------------
// The per-person override, and the member's own reading of the meter.

/**
 * Gives one person their own monthly ceiling, or takes it away (null) so
 * they follow their plan again. Cents, never negative.
 */
export async function setAiAllowanceOverride(
  userId: string,
  monthlyCents: number | null
): Promise<void> {
  if (monthlyCents === null) {
    await db
      .delete(customShellAiAllowanceOverrides)
      .where(eq(customShellAiAllowanceOverrides.userId, userId))
    return
  }

  const at = now()
  await db
    .insert(customShellAiAllowanceOverrides)
    .values({ userId, monthlyCents, createdAt: at, updatedAt: at })
    .onConflictDoUpdate({
      target: customShellAiAllowanceOverrides.userId,
      set: { monthlyCents, updatedAt: at },
    })
}

export type MyAiRecentCall = {
  id: string
  feature: string
  model: string
  status: AiUsageStatus
  costCents: number
  createdAt: Date
}

export type MyAiUsage = {
  /** The first day of the month the numbers cover. */
  monthStart: string
  /** Their ceiling in cents, null for no ceiling. */
  allowanceCents: number | null
  spentCents: number
  calls: number
  tokens: number
  recent: MyAiRecentCall[]
}

/**
 * One person's own usage — what the member account panel shows. Everything
 * here is filtered by the id the caller's SESSION resolved to; nothing about
 * anyone else can come out of it.
 */
export async function loadMyAiUsage(userId: string): Promise<MyAiUsage> {
  const events = customShellAiUsageEvents
  const monthStart = aiUsageMonthStart(now())

  const [[totalsRow], recentRows, allowanceCents] = await Promise.all([
    db
      .select({
        costCents: sql<string>`coalesce(sum(${events.costCents}), 0)`,
        calls: sql<string>`count(*)`,
        tokens: sql<string>`coalesce(sum(${events.inputTokens} + ${events.outputTokens}), 0)`,
      })
      .from(events)
      .where(
        and(eq(events.userId, userId), eq(events.monthStart, monthStart))
      ),
    db
      .select({
        id: events.id,
        feature: events.feature,
        model: events.model,
        status: events.status,
        costCents: events.costCents,
        createdAt: events.createdAt,
      })
      .from(events)
      .where(eq(events.userId, userId))
      .orderBy(desc(events.createdAt), desc(events.id))
      .limit(8),
    getAiAllowanceCents(userId),
  ])

  return {
    monthStart,
    allowanceCents,
    spentCents: Number(totalsRow?.costCents ?? 0),
    calls: Number(totalsRow?.calls ?? 0),
    tokens: Number(totalsRow?.tokens ?? 0),
    recent: recentRows.map((row) => ({
      id: row.id,
      feature: row.feature,
      model: row.model,
      status: row.status as AiUsageStatus,
      costCents: row.costCents,
      createdAt: row.createdAt,
    })),
  }
}
