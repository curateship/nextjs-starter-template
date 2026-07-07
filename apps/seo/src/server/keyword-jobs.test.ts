import { readFile } from "node:fs/promises"

import { PGlite } from "@electric-sql/pglite"
import { drizzle } from "drizzle-orm/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import type { CustomShellDb } from "@/server/db"
import { assertUserJobLimits } from "@/server/keyword-jobs"
import { createProjectForUser } from "@/server/seo-projects"
import { customShellUsers, keywordJobs } from "@/server/schema"
import * as schema from "@/server/schema"

let database: CustomShellDb
let userId: string
let otherUserId: string
let projectId: string

async function createUser(email: string) {
  const id = crypto.randomUUID()
  await database.insert(customShellUsers).values({
    id,
    email,
    name: "Test",
    role: "admin",
    passwordHash: "hash",
    createdAt: new Date(),
    updatedAt: new Date(),
  })
  return id
}

async function seedJobs(
  ownerId: string,
  howMany: number,
  status: string,
  createdAt: Date
) {
  for (let index = 0; index < howMany; index += 1) {
    await database.insert(keywordJobs).values({
      userId: ownerId,
      projectId,
      type: "rank_check",
      status,
      input: {},
      createdAt,
      updatedAt: createdAt,
    })
  }
}

beforeEach(async () => {
  // Small caps keep the seeded row counts (and the test) light.
  process.env.MAX_ACTIVE_JOBS_PER_USER = "3"
  process.env.MAX_JOBS_PER_HOUR_PER_USER = "5"

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
  userId = await createUser("owner@example.test")
  otherUserId = await createUser("other@example.test")
  const project = await createProjectForUser(
    userId,
    {
      name: "My Site",
      domain: "example.com",
      locationCode: 2840,
      languageCode: "en",
    },
    database
  )
  projectId = project.id
})

afterEach(() => {
  delete process.env.MAX_ACTIVE_JOBS_PER_USER
  delete process.env.MAX_JOBS_PER_HOUR_PER_USER
})

describe("assertUserJobLimits", () => {
  it("allows a new job when under both caps", async () => {
    await seedJobs(userId, 2, "running", new Date())
    await expect(
      assertUserJobLimits(database, userId)
    ).resolves.toBeUndefined()
  })

  it("blocks when the concurrent-job cap is reached", async () => {
    await seedJobs(userId, 3, "running", new Date())
    await expect(assertUserJobLimits(database, userId)).rejects.toThrow(
      /in progress/
    )
  })

  it("blocks when the hourly creation cap is reached", async () => {
    // Completed jobs do not count as active but still count toward the
    // rolling one-hour creation cap.
    await seedJobs(userId, 5, "completed", new Date())
    await expect(assertUserJobLimits(database, userId)).rejects.toThrow(
      /past hour/
    )
  })

  it("ignores jobs older than an hour and other users' jobs", async () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000)
    await seedJobs(userId, 5, "completed", twoHoursAgo)
    await seedJobs(otherUserId, 3, "running", new Date())
    await expect(
      assertUserJobLimits(database, userId)
    ).resolves.toBeUndefined()
  })

  it("uses the default caps when the env overrides are unset", async () => {
    delete process.env.MAX_ACTIVE_JOBS_PER_USER
    delete process.env.MAX_JOBS_PER_HOUR_PER_USER
    // 5 active would trip the small override, but is under the default of 10.
    await seedJobs(userId, 5, "running", new Date())
    await expect(
      assertUserJobLimits(database, userId)
    ).resolves.toBeUndefined()
  })
})
