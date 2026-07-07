import { readFile } from "node:fs/promises"

import { PGlite } from "@electric-sql/pglite"
import { and, eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/pglite"
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest"

import type { CustomShellDb } from "@/server/db"
import { normalizeKeyword } from "@/lib/keyword-research"
import { dataForSeoPost } from "@/server/dataforseo"
import { runKeywordJob } from "@/server/keyword-jobs"
import {
  countUnreadAlerts,
  detectRankingAlert,
  listAlertsForProject,
  markAlertRead,
  markAllAlertsRead,
  recordRankingAlert,
} from "@/server/ranking-alerts"
import { getRankingTrendForProject } from "@/server/rank-tracker"
import { createProjectForUser } from "@/server/seo-projects"
import {
  customShellUsers,
  keywordJobs,
  keywordRankingAlerts,
  keywordRankings,
  keywords,
  projectKeywords,
} from "@/server/schema"
import * as schema from "@/server/schema"

vi.mock("@/server/dataforseo", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/dataforseo")>()),
  dataForSeoPost: vi.fn(),
}))

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

async function seedTrackedKeyword(keyword: string) {
  const [keywordRow] = await database
    .insert(keywords)
    .values({
      keyword,
      normalizedKeyword: normalizeKeyword(keyword),
      locationCode: 2840,
      languageCode: "en",
    })
    .returning()
  await database.insert(projectKeywords).values({
    projectId,
    keywordId: keywordRow!.id,
    source: "seed_research",
    trackedAt: new Date(),
  })
  return keywordRow!.id
}

