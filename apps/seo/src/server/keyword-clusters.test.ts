import { readFile } from "node:fs/promises"

import { PGlite } from "@electric-sql/pglite"
import { drizzle } from "drizzle-orm/pglite"
import { beforeEach, describe, expect, it } from "vitest"

import type { CustomShellDb } from "@/server/db"
import { normalizeKeyword } from "@/lib/keyword-research"
import {
  assignClusterAnchors,
  listClustersForProject,
  rebuildClustersForProject,
  renameCluster,
  tokenizeKeyword,
  updateClusterStatus,
} from "@/server/keyword-clusters"
import { getProjectOverviewForUser } from "@/server/project-overview"
import { listProjectKeywordsForUser } from "@/server/project-keywords"
import { createProjectForUser } from "@/server/seo-projects"
import {
  apiUsageLogs,
  customShellUsers,
  keywordMetrics,
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

async function seedKeyword(
  keyword: string,
  metrics: {
    searchVolume?: number | null
    keywordDifficulty?: number | null
    intent?: string | null
  } = {},
  status = "new"
) {
  const [keywordRow] = await database
    .insert(keywords)
    .values({
      keyword,
      normalizedKeyword: normalizeKeyword(keyword),
      locationCode: 2840,
      languageCode: "en",
    })
    .returning()
  await database.insert(keywordMetrics).values({
    keywordId: keywordRow!.id,
    sourceEndpoint: "test",
    searchVolume: metrics.searchVolume ?? null,
    keywordDifficulty: metrics.keywordDifficulty ?? null,
    intent: metrics.intent ?? null,
  })
  const [projectKeyword] = await database
    .insert(projectKeywords)
    .values({
      projectId,
      keywordId: keywordRow!.id,
      source: "seed_research",
      status,
      opportunityScore: metrics.searchVolume ?? null,
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

describe("tokenizeKeyword", () => {
  it("drops stopwords and short tokens, strips plurals", () => {
    expect(tokenizeKeyword("best plumbers near me in Toronto")).toEqual([
      "plumber",
      "toronto",
    ])
    expect(tokenizeKeyword("how to fix a tap")).toEqual(["fix", "tap"])
    expect(tokenizeKeyword("glass business")).toEqual(["glass", "business"])
  })
})

describe("assignClusterAnchors", () => {
  it("groups keywords by their most frequent shared token", () => {
    const clusters = assignClusterAnchors([
      { id: "1", keyword: "emergency plumber" },
      { id: "2", keyword: "plumber toronto" },
      { id: "3", keyword: "cheap plumber toronto" },
      { id: "4", keyword: "drain cleaning" },
      { id: "5", keyword: "the and of" },
    ])
    expect(clusters.get("plumber")).toEqual(["1", "2", "3"])
    expect(clusters.get("other")).toEqual(["5"])
    // Frequency tie between "drain" and "cleaning" breaks to the longer token.
    expect(clusters.get("cleaning")).toEqual(["4"])
  })
})

describe("cluster rebuild and listing", () => {
  beforeEach(async () => {
    await seedKeyword("emergency plumber", {
      searchVolume: 500,
      keywordDifficulty: 30,
      intent: "transactional",
    })
    await seedKeyword("plumber toronto", {
      searchVolume: 1000,
      keywordDifficulty: 40,
      intent: "commercial",
    })
    await seedKeyword("drain cleaning service", { searchVolume: 200 })
    await seedKeyword("plumber spam", { searchVolume: 50 }, "ignored")
  })

  it("builds clusters excluding ignored keywords and replaces them on rerun", async () => {
    const first = await rebuildClustersForProject(userId, projectId, database)
    expect(first.keywords).toBe(3)
    expect(first.clusters).toBeGreaterThanOrEqual(2)

    const list = await listClustersForProject(
      userId,
      { projectId, pagination: { page: 1, pageSize: 10 } },
      database
    )
    const plumber = list.rows.find((row) => row.name === "plumber")
    expect(plumber).toMatchObject({
      keywordCount: 2,
      totalVolume: 1500,
      avgDifficulty: 35,
      bestOpportunity: 1000,
      topKeyword: "plumber toronto",
    })
    // Ignored keyword stays unclustered.
    expect(list.unclusteredCount).toBe(0)

    const second = await rebuildClustersForProject(userId, projectId, database)
    expect(second.clusters).toBe(first.clusters)
    const relisted = await listClustersForProject(
      userId,
      { projectId, pagination: { page: 1, pageSize: 10 } },
      database
    )
    expect(relisted.total).toBe(second.clusters)
  })

  it("filters member keywords by clusterId and applies bulk status", async () => {
    await rebuildClustersForProject(userId, projectId, database)
    const list = await listClustersForProject(
      userId,
      { projectId, pagination: { page: 1, pageSize: 10 } },
      database
    )
    const plumber = list.rows.find((row) => row.name === "plumber")!

    const members = await listProjectKeywordsForUser(
      userId,
      {
        projectId,
        filters: { clusterId: plumber.id },
        pagination: { page: 1, pageSize: 10 },
      },
      database
    )
    expect(members.total).toBe(2)

    const result = await updateClusterStatus(
      userId,
      projectId,
      plumber.id,
      "planned",
      database
    )
    expect(result.updated).toBe(2)
    const planned = await listProjectKeywordsForUser(
      userId,
      {
        projectId,
        filters: { status: ["planned"] },
        pagination: { page: 1, pageSize: 10 },
      },
      database
    )
    expect(planned.total).toBe(2)
  })

  it("renames clusters and enforces ownership", async () => {
    await rebuildClustersForProject(userId, projectId, database)
    const list = await listClustersForProject(
      userId,
      { projectId, pagination: { page: 1, pageSize: 10 } },
      database
    )
    const cluster = list.rows[0]!

    await renameCluster(userId, projectId, cluster.id, "Plumbing", database)
    const renamed = await listClustersForProject(
      userId,
      { projectId, q: "Plumbing", pagination: { page: 1, pageSize: 10 } },
      database
    )
    expect(renamed.total).toBe(1)

    await expect(
      rebuildClustersForProject(otherUserId, projectId, database)
    ).rejects.toThrow("not found")
    await expect(
      renameCluster(otherUserId, projectId, cluster.id, "X", database)
    ).rejects.toThrow("not found")
  })
})

describe("project overview", () => {
  it("aggregates status counts, rankings, clusters, and usage", async () => {
    const tracked = await seedKeyword(
      "emergency plumber",
      { searchVolume: 500, intent: "transactional" },
      "saved"
    )
    await seedKeyword("plumber toronto", { searchVolume: 1000 }, "planned")
    await seedKeyword("drain cleaning", { searchVolume: 100 })

    // Track one keyword and give it two ranking checks.
    const { setKeywordTracking } = await import("@/server/rank-tracker")
    await setKeywordTracking(
      userId,
      projectId,
      [tracked.projectKeywordId],
      true,
      database
    )
    await database.insert(keywordRankings).values([
      {
        projectId,
        keywordId: tracked.keywordId,
        position: 12,
        checkedAt: new Date(Date.now() - 86400000),
      },
      {
        projectId,
        keywordId: tracked.keywordId,
        position: 6,
        checkedAt: new Date(),
      },
    ])

    await database.insert(apiUsageLogs).values({
      userId,
      projectId,
      provider: "dataforseo",
      endpoint: "/v3/test",
      cost: "0.05",
      success: true,
    })

    await rebuildClustersForProject(userId, projectId, database)

    const overview = await getProjectOverviewForUser(
      userId,
      projectId,
      database
    )
    expect(overview.totalKeywords).toBe(3)
    expect(overview.statusCounts.saved).toBe(1)
    expect(overview.statusCounts.planned).toBe(1)
    expect(overview.statusCounts.new).toBe(1)
    expect(overview.trackedCount).toBe(1)
    expect(overview.averagePosition).toBe(6)
    expect(overview.topTenCount).toBe(1)
    expect(overview.clusterCount).toBeGreaterThanOrEqual(2)
    expect(overview.usage.totalCost).toBeCloseTo(0.05)
    expect(overview.usage.requestCount).toBe(1)
    expect(overview.topOpportunities.length).toBe(3)
    expect(overview.scheduleFrequency).toBe("manual")

    await expect(
      getProjectOverviewForUser(otherUserId, projectId, database)
    ).rejects.toThrow("not found")
  })
})
