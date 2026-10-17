import { PGlite } from "@electric-sql/pglite"
import { and, eq, inArray } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { now, uuid } from "@/server/auth/security"
import { type CustomShellDb } from "@/server/db"
import {
  customShellAiUsageEvents,
  customShellMedia,
  type CustomShellUser,
} from "@/server/schema"
import {
  createTestDatabase,
  insertUser,
  insertWorkspace,
} from "@/server/test-support"
import {
  createFirstFrames,
  listFirstFrames,
} from "@/server/video/asset-factories/first-frames"
import { createCarouselFromFrames } from "@/server/video/carousels"
import {
  readProjectSpend,
  requireProjectBudget,
} from "@/server/video/project-spend"
import {
  createOwnedProject,
  deleteOwnedProjects,
  duplicateOwnedProject,
  listOwnedProjects,
  setProjectPinned,
  setProjectsArchived,
  summarizeProjectDelete,
} from "@/server/video/projects"
import {
  videoActors,
  videoAiGenerations,
  videoCarousels,
  videoFirstFrames,
  videoProjects,
  videoViralVideos,
} from "@/server/video/schema"
import { copyVideoIntoProject } from "@/server/video/viral/copy-into-project"

const removed: string[] = []
vi.mock("@/server/media/storage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/media/storage")>()),
  deleteFromR2: async (storagePath: string) => {
    removed.push(storagePath)
  },
  getPublicMediaUrl: async (storagePath: string) =>
    `https://media.test/${storagePath}`,
}))

let client: PGlite
let database: CustomShellDb
let user: CustomShellUser
let workspaceId: string

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  user = await insertUser(database)
  workspaceId = (await insertWorkspace(database, { userId: user.id })).id
  removed.length = 0
})

afterEach(async () => {
  await client.close()
})

