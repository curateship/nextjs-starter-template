import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  aiUsageMonthStart,
  checkAiAllowance,
  loadAiUsageDashboard,
  loadMyAiUsage,
  recordDeferredAiSuccess,
  recordAiUsage,
  runAiCall,
  setAiAllowanceOverride,
} from "@/server/ai/usage"
import {
  customShellAiUsageAlerts,
  customShellAiUsageEvents,
  customShellNotifications,
  customShellPlans,
  customShellUsers,
} from "@/server/schema"
import { createTestDatabase, type TestDatabase } from "@/server/test-support"

let client: PGlite
let database: TestDatabase

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db

  await database.insert(customShellUsers).values({
    id: "user-1",
    email: "meter@internal.dev",
    name: "Meter",
    role: "admin",
    createdAt: new Date(),
    updatedAt: new Date(),
  })
})

afterEach(async () => {
  await client.close()
  vi.restoreAllMocks()
})

async function allRows() {
  return database.select().from(customShellAiUsageEvents)
}

describe("aiUsageMonthStart", () => {
  it("is the first day of the call's UTC month", () => {
    expect(aiUsageMonthStart(new Date("2026-08-02T15:04:05Z"))).toBe(
      "2026-08-01"
    )
    // The last moment of a UTC month still belongs to that month.
    expect(aiUsageMonthStart(new Date("2026-01-31T23:59:59Z"))).toBe(
      "2026-01-01"
    )
  })
})

describe("runAiCall", () => {
  it("writes exactly one success row with the tokens and the priced cost", async () => {
    const answer = await runAiCall(
      {
        userId: "user-1",
        provider: "anthropic",
        model: "claude-opus-5",
        feature: "key-test",
      },
      async () => ({
        result: "hello",
        usage: { inputTokens: 200_000, outputTokens: 10_000 },
      })
    )
    expect(answer).toBe("hello")

    const rows = await allRows()
    expect(rows).toHaveLength(1)
    const row = rows[0]
    expect(row.userId).toBe("user-1")
    expect(row.provider).toBe("anthropic")
    expect(row.model).toBe("claude-opus-5")
    expect(row.feature).toBe("key-test")
    expect(row.status).toBe("success")
    expect(row.inputTokens).toBe(200_000)
    expect(row.outputTokens).toBe(10_000)
    // By hand: 200k in at $5/M = $1.00, 10k out at $25/M = $0.25 → 125 cents.
    expect(row.costCents).toBe(125)
    expect(row.monthStart).toBe(aiUsageMonthStart(new Date()))
  })

  it("prices work charged by what it makes, and keeps the count beside it", async () => {
    await runAiCall(
      {
        userId: "user-1",
        provider: "elevenlabs",
        model: "eleven_multilingual_v2",
        feature: "voiceover",
      },
      async () => ({
        result: "spoken",
        // No tokens to count: 10,000 characters were read aloud.
        usage: { inputTokens: 0, outputTokens: 0, units: 10_000 },
      })
    )

    const [row] = await allRows()
    // By hand: 10,000 characters at $0.15 per 1,000 → $1.50 → 150 cents.
    expect(row.costCents).toBe(150)
    expect(row.inputTokens).toBe(0)
    expect(row.metadata.units).toBe(10_000)
  })

  it("records a completed background job only when its result is ready", async () => {
    await recordDeferredAiSuccess(
      {
        userId: "user-1",
        provider: "gemini",
        model: "veo-3.1-generate-preview",
        feature: "video-generation",
      },
      { inputTokens: 0, outputTokens: 0, units: 4 }
    )

    const [row] = await allRows()
    expect(row.status).toBe("success")
    expect(row.costCents).toBe(160)
    expect(row.metadata.units).toBe(4)
  })

  it("writes exactly one failed row when the call throws, then rethrows", async () => {
    await expect(
      runAiCall(
        {
          userId: "user-1",
          provider: "openai",
          model: "gpt-5-mini",
          feature: "key-test",
        },
        async () => {
          throw new Error("the provider hung up")
        }
      )
    ).rejects.toThrow("the provider hung up")

    const rows = await allRows()
    expect(rows).toHaveLength(1)
    expect(rows[0].status).toBe("failed")
    expect(rows[0].inputTokens).toBe(0)
    expect(rows[0].outputTokens).toBe(0)
    expect(rows[0].costCents).toBe(0)
    expect(rows[0].metadata.error).toBe("the provider hung up")
  })

  it("keeps the tokens of a model missing from the price list, at zero cost", async () => {
    await recordAiUsage({
      userId: "user-1",
      provider: "anthropic",
      model: "some-future-model",
      feature: "key-test",
      inputTokens: 12_345,
      outputTokens: 678,
      status: "success",
    })
    const rows = await allRows()
    expect(rows).toHaveLength(1)
    expect(rows[0].inputTokens).toBe(12_345)
    expect(rows[0].costCents).toBe(0)
  })

  it("still returns the AI result when the meter itself cannot write", async () => {
    // A dead meter must never break the call it measures.
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined)
    await client.exec('DROP TABLE "ai_usage_events"')

    const answer = await runAiCall(
      {
        userId: "user-1",
        provider: "anthropic",
        model: "claude-opus-5",
        feature: "key-test",
      },
      async () => ({ result: 42, usage: { inputTokens: 1, outputTokens: 1 } })
    )
    expect(answer).toBe(42)
    // ...but it fails loudly in the log, so it cannot stay quietly dead.
    expect(consoleError).toHaveBeenCalled()
  })
})

