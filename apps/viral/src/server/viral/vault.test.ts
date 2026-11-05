import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { now, uuid } from "@/server/auth/security"
import { type CustomShellDb } from "@/server/db"
import { customShellMedia, type CustomShellUser } from "@/server/schema"
import { createTestDatabase, insertUser, insertWorkspace } from "@/server/test-support"
import { deleteSavedVideos } from "@/server/viral/delete-saved-videos"
import { loadViralProjectScreen } from "@/server/viral/project-view"
import { createViralProject, deleteViralProjects } from "@/server/viral/projects"
import {
  viralAnalyses,
  viralProjectKeywords,
  viralProjectResults,
  viralVaultItems,
  viralVideos,
} from "@/server/viral/schema"
import {
  changeVaultItems,
  fillVaultCopies,
  listVault,
  listVaultTags,
  saveToVault,
  updateVaultItem,
} from "@/server/viral/vault"

/**
 * The vault (task parts 17 to 20), checked against the database: an item
 * keeps its own numbers, analysis and notes, plays on after its search
 * result and saved video go, and deleting it deletes its file.
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

const URL_A = "https://www.youtube.com/shorts/abc123def45"

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

async function projectWithResult(name = "Meal prep") {
  const project = await createViralProject(user.id, {
    name,
    description: "",
    topic: "busy dads",
    socials: ["youtube"],
    keywords: ["meal prep"],
    folderId: null,
  })
  const [keyword] = await database.select().from(viralProjectKeywords).where(eq(viralProjectKeywords.projectId, project.id))
  await database.insert(viralProjectResults).values({
    id: uuid(),
    keywordId: keyword.id,
    projectId: project.id,
    platform: "youtube",
    platformVideoId: "abc123def45",
    url: URL_A,
    title: "Meal prep in 10 minutes",
    channelId: "UCchannel",
    channelName: "Chef",
    subscribers: 10_000,
    views: 400_000,
    likes: 20_000,
    comments: 300,
    postedAt: new Date(Date.now() - 86_400_000),
    durationSeconds: 30,
    foundAt: now(),
  })
  return project
}

/** A downloaded file in the media library. */
async function downloadedFile() {
  const at = now()
  const mediaId = uuid()
  await database.insert(customShellMedia).values({
    id: mediaId,
    workspaceId,
    userId: user.id,
    filename: `${mediaId}.mp4`,
    originalName: "Saved video.mp4",
    fileSize: 1_000,
    mimeType: "video/mp4",
    fileType: "video",
    storagePath: `${user.id}/${mediaId}.mp4`,
    createdAt: at,
    updatedAt: at,
  })
  return mediaId
}

/** The saved video as the worker leaves it after downloading: its file in the library. */
async function downloaded() {
  const at = now()
  const mediaId = uuid()
  await database.insert(customShellMedia).values({
    id: mediaId,
    workspaceId,
    userId: user.id,
    filename: `${mediaId}.mp4`,
    originalName: "Saved video.mp4",
    fileSize: 1_000,
    mimeType: "video/mp4",
    fileType: "video",
    storagePath: `${user.id}/${mediaId}.mp4`,
    createdAt: at,
    updatedAt: at,
  })
  const id = uuid()
  await database.insert(viralVideos).values({
    id,
    ownerId: user.id,
    platform: "youtube",
    platformVideoId: "abc123def45",
    sourceUrl: URL_A,
    status: "downloaded",
    wantsAnalysis: false,
    mediaId,
    title: "Meal prep in 10 minutes",
    createdAt: at,
    updatedAt: at,
  })
  return { id, mediaId }
}

