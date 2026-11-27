import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ANALYSIS_FEATURES } from "@/lib/viral/analysis"
import { filterLibraryHooks } from "@/lib/viral/library"
import { now, uuid } from "@/server/auth/security"
import { type CustomShellDb } from "@/server/db"
import { type CustomShellUser } from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"
import { analyseVideo } from "@/server/viral/ai-analysis"
import { HOOK_IDEAS_FEATURE, listHookIdeas, writeHookIdeas } from "@/server/viral/hook-ideas"
import {
  addHookType,
  deleteHookType,
  HOOK_TYPE_FEATURE,
  labelOldHooks,
  readHookTypeSettings,
  unlabelledHooks,
} from "@/server/viral/hook-types"
import { listLibraryHooks, setHookTags } from "@/server/viral/library"
import { createOwnHook, deleteOwnHook, updateOwnHook } from "@/server/viral/own-hooks"
import { createViralProject, ensureSampleViralProject, listViralProjects } from "@/server/viral/projects"
import { viralAnalyses, viralHookIdeas, viralOwnHooks, viralVideos } from "@/server/viral/schema"

/**
 * The Library's writing (more-features task parts 6, 7 and 8), with a fake
 * writer and no network: hook types and the pass that labels old hooks, your
 * own hooks, and five hooks written from any hook.
 */

const asked = vi.hoisted(() => ({
  calls: [] as { feature: string; metadata: Record<string, unknown>; prompt: string }[],
  answers: {} as Record<string, unknown | ((prompt: string) => unknown)>,
}))

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
    const answer = asked.answers[feature]
    return schema.parse(typeof answer === "function" ? answer(prompt) : answer)
  },
}))

vi.mock("@/server/media/storage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/media/storage")>()),
  getPublicMediaUrl: async (path: string) => `https://media.test/${path}`,
}))

let client: PGlite
let database: CustomShellDb
let user: CustomShellUser
const previousKey = process.env.CUSTOM_SHELL_SECRET_ENCRYPTION_KEY

beforeEach(async () => {
  process.env.CUSTOM_SHELL_SECRET_ENCRYPTION_KEY = "a".repeat(64)
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  user = await insertUser(database)
  asked.calls = []
  asked.answers = {}
})

afterEach(async () => {
  if (previousKey === undefined) delete process.env.CUSTOM_SHELL_SECRET_ENCRYPTION_KEY
  else process.env.CUSTOM_SHELL_SECRET_ENCRYPTION_KEY = previousKey
  await client.close()
})

async function project(topic = "meal-prep course for busy dads") {
  return createViralProject(user.id, { name: "Meal prep", description: "", topic, socials: ["youtube"], keywords: [], folderId: null })
}

const PIECES = {
  whyItWorks: { hook: "x", parts: [], whySpread: "y" },
  script: [],
  ideas: [],
  title: { title: "t", caption: "", hashtags: [] },
}

/** A saved video with a breakdown and an analysis, so its hook is in the Library. */
async function analysedVideo(hookWords: string, projectId: string | null, platformVideoId = `v${uuid().slice(0, 8)}`) {
  const at = now()
  const id = uuid()
  await database.insert(viralVideos).values({
    id,
    ownerId: user.id,
    platform: "youtube",
    platformVideoId,
    sourceUrl: `https://www.youtube.com/shorts/${platformVideoId}`,
    status: "ready",
    title: hookWords,
    breakdown: {
      transcript: [{ startMs: 0, endMs: 2_000, text: hookWords }],
      segments: [
        { role: "hook", startMs: 0, endMs: 2_000, summary: "Hook" },
        { role: "cta", startMs: 2_000, endMs: 4_000, summary: "Ask" },
      ],
      scenes: [],
    },
    createdAt: at,
    updatedAt: at,
  })
  await database.insert(viralAnalyses).values({ id: uuid(), ownerId: user.id, savedVideoId: id, projectId, topic: "dads", pieces: PIECES, createdAt: at, updatedAt: at })
  return id
}