beforeEach(async () => {
  vi.clearAllMocks()
  delete process.env.RANK_ALERT_MOVE_THRESHOLD

  const client = new PGlite()
  for (const file of [
    "0000_custom_shell_baseline.sql",
    "0003_custom_shell_workspaces.sql",
    "0004_keyword_research.sql",
    "0005_rank_tracker.sql",
    "0006_clusters_schedules.sql",
    "0007_workspace_projects.sql",
    "0008_ranking_alerts.sql",
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

describe("detectRankingAlert", () => {
  it("returns null when nothing ranked before or after", () => {
    expect(
      detectRankingAlert({ previousPosition: null, newPosition: null })
    ).toBeNull()
  })

  it("detects new and lost rankings", () => {
    expect(
      detectRankingAlert({ previousPosition: null, newPosition: 42 })
    ).toMatchObject({ type: "new_ranking", newPosition: 42, delta: null })
    expect(
      detectRankingAlert({ previousPosition: 42, newPosition: null })
    ).toMatchObject({ type: "lost_ranking", previousPosition: 42, delta: null })
  })

  it("detects top-10 crossings ahead of big moves", () => {
    expect(
      detectRankingAlert({ previousPosition: 22, newPosition: 9 })
    ).toMatchObject({ type: "entered_top_10", delta: 13 })
    expect(
      detectRankingAlert({ previousPosition: 8, newPosition: 14 })
    ).toMatchObject({ type: "left_top_10", delta: -6 })
    // Boundary: position 10 is inside the top 10, 11 is not.
    expect(
      detectRankingAlert({ previousPosition: 11, newPosition: 10 })
    ).toMatchObject({ type: "entered_top_10", delta: 1 })
    expect(
      detectRankingAlert({ previousPosition: 10, newPosition: 11 })
    ).toMatchObject({ type: "left_top_10", delta: -1 })
  })

  it("detects big moves at or beyond the threshold", () => {
    expect(
      detectRankingAlert({ previousPosition: 50, newPosition: 45 })
    ).toMatchObject({ type: "big_gain", delta: 5 })
    expect(
      detectRankingAlert({ previousPosition: 45, newPosition: 50 })
    ).toMatchObject({ type: "big_drop", delta: -5 })
    // Moves inside the top 10 that do not cross it still count.
    expect(
      detectRankingAlert({ previousPosition: 9, newPosition: 3 })
    ).toMatchObject({ type: "big_gain", delta: 6 })
  })

  it("ignores small moves and unchanged positions", () => {
    expect(
      detectRankingAlert({ previousPosition: 50, newPosition: 47 })
    ).toBeNull()
    expect(
      detectRankingAlert({ previousPosition: 20, newPosition: 20 })
    ).toBeNull()
  })

  it("honours a custom threshold", () => {
    expect(
      detectRankingAlert({ previousPosition: 30, newPosition: 28 }, 2)
    ).toMatchObject({ type: "big_gain", delta: 2 })
    expect(
      detectRankingAlert({ previousPosition: 30, newPosition: 25 }, 6)
    ).toBeNull()
  })

  it("reads RANK_ALERT_MOVE_THRESHOLD from the environment", () => {
    process.env.RANK_ALERT_MOVE_THRESHOLD = "3"
    expect(
      detectRankingAlert({ previousPosition: 30, newPosition: 27 })
    ).toMatchObject({ type: "big_gain", delta: 3 })
    delete process.env.RANK_ALERT_MOVE_THRESHOLD
  })
})

describe("recordRankingAlert", () => {
  it("stores an alert row for an alert-worthy move", async () => {
    const keywordId = await seedTrackedKeyword("seo tools")
    const alert = await recordRankingAlert(
      {
        projectId,
        keywordId,
        keyword: "seo tools",
        previousPosition: 8,
        newPosition: 14,
      },
      database
    )
    expect(alert).toMatchObject({
      projectId,
      keywordId,
      type: "left_top_10",
      previousPosition: 8,
      newPosition: 14,
      delta: -6,
      keywordSnapshot: "seo tools",
      readAt: null,
    })

    const rows = await database.select().from(keywordRankingAlerts)
    expect(rows).toHaveLength(1)
  })

  it("does not store anything for a boring move", async () => {
    const keywordId = await seedTrackedKeyword("seo tools")
    const alert = await recordRankingAlert(
      {
        projectId,
        keywordId,
        keyword: "seo tools",
        previousPosition: 30,
        newPosition: 29,
      },
      database
    )
    expect(alert).toBeNull()
    expect(await database.select().from(keywordRankingAlerts)).toHaveLength(0)
  })
})

describe("alert reads and unread counts", () => {
  async function seedAlerts() {
    const keywordId = await seedTrackedKeyword("seo tools")
    const first = await recordRankingAlert(
      { projectId, keywordId, keyword: "seo tools", previousPosition: 22, newPosition: 9 },
      database
    )
    const second = await recordRankingAlert(
      { projectId, keywordId, keyword: "seo tools", previousPosition: 9, newPosition: 30 },
      database
    )
    return { first: first!, second: second! }
  }

  it("lists alerts with unread filter and pagination", async () => {
    const { first } = await seedAlerts()
    const all = await listAlertsForProject(
      userId,
      { projectId, pagination: { page: 1, pageSize: 10 } },
      database
    )
    expect(all.total).toBe(2)
    expect(all.rows).toHaveLength(2)
    expect(all.rows.map((row) => row.keyword)).toEqual([
      "seo tools",
      "seo tools",
    ])

    await markAlertRead(userId, projectId, first.id, database)
    const unread = await listAlertsForProject(
      userId,
      { projectId, unreadOnly: true, pagination: { page: 1, pageSize: 10 } },
      database
    )
    expect(unread.total).toBe(1)
    expect(unread.rows[0]!.id).not.toBe(first.id)

    const paged = await listAlertsForProject(
      userId,
      { projectId, pagination: { page: 2, pageSize: 1 } },
      database
    )
    expect(paged.total).toBe(2)
    expect(paged.rows).toHaveLength(1)
  })

  it("counts unread and marks all read", async () => {
    await seedAlerts()
    expect(await countUnreadAlerts(userId, projectId, database)).toBe(2)

    const result = await markAllAlertsRead(userId, projectId, database)
    expect(result.updated).toBe(2)
    expect(await countUnreadAlerts(userId, projectId, database)).toBe(0)

    // Marking again is a no-op.
    const again = await markAllAlertsRead(userId, projectId, database)
    expect(again.updated).toBe(0)
  })

  it("rejects other users' projects", async () => {
    const { first } = await seedAlerts()
    await expect(
      listAlertsForProject(
        otherUserId,
        { projectId, pagination: { page: 1, pageSize: 10 } },
        database
      )
    ).rejects.toThrow("Project not found")
    await expect(
      countUnreadAlerts(otherUserId, projectId, database)
    ).rejects.toThrow("Project not found")
    await expect(
      markAlertRead(otherUserId, projectId, first.id, database)
    ).rejects.toThrow("Project not found")
    await expect(
      markAllAlertsRead(otherUserId, projectId, database)
    ).rejects.toThrow("Project not found")
  })

  it("rejects unknown alert ids", async () => {
    await expect(
      markAlertRead(userId, projectId, crypto.randomUUID(), database)
    ).rejects.toThrow("Alert not found")
  })
})

describe("getRankingTrendForProject", () => {
  it("aggregates checks by day", async () => {
    const keywordId = await seedTrackedKeyword("seo tools")
    const otherKeywordId = await seedTrackedKeyword("best crm")
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)

    await database.insert(keywordRankings).values([
      { projectId, keywordId, position: 2, checkedAt: dayAgo },
      { projectId, keywordId: otherKeywordId, position: null, checkedAt: dayAgo },
      { projectId, keywordId, position: 6, checkedAt: new Date() },
      { projectId, keywordId: otherKeywordId, position: 40, checkedAt: new Date() },
    ])

    const points = await getRankingTrendForProject(
      userId,
      projectId,
      { days: 30 },
      database
    )
    expect(points).toHaveLength(2)

    const [older, newer] = points
    expect(older).toMatchObject({ top3: 1, top10: 1, top100: 1, checks: 2 })
    // (101-2 + 0) / 2 = 49.5
    expect(older!.visibility).toBeCloseTo(49.5, 1)
    expect(older!.avgPosition).toBe(2)

    expect(newer).toMatchObject({ top3: 0, top10: 1, top100: 2, checks: 2 })
    expect(newer!.avgPosition).toBeCloseTo(23, 1)
    // (101-6 + 101-40) / 2 = 78
    expect(newer!.visibility).toBeCloseTo(78, 1)
  })

  it("rejects other users' projects", async () => {
    await expect(
      getRankingTrendForProject(otherUserId, projectId, {}, database)
    ).rejects.toThrow("Project not found")
  })
})

describe("rank check job integration", () => {
  function serpResponse(ourPosition: number | null) {
    const items: Array<Record<string, unknown>> = [
      {
        type: "organic",
        rank_absolute: 1,
        domain: "competitor.com",
        url: "https://competitor.com/a",
        title: "Competitor",
      },
    ]
    if (ourPosition != null) {
      items.push({
        type: "organic",
        rank_absolute: ourPosition,
        domain: "example.com",
        url: "https://example.com/page",
        title: "Us",
      })
    }
    return {
      status_code: 20000,
      status_message: "Ok",
      cost: 0.002,
      tasks: [
        {
          status_code: 20000,
          status_message: "Ok",
          cost: 0.002,
          result: [{ items }],
        },
      ],
    }
  }

  async function runRankCheckJob() {
    const [job] = await database
      .insert(keywordJobs)
      .values({
        userId,
        projectId,
        type: "rank_check",
        status: "pending",
        input: {},
      })
      .returning()
    await runKeywordJob(job!.id, database)
    const [finished] = await database
      .select()
      .from(keywordJobs)
      .where(eq(keywordJobs.id, job!.id))
    return finished!
  }

  it("creates alerts on movement but not on the baseline check", async () => {
    const keywordId = await seedTrackedKeyword("seo tools")
    const mock = dataForSeoPost as Mock

    mock.mockResolvedValueOnce(serpResponse(8))
    const firstJob = await runRankCheckJob()
    expect(firstJob.status).toBe("completed")
    expect(await database.select().from(keywordRankingAlerts)).toHaveLength(0)

    mock.mockResolvedValueOnce(serpResponse(14))
    const secondJob = await runRankCheckJob()
    expect(secondJob.status).toBe("completed")

    const alerts = await database
      .select()
      .from(keywordRankingAlerts)
      .where(
        and(
          eq(keywordRankingAlerts.projectId, projectId),
          eq(keywordRankingAlerts.keywordId, keywordId)
        )
      )
    expect(alerts).toHaveLength(1)
    expect(alerts[0]).toMatchObject({
      type: "left_top_10",
      previousPosition: 8,
      newPosition: 14,
      delta: -6,
      keywordSnapshot: "seo tools",
    })

    // Both rankings were still recorded.
    expect(await database.select().from(keywordRankings)).toHaveLength(2)
  })
})
