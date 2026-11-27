import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { now, uuid } from "@/server/auth/security"
import { type CustomShellDb } from "@/server/db"
import { customShellMedia, type CustomShellUser } from "@/server/schema"
import { createTestDatabase, insertUser, insertWorkspace } from "@/server/test-support"
import { copyVideoToProject } from "@/server/viral/copy-to-project"
import { archiveViralProjects, createSampleViralProject, createViralProject, ensureSampleViralProject, listViralProjects } from "@/server/viral/projects"
import { viralProjectLinks, viralVaultItems, viralVideos } from "@/server/viral/schema"
import { changeVaultItems, copyVaultItem, listVault, updateVaultItem } from "@/server/viral/vault"

/**
 * Copy to another project (task part 16, Tyler: "Copy, both keep it"): both
 * projects keep the video or idea, sharing one file, so deleting one copy
 * leaves the other playing. Only the person's own projects are reachable.
 */

const removed = vi.hoisted(() => [] as string[])

vi.mock("@/server/media/storage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/media/storage")>()),
  deleteFromR2: async (path: string) => {
    removed.push(path)
  },
  getPublicMediaUrl: async (path: string) => `https://media.test/${path}`,
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

function project(name: string, owner = user) {
  return createViralProject(owner.id, { name, description: "", topic: "busy dads", socials: ["youtube"], keywords: [], folderId: null })
}

/** A vault idea in `projectId` with a kept file and one tag. */
async function ideaIn(projectId: string) {
  const at = now()
  const mediaId = uuid()
  await database.insert(customShellMedia).values({
    id: mediaId,
    workspaceId,
    userId: user.id,
    filename: `${mediaId}.mp4`,
    originalName: "Kept.mp4",
    fileSize: 1_000,
    mimeType: "video/mp4",
    fileType: "video",
    storagePath: `${user.id}/${mediaId}.mp4`,
    createdAt: at,
    updatedAt: at,
  })
  const [row] = await database
    .insert(viralVaultItems)
    .values({
      id: uuid(),
      ownerId: user.id,
      projectId,
      platform: "youtube",
      platformVideoId: "abc123def45",
      sourceUrl: "https://www.youtube.com/shorts/abc123def45",
      title: "Meal prep in 10 minutes",
      mediaId,
      stats: { views: 400_000, likes: null, comments: null, subscribers: null, durationSeconds: 30, postedAt: null, score: 80, outlier: 40 },
      notes: "Film this first",
      status: "scripted",
      createdAt: at,
      updatedAt: at,
    })
    .returning()
  await updateVaultItem(user.id, row.id, { tags: ["Hooks"] })
  return { item: row, mediaId }
}

describe("copying a vault idea", () => {
  it("keeps its notes, status and tags in both, and one deletion leaves the other playing", async () => {
    const first = await project("Meal prep")
    const second = await project("Lunch ideas")
    const { item, mediaId } = await ideaIn(first.id)

    const copied = await copyVaultItem(user.id, item.id, second.id)
    expect(copied.state).toBe("copied")
    if (copied.state !== "copied") return
    expect(copied.item).toMatchObject({ projectId: second.id, notes: "Film this first", status: "scripted", tags: ["Hooks"] })
    expect(copied.item.playbackUrl).toBe(`https://media.test/${user.id}/${mediaId}.mp4`)

    await changeVaultItems(user.id, [item.id], { kind: "delete" })
    expect(removed).toEqual([])
    const [left] = await listVault(user.id, { projectId: second.id })
    expect(left.playbackUrl).toBe(`https://media.test/${user.id}/${mediaId}.mp4`)
  })

  it("changes nothing in a project that already holds the video", async () => {
    const first = await project("Meal prep")
    const second = await project("Lunch ideas")
    const { item } = await ideaIn(first.id)
    await copyVaultItem(user.id, item.id, second.id)
    expect(await copyVaultItem(user.id, item.id, second.id)).toEqual({ state: "already", projectName: "Lunch ideas" })
  })

  it("refuses somebody else's project", async () => {
    const first = await project("Meal prep")
    const other = await insertUser(database)
    const theirs = await project("Theirs", other)
    const { item } = await ideaIn(first.id)
    await expect(copyVaultItem(user.id, item.id, theirs.id)).rejects.toThrow(/That project is gone/)
    await expect(copyVaultItem(other.id, item.id, theirs.id)).rejects.toThrow(/no longer in the vault/)
  })

  it("refuses a sample project, an archived project and a made-up sample idea, as copying a video does", async () => {
    const sample = await createSampleViralProject(user.id)
    const first = await project("Meal prep")
    const { item } = await ideaIn(first.id)
    await expect(copyVaultItem(user.id, item.id, sample.id)).rejects.toThrow(/sample project/)

    const shelved = await project("Shelved")
    await archiveViralProjects(user.id, [shelved.id], true)
    await expect(copyVaultItem(user.id, item.id, shelved.id)).rejects.toThrow(/is archived/)

    const [sampleIdea] = await listVault(user.id, { projectId: sample.id })
    await expect(copyVaultItem(user.id, sampleIdea.id, first.id)).rejects.toThrow(/made-up sample video/)
  })
})

describe("copying a video", () => {
  it("adds it to the other project through one saved row, with no AI", async () => {
    const second = await project("Lunch ideas")
    expect(await copyVideoToProject(user.id, { url: "https://www.youtube.com/shorts/abc123def45", targetProjectId: second.id })).toEqual({
      state: "copied",
      projectName: "Lunch ideas",
    })
    const [saved] = await database.select().from(viralVideos).where(eq(viralVideos.ownerId, user.id))
    expect(saved.wantsAnalysis).toBe(false)
    const links = await database.select().from(viralProjectLinks).where(eq(viralProjectLinks.projectId, second.id))
    expect(links.map((link) => link.savedVideoId)).toEqual([saved.id])

    expect(
      await copyVideoToProject(user.id, { url: "https://www.youtube.com/shorts/abc123def45", targetProjectId: second.id })
    ).toEqual({ state: "already", projectName: "Lunch ideas" })
  })

  it("refuses a sample project and a made-up sample video", async () => {
    await ensureSampleViralProject(user.id)
    const [sample] = await listViralProjects(user.id, { archived: false })
    await expect(
      copyVideoToProject(user.id, { url: "https://www.youtube.com/shorts/abc123def45", targetProjectId: sample.id })
    ).rejects.toThrow(/sample project/)
    const mine = await project("Mine")
    await expect(
      copyVideoToProject(user.id, { url: "https://www.youtube.com/shorts/sample-1", targetProjectId: mine.id })
    ).rejects.toThrow(/made-up sample video/)
  })
})