describe("hook types", () => {
  it("names the type in the same call as Why it works, at no extra call", async () => {
    const made = await project()
    const id = await analysedVideo("You are prepping lunch wrong.", made.id, "abc123def45")
    await addHookType(user.id, "Callback")
    asked.answers = {
      [ANALYSIS_FEATURES.whyItWorks]: { hook: "A mistake.", hookType: "mistake", parts: [], whySpread: "Warnings spread." },
      [ANALYSIS_FEATURES.script]: { script: [{ role: "hook", seconds: 3, words: "a" }, { role: "cta", seconds: 2, words: "b" }] },
      [ANALYSIS_FEATURES.ideas]: { ideas: [1, 2, 3].map((n) => ({ idea: `Idea ${n}`, hook: `Hook ${n}` })) },
      [ANALYSIS_FEATURES.title]: { title: "T", caption: "", hashtags: [] },
    }
    const result = await analyseVideo(user.id, { projectId: made.id, url: "https://www.youtube.com/shorts/abc123def45", topic: "dads" })
    expect(asked.calls).toHaveLength(4)
    expect(asked.calls.find((call) => call.feature === ANALYSIS_FEATURES.whyItWorks)?.prompt).toContain('"Callback"')
    const [video] = await database.select().from(viralVideos).where(eq(viralVideos.id, id))
    expect(video).toMatchObject({ hookType: "mistake", hookTypeId: null })
    // The type lives on the video, not in the analysis's pieces.
    if (result.state === "written") expect(result.analysis.pieces.whyItWorks).not.toHaveProperty("hookType")
  })

  it("leaves the type empty when the answer names nothing on the list", async () => {
    const made = await project()
    const id = await analysedVideo("Hello.", made.id, "abc123def45")
    asked.answers = {
      [ANALYSIS_FEATURES.whyItWorks]: { hook: "A.", hookType: "Something made up", parts: [], whySpread: "B." },
      [ANALYSIS_FEATURES.script]: { script: [{ role: "hook", seconds: 3, words: "a" }, { role: "cta", seconds: 2, words: "b" }] },
      [ANALYSIS_FEATURES.ideas]: { ideas: [1, 2, 3].map((n) => ({ idea: `Idea ${n}`, hook: `Hook ${n}` })) },
      [ANALYSIS_FEATURES.title]: { title: "T", caption: "", hashtags: [] },
    }
    await analyseVideo(user.id, { projectId: made.id, url: "https://www.youtube.com/shorts/abc123def45", topic: "dads" })
    const [video] = await database.select().from(viralVideos).where(eq(viralVideos.id, id))
    expect(video.hookType).toBeNull()
  })

  it("refuses a name already on the list, and deleting an own type sets its hooks back to no type", async () => {
    await expect(addHookType(user.id, "bold claim")).rejects.toThrow(/one of the fixed types/)
    const [callback] = await addHookType(user.id, "Callback")
    await expect(addHookType(user.id, "  callback ")).rejects.toThrow(/already/)

    const videoId = await analysedVideo("Remember last week?", null)
    await database.update(viralVideos).set({ hookTypeId: callback.id }).where(eq(viralVideos.id, videoId))
    const own = await createOwnHook(user.id, { words: "As I said yesterday", link: "", typeId: callback.id, tags: [] })
    expect(own.typeId).toBe(callback.id)

    const other = await insertUser(database)
    await expect(deleteHookType(other.id, callback.id)).rejects.toThrow(/gone already/)
    expect(await deleteHookType(user.id, callback.id)).toEqual([])
    const hooks = await listLibraryHooks(user.id)
    expect(hooks.map((hook) => hook.typeId)).toEqual([null, null])
  })

  it("labels old hooks a batch at a time, skips the sample, and the Type filter then finds them", async () => {
    await ensureSampleViralProject(user.id)
    const made = await project()
    const first = await analysedVideo("Did you know this?", made.id)
    const second = await analysedVideo("Stop salting pasta water.", made.id)
    // A made-up video with no type, as an older sample may have: never sent to the AI.
    await analysedVideo("Sample hook.", made.id, "sample-99")
    const own = await createOwnHook(user.id, { words: "Three lunches, one tray.", link: "", typeId: null, tags: [] })

    const settings = await readHookTypeSettings(user.id)
    expect(settings).toMatchObject({ unlabelled: 3, nextPress: 3 })
    expect(settings.price.cents).toBeGreaterThan(0)

    asked.answers[HOOK_TYPE_FEATURE] = (prompt: string) => {
      const lines = prompt.split("\n").filter((line) => /^\d+\. /.test(line))
      return {
        types: lines.map((line, index) => ({
          n: index + 1,
          type: line.includes("Did you know") ? "Question" : line.includes("Stop") ? "mistake" : "not a type",
        })),
      }
    }
    const result = await labelOldHooks(user.id)
    expect(asked.calls).toHaveLength(1)
    expect(asked.calls[0].feature).toBe(HOOK_TYPE_FEATURE)
    expect(asked.calls[0].prompt).not.toContain("Sample hook")
    expect(asked.calls[0].metadata).not.toHaveProperty("viralProjectId")
    expect(result).toEqual({ labelled: 2, left: 1, error: null })

    const hooks = await listLibraryHooks(user.id)
    const byId = new Map(hooks.map((hook) => [hook.id, hook.typeId]))
    expect(byId.get(first)).toBe("question")
    expect(byId.get(second)).toBe("mistake")
    expect(byId.get(own.id)).toBeNull()
    expect(filterLibraryHooks(hooks, { type: "mistake" }).map((hook) => hook.text)).toEqual(
      expect.arrayContaining(["Stop salting pasta water."])
    )
    // The sample's own hook came with its type.
    expect(filterLibraryHooks(hooks, { type: "mistake" }).every((hook) => hook.typeId === "mistake")).toBe(true)
    expect((await unlabelledHooks(user.id)).map((hook) => hook.id)).toEqual([own.id])
  })

  it("keeps the labels from the calls that worked when one fails", async () => {
    asked.answers[HOOK_TYPE_FEATURE] = () => {
      throw new Error("No Google Gemini key is saved - add one in Settings → AI")
    }
    await createOwnHook(user.id, { words: "One.", link: "", typeId: null, tags: [] })
    const result = await labelOldHooks(user.id)
    expect(result).toEqual({ labelled: 0, left: 1, error: "No Google Gemini key is saved - add one in Settings → AI" })
  })
})

