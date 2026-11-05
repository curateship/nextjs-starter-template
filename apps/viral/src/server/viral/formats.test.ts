import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { formatFromAnalysis } from "@/lib/viral/formats"
import { now, uuid } from "@/server/auth/security"
import { type CustomShellDb } from "@/server/db"
import { type CustomShellUser } from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"
import {
  deleteFormat,
  listFormats,
  listFormatScripts,
  renameFormat,
  saveFormat,
  writeFromFormat,
} from "@/server/viral/formats"
import { listLibraryHooks, setHookTags } from "@/server/viral/library"
import { createViralProject, ensureSampleViralProject, listViralProjects } from "@/server/viral/projects"
import { viralAnalyses, viralVideos } from "@/server/viral/schema"

/**
 * The Library (task parts 17 and 18): saved formats write scripts with no
 * source video, refusing one that drops a part, and Hooks gathers the opening
 * line of every analysed video across projects. Gemini is stubbed.
 */

const writer = vi.hoisted(() => ({
  answer: { script: [] as { role: string; seconds: number; words: string }[] },
  calls: [] as { feature: string; metadata: Record<string, unknown> }[],
}))

vi.mock("@/server/viral/writer", () => ({
  WRITER_MODEL: "gemini-3.8-flash",
  askWriter: async (input: { feature: string; metadata: Record<string, unknown> }) => {
    writer.calls.push({ feature: input.feature, metadata: input.metadata })
    return writer.answer
  },
}))

vi.mock("@/server/media/storage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/media/storage")>()),
  getPublicMediaUrl: async (path: string) => `https://media.test/${path}`,
}))

let client: PGlite
let database: CustomShellDb
let user: CustomShellUser

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  user = await insertUser(database)
  writer.calls.length = 0
})

afterEach(async () => {
  await client.close()
})

const PARTS = [
  { role: "hook" as const, seconds: 3, summary: "Names a mistake." },
  { role: "solution" as const, seconds: 15, summary: "Three fixes." },
  { role: "cta" as const, seconds: 4, summary: "Asks them to save it." },
]

function project(name = "Meal prep", topic = "busy dads") {
  return createViralProject(user.id, { name, description: "", topic, socials: ["youtube"], keywords: [], folderId: null })
}

describe("formats", () => {
  it("takes an analysis's parts in order, with what each one does", () => {
    expect(
      formatFromAnalysis({
        whyItWorks: {
          hook: "x",
          parts: [
            { role: "solution", summary: "Three fixes." },
            { role: "hook", summary: "Names a mistake." },
          ],
          whySpread: "y",
        },
        script: [
          { role: "hook", seconds: 2.6, words: "a" },
          { role: "solution", seconds: 15, words: "b" },
        ],
        ideas: [],
        title: { title: "t", caption: "", hashtags: [] },
      })
    ).toEqual([
      { role: "hook", seconds: 3, summary: "Names a mistake." },
      { role: "solution", seconds: 15, summary: "Three fixes." },
    ])
  })

  it("names an unnamed format by its parts, renames it, and deletes it with its scripts", async () => {
    const format = await saveFormat(user.id, { name: "", parts: PARTS, sourceTitle: "Meal prep in 10 minutes" })
    expect(format.name).toBe("Hook, Solution, The ask")
    expect((await renameFormat(user.id, format.id, "Mistake, fixes, ask")).name).toBe("Mistake, fixes, ask")

    const other = await insertUser(database)
    await expect(renameFormat(other.id, format.id, "Mine")).rejects.toThrow(/That format is gone/)
    await expect(listFormatScripts(other.id, format.id)).rejects.toThrow(/That format is gone/)

    await deleteFormat(user.id, format.id)
    expect(await listFormats(user.id)).toEqual([])
  })

  it("writes a script for the project's topic, on the project's meter", async () => {
    const format = await saveFormat(user.id, { name: "Mistake", parts: PARTS, sourceTitle: null })
    const mine = await project()
    writer.answer = {
      script: [
        { role: "hook", seconds: 3.2, words: "Stop prepping lunch like this." },
        { role: "solution", seconds: 15, words: "Three fixes." },
        { role: "cta", seconds: 4, words: "Save this." },
      ],
    }
    const script = await writeFromFormat(user.id, { formatId: format.id, projectId: mine.id, idea: "Ten minute lunches" })
    expect(script).toMatchObject({ projectName: "Meal prep", idea: "Ten minute lunches" })
    expect(script.script.map((part) => part.seconds)).toEqual([3, 15, 4])
    expect(writer.calls).toEqual([{ feature: "viral_format_script", metadata: { formatId: format.id, viralProjectId: mine.id } }])
    expect(await listFormatScripts(user.id, format.id)).toHaveLength(1)
  })

  it("refuses a script missing one of the format's parts", async () => {
    const format = await saveFormat(user.id, { name: "Mistake", parts: PARTS, sourceTitle: null })
    const mine = await project()
    writer.answer = { script: [{ role: "hook", seconds: 3, words: "Stop." }] }
    await expect(writeFromFormat(user.id, { formatId: format.id, projectId: mine.id, idea: "Lunches" })).rejects.toThrow(
      /missing "Solution" and "The ask"/
    )
    expect(await listFormatScripts(user.id, format.id)).toEqual([])
  })

  it("refuses a sample project and a project with no topic, before asking Gemini", async () => {
    const format = await saveFormat(user.id, { name: "Mistake", parts: PARTS, sourceTitle: null })
    await ensureSampleViralProject(user.id)
    const [sample] = await listViralProjects(user.id, { archived: false })
    await expect(writeFromFormat(user.id, { formatId: format.id, projectId: sample.id, idea: "x" })).rejects.toThrow(/sample project/)
    const blank = await project("Blank", "")
    await expect(writeFromFormat(user.id, { formatId: format.id, projectId: blank.id, idea: "x" })).rejects.toThrow(/has no topic/)
    expect(writer.calls).toEqual([])
  })

  it("gives the sample a format once, however often the sample is made", async () => {
    await ensureSampleViralProject(user.id)
    const formats = await listFormats(user.id)
    expect(formats).toHaveLength(1)
    expect(formats[0]).toMatchObject({ sample: true })
  })
})

