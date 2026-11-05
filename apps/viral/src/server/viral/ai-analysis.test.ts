import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ANALYSIS_FEATURES } from "@/lib/viral/analysis"
import { now, uuid } from "@/server/auth/security"
import { type CustomShellDb } from "@/server/db"
import { type CustomShellUser } from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"
import {
  analyseVideo,
  analysisPrice,
  listAnalyses,
  saveAnalysisNotes,
  writePendingAnalysis,
} from "@/server/viral/ai-analysis"
import { createViralProject } from "@/server/viral/projects"
import { viralAnalyses, viralVideos } from "@/server/viral/schema"

/**
 * Analyse with AI (task part 15), with a fake writer: four calls under four
 * meter names, a script refused unless it has every part, one analysis per
 * topic, and an Analyse pressed before the breakdown waits for it.
 */

const asked = vi.hoisted(() => ({
  calls: [] as { feature: string; metadata: Record<string, unknown>; prompt: string }[],
  answers: {} as Record<string, unknown>,
}))

vi.mock("@/server/viral/writer", () => ({
  WRITER_MODEL: "gemini-3.8-flash",
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
    return schema.parse(asked.answers[feature])
  },
}))

let client: PGlite
let database: CustomShellDb
let user: CustomShellUser

const BREAKDOWN = {
  transcript: [
    { startMs: 0, endMs: 2_000, text: "I wasted $4,000 before I learned this" },
    { startMs: 2_000, endMs: 9_000, text: "Here is what works" },
  ],
  segments: [
    { role: "hook", startMs: 0, endMs: 2_000, summary: "A loss that stops the scroll." },
    { role: "solution", startMs: 2_000, endMs: 9_000, summary: "The fix, shown." },
    { role: "cta", startMs: 9_000, endMs: 10_000, summary: "Follow for more." },
  ],
  scenes: [{ startMs: 0, endMs: 10_000 }],
}

function goodAnswers(scriptRoles = ["hook", "solution", "cta"]) {
  asked.answers = {
    [ANALYSIS_FEATURES.whyItWorks]: {
      hook: "Opens on a loss.",
      parts: [{ role: "hook", summary: "Loss" }],
      whySpread: "People share warnings.",
    },
    [ANALYSIS_FEATURES.script]: {
      script: scriptRoles.map((role) => ({ role, seconds: 3.4, words: `The ${role} for busy dads` })),
    },
    [ANALYSIS_FEATURES.ideas]: {
      ideas: [
        { idea: "One", hook: "Hook one" },
        { idea: "Two", hook: "Hook two" },
        { idea: "Three", hook: "Hook three" },
      ],
    },
    [ANALYSIS_FEATURES.title]: { title: "Meal prep in 10", caption: "Save this.", hashtags: ["mealprep", "#dads"] },
  }
}

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  user = await insertUser(database)
  asked.calls = []
  goodAnswers()
})

afterEach(async () => {
  await client.close()
})

async function project() {
  return createViralProject(user.id, {
    name: "Meal prep",
    description: "",
    topic: "meal-prep course for busy dads",
    socials: ["youtube"],
    keywords: [],
    folderId: null,
  })
}

async function savedVideo(status: "ready" | "downloading" = "ready") {
  const at = now()
  const id = uuid()
  await database.insert(viralVideos).values({
    id,
    ownerId: user.id,
    platform: "youtube",
    platformVideoId: "abc123def45",
    sourceUrl: "https://www.youtube.com/shorts/abc123def45",
    status,
    title: "I wasted $4,000",
    breakdown: status === "ready" ? BREAKDOWN : null,
    createdAt: at,
    updatedAt: at,
  })
  return id
}

