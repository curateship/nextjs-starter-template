import { gte, eq, sql } from "drizzle-orm"

import {
  aiCostCents,
  type AiProvider,
  type AiUsageRange,
} from "@/lib/ai-models"
import { db } from "@/server/db"
import { customShellAiUsageEvents, customShellUsers } from "@/server/schema"
import { now, uuid } from "@/server/security"

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
  status: AiUsageStatus
  metadata?: Record<string, unknown>
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
      costCents: aiCostCents(entry.model, entry.inputTokens, entry.outputTokens),
      status: entry.status,
      monthStart: aiUsageMonthStart(at),
      metadata: entry.metadata ?? {},
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
  try {
    const { result, usage } = await call()
    await recordAiUsage({
      ...context,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      status: "success",
    })
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
// The dashboard's reading of the meter. Aggregation happens in SQL, leaning on
// the (user, month) and (month, created_at) indexes, so a heavy month never
// gets pulled into memory row by row.

// The ranges themselves live in `lib/ai-models.ts` so the browser can import
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
