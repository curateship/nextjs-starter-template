import { readFile } from "node:fs/promises"

import { PGlite } from "@electric-sql/pglite"
import { drizzle } from "drizzle-orm/pglite"
import { beforeEach, describe, expect, it } from "vitest"

import type { CustomShellDb } from "@/server/db"
import { normalizeKeyword } from "@/lib/keyword-research"
import {
  getUsageSummaryForUser,
  listUsageLogsForUser,
} from "@/server/api-usage"
import {
  getRankingHistoryForUser,
  listRankingsForProject,
  matchSerpPosition,
  setKeywordTracking,
} from "@/server/rank-tracker"
import { createProjectForUser } from "@/server/seo-projects"
import {
  apiUsageLogs,
  customShellUsers,
  keywordRankings,
  keywords,
  projectKeywords,
} from "@/server/schema"
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

async function seedProjectKeyword(keyword: string) {
  const [keywordRow] = await database
    .insert(keywords)
    .values({
      keyword,
      normalizedKeyword: normalizeKeyword(keyword),
      locationCode: 2840,
      languageCode: "en",
    })
    .returning()
  const [projectKeyword] = await database
    .insert(projectKeywords)
    .values({
      projectId,
      keywordId: keywordRow!.id,
      source: "seed_research",
    })
    .returning()
  return { keywordId: keywordRow!.id, projectKeywordId: projectKeyword!.id }
}

