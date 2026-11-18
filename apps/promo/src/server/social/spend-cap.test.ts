import type { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { uuid } from "@/server/auth/security"
import { customShellAiUsageEvents } from "@/server/schema"
import { createTestDatabase, insertUser, type TestDatabase } from "@/server/test-support"
import { aiUsageMonthStart } from "@/server/ai/usage"
import { parseCapDollars } from "@/lib/social/spend-cap"

const runAiCall = vi.fn(async (_meta: unknown, call: () => Promise<{ result: unknown }>) => (await call()).result)
vi.mock("@/server/ai/usage", async (original) => ({
  ...(await original<typeof import("@/server/ai/usage")>()),
  runAiCall: (meta: unknown, call: () => Promise<{ result: unknown }>) => runAiCall(meta, call),
}))

const { createProject } = await import("./projects")
const { askModel } = await import("./drafts")
const { projectMonthSpendCents, refuseOverProjectCap, setProjectAiCap } = await import("./spend-cap")
const { promoProjects } = await import("./schema")

/**
 * A project's monthly AI spend cap (part 2 of
 * workspace/tasks/New features/new-features-18-nov.md), on real rows of the
 * shell's meter. No model is asked anything.
 */
describe("a project's AI spend cap", () => {
  let client: PGlite
  let db: TestDatabase
  let userId: string

  beforeEach(async () => {
    const made = await createTestDatabase()
    client = made.client
    db = made.db
    userId = (await insertUser(db, { role: "admin" })).id
    runAiCall.mockClear()
  })

  afterEach(async () => {
    vi.unstubAllGlobals()
    await client.close()
  })

  async function spent(projectId: string, cents: number, at: Date = new Date()) {
    await db.insert(customShellAiUsageEvents).values({
      id: uuid(),
      userId,
      provider: "anthropic",
      model: "m",
      feature: "reddit-comment",
      inputTokens: 1,
      outputTokens: 1,
      costCents: cents,
      status: "success",
      monthStart: aiUsageMonthStart(at),
      metadata: { projectId },
      createdAt: at,
    })
  }

  it("refuses a project at its cap with how much, and lets another project and a project with no cap through", async () => {
    const capped = await createProject(userId, "Taskly", db)
    const free = await createProject(userId, "Other", db)
    await setProjectAiCap(userId, capped, 2000, db)
    await spent(capped, 1999)
    await spent(free, 5000)

    await expect(refuseOverProjectCap(userId, capped, db)).resolves.toBeUndefined()
    await spent(capped, 1)
    await expect(refuseOverProjectCap(userId, capped, db)).rejects.toThrow(
      "Taskly has used its $20 of AI this month. Raise the cap in the project's ⋮, under AI spend cap."
    )
    await expect(refuseOverProjectCap(userId, free, db)).resolves.toBeUndefined()
    await expect(refuseOverProjectCap(userId, null, db)).resolves.toBeUndefined()
    expect(await projectMonthSpendCents(userId, capped, db)).toBe(2000)
  })

  it("counts this calendar month only, so last month's spend never stops a project", async () => {
    const projectId = await createProject(userId, "Taskly", db)
    await setProjectAiCap(userId, projectId, 100, db)
    await spent(projectId, 500, new Date(Date.UTC(2020, 0, 15)))
    await expect(refuseOverProjectCap(userId, projectId, db)).resolves.toBeUndefined()
  })

  it("stops an AI call before anything is sent or counted, and writes the project on the meter's row", async () => {
    const projectId = await createProject(userId, "Taskly", db)
    const call = { userId, provider: "anthropic" as const, model: "m", feature: "reddit-comment", projectId, metadata: { findId: "f" }, prompt: "hi", key: "k" }
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ content: [{ type: "text", text: "ok" }], usage: { input_tokens: 1, output_tokens: 1 } }))
    )
    vi.stubGlobal("fetch", fetchMock)

    await askModel(call, (answer) => answer)
    expect(runAiCall.mock.calls[0][0]).toMatchObject({ metadata: { findId: "f", projectId } })

    await setProjectAiCap(userId, projectId, 0, db)
    await expect(askModel(call, (answer) => answer)).rejects.toThrow("has used its $0 of AI this month")
    expect(runAiCall).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("saves a cap only for the project's own person, and refuses a cap that is not whole cents", async () => {
    const projectId = await createProject(userId, "Taskly", db)
    const stranger = (await insertUser(db, { role: "admin" })).id
    await expect(setProjectAiCap(stranger, projectId, 100, db)).rejects.toThrow("does not exist")
    await expect(setProjectAiCap(userId, projectId, -1, db)).rejects.toThrow("number of dollars")
    await setProjectAiCap(userId, projectId, null, db)
    const [project] = await db.select({ capCents: promoProjects.aiCapCents }).from(promoProjects)
    expect(project.capCents).toBeNull()
  })

  it("reads what was typed in dollars", () => {
    expect(parseCapDollars("")).toEqual({ cents: null })
    expect(parseCapDollars(" 20 ")).toEqual({ cents: 2000 })
    expect(parseCapDollars("$12.5")).toEqual({ cents: 1250 })
    expect(parseCapDollars("1,000")).toEqual({ cents: 100000 })
    expect(parseCapDollars("twenty")).toEqual({ error: "Type the cap in dollars, such as 20." })
    expect(parseCapDollars("20000")).toEqual({ error: "The cap can be at most $10,000." })
  })
})