describe("loadAiUsageDashboard", () => {
  /** One meter row, written directly so the date can sit anywhere in time. */
  async function seedEvent(entry: {
    userId: string | null
    provider: string
    model: string
    feature: string
    inputTokens: number
    outputTokens: number
    costCents: number
    status?: string
    daysAgo?: number
  }) {
    const createdAt = new Date(
      Date.now() - (entry.daysAgo ?? 0) * 24 * 60 * 60 * 1000
    )
    await database.insert(customShellAiUsageEvents).values({
      id: crypto.randomUUID(),
      userId: entry.userId,
      provider: entry.provider,
      model: entry.model,
      feature: entry.feature,
      inputTokens: entry.inputTokens,
      outputTokens: entry.outputTokens,
      costCents: entry.costCents,
      status: entry.status ?? "success",
      monthStart: aiUsageMonthStart(createdAt),
      metadata: {},
      createdAt,
    })
  }

  async function seedSpread() {
    await database.insert(customShellUsers).values({
      id: "user-2",
      email: "second@internal.dev",
      name: "Second",
      role: "member",
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    // Three calls inside the last 30 days, one 45 days back.
    await seedEvent({
      userId: "user-1", provider: "anthropic", model: "claude-opus-5",
      feature: "key-test", inputTokens: 100_000, outputTokens: 0, costCents: 50,
    })
    await seedEvent({
      userId: "user-1", provider: "openai", model: "gpt-5",
      feature: "automation", inputTokens: 0, outputTokens: 100_000, costCents: 100,
    })
    await seedEvent({
      userId: "user-2", provider: "anthropic", model: "claude-opus-5",
      feature: "automation", inputTokens: 10_000, outputTokens: 0, costCents: 5,
      status: "failed",
    })
    await seedEvent({
      userId: "user-1", provider: "anthropic", model: "claude-opus-5",
      feature: "key-test", inputTokens: 1_000, outputTokens: 0, costCents: 999,
      daysAgo: 45,
    })
  }

  it("adds the meter up by person, feature, model and day", async () => {
    await seedSpread()
    const dashboard = await loadAiUsageDashboard("30d")

    expect(dashboard.totals).toEqual({
      costCents: 155,
      calls: 3,
      tokens: 210_000,
      failed: 1,
    })

    const byPerson = Object.fromEntries(
      dashboard.byPerson.map((row) => [row.userId, row])
    )
    expect(byPerson["user-1"].calls).toBe(2)
    expect(byPerson["user-1"].costCents).toBe(150)
    expect(byPerson["user-1"].name).toBe("Meter")
    expect(byPerson["user-2"].costCents).toBe(5)

    const byFeature = Object.fromEntries(
      dashboard.byFeature.map((row) => [row.feature, row])
    )
    expect(byFeature["key-test"].costCents).toBe(50)
    expect(byFeature["automation"].costCents).toBe(105)

    const byModel = Object.fromEntries(
      dashboard.byModel.map((row) => [row.model, row])
    )
    expect(byModel["claude-opus-5"].calls).toBe(2)
    expect(byModel["claude-opus-5"].costCents).toBe(55)
    expect(byModel["gpt-5"].costCents).toBe(100)

    // Every day of the range is in the chart, and today carries the spend.
    expect(dashboard.daily).toHaveLength(31)
    expect(dashboard.daily.at(-1)?.costCents).toBe(155)
    expect(dashboard.daily[3].costCents).toBe(0)
  })

  it("widens with the range instead of always reading 30 days", async () => {
    await seedSpread()
    const wide = await loadAiUsageDashboard("90d")
    expect(wide.totals.calls).toBe(4)
    expect(wide.totals.costCents).toBe(1154)
    // The current month can never contain the 45-day-old call.
    const month = await loadAiUsageDashboard("month")
    expect(month.totals.costCents).toBe(155)
  })

  it("keeps a deleted account's spend on the books, anonymously", async () => {
    await seedEvent({
      userId: null, provider: "anthropic", model: "claude-opus-5",
      feature: "automation", inputTokens: 5_000, outputTokens: 0, costCents: 3,
    })
    const dashboard = await loadAiUsageDashboard("30d")
    const anonymous = dashboard.byPerson.find((row) => row.userId === null)
    expect(anonymous?.name).toBe("Deleted account")
    expect(anonymous?.costCents).toBe(3)
    // Nobody left to limit.
    expect(anonymous?.allowanceCents).toBeNull()
  })

  it("shows each person's ceiling and this month's spend beside it", async () => {
    await givePlanAllowance(1) // the default plan gives $1 a month
    await seedSpread()
    await setAiAllowanceOverride("user-1", 500)

    const dashboard = await loadAiUsageDashboard("30d")
    const byPerson = Object.fromEntries(
      dashboard.byPerson.map((row) => [row.userId, row])
    )
    // user-1 has their own $5; user-2 follows the plan's $1.
    expect(byPerson["user-1"].allowanceCents).toBe(500)
    expect(byPerson["user-2"].allowanceCents).toBe(100)
    expect(byPerson["user-1"].monthSpentCents).toBe(150)
    expect(byPerson["user-2"].monthSpentCents).toBe(5)
  })
})

// ---------------------------------------------------------------------------
// The monthly ceiling.

/**
 * Makes the default plan carry an AI allowance of `dollars` a month. The
 * migrations already seed a default "free" plan, so this writes to it.
 */
async function givePlanAllowance(dollars: number) {
  const updated = await database
    .update(customShellPlans)
    .set({ features: { aiDollars: dollars } })
    .where(eq(customShellPlans.isDefault, true))
    .returning({ id: customShellPlans.id })
  expect(updated).toHaveLength(1)
}

/** One successful AI call costing exactly `cents` (opus-5 output pricing). */
function callCosting(cents: number, feature = "automation") {
  return runAiCall(
    {
      userId: "user-1",
      provider: "anthropic",
      model: "claude-opus-5",
      feature,
    },
    // $25 per million output tokens → 400 tokens is one cent.
    async () => ({
      result: "ok",
      usage: { inputTokens: 0, outputTokens: cents * 400 },
    })
  )
}

async function alertRows() {
  return database.select().from(customShellAiUsageAlerts)
}

async function noticeRows() {
  return database.select().from(customShellNotifications)
}

describe("checkAiAllowance", () => {
  it("lets everything through when nothing sets a ceiling", async () => {
    // No plan, no override — a missing setting means no ceiling, never zero.
    await expect(checkAiAllowance("user-1")).resolves.toBeUndefined()
    await expect(callCosting(500)).resolves.toBe("ok")
    expect(await alertRows()).toHaveLength(0)
  })

  it("blocks at the plan's ceiling: a blocked row, one notice, and the provider never called", async () => {
    await givePlanAllowance(1) // $1
    // The month is already spent to the ceiling.
    await recordAiUsage({
      userId: "user-1", provider: "anthropic", model: "claude-opus-5",
      feature: "automation", inputTokens: 0, outputTokens: 40_000,
      status: "success",
    })

    const provider = vi.fn(async () => ({
      result: "never",
      usage: { inputTokens: 0, outputTokens: 0 },
    }))
    await expect(
      runAiCall(
        {
          userId: "user-1", provider: "anthropic",
          model: "claude-opus-5", feature: "automation",
        },
        provider
      )
    ).rejects.toThrow("AI_LIMIT_REACHED")

    // The wall itself is on the books, and the request never left the house.
    expect(provider).not.toHaveBeenCalled()
    const blocked = (await allRows()).filter((row) => row.status === "blocked")
    expect(blocked).toHaveLength(1)
    expect(blocked[0].costCents).toBe(0)

    const alerts = await alertRows()
    expect(alerts).toHaveLength(1)
    expect(alerts[0].level).toBe("reached")
    const notices = await noticeRows()
    expect(notices).toHaveLength(1)
    expect(notices[0].type).toBe("ai_limit_reached")
    expect(notices[0].recipientUserId).toBe("user-1")
  })

  it("lets a person's own override beat their plan", async () => {
    await givePlanAllowance(1) // the plan alone would block this
    await setAiAllowanceOverride("user-1", 500) // but they were given $5
    await callCosting(100) // $1 spent — at the plan's ceiling
    await expect(callCosting(100)).resolves.toBe("ok")
  })

  it("treats a real zero as a real ceiling of nothing", async () => {
    await setAiAllowanceOverride("user-1", 0)
    const provider = vi.fn(async () => ({
      result: "never",
      usage: { inputTokens: 0, outputTokens: 0 },
    }))
    await expect(
      runAiCall(
        {
          userId: "user-1", provider: "anthropic",
          model: "claude-opus-5", feature: "automation",
        },
        provider
      )
    ).rejects.toThrow("AI_LIMIT_REACHED")
    expect(provider).not.toHaveBeenCalled()
    // Only "reached" — there is no 80% of nothing to warn about.
    const alerts = await alertRows()
    expect(alerts).toHaveLength(1)
    expect(alerts[0].level).toBe("reached")
  })

  it("resets on the first of the month", async () => {
    await givePlanAllowance(1)
    // Last month was spent to the ceiling; this month is untouched.
    const lastMonth = new Date()
    lastMonth.setUTCDate(0) // the last day of the previous month
    await database.insert(customShellAiUsageEvents).values({
      id: crypto.randomUUID(),
      userId: "user-1",
      provider: "anthropic",
      model: "claude-opus-5",
      feature: "automation",
      inputTokens: 0,
      outputTokens: 40_000,
      costCents: 100,
      status: "success",
      monthStart: aiUsageMonthStart(lastMonth),
      metadata: {},
      createdAt: lastMonth,
    })

    await expect(callCosting(50)).resolves.toBe("ok")
  })

  it("sends the 80% warning exactly once, even for calls landing together", async () => {
    await givePlanAllowance(1) // $1 → the warning line is 80 cents
    // Two calls of 41 cents each land together: 82 cents, past 80%, short of
    // the ceiling. Both may try to warn; the unique index lets one through.
    await Promise.all([callCosting(41), callCosting(41)])

    const alerts = await alertRows()
    expect(alerts).toHaveLength(1)
    expect(alerts[0].level).toBe("warning")
    const notices = await noticeRows()
    expect(notices).toHaveLength(1)
    expect(notices[0].type).toBe("ai_limit_warning")

    // A third call keeps the month over 80% — and warns nobody again.
    await callCosting(1)
    expect(await alertRows()).toHaveLength(1)
    expect(await noticeRows()).toHaveLength(1)
  })

  it("says so once when a success lands exactly on the ceiling", async () => {
    await givePlanAllowance(1)
    await callCosting(100) // the whole dollar in one call
    const alerts = await alertRows()
    // Straight past 80% to 100%: one "reached" notice, not a warning as well.
    expect(alerts).toHaveLength(1)
    expect(alerts[0].level).toBe("reached")
  })
})

describe("loadMyAiUsage", () => {
  it("returns only the signed-in person's numbers", async () => {
    await database.insert(customShellUsers).values({
      id: "user-2",
      email: "other@internal.dev",
      name: "Other",
      role: "member",
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    await givePlanAllowance(2) // $2 for everyone on the plan
    await callCosting(30, "automation")
    await callCosting(20, "key-test")
    // Somebody else's spend, which must never leak into user-1's panel.
    await recordAiUsage({
      userId: "user-2", provider: "openai", model: "gpt-5",
      feature: "automation", inputTokens: 9_999, outputTokens: 9_999,
      status: "success",
    })

    const mine = await loadMyAiUsage("user-1")
    expect(mine.spentCents).toBe(50)
    expect(mine.calls).toBe(2)
    expect(mine.tokens).toBe(50 * 400)
    expect(mine.allowanceCents).toBe(200)
    expect(mine.recent).toHaveLength(2)
    // Newest first, and nothing of user-2's anywhere in the list.
    expect(mine.recent[0].feature).toBe("key-test")
    expect(mine.recent.every((call) => call.costCents <= 30)).toBe(true)

    const theirs = await loadMyAiUsage("user-2")
    expect(theirs.calls).toBe(1)
    expect(theirs.tokens).toBe(19_998)
  })

  it("reads as no ceiling when nothing sets one", async () => {
    await callCosting(10)
    const mine = await loadMyAiUsage("user-1")
    expect(mine.allowanceCents).toBeNull()
    expect(mine.spentCents).toBe(10)
  })
})