beforeEach(async () => {
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

describe("matchSerpPosition", () => {
  const items = [
    { type: "paid", rank_absolute: 1, domain: "ads.example.com" },
    {
      type: "organic",
      rank_absolute: 3,
      domain: "competitor.com",
      url: "https://competitor.com/a",
      title: "Competitor",
    },
    {
      type: "organic",
      rank_absolute: 7,
      domain: "www.example.com",
      url: "https://www.example.com/page",
      title: "Our page",
    },
    {
      type: "organic",
      rank_absolute: 9,
      domain: "another.com",
      url: "https://another.com",
      title: "Another",
    },
  ]

  it("finds the project domain ignoring www and non-organic items", () => {
    const match = matchSerpPosition(items, "example.com")
    expect(match.position).toBe(7)
    expect(match.url).toBe("https://www.example.com/page")
    expect(match.topResults).toHaveLength(3)
    expect(match.topResults[0]?.domain).toBe("competitor.com")
  })

  it("matches subdomains", () => {
    const match = matchSerpPosition(
      [
        {
          type: "organic",
          rank_absolute: 5,
          domain: "blog.example.com",
          url: "https://blog.example.com/post",
          title: "Post",
        },
      ],
      "example.com"
    )
    expect(match.position).toBe(5)
  })

  it("returns null when the domain is absent", () => {
    const match = matchSerpPosition(items, "missing.com")
    expect(match.position).toBeNull()
    expect(match.url).toBeNull()
    expect(match.topResults).toHaveLength(3)
  })
})

describe("keyword tracking", () => {
  it("sets and clears tracked_at", async () => {
    const { projectKeywordId } = await seedProjectKeyword("plumber toronto")

    const result = await setKeywordTracking(
      userId,
      projectId,
      [projectKeywordId],
      true,
      database
    )
    expect(result.updated).toBe(1)

    let list = await listRankingsForProject(
      userId,
      { projectId, pagination: { page: 1, pageSize: 10 } },
      database
    )
    expect(list.total).toBe(1)

    await setKeywordTracking(
      userId,
      projectId,
      [projectKeywordId],
      false,
      database
    )
    list = await listRankingsForProject(
      userId,
      { projectId, pagination: { page: 1, pageSize: 10 } },
      database
    )
    expect(list.total).toBe(0)
  })

  it("enforces ownership", async () => {
    const { projectKeywordId } = await seedProjectKeyword("plumber toronto")
    await expect(
      setKeywordTracking(
        otherUserId,
        projectId,
        [projectKeywordId],
        true,
        database
      )
    ).rejects.toThrow("not found")
    await expect(
      listRankingsForProject(
        otherUserId,
        { projectId, pagination: { page: 1, pageSize: 10 } },
        database
      )
    ).rejects.toThrow("not found")
  })
})

describe("rankings list and history", () => {
  it("computes latest position, change, and best position", async () => {
    const first = await seedProjectKeyword("emergency plumber")
    const second = await seedProjectKeyword("drain cleaning")
    await setKeywordTracking(
      userId,
      projectId,
      [first.projectKeywordId, second.projectKeywordId],
      true,
      database
    )

    const base = Date.now()
    await database.insert(keywordRankings).values([
      {
        projectId,
        keywordId: first.keywordId,
        position: 12,
        rankingUrl: "https://example.com/old",
        checkedAt: new Date(base - 2 * 86400000),
      },
      {
        projectId,
        keywordId: first.keywordId,
        position: 8,
        rankingUrl: "https://example.com/new",
        checkedAt: new Date(base - 86400000),
      },
      {
        projectId,
        keywordId: second.keywordId,
        position: null,
        checkedAt: new Date(base - 86400000),
      },
    ])

    const list = await listRankingsForProject(
      userId,
      {
        projectId,
        sort: { field: "position", direction: "asc" },
        pagination: { page: 1, pageSize: 10 },
      },
      database
    )
    expect(list.total).toBe(2)

    const improved = list.rows.find(
      (row) => row.keyword === "emergency plumber"
    )
    expect(improved).toMatchObject({
      position: 8,
      previousPosition: 12,
      change: 4,
      bestPosition: 8,
      rankingUrl: "https://example.com/new",
    })

    const notFound = list.rows.find((row) => row.keyword === "drain cleaning")
    expect(notFound?.position).toBeNull()
    expect(notFound?.change).toBeNull()
    expect(notFound?.lastCheckedAt).not.toBeNull()

    // Ranked keywords sort before null positions.
    expect(list.rows[0]?.keyword).toBe("emergency plumber")

    const searched = await listRankingsForProject(
      userId,
      { projectId, q: "drain", pagination: { page: 1, pageSize: 10 } },
      database
    )
    expect(searched.total).toBe(1)
  })

  it("returns chronological history", async () => {
    const { keywordId, projectKeywordId } =
      await seedProjectKeyword("emergency plumber")
    const base = Date.now()
    await database.insert(keywordRankings).values([
      {
        projectId,
        keywordId,
        position: 20,
        checkedAt: new Date(base - 2 * 86400000),
      },
      {
        projectId,
        keywordId,
        position: 15,
        topResults: [{ position: 1, domain: "competitor.com", url: "x", title: "t" }],
        checkedAt: new Date(base - 86400000),
      },
    ])

    const { keyword, history } = await getRankingHistoryForUser(
      userId,
      projectId,
      projectKeywordId,
      database
    )
    expect(keyword).toBe("emergency plumber")
    expect(history.map((entry) => entry.position)).toEqual([20, 15])
    expect(history[1]?.topResults?.[0]?.domain).toBe("competitor.com")
  })
})

describe("usage summary and logs", () => {
  beforeEach(async () => {
    await database.insert(apiUsageLogs).values([
      {
        userId,
        projectId,
        provider: "dataforseo",
        endpoint: "/v3/serp/google/organic/live/regular",
        keywordCount: 1,
        cost: "0.002",
        statusCode: 20000,
        statusMessage: "Ok.",
        success: true,
      },
      {
        userId,
        projectId,
        provider: "dataforseo",
        endpoint: "/v3/dataforseo_labs/google/keyword_suggestions/live",
        keywordCount: 300,
        cost: "0.011",
        statusCode: 20000,
        statusMessage: "Ok.",
        success: true,
      },
      {
        userId,
        projectId: null,
        provider: "dataforseo",
        endpoint: "/v3/dataforseo_labs/locations_and_languages",
        cost: null,
        statusCode: null,
        statusMessage: "credentials missing",
        success: false,
      },
      {
        userId: otherUserId,
        provider: "dataforseo",
        endpoint: "/v3/serp/google/organic/live/regular",
        cost: "9.99",
        success: true,
      },
    ])
  })

  it("aggregates totals scoped to the user", async () => {
    const summary = await getUsageSummaryForUser(userId, 30, database)
    expect(summary.requestCount).toBe(3)
    expect(summary.totalCost).toBeCloseTo(0.013)
    expect(summary.keywordCount).toBe(301)
    expect(summary.failureCount).toBe(1)

    const projectRow = summary.byProject.find(
      (row) => row.projectId === projectId
    )
    expect(projectRow).toMatchObject({ projectName: "My Site", requests: 2 })
    expect(summary.byEndpoint.length).toBe(3)
  })

  it("filters and paginates logs", async () => {
    const all = await listUsageLogsForUser(
      userId,
      { pagination: { page: 1, pageSize: 2 } },
      database
    )
    expect(all.total).toBe(3)
    expect(all.rows).toHaveLength(2)

    const failed = await listUsageLogsForUser(
      userId,
      { success: false, pagination: { page: 1, pageSize: 10 } },
      database
    )
    expect(failed.total).toBe(1)
    expect(failed.rows[0]?.statusMessage).toBe("credentials missing")

    const byProject = await listUsageLogsForUser(
      userId,
      { projectId, pagination: { page: 1, pageSize: 10 } },
      database
    )
    expect(byProject.total).toBe(2)
    expect(byProject.rows[0]?.projectName).toBe("My Site")
  })
})