describe("your own hook", () => {
  it("keeps the words, an http link and tags, shows under All projects, and refuses another link", async () => {
    await expect(createOwnHook(user.id, { words: "Hi", link: "javascript:alert(1)", typeId: null, tags: [] })).rejects.toThrow(/http/)
    await expect(createOwnHook(user.id, { words: "   ", link: "", typeId: null, tags: [] })).rejects.toThrow(/words/)
    await expect(createOwnHook(user.id, { words: "Hi", link: "", typeId: "made-up-id", tags: [] })).rejects.toThrow(/type is gone/)

    const hook = await createOwnHook(user.id, {
      words: "  Nobody   tells you this about rice ",
      link: "https://podcasts.example/ep/12",
      typeId: "story",
      tags: ["Podcast"],
    })
    expect(hook).toMatchObject({ kind: "own", text: "Nobody tells you this about rice", link: "https://podcasts.example/ep/12", typeId: "story", tags: ["Podcast"], winner: false })

    const made = await project()
    await analysedVideo("Video hook.", made.id)
    const hooks = await listLibraryHooks(user.id)
    expect(hooks.map((one) => one.kind).sort()).toEqual(["own", "video"])
    expect(filterLibraryHooks(hooks, { project: made.id }).map((one) => one.kind)).toEqual(["video"])

    expect(await updateOwnHook(user.id, hook.id, { link: "", typeId: null })).toMatchObject({ link: null, typeId: null })
    expect(await setHookTags(user.id, "own", hook.id, ["Later", "later"])).toEqual(["Later"])

    const other = await insertUser(database)
    await expect(updateOwnHook(other.id, hook.id, { words: "x" })).rejects.toThrow(/gone/)
    await expect(deleteOwnHook(other.id, hook.id)).rejects.toThrow(/gone/)
    expect(await listLibraryHooks(other.id)).toEqual([])
  })
})

describe("Write hooks like this", () => {
  const FIVE = { hooks: ["One", "Two", "Three", "Four", "Five", "Six"] }

  it("writes five hooks for the project's topic on its meter, keeps them newest first, and they go with the hook", async () => {
    const made = await project()
    const own = await createOwnHook(user.id, { words: "Stop salting pasta water.", link: "", typeId: null, tags: [] })
    asked.answers[HOOK_IDEAS_FEATURE] = FIVE

    const first = await writeHookIdeas(user.id, { kind: "own", hookId: own.id, projectId: made.id })
    expect(first.hooks).toEqual(["One", "Two", "Three", "Four", "Five"])
    expect(asked.calls[0]).toMatchObject({ feature: HOOK_IDEAS_FEATURE, metadata: { viralProjectId: made.id } })
    expect(asked.calls[0].prompt).toContain("Stop salting pasta water.")
    expect(asked.calls[0].prompt).toContain("busy dads")
    const second = await writeHookIdeas(user.id, { kind: "own", hookId: own.id, projectId: made.id })

    const listed = await listHookIdeas(user.id, { kind: "own", hookId: own.id })
    expect(listed.map((one) => one.id)).toEqual([second.id, first.id])
    expect(listed[0].projectName).toBe("Meal prep")

    const other = await insertUser(database)
    await expect(listHookIdeas(other.id, { kind: "own", hookId: own.id })).rejects.toThrow(/gone/)

    await deleteOwnHook(user.id, own.id)
    expect(await database.select().from(viralHookIdeas)).toEqual([])
    expect(await database.select().from(viralOwnHooks)).toEqual([])
  })

  it("writes from an analysed video's hook too", async () => {
    const made = await project()
    const videoId = await analysedVideo("You are prepping lunch wrong.", made.id)
    asked.answers[HOOK_IDEAS_FEATURE] = FIVE
    await writeHookIdeas(user.id, { kind: "video", hookId: videoId, projectId: made.id })
    expect(asked.calls[0].prompt).toContain("You are prepping lunch wrong.")
    expect(await listHookIdeas(user.id, { kind: "video", hookId: videoId })).toHaveLength(1)
  })

  it("refuses a sample project and a project with no topic before the AI is asked", async () => {
    await ensureSampleViralProject(user.id)
    const [sample] = await listViralProjects(user.id, { archived: false })
    const blank = await project("")
    const own = await createOwnHook(user.id, { words: "Hi there.", link: "", typeId: null, tags: [] })
    await expect(writeHookIdeas(user.id, { kind: "own", hookId: own.id, projectId: sample.id })).rejects.toThrow(/sample project/)
    await expect(writeHookIdeas(user.id, { kind: "own", hookId: own.id, projectId: blank.id })).rejects.toThrow(/no topic/)
    expect(asked.calls).toEqual([])
  })
})
