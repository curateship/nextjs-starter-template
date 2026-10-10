import { and, count, desc, eq, gte, inArray, lt, sql } from "drizzle-orm"

import { subscriptionIsActive } from "@/server/billing/entitlements"
import { isUsageMeter } from "@/lib/billing/usage-meter"
import { requireBilling, stripe } from "@/server/billing/stripe"
import { now, uuid } from "@/server/auth/security"
import { db, type CustomShellDb } from "@/server/db"
import {
  customShellPlans,
  customShellSubscriptions,
  customShellUsageEvents,
  customShellUsers,
  type CustomShellUsageEvent,
} from "@/server/schema"

const STRIPE_USAGE_MAX_AGE_MS = 35 * 24 * 60 * 60 * 1_000
const RECENT_MEMBER_EVENTS = 20
const RECONCILE_BATCH_SIZE = 500

export type UsageReporterInput = {
  id: string
  customerId: string
  meter: string
  quantity: number
  occurredAt: Date
}

export type UsageReporter = (input: UsageReporterInput) => Promise<void>

const stripeUsageReporter: UsageReporter = async (event) => {
  requireBilling()
  await (await stripe()).billing.meterEvents.create(
    stripeMeterEventForUsage(event)
  )
}

/** The exact Stripe request for one stored row, kept pure for verification. */
export function stripeMeterEventForUsage(event: UsageReporterInput) {
  return {
    event_name: event.meter,
    identifier: event.id,
    payload: {
      stripe_customer_id: event.customerId,
      value: String(event.quantity),
    },
    timestamp: Math.floor(event.occurredAt.getTime() / 1_000),
  }
}

type RecordUsageOptions = {
  database?: CustomShellDb
  reporter?: UsageReporter
  occurredAt?: Date
}

/**
 * Records one product-defined unit of billable usage.
 *
 * The database write comes first. A Stripe outage leaves a pending row rather
 * than losing the event or failing the product action that already happened.
 * Invoice webhooks retry pending rows through `reconcilePendingUsageForCustomer`.
 */
export async function recordUsage(
  userId: string,
  meter: string,
  quantity: number,
  options: RecordUsageOptions = {}
) {
  validateUsageInput(userId, meter, quantity)

  const database = options.database ?? db
  const reporter = options.reporter ?? stripeUsageReporter
  const occurredAt = options.occurredAt ?? now()

  const [billing] = await database
    .select({
      subscription: customShellSubscriptions,
      plan: customShellPlans,
    })
    .from(customShellSubscriptions)
    .leftJoin(
      customShellPlans,
      eq(customShellPlans.id, customShellSubscriptions.planId)
    )
    .where(eq(customShellSubscriptions.userId, userId))
    .limit(1)

  const stripeCustomerId =
    billing?.subscription.source === "stripe" &&
    !billing.subscription.pausedAt &&
    subscriptionIsActive(billing.subscription, occurredAt) &&
    billing.plan?.usageMeter === meter
      ? billing.subscription.stripeCustomerId
      : null

  const id = uuid()
  const stripeReportStatus = stripeCustomerId ? "pending" : "not_applicable"
  const [event] = await database
    .insert(customShellUsageEvents)
    .values({
      id,
      userId,
      meter,
      quantity,
      occurredAt,
      stripeCustomerId,
      stripeReportStatus,
      createdAt: now(),
    })
    .returning()

  if (!event) {
    throw new Error("USAGE_NOT_RECORDED")
  }

  if (!stripeCustomerId) {
    return { id, stripeReportStatus: "not_applicable" as const }
  }

  const reported = await reportStoredUsage(event, database, reporter)
  return {
    id,
    stripeReportStatus: reported ? ("reported" as const) : ("pending" as const),
  }
}

/**
 * Retries the pending usage for one Stripe customer after an invoice event.
 * Calls run one at a time because Stripe refuses concurrent events for the
 * same customer and meter.
 */
export async function reconcilePendingUsageForCustomer(
  customerId: string,
  database: CustomShellDb = db,
  reporter: UsageReporter = stripeUsageReporter
) {
  if (!customerId.trim()) return { reported: 0, failed: 0 }

  const pendingRows = await database
    .select()
    .from(customShellUsageEvents)
    .where(
      and(
        eq(customShellUsageEvents.stripeCustomerId, customerId),
        eq(customShellUsageEvents.stripeReportStatus, "pending")
      )
    )
    .orderBy(customShellUsageEvents.occurredAt, customShellUsageEvents.id)
    .limit(RECONCILE_BATCH_SIZE + 1)
  const pending = pendingRows.slice(0, RECONCILE_BATCH_SIZE)
  const hasMore = pendingRows.length > RECONCILE_BATCH_SIZE

  let reported = 0
  let failed = 0
  let retryFailures = 0
  for (const event of pending) {
    if (eventTooOldForStripe(event.occurredAt)) {
      await database
        .update(customShellUsageEvents)
        .set({
          stripeReportStatus: "failed",
          stripeReportError: "EVENT_TOO_OLD",
        })
        .where(eq(customShellUsageEvents.id, event.id))
      failed += 1
      continue
    }

    if (await reportStoredUsage(event, database, reporter)) {
      reported += 1
    } else {
      failed += 1
      retryFailures += 1
    }
  }

  if (retryFailures > 0 || hasMore) {
    throw new Error("USAGE_RECONCILIATION_INCOMPLETE")
  }

  return { reported, failed }
}

