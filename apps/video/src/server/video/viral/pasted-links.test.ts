import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { now, uuid } from "@/server/auth/security"
import { type CustomShellDb } from "@/server/db"
import { type CustomShellUser } from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"
import {
  videoViralProjectKeywords,
  videoViralProjectLinks,
  videoViralProjectResults,
  videoViralProjects,
  videoViralVideos,
} from "@/server/video/schema"
import { deleteSavedVideos } from "@/server/video/viral/delete-saved-videos"
import {
  PASTE_LINK_REFUSED,
  pasteVideoLink,
  withHttps,
} from "@/server/video/viral/pasted-links"
import { loadViralProjectScreen } from "@/server/video/viral/project-view"
import {
  createSampleViralProject,
  createViralProject,
  deleteViralProjects,
  hideViralChannels,
} from "@/server/video/viral/projects"

/**
 * Add a link (viral task 08) against a real database with every migration
 * replayed, so this also proves 0136 applies. Nothing is downloaded: a paste
 * only writes the row the worker picks up, and the worker is tested in
 * download-and-analyse.test.ts.
 */

let client: PGlite
let database: CustomShellDb
let user: CustomShellUser
let other: CustomShellUser

const TIKTOK = "https://www.tiktok.com/@zachking/video/7312345678901234567"

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  user = await insertUser(database)
  other = await insertUser(database)
})

afterEach(async () => {
  await client.close()
})

async function newProject(ownerId = user.id) {
  return createViralProject(ownerId, {
    name: "Magic tricks",
    description: "Short magic tricks that look impossible",
    keywords: ["magic trick"],
    folderId: null,
  })
}

async function savedRows() {
  return database.select().from(videoViralVideos)
}

describe("the link check", () => {
  it("refuses a profile, a playlist and any other site with a sentence naming the links that work", async () => {
    const project = await newProject()
    for (const link of [
      "https://www.tiktok.com/@zachking",
      "https://www.instagram.com/zachking/",
      "https://www.youtube.com/@zachking",
      "https://www.youtube.com/playlist?list=PL123",
      "https://example.com/video/1",
      "not a link at all",
    ]) {
      await expect(pasteVideoLink(user.id, project.id, link)).rejects.toThrow(
        PASTE_LINK_REFUSED
      )
    }
    expect(await savedRows()).toHaveLength(0)
  })

  it("reads a link copied without its https, and upgrades an old http one", () => {
    expect(withHttps("  youtube.com/shorts/abc ")).toBe("https://youtube.com/shorts/abc")
    expect(withHttps("http://youtu.be/abc")).toBe("https://youtu.be/abc")
    expect(withHttps("https://youtu.be/abc")).toBe("https://youtu.be/abc")
    // Left for the link check to refuse rather than turned into a web address.
    expect(withHttps("file:///etc/passwd")).toBe("file:///etc/passwd")
  })

  it("refuses a sample project, whose videos are made up", async () => {
    const sample = await createSampleViralProject(user.id)
    await expect(pasteVideoLink(user.id, sample.id, TIKTOK)).rejects.toThrow("sample")
  })

  it("refuses somebody else's project", async () => {
    const theirs = await newProject(other.id)
    await expect(pasteVideoLink(user.id, theirs.id, TIKTOK)).rejects.toThrow("That project is gone")
    expect(await savedRows()).toHaveLength(0)
  })
})

