import { readdir, readFile } from "node:fs/promises"

import { PGlite } from "@electric-sql/pglite"
import { drizzle } from "drizzle-orm/pglite"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { setDbForTests, type CustomShellDb } from "@/server/db"
import {
  aiUsageMonthStart,
  loadAiUsageDashboard,
  recordAiUsage,
  runAiCall,
} from "@/server/ai-usage"
import * as schema from "@/server/schema"
import { customShellAiUsageEvents, customShellUsers } from "@/server/schema"

let client: PGlite
let database: ReturnType<typeof drizzle>

beforeEach(async () => {
  client = new PGlite()
  // Replay every migration in order, the way setup-database.mjs does, so the
  // test schema cannot drift from the real one.
  const folder = new URL("../../drizzle/", import.meta.url)
  const migrations = (await readdir(folder))
    .filter((file) => file.endsWith(".sql"))
    .sort()
  for (const migration of migrations) {
    await client.exec(await readFile(new URL(migration, folder), "utf8"))
  }
  database = drizzle(client, { schema })
  setDbForTests(database as unknown as CustomShellDb)

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
  })
})