export type UsageMeterTotal = {
  meter: string
  quantity: number
  events: number
  pending: number
  failed: number
}

export type MemberUsageSummary = {
  monthStart: string
  totalQuantity: number
  totalEvents: number
  byMeter: Array<Pick<UsageMeterTotal, "meter" | "quantity" | "events">>
  recent: {
    id: string
    meter: string
    quantity: number
    occurredAt: string
  }[]
}

export async function loadMemberUsage(
  userId: string,
  timestamp = now(),
  database: CustomShellDb = db
): Promise<MemberUsageSummary> {
  const monthStart = usageMonthStart(timestamp)
  const monthEnd = usageMonthEnd(timestamp)
  const [meterRows, recentRows] = await Promise.all([
    database
      .select({
        meter: customShellUsageEvents.meter,
        quantity: sql<string>`coalesce(sum(${customShellUsageEvents.quantity}), 0)`,
        events: count(),
      })
      .from(customShellUsageEvents)
      .where(
        and(
          eq(customShellUsageEvents.userId, userId),
          gte(customShellUsageEvents.occurredAt, monthStart),
          lt(customShellUsageEvents.occurredAt, monthEnd)
        )
      )
      .groupBy(customShellUsageEvents.meter)
      .orderBy(desc(sql`sum(${customShellUsageEvents.quantity})`)),
    database
      .select({
        id: customShellUsageEvents.id,
        meter: customShellUsageEvents.meter,
        quantity: customShellUsageEvents.quantity,
        occurredAt: customShellUsageEvents.occurredAt,
      })
      .from(customShellUsageEvents)
      .where(eq(customShellUsageEvents.userId, userId))
      .orderBy(desc(customShellUsageEvents.occurredAt))
      .limit(RECENT_MEMBER_EVENTS),
  ])

  const byMeter = meterRows.map((row) => ({
    meter: row.meter,
    quantity: Number(row.quantity),
    events: Number(row.events),
  }))

  return {
    monthStart: monthStart.toISOString(),
    totalQuantity: byMeter.reduce((total, row) => total + row.quantity, 0),
    totalEvents: byMeter.reduce((total, row) => total + row.events, 0),
    byMeter,
    recent: recentRows.map((row) => ({
      ...row,
      occurredAt: row.occurredAt.toISOString(),
    })),
  }
}

export type AdminUsageSummary = {
  monthStart: string
  totalQuantity: number
  totalEvents: number
  activeMeters: number
  pendingStripeReports: number
  failedStripeReports: number
  byMeter: UsageMeterTotal[]
  byPerson: {
    userId: string | null
    name: string
    email: string | null
    quantity: number
    events: number
    lastUsedAt: string
  }[]
}