async function insertPicture(id = uuid()) {
  const timestamp = now()
  await database.insert(customShellMedia).values({
    id,
    workspaceId,
    userId: user.id,
    filename: `${id}.png`,
    originalName: `${id}.png`,
    fileSize: 8,
    mimeType: "image/png",
    fileType: "image",
    storagePath: `${user.id}/${id}.png`,
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  return id
}

async function insertActor(name = "Mia") {
  const timestamp = now()
  const id = uuid()
  await database.insert(videoActors).values({
    id,
    userId: user.id,
    name,
    prompt: `${name}, 30s`,
    model: "gemini-2.5-flash-image",
    status: "active",
    tags: [],
    imageMediaId: await insertPicture(),
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  return id
}

async function insertFrame(projectId: string, actorId: string, name = "Kitchen") {
  const timestamp = now()
  const id = uuid()
  const imageMediaId = await insertPicture()
  await database.insert(videoFirstFrames).values({
    id,
    userId: user.id,
    projectId,
    actorId,
    name,
    prompt: name,
    model: "gemini-2.5-flash-image",
    aspectRatio: "9:16",
    tags: [],
    pinned: false,
    imageMediaId,
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  return { id, imageMediaId }
}

async function insertSpend(projectId: string | null, feature: string, cents: number) {
  await database.insert(customShellAiUsageEvents).values({
    id: uuid(),
    userId: user.id,
    provider: "gemini",
    model: "gemini-2.5-flash-image",
    feature,
    inputTokens: 0,
    outputTokens: 0,
    costCents: cents,
    status: "success",
    monthStart: "2026-10-01",
    metadata: projectId ? { projectId } : {},
    createdAt: now(),
  })
}

describe("the projects list", () => {
  it("leaves archived projects out, lists them on their own, and brings them back", async () => {
    const kept = await createOwnedProject(user.id, "Kept", database)
    const old = await createOwnedProject(user.id, "Old", database)

    const result = await setProjectsArchived(user.id, [old.id, kept.id], true, database)
    expect(result.done_ids.sort()).toEqual([kept.id, old.id].sort())
    await setProjectsArchived(user.id, [kept.id], false, database)

    const listed = await listOwnedProjects({ userId: user.id, database })
    expect(listed.projects.map((project) => project.name)).toEqual(["Kept"])
    const archived = await listOwnedProjects({ userId: user.id, archived: true, database })
    expect(archived.projects.map((project) => project.name)).toEqual(["Old"])
    expect(archived.projects[0].archived).toBe(true)
  })

  it("puts a pinned project first, and archiving takes the pin off", async () => {
    const pinned = await createOwnedProject(user.id, "Pinned", database)
    await createOwnedProject(user.id, "Newer", database)

    await setProjectPinned(user.id, pinned.id, true, database)
    const listed = await listOwnedProjects({ userId: user.id, database })
    expect(listed.projects.map((project) => [project.name, project.pinned])).toEqual([
      ["Pinned", true],
      ["Newer", false],
    ])

    await setProjectsArchived(user.id, [pinned.id], true, database)
    const [row] = await database
      .select()
      .from(videoProjects)
      .where(eq(videoProjects.id, pinned.id))
    expect(row.pinnedAt).toBeNull()
  })

  it("shows each project's actors, and filters by actor", async () => {
    const mia = await insertActor("Mia")
    const leo = await insertActor("Leo")
    const withMia = await createOwnedProject(user.id, "With Mia", database)
    const withLeo = await createOwnedProject(user.id, "With Leo", database)
    await insertFrame(withMia.id, mia)
    await insertFrame(withLeo.id, leo)

    const all = await listOwnedProjects({ userId: user.id, database })
    const byName = new Map(all.projects.map((project) => [project.name, project]))
    expect(byName.get("With Mia")?.actors.map((actor) => actor.name)).toEqual(["Mia"])

    const filtered = await listOwnedProjects({ userId: user.id, actorId: mia, database })
    expect(filtered.projects.map((project) => project.name)).toEqual(["With Mia"])
  })
})

describe("duplicating and deleting a project", () => {
  it("gives the copy its own first frame records showing the same pictures", async () => {
    const actor = await insertActor()
    const project = await createOwnedProject(user.id, "Reel", database)
    const frame = await insertFrame(project.id, actor)

    const copy = await duplicateOwnedProject(user.id, project.id, database)

    const frames = await database
      .select()
      .from(videoFirstFrames)
      .where(eq(videoFirstFrames.projectId, copy.id))
    expect(frames).toHaveLength(1)
    expect(frames[0].id).not.toBe(frame.id)
    expect(frames[0].imageMediaId).toBe(frame.imageMediaId)
  })

  it("counts what a delete takes with it", async () => {
    const actor = await insertActor()
    const project = await createOwnedProject(user.id, "Reel", database)
    await insertFrame(project.id, actor, "One")
    await insertFrame(project.id, actor, "Two")

    expect(await summarizeProjectDelete(user.id, [project.id], database)).toEqual({
      first_frames: 2,
      ai_clips: 0,
      exports: 0,
    })
  })

  it("deletes the project's first frames and their pictures, but keeps a picture a duplicate still shows", async () => {
    const actor = await insertActor()
    const project = await createOwnedProject(user.id, "Reel", database)
    const shared = await insertFrame(project.id, actor, "Shared")
    const own = await insertFrame(project.id, actor, "Own")
    const copy = await duplicateOwnedProject(user.id, project.id, database)
    // The copy lets go of one frame, so only the other is still shared.
    await database
      .delete(videoFirstFrames)
      .where(
        and(
          eq(videoFirstFrames.projectId, copy.id),
          eq(videoFirstFrames.imageMediaId, own.imageMediaId)
        )
      )

    await deleteOwnedProjects(user.id, [project.id], database)

    expect(
      await database.select().from(videoFirstFrames).where(eq(videoFirstFrames.projectId, project.id))
    ).toEqual([])
    const pictures = await database
      .select({ id: customShellMedia.id })
      .from(customShellMedia)
      .where(inArray(customShellMedia.id, [shared.imageMediaId, own.imageMediaId]))
    expect(pictures.map((row) => row.id)).toEqual([shared.imageMediaId])
    expect(removed).toContain(`${user.id}/${own.imageMediaId}.png`)
    // The copy is untouched.
    const copyFrames = await database
      .select()
      .from(videoFirstFrames)
      .where(eq(videoFirstFrames.projectId, copy.id))
    expect(copyFrames.map((row) => row.imageMediaId)).toEqual([shared.imageMediaId])
  })

  it("deletes an AI clip made for the project with it", async () => {
    const actor = await insertActor()
    const project = await createOwnedProject(user.id, "Reel", database)
    const frame = await insertFrame(project.id, actor)
    const output = await insertPicture()
    const timestamp = now()
    await database.insert(videoAiGenerations).values({
      id: "shot-1",
      userId: user.id,
      projectId: project.id,
      firstFrameId: frame.id,
      firstFrameMediaId: frame.imageMediaId,
      prompt: "Move",
      model: "veo-3.1-generate-preview",
      aspectRatio: "9:16",
      durationSeconds: 8,
      shotId: "shot-1",
      shotIndex: 1,
      shotPieces: 1,
      status: "ready",
      outputMediaId: output,
      createdAt: timestamp,
      updatedAt: timestamp,
    })

    await deleteOwnedProjects(user.id, [project.id], database)

    const left = await database
      .select({ id: customShellMedia.id })
      .from(customShellMedia)
      .where(inArray(customShellMedia.id, [output, frame.imageMediaId]))
    expect(left).toEqual([])
  })
})

describe("a project's AI spending", () => {
  it("adds up only the spending that names the project, by tool", async () => {
    const project = await createOwnedProject(user.id, "Reel", database)
    await insertSpend(project.id, "video-image-generation", 8)
    await insertSpend(project.id, "video-generation", 320)
    await insertSpend(null, "video-generation", 999)

    const spend = await readProjectSpend(user.id, project.id, database)

    // $0.08 of pictures plus $3.20 of AI clips is $3.28.
    expect(spend.total_cents).toBe(328)
    expect(spend.by_tool).toEqual([
      { label: "AI clips", cents: 320 },
      { label: "Pictures", cents: 8 },
    ])
    expect(spend.limit_cents).toBeNull()
  })

  it("refuses a call priced by its words once the limit is reached", async () => {
    const project = await createOwnedProject(user.id, "Reel", database)
    await database
      .update(videoProjects)
      .set({ spendLimitCents: 500 })
      .where(eq(videoProjects.id, project.id))
    await insertSpend(project.id, "caption_generation", 500)

    await expect(requireProjectBudget(user.id, project.id, 0, database)).rejects.toThrow(
      "This project has spent $5.00 of its $5.00 limit. Raise the limit in the project's settings."
    )
  })

  it("stops first frames before any picture is made when they would pass the limit", async () => {
    const actor = await insertActor()
    const project = await createOwnedProject(user.id, "Reel", database)
    await database
      .update(videoProjects)
      .set({ spendLimitCents: 5 })
      .where(eq(videoProjects.id, project.id))

    // Two pictures at $0.039 each is about $0.08, past the $0.05 limit.
    await expect(
      createFirstFrames(user.id, {
        projectId: project.id,
        actorId: actor,
        prompt: "In a kitchen",
        variants: 2,
      })
    ).rejects.toThrow("and this costs about $0.08")
    expect(await database.select().from(videoFirstFrames)).toEqual([])
  })
})

describe("first frames belong to their project", () => {
  it("lists only this project's first frames", async () => {
    const actor = await insertActor()
    const project = await createOwnedProject(user.id, "Reel", database)
    const other = await createOwnedProject(user.id, "Other", database)
    await insertFrame(project.id, actor, "Mine")
    await insertFrame(other.id, actor, "Theirs")

    const { firstFrames } = await listFirstFrames(user.id, project.id)
    expect(firstFrames.map((frame) => frame.name)).toEqual(["Mine"])
    expect(firstFrames[0].image.file_type).toBe("image")
  })

  it("makes a carousel with one filled slide per ticked frame, in the order ticked", async () => {
    const actor = await insertActor()
    const project = await createOwnedProject(user.id, "Reel", database)
    const first = await insertFrame(project.id, actor, "First")
    const second = await insertFrame(project.id, actor, "Second")

    const carousel = await createCarouselFromFrames(
      user.id,
      project.id,
      [second.id, first.id],
      "1:1",
      database
    )

    const [row] = await database
      .select()
      .from(videoCarousels)
      .where(eq(videoCarousels.id, carousel.id))
    const slides = row.slides as { title: string; items: { mediaId: string; fit: string }[] }[]
    expect(slides.map((slide) => slide.title)).toEqual(["Second", "First"])
    expect(slides[0].items[0]).toMatchObject({ mediaId: second.imageMediaId, fit: "cover" })
    expect(row.format).toBe("1:1")
  })
})

describe("Copy this", () => {
  it("makes two projects from two presses, on one saved video", async () => {
    const url = "https://www.youtube.com/shorts/abcdefghijk"
    const one = await copyVideoIntoProject(user.id, url, "Viral thing")
    const two = await copyVideoIntoProject(user.id, url, "Viral thing")

    expect(one.id).not.toBe(two.id)
    expect(one.name).toBe("Viral thing")
    const saved = await database.select().from(videoViralVideos)
    expect(saved).toHaveLength(1)
    const projects = await database.select().from(videoProjects)
    expect(projects.map((project) => project.sourceViralVideoId)).toEqual([
      saved[0].id,
      saved[0].id,
    ])
  })
})