describe("pasting a video", () => {
  it("saves it for breaking down and shows it in the project, marked as pasted", async () => {
    const project = await newProject()
    const pasted = await pasteVideoLink(user.id, project.id, TIKTOK)

    expect(pasted.key).toBe("tiktok:7312345678901234567")
    expect(pasted.alreadySaved).toBe(false)
    expect(pasted.video.status).toBe("waiting")
    expect(pasted.video.wantsAnalysis).toBe(true)

    const screen = await loadViralProjectScreen(user.id, project.id)
    const shown = screen.videos.find((video) => video.key === pasted.key)
    expect(shown).toMatchObject({
      source: "link",
      savedVideoId: pasted.video.id,
      savedStatus: "waiting",
      // Until the download lands, the link stands in for the title.
      title: TIKTOK,
    })
  })

  it("pasted twice is one saved video and one place in the project", async () => {
    const project = await newProject()
    const first = await pasteVideoLink(user.id, project.id, TIKTOK)
    const second = await pasteVideoLink(user.id, project.id, `${TIKTOK}?is_from_webapp=1`)

    expect(second.video.id).toBe(first.video.id)
    expect(second.alreadySaved).toBe(true)
    expect(await savedRows()).toHaveLength(1)
    expect(await database.select().from(videoViralProjectLinks)).toHaveLength(1)
    const screen = await loadViralProjectScreen(user.id, project.id)
    expect(screen.videos.filter((video) => video.key === first.key)).toHaveLength(1)
  })

  it("a video already saved from a search opens that copy and turns its breakdown on", async () => {
    const project = await newProject()
    const at = now()
    const savedId = uuid()
    await database.insert(videoViralVideos).values({
      id: savedId,
      ownerId: user.id,
      platform: "tiktok",
      platformVideoId: "7312345678901234567",
      sourceUrl: TIKTOK,
      status: "downloaded",
      wantsAnalysis: false,
      createdAt: at,
      updatedAt: at,
    })

    const pasted = await pasteVideoLink(user.id, project.id, TIKTOK)
    expect(pasted.alreadySaved).toBe(true)
    expect(pasted.video.id).toBe(savedId)
    // Back in the queue for the AI only; the stored file is not fetched again.
    expect(pasted.video.status).toBe("waiting")
    expect(pasted.video.wantsAnalysis).toBe(true)
    expect(await savedRows()).toHaveLength(1)
  })

  it("is one card when a keyword search also found it, the search's", async () => {
    const project = await newProject()
    const [keyword] = await database
      .select()
      .from(videoViralProjectKeywords)
      .where(eq(videoViralProjectKeywords.projectId, project.id))
    await database.insert(videoViralProjectResults).values({
      id: uuid(),
      keywordId: keyword.id,
      projectId: project.id,
      platform: "youtube",
      platformVideoId: "abc123",
      url: "https://www.youtube.com/shorts/abc123",
      title: "Found by the search",
      channelId: "UCmagic",
      channelName: "Magic",
      views: 10_000,
      durationSeconds: 30,
      foundAt: now(),
    })

    await pasteVideoLink(user.id, project.id, "youtube.com/shorts/abc123")
    const screen = await loadViralProjectScreen(user.id, project.id)
    const cards = screen.videos.filter((video) => video.key === "youtube:abc123")
    expect(cards).toHaveLength(1)
    expect(cards[0]).toMatchObject({ source: "search", title: "Found by the search" })
    expect(cards[0].savedVideoId).not.toBeNull()
  })

  it("scores a pasted video from yt-dlp's numbers once the download lands", async () => {
    const project = await newProject()
    const pasted = await pasteVideoLink(user.id, project.id, TIKTOK)
    await database
      .update(videoViralVideos)
      .set({
        status: "downloaded",
        title: "The impossible card trick",
        channelName: "zachking",
        channelId: "@zachking",
        subscribers: 80_000_000,
        views: 2_000_000,
        likes: 150_000,
        comments: 3_000,
        postedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
        durationSeconds: 25,
      })
      .where(eq(videoViralVideos.id, pasted.video.id))

    const screen = await loadViralProjectScreen(user.id, project.id)
    const shown = screen.videos.find((video) => video.key === pasted.key)
    expect(shown?.title).toBe("The impossible card trick")
    expect(shown?.views).toBe(2_000_000)
    expect(shown?.score.score).toBeGreaterThan(0)
    expect(shown?.score.viewsPerDay).not.toBeNull()
  })

  it("leaves the project when its channel is hidden there", async () => {
    const project = await newProject()
    const pasted = await pasteVideoLink(user.id, project.id, TIKTOK)
    await database
      .update(videoViralVideos)
      .set({ channelId: "@zachking", channelName: "zachking" })
      .where(eq(videoViralVideos.id, pasted.video.id))

    await hideViralChannels(user.id, project.id, [
      { platform: "tiktok", channelId: "@zachking", channelName: "zachking" },
    ])
    const screen = await loadViralProjectScreen(user.id, project.id)
    expect(screen.videos.some((video) => video.key === pasted.key)).toBe(false)
  })
})

describe("what deleting keeps", () => {
  it("deleting the project keeps the saved video and its breakdown", async () => {
    const project = await newProject()
    const pasted = await pasteVideoLink(user.id, project.id, TIKTOK)

    await deleteViralProjects(user.id, [project.id])

    expect(await database.select().from(videoViralProjects)).toHaveLength(0)
    expect(await database.select().from(videoViralProjectLinks)).toHaveLength(0)
    const [row] = await savedRows()
    expect(row.id).toBe(pasted.video.id)
  })

  it("deleting the saved video takes it out of the project", async () => {
    const project = await newProject()
    const pasted = await pasteVideoLink(user.id, project.id, TIKTOK)

    await deleteSavedVideos(user.id, [pasted.video.id])

    expect(await database.select().from(videoViralProjectLinks)).toHaveLength(0)
    const screen = await loadViralProjectScreen(user.id, project.id)
    expect(screen.videos.some((video) => video.key === pasted.key)).toBe(false)
  })
})

describe("the hook's words on the screen's read", () => {
  it("come with a broken-down video, and not with one still waiting", async () => {
    const project = await newProject()
    const pasted = await pasteVideoLink(user.id, project.id, TIKTOK)
    let screen = await loadViralProjectScreen(user.id, project.id)
    expect(screen.videos.find((video) => video.key === pasted.key)?.hook).toBeNull()

    await database
      .update(videoViralVideos)
      .set({
        status: "ready",
        breakdown: {
          transcript: [
            { startMs: 0, endMs: 1200, text: "This card should not exist." },
            { startMs: 5000, endMs: 6000, text: "Follow for part two." },
          ],
          segments: [
            { role: "hook", startMs: 0, endMs: 2000, summary: "An impossible claim." },
            { role: "cta", startMs: 2000, endMs: 6000, summary: "Asks for a follow." },
          ],
          scenes: [{ startMs: 0, endMs: 6000 }],
        },
      })
      .where(eq(videoViralVideos.id, pasted.video.id))

    screen = await loadViralProjectScreen(user.id, project.id)
    expect(screen.videos.find((video) => video.key === pasted.key)?.hook).toEqual({
      startMs: 0,
      endMs: 2000,
      text: "This card should not exist.",
    })
  })
})
