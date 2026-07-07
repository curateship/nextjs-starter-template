import { readFile } from "node:fs/promises"

import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/pglite"
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest"

import type { CustomShellDb } from "@/server/db"
import { normalizeIntersectionItem } from "@/server/backlink-jobs"
import {
  addManualProspect,
  createBacklinkDiscoveryJobForUser,
  deleteProspect,
  exportProspectsCsv,
  getBacklinkSummary,
  getProspectStatusCounts,
  listProspectsForProject,
  updateProspect,
} from "@/server/backlinks"
import { dataForSeoPost } from "@/server/dataforseo"
import { runKeywordJob } from "@/server/keyword-jobs"
import { addCompetitorToProject, createProjectForUser } from "@/server/seo-projects"
import {
  backlinkProspects,
  customShellUsers,
  keywordJobs,
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

beforeEach(async () => {
  vi.clearAllMocks()

  const client = new PGlite()
  for (const file of [
    "0000_custom_shell_baseline.sql",
    "0003_custom_shell_workspaces.sql",
    "0004_keyword_research.sql",
    "0005_rank_tracker.sql",
    "0006_clusters_schedules.sql",
    "0007_workspace_projects.sql",
    "0008_ranking_alerts.sql",
    "0009_backlink_builder.sql",
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
  await addCompetitorToProject(userId, projectId, "compa.com", database)
})

function intersectionResponse(
  items: Array<Record<string, unknown>>
) {
  return {
    status_code: 20000,
    status_message: "Ok",
    cost: 0.02,
    tasks: [
      {
        status_code: 20000,
        status_message: "Ok",
        cost: 0.02,
        result: [{ items }],
      },
    ],
  }
}

function summaryResponse(overrides: Record<string, unknown> = {}) {
  return {
    status_code: 20000,
    status_message: "Ok",
    cost: 0.01,
    tasks: [
      {
        status_code: 20000,
        status_message: "Ok",
        cost: 0.01,
        result: [
          {
            target: "example.com",
            rank: 41,
            backlinks: 1200,
            referring_domains: 128,
            referring_pages: 500,
            broken_backlinks: 3,
            ...overrides,
          },
        ],
      },
    ],
  }
}

const defaultItems = [
  {
    domain: "blog.acme.com",
    "1": { backlinks: 12, rank: 72 },
  },
  // The project's own domain and the competitors themselves are excluded.
  { domain: "example.com", "1": { backlinks: 3, rank: 10 } },
  { domain: "compa.com", "1": { backlinks: 99, rank: 80 } },
  // Duplicate referring domain is deduped.
  { domain: "www.blog.acme.com", "1": { backlinks: 1, rank: 70 } },
  { domain: "dev.to", "1": { backlinks: 4, main_domain_rank: 91 } },
]

async function runDiscoveryJob(items = defaultItems) {
  const mock = dataForSeoPost as Mock
  mock.mockImplementation((path: string) => {
    if (path.includes("domain_intersection")) {
      return Promise.resolve(intersectionResponse(items))
    }
    return Promise.resolve(summaryResponse())
  })

  const [job] = await database
    .insert(keywordJobs)
    .values({
      userId,
      projectId,
      type: "backlink_discovery",
      status: "pending",
      input: { limit: 100 },
    })
    .returning()
  await runKeywordJob(job!.id, database)
  const [finished] = await database
    .select()
    .from(keywordJobs)
    .where(eq(keywordJobs.id, job!.id))
  return finished!
}

describe("normalizeIntersectionItem", () => {
  const targets = { "1": "compa.com", "2": "compb.com" }

  it("sums backlinks and takes the best rank across targets", () => {
    const prospect = normalizeIntersectionItem(
      {
        domain: "Blog.Acme.com",
        "1": { backlinks: 10, rank: 70 },
        "2": { backlinks: 5, main_domain_rank: 72 },
      },
      targets
    )
    expect(prospect).toEqual({
      referringDomain: "Blog.Acme.com",
      normalizedDomain: "blog.acme.com",
      domainRank: 72,
      backlinksCount: 15,
      referringTo: ["compa.com", "compb.com"],
    })
  })

  it("only reports targets present on the item", () => {
    const prospect = normalizeIntersectionItem(
      { domain: "dev.to", "2": { backlinks: 4, rank: 91 } },
      targets
    )
    expect(prospect).toMatchObject({
      referringTo: ["compb.com"],
      backlinksCount: 4,
      domainRank: 91,
    })
  })

  it("skips items without a domain and tolerates missing summaries", () => {
    expect(normalizeIntersectionItem({}, targets)).toBeNull()
    expect(
      normalizeIntersectionItem({ domain: "dev.to" }, targets)
    ).toMatchObject({ backlinksCount: null, domainRank: null, referringTo: [] })
  })
})

describe("runBacklinkDiscovery", () => {
  it("stores normalized prospects and the own-profile snapshot", async () => {
    const job = await runDiscoveryJob()
    expect(job.status).toBe("completed")
    expect(job.errorMessage).toBeNull()

    const { rows, total } = await listProspectsForProject(
      userId,
      { projectId, pagination: { page: 1, pageSize: 10 } },
      database
    )
    expect(total).toBe(2)
    expect(rows.map((row) => row.normalizedDomain).sort()).toEqual([
      "blog.acme.com",
      "dev.to",
    ])
    const acme = rows.find((row) => row.normalizedDomain === "blog.acme.com")!
    expect(acme).toMatchObject({
      domainRank: 72,
      backlinksCount: 12,
      referringTo: ["compa.com"],
      status: "new",
      discoveredVia: "domain_intersection",
    })

    const summary = await getBacklinkSummary(userId, projectId, database)
    expect(summary).toMatchObject({
      target: "example.com",
      domainRank: 41,
      backlinks: 1200,
      referringDomains: 128,
      referringPages: 500,
      brokenBacklinks: 3,
    })
  })

  it("preserves pipeline edits on re-run and adds new prospects", async () => {
    await runDiscoveryJob()
    const { rows } = await listProspectsForProject(
      userId,
      { projectId, pagination: { page: 1, pageSize: 10 } },
      database
    )
    const acme = rows.find((row) => row.normalizedDomain === "blog.acme.com")!
    await updateProspect(
      userId,
      projectId,
      acme.id,
      {
        status: "contacted",
        contactEmail: "editor@blog.acme.com",
        notes: "replied 7/3, sending draft",
      },
      database
    )

    await runDiscoveryJob([
      ...defaultItems,
      { domain: "news.ycombinator.com", "1": { backlinks: 2, rank: 93 } },
    ])

    const after = await listProspectsForProject(
      userId,
      { projectId, pagination: { page: 1, pageSize: 10 } },
      database
    )
    expect(after.total).toBe(3)
    const acmeAfter = after.rows.find(
      (row) => row.normalizedDomain === "blog.acme.com"
    )!
    expect(acmeAfter).toMatchObject({
      status: "contacted",
      contactEmail: "editor@blog.acme.com",
      notes: "replied 7/3, sending draft",
    })
    expect(
      after.rows.find((row) => row.normalizedDomain === "news.ycombinator.com")
    ).toMatchObject({ status: "new" })
  })

  async function runDiscoveryWith(
    impl: (path: string) => Promise<unknown>
  ) {
    ;(dataForSeoPost as Mock).mockImplementation(impl)
    const [job] = await database
      .insert(keywordJobs)
      .values({
        userId,
        projectId,
        type: "backlink_discovery",
        status: "pending",
        input: { limit: 100 },
      })
      .returning()
    await runKeywordJob(job!.id, database)
    const [finished] = await database
      .select()
      .from(keywordJobs)
      .where(eq(keywordJobs.id, job!.id))
    return finished!
  }

  it("fails the job when both requests fail", async () => {
    const finished = await runDiscoveryWith(() =>
      Promise.reject(new Error("DataForSEO error 40200: payment required"))
    )
    expect(finished.status).toBe("failed")
    expect(finished.errorMessage).toContain("payment required")
  })

  it("fails the job when the prospect-discovery call fails, even if the summary succeeds", async () => {
    // A "completed" job with zero prospects and a hidden warning would mislead
    // the user into thinking discovery ran and found nothing.
    const finished = await runDiscoveryWith((path) =>
      path.includes("domain_intersection")
        ? Promise.reject(new Error("DataForSEO error 40501: rate limited"))
        : Promise.resolve(summaryResponse())
    )
    expect(finished.status).toBe("failed")
    expect(finished.errorMessage).toContain("rate limited")
  })

  it("completes as a partial success when only the summary refresh fails", async () => {
    const finished = await runDiscoveryWith((path) =>
      path.includes("domain_intersection")
        ? Promise.resolve(intersectionResponse(defaultItems))
        : Promise.reject(new Error("DataForSEO error 40501: rate limited"))
    )
    expect(finished.status).toBe("completed")
    expect(finished.currentStep).toContain("1 failed")
    // Prospects from the successful discovery call were still saved.
    const { total } = await listProspectsForProject(
      userId,
      { projectId, pagination: { page: 1, pageSize: 10 } },
      database
    )
    expect(total).toBe(2)
  })
})

describe("createBacklinkDiscoveryJobForUser guards", () => {
  it("requires a project domain", async () => {
    const bare = await createProjectForUser(
      userId,
      { name: "No Domain", locationCode: 2840, languageCode: "en" },
      database
    )
    await expect(
      createBacklinkDiscoveryJobForUser(userId, bare.id, {}, database)
    ).rejects.toThrow("Set a domain")
  })

  it("requires at least one competitor", async () => {
    const lonely = await createProjectForUser(
      userId,
      {
        name: "Lonely",
        domain: "lonely.com",
        locationCode: 2840,
        languageCode: "en",
      },
      database
    )
    await expect(
      createBacklinkDiscoveryJobForUser(userId, lonely.id, {}, database)
    ).rejects.toThrow("competitor")
  })

  it("rejects other users' projects", async () => {
    await expect(
      createBacklinkDiscoveryJobForUser(otherUserId, projectId, {}, database)
    ).rejects.toThrow("Project not found")
  })
})

describe("prospect pipeline", () => {
  it("moves a prospect through statuses and filters by status", async () => {
    const prospect = await addManualProspect(
      userId,
      projectId,
      { domain: "dev.to" },
      database
    )
    expect(prospect.status).toBe("new")
    expect(prospect.discoveredVia).toBe("manual")

    for (const status of ["qualified", "contacted", "replied", "won"] as const) {
      const updated = await updateProspect(
        userId,
        projectId,
        prospect.id,
        { status },
        database
      )
      expect(updated.status).toBe(status)
    }

    const won = await listProspectsForProject(
      userId,
      { projectId, status: ["won"], pagination: { page: 1, pageSize: 10 } },
      database
    )
    expect(won.total).toBe(1)

    const counts = await getProspectStatusCounts(userId, projectId, database)
    expect(counts).toMatchObject({ won: 1, new: 0 })
  })

  it("rejects duplicate manual prospects", async () => {
    await addManualProspect(userId, projectId, { domain: "dev.to" }, database)
    await expect(
      addManualProspect(userId, projectId, { domain: "https://dev.to/" }, database)
    ).rejects.toThrow("already in the prospect list")
  })

  it("deletes prospects", async () => {
    const prospect = await addManualProspect(
      userId,
      projectId,
      { domain: "dev.to" },
      database
    )
    await deleteProspect(userId, projectId, prospect.id, database)
    expect(await database.select().from(backlinkProspects)).toHaveLength(0)
    await expect(
      deleteProspect(userId, projectId, prospect.id, database)
    ).rejects.toThrow("Prospect not found")
  })

  it("rejects other users' projects on every mutation", async () => {
    const prospect = await addManualProspect(
      userId,
      projectId,
      { domain: "dev.to" },
      database
    )
    await expect(
      listProspectsForProject(
        otherUserId,
        { projectId, pagination: { page: 1, pageSize: 10 } },
        database
      )
    ).rejects.toThrow("Project not found")
    await expect(
      updateProspect(
        otherUserId,
        projectId,
        prospect.id,
        { status: "won" },
        database
      )
    ).rejects.toThrow("Project not found")
    await expect(
      deleteProspect(otherUserId, projectId, prospect.id, database)
    ).rejects.toThrow("Project not found")
    await expect(
      getProspectStatusCounts(otherUserId, projectId, database)
    ).rejects.toThrow("Project not found")
    await expect(
      getBacklinkSummary(otherUserId, projectId, database)
    ).rejects.toThrow("Project not found")
    await expect(
      exportProspectsCsv(otherUserId, projectId, database)
    ).rejects.toThrow("Project not found")
  })
})

describe("exportProspectsCsv", () => {
  it("escapes quotes, commas, and formula prefixes", async () => {
    const prospect = await addManualProspect(
      userId,
      projectId,
      { domain: "dev.to" },
      database
    )
    await updateProspect(
      userId,
      projectId,
      prospect.id,
      { notes: '=SUM(A1), said "maybe"' },
      database
    )

    const { filename, csv } = await exportProspectsCsv(
      userId,
      projectId,
      database
    )
    expect(filename).toMatch(/^backlink-prospects-\d{4}-\d{2}-\d{2}\.csv$/)

    const lines = csv.split("\r\n")
    expect(lines[0]).toBe(
      "referring_domain,domain_rank,backlinks_count,referring_to,status,contact_url,contact_email,notes,discovered_via,created_at"
    )
    // Leading apostrophe defuses the formula; embedded quotes are doubled.
    expect(lines[1]).toContain('"\'=SUM(A1), said ""maybe"""')
  })
})
