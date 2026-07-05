import { readFile } from "node:fs/promises"

import { PGlite } from "@electric-sql/pglite"
import { drizzle } from "drizzle-orm/pglite"
import { beforeEach, describe, expect, it } from "vitest"

import type { CustomShellDb } from "@/server/db"
import {
  calculateOpportunityScore,
  calculateTrendScore,
  isValidAdsKeyword,
  isValidDomain,
  normalizeDomain,
  normalizeKeyword,
  suggestGapAction,
  suggestPageType,
} from "@/lib/keyword-research"
import { buildBasicAuthHeader, hashPayload } from "@/server/dataforseo"
import { scoreProjectKeywords } from "@/server/keyword-jobs"
import {
  exportProjectKeywordsCsvForUser,
  listProjectKeywordsForUser,
  updateProjectKeywordStatusForUser,
} from "@/server/project-keywords"
import {
  addCompetitorToProject,
  createProjectForUser,
  listLanguageOptions,
  listLocationOptions,
  updateProjectForUser,
} from "@/server/seo-projects"
import {
  customShellUsers,
  keywordMetrics,
  keywords,
  projectKeywords,
} from "@/server/schema"
import * as schema from "@/server/schema"

let database: CustomShellDb
let userId: string
let otherUserId: string

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
})

describe("keyword normalization", () => {
  it("normalizes keywords", () => {
    expect(normalizeKeyword("  Best   PLUMBER  ")).toBe("best plumber")
  })

  it("validates keywords for Google Ads", () => {
    expect(isValidAdsKeyword("plumber toronto")).toBe(true)
    expect(isValidAdsKeyword("a".repeat(81))).toBe(false)
    expect(isValidAdsKeyword("one two three four five six seven eight nine ten eleven")).toBe(
      false
    )
  })

  it("normalizes domains", () => {
    expect(normalizeDomain("https://www.Example.com/path?q=1")).toBe(
      "example.com"
    )
    expect(isValidDomain("example.com")).toBe(true)
    expect(isValidDomain("not a domain")).toBe(false)
    expect(isValidDomain("example")).toBe(false)
  })
})

describe("trend score", () => {
  it("returns 50 with insufficient data", () => {
    expect(calculateTrendScore(null)).toBe(50)
    expect(
      calculateTrendScore([{ year: 2026, month: 1, search_volume: 10 }])
    ).toBe(50)
  })

  it("detects a rising trend", () => {
    const months = [10, 10, 10, 20, 20, 20].map((volume, index) => ({
      year: 2026,
      month: index + 1,
      search_volume: volume,
    }))
    expect(calculateTrendScore(months)).toBe(100)
  })

  it("returns 80 when volume appears from zero", () => {
    const months = [0, 0, 0, 5, 5, 5].map((volume, index) => ({
      year: 2026,
      month: index + 1,
      search_volume: volume,
    }))
    expect(calculateTrendScore(months)).toBe(80)
  })
})

describe("opportunity score", () => {
  it("stays within 0-100 and handles missing data", () => {
    const { score, explanation } = calculateOpportunityScore({
      searchVolume: null,
      keywordDifficulty: null,
      intent: "unknown",
      trendScore: null,
      cpc: null,
      maxProjectVolume: 1000,
      maxProjectCpc: 10,
    })
    expect(score).toBeGreaterThanOrEqual(0)
    expect(score).toBeLessThanOrEqual(100)
    expect(explanation.reasons.length).toBeGreaterThan(0)
  })

  it("scores strong keywords higher", () => {
    const strong = calculateOpportunityScore({
      searchVolume: 1000,
      keywordDifficulty: 10,
      intent: "transactional",
      trendScore: 80,
      cpc: 10,
      maxProjectVolume: 1000,
      maxProjectCpc: 10,
    })
    const weak = calculateOpportunityScore({
      searchVolume: 5,
      keywordDifficulty: 95,
      intent: "navigational",
      trendScore: 20,
      cpc: 0.1,
      maxProjectVolume: 1000,
      maxProjectCpc: 10,
    })
    expect(strong.score).toBeGreaterThan(weak.score)
  })
})