describe("Library → Hooks", () => {
  it("gathers analysed videos' hooks across projects, naming each project, with their tags", async () => {
    const first = await project("Meal prep")
    const second = await project("Lunch ideas")
    const at = now()
    const savedId = uuid()
    await database.insert(viralVideos).values({
      id: savedId,
      ownerId: user.id,
      platform: "youtube",
      platformVideoId: "abc123def45",
      sourceUrl: "https://www.youtube.com/shorts/abc123def45",
      status: "ready",
      title: "Meal prep in 10 minutes",
      channelName: "Chef",
      views: 400_000,
      breakdown: {
        transcript: [{ startMs: 0, endMs: 2_000, text: "You are prepping lunch wrong." }],
        segments: [{ role: "hook", startMs: 0, endMs: 2_500, summary: "A mistake" }],
        scenes: [],
      },
      createdAt: at,
      updatedAt: at,
    })
    const pieces = {
      whyItWorks: { hook: "x", parts: [], whySpread: "y" },
      script: [],
      ideas: [],
      title: { title: "t", caption: "", hashtags: [] },
    }
    await database.insert(viralAnalyses).values([
      { id: uuid(), ownerId: user.id, savedVideoId: savedId, projectId: first.id, topic: "dads", pieces, createdAt: new Date(at.getTime() - 1_000), updatedAt: at },
      { id: uuid(), ownerId: user.id, savedVideoId: savedId, projectId: second.id, topic: "dads", pieces, createdAt: at, updatedAt: at },
    ])
    expect(await setHookTags(user.id, savedId, ["Mistakes", "mistakes"])).toEqual(["Mistakes"])

    const hooks = await listLibraryHooks(user.id)
    expect(hooks).toHaveLength(1)
    expect(hooks[0]).toMatchObject({
      key: "youtube:abc123def45",
      hook: { text: "You are prepping lunch wrong.", startMs: 0 },
      projects: [
        { id: second.id, name: "Lunch ideas" },
        { id: first.id, name: "Meal prep" },
      ],
      tags: ["Mistakes"],
    })

    const other = await insertUser(database)
    expect(await listLibraryHooks(other.id)).toEqual([])
    await expect(setHookTags(other.id, savedId, ["x"])).rejects.toThrow(/That video is gone/)
  })
})