describe("saving to the vault", () => {
  it("keeps the numbers, the analysis picked and the notes, with status Idea", async () => {
    const project = await projectWithResult()
    const saved = await downloaded()
    const analysisId = uuid()
    await database.insert(viralAnalyses).values({
      id: analysisId,
      ownerId: user.id,
      savedVideoId: saved.id,
      projectId: project.id,
      topic: "busy dads",
      pieces: {
        whyItWorks: { hook: "h", parts: [], whySpread: "w" },
        script: [{ role: "hook", seconds: 3, words: "Dads, listen" }],
        ideas: [],
        title: { title: "t", caption: "c", hashtags: [] },
      },
      createdAt: now(),
      updatedAt: now(),
    })
    const item = await saveToVault(user.id, { projectId: project.id, url: URL_A, analysisId, notes: "Film Sunday" })
    expect(item.status).toBe("idea")
    expect(item.stats.views).toBe(400_000)
    expect(item.title).toBe("Meal prep in 10 minutes")
    expect(item.analysis?.script[0].words).toBe("Dads, listen")
    expect(item.notes).toBe("Film Sunday")
    expect(item.playbackUrl).toBe(`https://media.test/${user.id}/${saved.mediaId}.mp4`)

    const screen = await loadViralProjectScreen(user.id, project.id)
    expect(screen.videos[0].vaultItemId).toBe(item.id)
    expect(screen.project.vault_count).toBe(1)

    // Saving it again updates the same idea.
    const again = await saveToVault(user.id, { projectId: project.id, url: URL_A, analysisId: null, notes: "Film Monday" })
    expect(again.id).toBe(item.id)
    expect(again.notes).toBe("Film Monday")
    expect(await database.select().from(viralVaultItems)).toHaveLength(1)
  })

  it("plays on after its search result and its saved video are deleted", async () => {
    const project = await projectWithResult()
    const saved = await downloaded()
    const item = await saveToVault(user.id, { projectId: project.id, url: URL_A, analysisId: null, notes: "" })
    await database.delete(viralProjectResults)
    await deleteSavedVideos(user.id, [saved.id])
    const [after] = await listVault(user.id, { projectId: project.id })
    expect(after.id).toBe(item.id)
    expect(after.playbackUrl).toContain(saved.mediaId)
    expect(removed).not.toContain(`${user.id}/${saved.mediaId}.mp4`)
  })

  it("keeps its file when the same video is saved again after its saved video was deleted", async () => {
    const project = await projectWithResult()
    const saved = await downloaded()
    await saveToVault(user.id, { projectId: project.id, url: URL_A, analysisId: null, notes: "" })
    await deleteSavedVideos(user.id, [saved.id])
    // Saving again makes a fresh saved video with no file yet.
    await saveToVault(user.id, { projectId: project.id, url: URL_A, analysisId: null, notes: "again" })
    const [stored] = await database.select().from(viralVaultItems)
    expect(stored.mediaId).toBe(saved.mediaId)
    expect(stored.notes).toBe("again")
  })

  it("goes with its project, and takes a file nothing else uses with it", async () => {
    const project = await projectWithResult()
    const saved = await downloaded()
    await saveToVault(user.id, { projectId: project.id, url: URL_A, analysisId: null, notes: "" })
    await deleteSavedVideos(user.id, [saved.id])
    expect(removed).not.toContain(`${user.id}/${saved.mediaId}.mp4`)
    await deleteViralProjects(user.id, [project.id])
    expect(await database.select().from(viralVaultItems)).toHaveLength(0)
    expect(removed).toContain(`${user.id}/${saved.mediaId}.mp4`)
    expect(await database.select().from(customShellMedia).where(eq(customShellMedia.id, saved.mediaId))).toHaveLength(0)
  })

  it("leaves the file when its project goes but the saved video still uses it", async () => {
    const project = await projectWithResult()
    const saved = await downloaded()
    await saveToVault(user.id, { projectId: project.id, url: URL_A, analysisId: null, notes: "" })
    await deleteViralProjects(user.id, [project.id])
    expect(removed).not.toContain(`${user.id}/${saved.mediaId}.mp4`)
  })

  it("takes the file when a download lands after it was saved", async () => {
    const project = await projectWithResult()
    const item = await saveToVault(user.id, { projectId: project.id, url: URL_A, analysisId: null, notes: "" })
    expect(item.playbackUrl).toBeNull()
    const [row] = await database.select().from(viralVideos)
    const file = await downloadedFile()
    await fillVaultCopies(row.id, file, "viral-covers/c.jpg")
    const [stored] = await database.select().from(viralVaultItems)
    expect(stored.mediaId).toBe(file)
    expect(stored.thumbnailStoragePath).toBe("viral-covers/c.jpg")
  })
})

describe("status, tags and mass select", () => {
  it("changes status and tags on one item, and offers the tags used", async () => {
    const project = await projectWithResult()
    await downloaded()
    const item = await saveToVault(user.id, { projectId: project.id, url: URL_A, analysisId: null, notes: "" })
    const changed = await updateVaultItem(user.id, item.id, { status: "scripted", tags: ["Hooks", "hooks", " Q1 "] })
    expect(changed.status).toBe("scripted")
    expect(changed.tags).toEqual(["Hooks", "Q1"])
    expect(await listVaultTags(user.id)).toEqual(["Hooks", "Q1"])
  })

  it("lists one project's vault or every project's", async () => {
    const one = await projectWithResult("One")
    const two = await projectWithResult("Two")
    await downloaded()
    await saveToVault(user.id, { projectId: one.id, url: URL_A, analysisId: null, notes: "" })
    await saveToVault(user.id, { projectId: two.id, url: URL_A, analysisId: null, notes: "" })
    expect(await listVault(user.id, { projectId: one.id })).toHaveLength(1)
    expect((await listVault(user.id)).map((item) => item.projectName).sort()).toEqual(["One", "Two"])
  })

  it("sets a status, adds a tag and deletes in one request each, skipping what isn't theirs", async () => {
    const project = await projectWithResult()
    const saved = await downloaded()
    const item = await saveToVault(user.id, { projectId: project.id, url: URL_A, analysisId: null, notes: "" })

    const status = await changeVaultItems(user.id, [item.id, "not-mine"], { kind: "status", status: "posted" })
    expect(status.completed).toEqual([item.id])
    expect(status.skipped).toEqual([{ id: "not-mine", reason: "no longer in the vault" }])
    expect((await changeVaultItems(user.id, [item.id], { kind: "status", status: "posted" })).same).toEqual([item.id])

    const tag = await changeVaultItems(user.id, [item.id], { kind: "tag", name: "Winners" })
    expect(tag.completed).toEqual([item.id])
    expect((await listVault(user.id))[0].tags).toEqual(["Winners"])

    // The saved video goes first, so the vault item is the file's last user.
    await database.delete(viralVideos).where(eq(viralVideos.id, saved.id))
    const gone = await changeVaultItems(user.id, [item.id], { kind: "delete" })
    expect(gone.completed).toEqual([item.id])
    expect(await database.select().from(viralVaultItems)).toHaveLength(0)
    expect(removed).toContain(`${user.id}/${saved.mediaId}.mp4`)
  })
})