describe("Analyse with AI", () => {
  it("writes the four pieces in four metered calls, for the topic asked", async () => {
    const made = await project()
    await savedVideo()
    const result = await analyseVideo(user.id, {
      projectId: made.id,
      url: "https://www.youtube.com/shorts/abc123def45",
      topic: "meal-prep course for busy dads",
    })
    expect(result.state).toBe("written")
    expect(asked.calls.map((call) => call.feature).sort()).toEqual(Object.values(ANALYSIS_FEATURES).filter((one) => one !== "viral_breakdown").sort())
    expect(asked.calls.every((call) => call.metadata.viralProjectId === made.id)).toBe(true)
    expect(asked.calls.find((call) => call.feature === ANALYSIS_FEATURES.script)?.prompt).toContain("busy dads")
    if (result.state !== "written") return
    expect(result.analysis.pieces.script.map((part) => part.role)).toEqual(["hook", "solution", "cta"])
    expect(result.analysis.pieces.script[0].seconds).toBe(3)
    expect(result.analysis.pieces.title.hashtags).toEqual(["#mealprep", "#dads"])
  })

  it("adds a second analysis for a second topic and keeps the first", async () => {
    const made = await project()
    const id = await savedVideo()
    const url = "https://www.youtube.com/shorts/abc123def45"
    await analyseVideo(user.id, { projectId: made.id, url, topic: "meal-prep course for busy dads" })
    await analyseVideo(user.id, { projectId: made.id, url, topic: "a gym for retirees" })
    const { analyses } = await listAnalyses(user.id, id)
    expect(analyses.map((one) => one.topic)).toEqual(["a gym for retirees", "meal-prep course for busy dads"])
  })

  it("refuses a script that leaves out one of the original's parts", async () => {
    const made = await project()
    await savedVideo()
    goodAnswers(["hook", "solution"])
    await expect(
      analyseVideo(user.id, { projectId: made.id, url: "https://www.youtube.com/shorts/abc123def45", topic: "dads" })
    ).rejects.toThrow('missing "The ask"')
    expect(await database.select().from(viralAnalyses)).toHaveLength(0)
  })

  it("waits for the breakdown, then the worker writes it once", async () => {
    const made = await project()
    const id = await savedVideo("downloading")
    const result = await analyseVideo(user.id, {
      projectId: made.id,
      url: "https://www.youtube.com/shorts/abc123def45",
      topic: "busy dads",
    })
    expect(result.state).toBe("waiting")
    expect(asked.calls).toHaveLength(0)
    expect((await listAnalyses(user.id, id)).pendingTopic).toBe("busy dads")

    await database.update(viralVideos).set({ status: "ready", breakdown: BREAKDOWN }).where(eq(viralVideos.id, id))
    await writePendingAnalysis(id)
    await writePendingAnalysis(id)
    const after = await listAnalyses(user.id, id)
    expect(after.analyses).toHaveLength(1)
    expect(after.pendingTopic).toBeNull()
  })

  it("keeps a waiting analysis's failure as a sentence", async () => {
    const made = await project()
    const id = await savedVideo("downloading")
    await analyseVideo(user.id, { projectId: made.id, url: "https://www.youtube.com/shorts/abc123def45", topic: "dads" })
    goodAnswers(["hook"])
    await database.update(viralVideos).set({ status: "ready", breakdown: BREAKDOWN }).where(eq(viralVideos.id, id))
    await writePendingAnalysis(id)
    expect((await listAnalyses(user.id, id)).error).toContain("Press Analyse again")
  })

  it("refuses without a topic, and saves notes on an analysis", async () => {
    const made = await project()
    const id = await savedVideo()
    const url = "https://www.youtube.com/shorts/abc123def45"
    await expect(analyseVideo(user.id, { projectId: made.id, url, topic: "  " })).rejects.toThrow("for whom")
    await analyseVideo(user.id, { projectId: made.id, url, topic: "dads" })
    const [analysis] = (await listAnalyses(user.id, id)).analyses
    await saveAnalysisNotes(user.id, analysis.id, "Film this Sunday")
    expect((await listAnalyses(user.id, id)).analyses[0].notes).toBe("Film this Sunday")
  })

  it("prices an analysis before it runs, more when the breakdown is still owed", () => {
    expect(analysisPrice(30, true).cents).toBeGreaterThanOrEqual(1)
    expect(analysisPrice(30, false).cents).toBeGreaterThanOrEqual(analysisPrice(30, true).cents)
    expect(analysisPrice(30, false).breakdownNeeded).toBe(true)
  })
})
