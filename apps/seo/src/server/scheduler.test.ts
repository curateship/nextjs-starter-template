import { readFile } from "node:fs/promises"

import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/pglite"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { CustomShellDb } from "@/server/db"
import { isScheduleDue, runDueSchedules } from "@/server/scheduler"
import {
  createMetricsRefreshJobForUser,
  createRankCheckJobForUser,
} from "@/server/keyword-jobs"
import { createProjectForUser } from "@/server/seo-projects"
import { customShellUsers, keywordJobs, projects } from "@/server/schema"
import * as schema from "@/server/schema"

vi.mock("@/server/keyword-jobs", () => ({
  createRankCheckJobForUser: vi.fn().mockResolvedValue({ id: "job-1" }),
  createMetricsRefreshJobForUser: vi.fn().mockResolvedValue({ id: "job-2" }),
}))

let database: CustomShellDb
let userId: string

const DAY_MS = 24 * 60 * 60 * 1000

beforeEach(async () => {
  vi.clearAllMocks()
  process.env.DATAFORSEO_LOGIN = "test-login"
  process.env.DATAFORSEO_PASSWORD = "test-password"

  const client = new PGlite()
  for (const file of [
    "0000_custom_shell_baseline.sql",
    "0003_custom_shell_workspaces.sql",
    "0004_keyword_research.sql",
    "0005_rank_tracker.sql",
    "0006_clusters_schedules.sql",
    "0007_workspace_projects.sql",
  ]) {
    const sql = await readFile(
      new URL(`../../drizzle/${file}`, import.meta.url),
      "utf8"
    )
    await client.exec(sql)
  }
  database = drizzle(client, { schema }) as unknown as CustomShellDb

  userId = crypto.randomUUID()
  await database.insert(customShellUsers).values({
    id: userId,
    email: "owner@example.test",
    name: "Test",
    role: "admin",
    passwordHash: "hash",
    createdAt: new Date(),
    updatedAt: new Date(),
  })
})

afterEach(() => {
  delete process.env.DATAFORSEO_LOGIN
  delete process.env.DATAFORSEO_PASSWORD
})

describe("isScheduleDue", () => {
  const now = new Date("2026-07-05T12:00:00Z")

  it("never fires for manual", () => {
    expect(isScheduleDue("manual", null, now)).toBe(false)
    expect(isScheduleDue("manual", new Date(0), now)).toBe(false)
  })

  it("fires daily after 24 hours or when never run", () => {
    expect(isScheduleDue("daily", null, now)).toBe(true)
    expect(
      isScheduleDue("daily", new Date(now.getTime() - 2 * 60 * 60 * 1000), now)
    ).toBe(false)
    expect(
      isScheduleDue("daily", new Date(now.getTime() - 25 * 60 * 60 * 1000), now)
    ).toBe(true)
  })

  it("fires weekly after 7 days", () => {
    expect(
      isScheduleDue("weekly", new Date(now.getTime() - 6 * DAY_MS), now)
    ).toBe(false)
    expect(
      isScheduleDue("weekly", new Date(now.getTime() - 8 * DAY_MS), now)
    ).toBe(true)
  })
})

describe("runDueSchedules", () => {
  async function createScheduledProject(frequency: string) {
    const project = await createProjectForUser(
      userId,
      {
        name: "My Site",
        domain: "example.com",
        locationCode: 2840,
        languageCode: "en",
        scheduleFrequency: frequency,
      },
      database
    )
    return project
  }

  it("skips when credentials are missing", async () => {
    delete process.env.DATAFORSEO_LOGIN
    await createScheduledProject("daily")
    const result = await runDueSchedules(database)
    expect(result).toMatchObject({ started: 0, skipped: "credentials" })
    expect(createRankCheckJobForUser).not.toHaveBeenCalled()
  })

  it("creates jobs for due projects and does not double-fire", async () => {
    const project = await createScheduledProject("daily")
    await createScheduledProject("manual")

    await runDueSchedules(database)
    expect(createRankCheckJobForUser).toHaveBeenCalledTimes(1)
    expect(createRankCheckJobForUser).toHaveBeenCalledWith(
      userId,
      project.id,
      database
    )
    expect(createMetricsRefreshJobForUser).toHaveBeenCalledTimes(1)

    const [updated] = await database
      .select({ lastRunAt: projects.scheduleLastRunAt })
      .from(projects)
      .where(eq(projects.id, project.id))
    expect(updated?.lastRunAt).not.toBeNull()

    // Second tick right after: nothing is due anymore.
    await runDueSchedules(database)
    expect(createRankCheckJobForUser).toHaveBeenCalledTimes(1)
  })

  it("skips projects with an active job", async () => {
    const project = await createScheduledProject("daily")
    await database.insert(keywordJobs).values({
      userId,
      projectId: project.id,
      type: "seed_research",
      status: "running",
      input: {},
    })

    await runDueSchedules(database)
    expect(createRankCheckJobForUser).not.toHaveBeenCalled()

    const [row] = await database
      .select({ lastRunAt: projects.scheduleLastRunAt })
      .from(projects)
      .where(eq(projects.id, project.id))
    expect(row?.lastRunAt).toBeNull()
  })
})