export async function loadAdminUsage(
  timestamp = now(),
  database: CustomShellDb = db
): Promise<AdminUsageSummary> {
  const monthStart = usageMonthStart(timestamp)
  const monthEnd = usageMonthEnd(timestamp)
  const [meterRows, personRows, reportRows] = await Promise.all([
    database
      .select({
        meter: customShellUsageEvents.meter,
        quantity: sql<string>`coalesce(sum(${customShellUsageEvents.quantity}), 0)`,
        events: count(),
      })
      .from(customShellUsageEvents)
      .where(
        and(
          gte(customShellUsageEvents.occurredAt, monthStart),
          lt(customShellUsageEvents.occurredAt, monthEnd)
        )
      )
      .groupBy(customShellUsageEvents.meter)
      .orderBy(desc(sql`sum(${customShellUsageEvents.quantity})`)),
    database
      .select({
        userId: customShellUsageEvents.userId,
        name: customShellUsers.name,
        email: customShellUsers.email,
        quantity: sql<string>`coalesce(sum(${customShellUsageEvents.quantity}), 0)`,
        events: count(),
        lastUsedAt: sql<Date>`max(${customShellUsageEvents.occurredAt})`,
      })
      .from(customShellUsageEvents)
      .leftJoin(
        customShellUsers,
        eq(customShellUsers.id, customShellUsageEvents.userId)
      )
      .where(
        and(
          gte(customShellUsageEvents.occurredAt, monthStart),
          lt(customShellUsageEvents.occurredAt, monthEnd)
        )
      )
      .groupBy(
        customShellUsageEvents.userId,
        customShellUsers.name,
        customShellUsers.email
      )
      .orderBy(desc(sql`sum(${customShellUsageEvents.quantity})`)),
    database
      .select({
        meter: customShellUsageEvents.meter,
        pending: sql<number>`count(*) filter (where ${customShellUsageEvents.stripeReportStatus} = 'pending')`,
        failed: sql<number>`count(*) filter (where ${customShellUsageEvents.stripeReportStatus} = 'failed')`,
      })
      .from(customShellUsageEvents)
      .where(
        inArray(customShellUsageEvents.stripeReportStatus, [
          "pending",
          "failed",
        ])
      )
      .groupBy(customShellUsageEvents.meter),
  ])

  const reportsByMeter = new Map(
    reportRows.map((row) => [
      row.meter,
      { pending: Number(row.pending), failed: Number(row.failed) },
    ])
  )
  const byMeter = meterRows.map((row) => {
    const reports = reportsByMeter.get(row.meter) ?? { pending: 0, failed: 0 }
    reportsByMeter.delete(row.meter)
    return {
      meter: row.meter,
      quantity: Number(row.quantity),
      events: Number(row.events),
      ...reports,
    }
  })
  for (const [meter, reports] of reportsByMeter) {
    byMeter.push({ meter, quantity: 0, events: 0, ...reports })
  }

  return {
    monthStart: monthStart.toISOString(),
    totalQuantity: byMeter.reduce((total, row) => total + row.quantity, 0),
    totalEvents: byMeter.reduce((total, row) => total + row.events, 0),
    activeMeters: meterRows.length,
    pendingStripeReports: reportRows.reduce(
      (total, row) => total + Number(row.pending),
      0
    ),
    failedStripeReports: reportRows.reduce(
      (total, row) => total + Number(row.failed),
      0
    ),
    byMeter,
    byPerson: personRows.map((row) => ({
      userId: row.userId,
      name: row.name ?? "Deleted account",
      email: row.email,
      quantity: Number(row.quantity),
      events: Number(row.events),
      lastUsedAt: new Date(row.lastUsedAt).toISOString(),
    })),
  }
}

export function usageMonthStart(timestamp: Date) {
  return new Date(
    Date.UTC(timestamp.getUTCFullYear(), timestamp.getUTCMonth(), 1)
  )
}

function usageMonthEnd(timestamp: Date) {
  return new Date(
    Date.UTC(timestamp.getUTCFullYear(), timestamp.getUTCMonth() + 1, 1)
  )
}

function validateUsageInput(userId: string, meter: string, quantity: number) {
  if (!userId || userId.length > 36) throw new Error("USAGE_USER_INVALID")
  if (!isUsageMeter(meter)) throw new Error("USAGE_METER_INVALID")
  if (!Number.isSafeInteger(quantity) || quantity <= 0) {
    throw new Error("USAGE_QUANTITY_INVALID")
  }
}

function eventTooOldForStripe(occurredAt: Date) {
  return now().getTime() - occurredAt.getTime() > STRIPE_USAGE_MAX_AGE_MS
}

async function reportStoredUsage(
  event: CustomShellUsageEvent,
  database: CustomShellDb,
  reporter: UsageReporter
) {
  if (!event.stripeCustomerId) return false

  try {
    await reporter({
      id: event.id,
      customerId: event.stripeCustomerId,
      meter: event.meter,
      quantity: event.quantity,
      occurredAt: event.occurredAt,
    })
    await database
      .update(customShellUsageEvents)
      .set({
        stripeReportStatus: "reported",
        stripeReportError: null,
        stripeReportedAt: now(),
      })
      .where(eq(customShellUsageEvents.id, event.id))
    return true
  } catch (error) {
    const code = stripeErrorCode(error)
    if (code === "duplicate_meter_event") {
      await database
        .update(customShellUsageEvents)
        .set({
          stripeReportStatus: "reported",
          stripeReportError: null,
          stripeReportedAt: now(),
        })
        .where(eq(customShellUsageEvents.id, event.id))
      return true
    }

    await database
      .update(customShellUsageEvents)
      .set({ stripeReportError: code })
      .where(eq(customShellUsageEvents.id, event.id))
    console.error("Usage event remains pending for Stripe", event.id, code)
    return false
  }
}

function stripeErrorCode(error: unknown) {
  if (error && typeof error === "object" && "code" in error) {
    const code = String(error.code).slice(0, 120)
    return code || "STRIPE_REPORT_FAILED"
  }
  return "STRIPE_REPORT_FAILED"
}
