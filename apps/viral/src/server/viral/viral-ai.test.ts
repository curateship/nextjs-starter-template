import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { now, uuid } from "@/server/auth/security"
import { type CustomShellDb } from "@/server/db"
import { customShellAiUsageEvents, type CustomShellUser } from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"
import {
  viralProjectKeywords,
  viralProjectResults,
  viralProjects,
  viralVideos,
} from "@/server/viral/schema"
import { suggestKeywords } from "@/server/viral/keyword-ideas"
import { createViralProject } from "@/server/viral/projects"
import { matchTopics } from "@/server/viral/topic-match"

const asked = vi.hoisted(() => ({
  calls: [] as { feature: string; metadata: Record<string, unknown>; prompt: string }[],
  answer: null as unknown,
}))

// A fake writer: it writes down every question and answers with what the
// test set, checked against the schema the way a real writer's answer is.
vi.mock("@/server/viral/writer", () => ({
  askWriter: async ({
    feature,
    metadata,
    prompt,
    schema,
  }: {
    feature: string
    metadata: Record<string, unknown>
    prompt: string
    schema: { parse: (value: unknown) => unknown }
  }) => {
    asked.calls.push({ feature, metadata, prompt })
    return schema.parse(asked.answer)
  },
}))

let client: PGlite
let database: CustomShellDb
let user: CustomShellUser

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  user = await insertUser(database)
  asked.calls = []
  asked.answer = null
})

afterEach(async () => {
  await client.close()
})

async function newProject(description = "Short workout tips for busy people over 30") {
  return createViralProject(user.id, {
    name: "Gym tips",
    description,
    keywords: ["gym tips"],
    folderId: null,
  })
}

/** What an AI call already cost this project, as the meter would write it. */
async function spent(projectId: string, cents: number) {
  await database.insert(customShellAiUsageEvents).values({
    id: uuid(),
    userId: user.id,
    provider: "gemini",
    model: "gemini-3.8-flash",
    feature: "viral_topic_match",
    inputTokens: 1,
    outputTokens: 1,
    costCents: cents,
    status: "success",
    monthStart: new Date().toISOString().slice(0, 10),
    metadata: { viralProjectId: projectId },
    createdAt: now(),
  })
}

describe("keyword ideas", () => {
  it("never repeats a keyword already on the project, and stops at eight", async () => {
    asked.answer = {
      keywords: ["Gym Tips", "home workout", "#desk stretches", "posture fix", "a", "b", "c", "d", "e", "f"],
    }
    const ideas = await suggestKeywords(user.id, {
      description: "Short workout tips for busy people over 30",
      existing: ["gym tips"],
      projectId: null,
    })
    expect(ideas).toHaveLength(8)
    expect(ideas).not.toContain("Gym Tips")
    expect(ideas).toContain("desk stretches")
    expect(asked.calls[0].feature).toBe("viral_keyword_ideas")
  })

  it("asks for a description first", async () => {
    await expect(
      suggestKeywords(user.id, { description: "gym", existing: [], projectId: null })
    ).rejects.toThrow("Describe the niche")
    expect(asked.calls).toHaveLength(0)
  })

  it("counts against a project's spend limit and refuses past it", async () => {
    const project = await newProject()
    await database
      .update(viralProjects)
      .set({ spendLimitCents: 1 })
      .where(eq(viralProjects.id, project.id))
    await spent(project.id, 1)
    await expect(
      suggestKeywords(user.id, {
        description: project.description,
        existing: [],
        projectId: project.id,
      })
    ).rejects.toThrow("This project has spent $0.01 of its $0.01 limit")
    expect(asked.calls).toHaveLength(0)
  })
})

describe("how on-topic each video is", () => {
  async function addResult(projectId: string, platformVideoId: string, title: string) {
    const [keyword] = await database
      .select({ id: viralProjectKeywords.id })
      .from(viralProjectKeywords)
      .where(eq(viralProjectKeywords.projectId, projectId))
    await database.insert(viralProjectResults).values({
      id: uuid(),
      keywordId: keyword.id,
      projectId,
      platform: "youtube",
      platformVideoId,
      url: `https://www.youtube.com/shorts/${platformVideoId}`,
      title,
      channelId: "UCchannel",
      channelName: "Channel",
      views: 1000,
      durationSeconds: 30,
      foundAt: now(),
    })
  }

  async function projectRow(projectId: string) {
    const [row] = await database
      .select()
      .from(viralProjects)
      .where(eq(viralProjects.id, projectId))
    return row
  }

  it("asks once for every unmatched title and stores the numbers", async () => {
    const project = await newProject()
    await addResult(project.id, "a", "5 minute desk workout")
    await addResult(project.id, "b", "Bass fishing hooks explained")
    asked.answer = { matches: [{ n: 1, match: 92 }, { n: 2, match: 4 }] }

    expect(await matchTopics(await projectRow(project.id))).toBe(2)
    expect(asked.calls).toHaveLength(1)
    expect(asked.calls[0].metadata).toEqual({ viralProjectId: project.id })
    const rows = await database.select().from(viralProjectResults)
    expect(Object.fromEntries(rows.map((row) => [row.platformVideoId, row.topicMatch]))).toEqual({
      a: 92,
      b: 4,
    })

    // Looking again asks nothing: every title already has its number.
    expect(await matchTopics(await projectRow(project.id))).toBe(0)
    expect(asked.calls).toHaveLength(1)
  })

  it("skips a project with no description", async () => {
    const project = await newProject("")
    await addResult(project.id, "a", "Anything")
    expect(await matchTopics(await projectRow(project.id))).toBe(0)
    expect(asked.calls).toHaveLength(0)
  })
})

describe("reading where saved videos have got to", () => {
  it("answers for this person's videos only", async () => {
    const { listSavedVideoStatuses } = await import("@/server/viral/saved-videos")
    const other = await insertUser(database)
    const at = now()
    for (const [id, ownerId, status] of [
      ["mine", user.id, "analysing"],
      ["theirs", other.id, "downloading"],
    ] as const) {
      await database.insert(viralVideos).values({
        id,
        ownerId,
        platform: "youtube",
        platformVideoId: id,
        sourceUrl: `https://www.youtube.com/shorts/${id}`,
        status,
        createdAt: at,
        updatedAt: at,
      })
    }
    expect(await listSavedVideoStatuses(user.id, ["mine", "theirs"])).toEqual([
      { id: "mine", status: "analysing" },
    ])
  })
})