describe("page type and gap suggestions", () => {
  it("suggests page types by intent and modifiers", () => {
    expect(
      suggestPageType({ keyword: "plumber near me", intent: "transactional" })
    ).toBe("local_service_page")
    expect(
      suggestPageType({ keyword: "buy shoes online", intent: "transactional" })
    ).toBe("service_or_landing_page")
    expect(
      suggestPageType({ keyword: "best crm software", intent: "commercial" })
    ).toBe("comparison_page")
    expect(
      suggestPageType({ keyword: "how to fix a leak", intent: "informational" })
    ).toBe("faq_or_blog_post")
  })

  it("suggests gap actions", () => {
    expect(
      suggestGapAction({
        intent: "transactional",
        keywordDifficulty: 20,
        searchVolume: 500,
        ourRank: null,
        competitorRank: 3,
      })
    ).toBe("Create landing/service page")
    expect(
      suggestGapAction({
        intent: "informational",
        keywordDifficulty: 20,
        searchVolume: 500,
        ourRank: null,
        competitorRank: 3,
      })
    ).toBe("Create blog/guide")
    expect(
      suggestGapAction({
        intent: "commercial",
        keywordDifficulty: 90,
        searchVolume: 20,
        ourRank: null,
        competitorRank: 1,
      })
    ).toBe("Deprioritize")
    expect(
      suggestGapAction({
        intent: "commercial",
        keywordDifficulty: 30,
        searchVolume: 500,
        ourRank: 15,
        competitorRank: 2,
      })
    ).toBe("Improve existing page")
  })
})

describe("DataForSEO client helpers", () => {
  it("builds a basic auth header", () => {
    expect(buildBasicAuthHeader("login", "password")).toBe(
      `Basic ${Buffer.from("login:password").toString("base64")}`
    )
  })

  it("hashes payloads deterministically", () => {
    const payload = [{ keyword: "a", location_code: 2840 }]
    expect(hashPayload(payload)).toBe(hashPayload(payload))
    expect(hashPayload(payload)).not.toBe(hashPayload([{ keyword: "b" }]))
    expect(hashPayload(payload)).toMatch(/^[a-f0-9]{64}$/)
  })
})

describe("projects and competitors", () => {
  it("creates a project with normalized domain and location names", async () => {
    const project = await createProjectForUser(
      userId,
      {
        name: "My Site",
        domain: "https://www.Example.com/page",
        locationCode: 2840,
        languageCode: "en",
      },
      database
    )
    expect(project.normalizedDomain).toBe("example.com")
    expect(project.locationName).toBe("United States")
    expect(project.languageName).toBe("English")
  })

  it("rejects invalid domains", async () => {
    await expect(
      createProjectForUser(
        userId,
        {
          name: "Bad",
          domain: "not a domain",
          locationCode: 2840,
          languageCode: "en",
        },
        database
      )
    ).rejects.toThrow("valid domain")
  })

  it("creates a project with no domain", async () => {
    const project = await createProjectForUser(
      userId,
      { name: "Blank", locationCode: 2840, languageCode: "en" },
      database
    )
    expect(project.domain).toBeNull()
    expect(project.normalizedDomain).toBeNull()
    expect(project.locationName).toBe("United States")
  })

  it("resolves and links a project for the current workspace", async () => {
    const { getProjectForCurrentWorkspace } = await import(
      "@/server/seo-projects"
    )
    const { getOrCreateCurrentWorkspace } = await import("@/server/workspaces")

    const workspace = await getOrCreateCurrentWorkspace(userId, database)
    const project = await getProjectForCurrentWorkspace(userId, database)
    expect(project.workspaceId).toBe(workspace.id)
    expect(project.name).toBe(workspace.name)
    expect(project.domain).toBeNull()

    // Repeat calls return the same project (no duplicate).
    const again = await getProjectForCurrentWorkspace(userId, database)
    expect(again.id).toBe(project.id)

    // Name syncs when the workspace is renamed.
    const { customShellWorkspaces } = await import("@/server/schema")
    const { eq } = await import("drizzle-orm")
    await database
      .update(customShellWorkspaces)
      .set({ name: "Renamed", updatedAt: new Date() })
      .where(eq(customShellWorkspaces.id, workspace.id))
    const synced = await getProjectForCurrentWorkspace(userId, database)
    expect(synced.id).toBe(project.id)
    expect(synced.name).toBe("Renamed")
  })

  it("rejects duplicate competitors and the project domain", async () => {
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
    await addCompetitorToProject(userId, project.id, "rival.com", database)
    await expect(
      addCompetitorToProject(userId, project.id, "https://rival.com", database)
    ).rejects.toThrow("already added")
    await expect(
      addCompetitorToProject(userId, project.id, "www.example.com", database)
    ).rejects.toThrow("cannot match")
  })

  it("enforces project ownership", async () => {
    const project = await createProjectForUser(
      userId,
      {
        name: "Mine",
        domain: "example.com",
        locationCode: 2840,
        languageCode: "en",
      },
      database
    )
    await expect(
      updateProjectForUser(otherUserId, project.id, { name: "Stolen" }, database)
    ).rejects.toThrow("not found")
  })

  it("lists seeded locations and languages", async () => {
    const locations = await listLocationOptions(database)
    expect(locations.length).toBeGreaterThan(5)
    const languages = await listLanguageOptions(2124, database)
    expect(languages.map((language) => language.languageCode).sort()).toEqual([
      "en",
      "fr",
    ])
  })
})

async function seedKeyword(
  projectId: string,
  keyword: string,
  metrics: {
    searchVolume?: number | null
    keywordDifficulty?: number | null
    intent?: string | null
    cpc?: string | null
    trendScore?: number | null
    competitionLevel?: string | null
  },
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
    cpc: metrics.cpc ?? null,
    trendScore: metrics.trendScore ?? null,
    competitionLevel: metrics.competitionLevel ?? null,
  })
  const [projectKeyword] = await database
    .insert(projectKeywords)
    .values({
      projectId,
      keywordId: keywordRow!.id,
      source: "seed_research",
      status,
    })
    .returning()
  return projectKeyword!
}

describe("project keyword table", () => {
  let projectId: string

  beforeEach(async () => {
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
    await seedKeyword(projectId, "buy blue widgets", {
      searchVolume: 1000,
      keywordDifficulty: 20,
      intent: "transactional",
      cpc: "2.5000",
      trendScore: 70,
      competitionLevel: "HIGH",
    })
    await seedKeyword(projectId, "how to clean widgets", {
      searchVolume: 100,
      keywordDifficulty: 60,
      intent: "informational",
      cpc: "0.5000",
      trendScore: 50,
      competitionLevel: "LOW",
    })
    await seedKeyword(
      projectId,
      "widget spam",
      { searchVolume: 10 },
      "ignored"
    )
  })

  it("hides ignored keywords by default but shows them when requested", async () => {
    const result = await listProjectKeywordsForUser(
      userId,
      { projectId, pagination: { page: 1, pageSize: 10 } },
      database
    )
    expect(result.total).toBe(2)
    expect(result.rows.map((row) => row.keyword)).not.toContain("widget spam")

    const ignored = await listProjectKeywordsForUser(
      userId,
      {
        projectId,
        filters: { status: ["ignored"] },
        pagination: { page: 1, pageSize: 10 },
      },
      database
    )
    expect(ignored.total).toBe(1)
    expect(ignored.rows[0]?.keyword).toBe("widget spam")
  })

  it("combines filters and sorts server-side", async () => {
    const filtered = await listProjectKeywordsForUser(
      userId,
      {
        projectId,
        filters: { minVolume: 500, intent: ["transactional"] },
        pagination: { page: 1, pageSize: 10 },
      },
      database
    )
    expect(filtered.total).toBe(1)
    expect(filtered.rows[0]?.keyword).toBe("buy blue widgets")

    const sorted = await listProjectKeywordsForUser(
      userId,
      {
        projectId,
        sort: { field: "searchVolume", direction: "asc" },
        pagination: { page: 1, pageSize: 10 },
      },
      database
    )
    expect(sorted.rows[0]?.keyword).toBe("how to clean widgets")

    const question = await listProjectKeywordsForUser(
      userId,
      {
        projectId,
        filters: { questionOnly: true },
        pagination: { page: 1, pageSize: 10 },
      },
      database
    )
    expect(question.total).toBe(1)
    expect(question.rows[0]?.keyword).toBe("how to clean widgets")
  })

  it("blocks access for other users", async () => {
    await expect(
      listProjectKeywordsForUser(
        otherUserId,
        { projectId, pagination: { page: 1, pageSize: 10 } },
        database
      )
    ).rejects.toThrow("not found")
  })

  it("updates status in bulk", async () => {
    const list = await listProjectKeywordsForUser(
      userId,
      { projectId, pagination: { page: 1, pageSize: 10 } },
      database
    )
    const ids = list.rows.map((row) => row.id)
    const result = await updateProjectKeywordStatusForUser(
      userId,
      projectId,
      ids,
      "saved",
      database
    )
    expect(result.updated).toBe(2)
    const saved = await listProjectKeywordsForUser(
      userId,
      {
        projectId,
        filters: { status: ["saved"] },
        pagination: { page: 1, pageSize: 10 },
      },
      database
    )
    expect(saved.total).toBe(2)
  })

  it("scores project keywords with explanations", async () => {
    await scoreProjectKeywords(database, projectId)
    const result = await listProjectKeywordsForUser(
      userId,
      {
        projectId,
        sort: { field: "opportunityScore", direction: "desc" },
        pagination: { page: 1, pageSize: 10 },
      },
      database
    )
    expect(result.rows[0]?.keyword).toBe("buy blue widgets")
    for (const row of result.rows) {
      expect(row.opportunityScore).toBeGreaterThanOrEqual(0)
      expect(row.opportunityScore).toBeLessThanOrEqual(100)
    }
    expect(result.rows[0]?.suggestedPageType).toBe("service_or_landing_page")
  })

  it("exports CSV that respects filters and escapes values", async () => {
    const list = await listProjectKeywordsForUser(
      userId,
      {
        projectId,
        filters: { intent: ["transactional"] },
        pagination: { page: 1, pageSize: 1 },
      },
      database
    )
    await updateProjectKeywordPlanNotes(list.rows[0]!.id)

    const { csv, filename } = await exportProjectKeywordsCsvForUser(
      userId,
      {
        projectId,
        mode: "filtered",
        filters: { intent: ["transactional"] },
      },
      database
    )
    expect(filename).toMatch(/\.csv$/)
    const lines = csv.split("\r\n")
    expect(lines[0]).toContain("keyword,intent,search_volume")
    expect(lines).toHaveLength(2)
    expect(lines[1]).toContain('"notes, with ""quotes"""')
  })

  it("neutralizes spreadsheet formula injection in exported cells", async () => {
    const injected = await seedKeyword(projectId, "=HYPERLINK(evil)", {
      searchVolume: 10,
      intent: "transactional",
    })
    const { updateProjectKeywordPlanForUser } = await import(
      "@/server/project-keywords"
    )
    await updateProjectKeywordPlanForUser(
      userId,
      projectId,
      injected.id,
      { notes: "@SUM(A1)" },
      database
    )

    const { csv } = await exportProjectKeywordsCsvForUser(
      userId,
      { projectId, mode: "all" },
      database
    )
    const row = csv.split("\r\n").find((line) => line.includes("HYPERLINK"))
    expect(row).toBeDefined()
    // Formula triggers are prefixed with an apostrophe so spreadsheets treat
    // them as text, not formulas.
    expect(row!.startsWith("'=HYPERLINK(evil)")).toBe(true)
    expect(row).toContain("'@SUM(A1)")
  })

  async function updateProjectKeywordPlanNotes(projectKeywordId: string) {
    const { updateProjectKeywordPlanForUser } = await import(
      "@/server/project-keywords"
    )
    await updateProjectKeywordPlanForUser(
      userId,
      projectId,
      projectKeywordId,
      { notes: 'notes, with "quotes"' },
      database
    )
  }
})
