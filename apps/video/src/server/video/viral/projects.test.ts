import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { now, uuid } from "@/server/auth/security"
import { type CustomShellDb } from "@/server/db"
import { type CustomShellUser } from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"
import { createOwnedProject } from "@/server/video/projects"
import {
  videoCreatorPosts,
  videoCreators,
  videoProjects,
  videoViralCollectionItems,
  videoViralProjectCreators,
  videoViralProjectHiddenChannels,
  videoViralProjectKeywords,
  videoViralProjectResults,
  videoViralVideos,
} from "@/server/video/schema"
import { createCollection, setStarred } from "@/server/video/viral/collections"
import {
  addViralKeyword,
  archiveViralProjects,
  createSampleViralProject,
  createViralFolder,
  createViralProject,
  deleteViralProjects,
  duplicateViralProject,
  getViralProjectItem,
  hideViralChannels,
  listViralProjects,
  moveViralProjectsToFolder,
  removeViralKeyword,
  saveViralProjectSettings,
  viralDeleteSummary,
} from "@/server/video/viral/projects"
import { loadViralProjectScreen } from "@/server/video/viral/project-view"
import { unfollowInProject } from "@/server/video/viral/project-creators"

/**
 * Viral projects against a real database with every migration replayed, so
 * these also prove 0114 applies on top of everything before it.
 */

let client: PGlite
let database: CustomShellDb
let user: CustomShellUser
let other: CustomShellUser

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

async function newProject(keywords = ["gym tips"], ownerId = user.id) {
  return createViralProject(ownerId, {
    name: "Gym tips",
    description: "Short workout tips for busy people over 30",
    keywords,
    folderId: null,
  })
}

/** A result row written straight in, as a finished search would. */
async function addResult(
  projectId: string,
  keyword: string,
  overrides: Partial<typeof videoViralProjectResults.$inferInsert> = {}
) {
  const [row] = await database
    .select({ id: videoViralProjectKeywords.id })
    .from(videoViralProjectKeywords)
    .where(eq(videoViralProjectKeywords.keyword, keyword))
  const id = uuid()
  await database.insert(videoViralProjectResults).values({
    id,
    keywordId: row.id,
    projectId,
    platform: "youtube",
    platformVideoId: `v-${id.slice(0, 8)}`,
    url: "https://www.youtube.com/shorts/abc",
    title: "A video",
    channelId: "UCchannel1",
    channelName: "Channel one",
    subscribers: 10_000,
    views: 50_000,
    likes: 1_000,
    comments: 100,
    postedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
    durationSeconds: 40,
    foundAt: now(),
    ...overrides,
  })
  return id
}

describe("making a project", () => {
  it("keeps the description and the keywords in the order typed", async () => {
    const project = await newProject(["gym tips", "home workout", "desk stretches"])
    expect(project.description).toBe("Short workout tips for busy people over 30")
    expect(project.keywords).toEqual(["gym tips", "home workout", "desk stretches"])
    expect(project.days).toBe(30)
    expect(project.video_length).toBe("shorts")
  })

  it("refuses no keywords, an eleventh keyword and a repeat ignoring case", async () => {
    await expect(newProject([])).rejects.toThrow("Add at least one keyword.")
    await expect(
      newProject(Array.from({ length: 11 }, (_, index) => `keyword ${index}`))
    ).rejects.toThrow("at most 10 keywords")
    await expect(newProject(["Gym Tips", "gym tips"])).rejects.toThrow("twice")
  })

  it("adds a keyword later and refuses one already there", async () => {
    const project = await newProject()
    await addViralKeyword(user.id, project.id, "home workout")
    await expect(addViralKeyword(user.id, project.id, "GYM TIPS")).rejects.toThrow(
      "already one of this project's keywords"
    )
    expect((await getViralProjectItem(user.id, project.id)).keywords).toEqual([
      "gym tips",
      "home workout",
    ])
  })

  it("never shows or changes somebody else's project", async () => {
    const theirs = await newProject(["gym tips"], other.id)
    expect(await listViralProjects(user.id, { archived: false })).toEqual([])
    await expect(getViralProjectItem(user.id, theirs.id)).rejects.toThrow(
      "That project is gone"
    )
    await expect(addViralKeyword(user.id, theirs.id, "x")).rejects.toThrow()
  })
})

describe("the list", () => {
  it("files projects in Viral's own folders and archives them", async () => {
    const project = await newProject()
    const folder = await createViralFolder(user.id, "Clients")
    await moveViralProjectsToFolder(user.id, [project.id], folder.id)
    expect(await listViralProjects(user.id, { folderId: folder.id, archived: false })).toHaveLength(1)
    expect(await listViralProjects(user.id, { folderId: null, archived: false })).toHaveLength(0)

    expect(await archiveViralProjects(user.id, [project.id], true)).toEqual([project.id])
    expect(await listViralProjects(user.id, { archived: false })).toHaveLength(0)
    expect(await listViralProjects(user.id, { archived: true })).toHaveLength(1)
  })

  it("counts each video once however many keywords found it", async () => {
    const project = await newProject(["gym tips", "home workout"])
    await addResult(project.id, "gym tips", { platformVideoId: "same" })
    await addResult(project.id, "home workout", { platformVideoId: "same" })
    await addResult(project.id, "home workout", { platformVideoId: "other" })
    expect((await getViralProjectItem(user.id, project.id)).result_count).toBe(2)
  })
})

describe("duplicating", () => {
  it("copies the niche, keywords, filters and hidden channels but no results", async () => {
    const project = await newProject(["gym tips", "home workout"])
    await addResult(project.id, "gym tips")
    await hideViralChannels(user.id, project.id, [
      { platform: "youtube", channelId: "UCspam", channelName: "Spam" },
    ])

    const copy = await duplicateViralProject(user.id, project.id)
    expect(copy.name).toBe("Gym tips copy")
    expect(copy.keywords).toEqual(["gym tips", "home workout"])
    expect(copy.result_count).toBe(0)
    const hidden = await database
      .select()
      .from(videoViralProjectHiddenChannels)
      .where(eq(videoViralProjectHiddenChannels.projectId, copy.id))
    expect(hidden.map((one) => one.channelId)).toEqual(["UCspam"])
    const keywords = await database
      .select()
      .from(videoViralProjectKeywords)
      .where(eq(videoViralProjectKeywords.projectId, copy.id))
    // Nothing is searched until somebody presses Search on the copy.
    expect(keywords.every((keyword) => keyword.status === "idle")).toBe(true)
  })
})

describe("deleting", () => {
  it("says what goes and what stays, and keeps starred videos and editor projects", async () => {
    const project = await newProject()
    await addResult(project.id, "gym tips", { platformVideoId: "a" })
    await addResult(project.id, "gym tips", { platformVideoId: "b" })
    await hideViralChannels(user.id, project.id, [
      { platform: "youtube", channelId: "UCspam", channelName: "Spam" },
    ])
    const collection = await createCollection(user.id, "Gym hooks")
    await setStarred(
      user.id,
      collection.id,
      [
        {
          platform: "youtube",
          platformVideoId: "a",
          url: "https://www.youtube.com/shorts/a",
          title: "A video",
          channelId: "UCchannel1",
          channelName: "Channel one",
          subscribers: 10,
          views: 10,
          likes: null,
          comments: null,
          postedAt: null,
          durationSeconds: 30,
          thumbnailUrl: null,
        },
      ],
      true,
      project.id
    )
    const editor = await createOwnedProject(user.id, "Copied", database, null, null, project.id)

    const summary = await viralDeleteSummary(user.id, [project.id])
    expect(summary).toEqual({
      videos: 2,
      hidden_channels: 1,
      creators: 0,
      starred: 1,
      made_projects: 1,
    })

    expect(await deleteViralProjects(user.id, [project.id])).toEqual([project.id])
    expect(await database.select().from(videoViralProjectResults)).toHaveLength(0)
    const starred = await database.select().from(videoViralCollectionItems)
    expect(starred).toHaveLength(1)
    expect(starred[0].sourceProjectId).toBeNull()
    const [kept] = await database
      .select()
      .from(videoProjects)
      .where(eq(videoProjects.id, editor.id))
    expect(kept.sourceViralProjectId).toBeNull()
  })

  it("refuses to delete somebody else's project", async () => {
    const theirs = await newProject(["gym tips"], other.id)
    expect(await deleteViralProjects(user.id, [theirs.id])).toEqual([])
    expect(await listViralProjects(other.id, { archived: false })).toHaveLength(1)
  })
})

describe("keywords and their results", () => {
  it("removing a keyword drops only the videos no other keyword found", async () => {
    const project = await newProject(["gym tips", "home workout"])
    await addResult(project.id, "gym tips", { platformVideoId: "shared" })
    await addResult(project.id, "home workout", { platformVideoId: "shared" })
    await addResult(project.id, "home workout", { platformVideoId: "only-home" })
    const [home] = await database
      .select()
      .from(videoViralProjectKeywords)
      .where(eq(videoViralProjectKeywords.keyword, "home workout"))

    await removeViralKeyword(user.id, home.id)
    const screen = await loadViralProjectScreen(user.id, project.id)
    expect(screen.videos.map((video) => video.platformVideoId)).toEqual(["shared"])
  })
})

describe("the screen", () => {
  it("merges a video two keywords found into one card naming both", async () => {
    const project = await newProject(["gym tips", "home workout"])
    await addResult(project.id, "gym tips", { platformVideoId: "same", views: 100 })
    await addResult(project.id, "home workout", { platformVideoId: "same", views: 900, isNew: true })

    const screen = await loadViralProjectScreen(user.id, project.id)
    expect(screen.videos).toHaveLength(1)
    expect(screen.videos[0].keywords.sort()).toEqual(["gym tips", "home workout"])
    expect(screen.videos[0].views).toBe(900)
    expect(screen.videos[0].isNew).toBe(true)
    expect(screen.keywords.find((one) => one.keyword === "home workout")?.new_count).toBe(1)
  })

  it("leaves out hidden channels, from the videos and the creators", async () => {
    const project = await newProject()
    await addResult(project.id, "gym tips", { channelId: "UCkeep", channelName: "Keep" })
    await addResult(project.id, "gym tips", { channelId: "UCspam", channelName: "Spam" })
    await hideViralChannels(user.id, project.id, [
      { platform: "youtube", channelId: "UCspam", channelName: "Spam" },
    ])

    const screen = await loadViralProjectScreen(user.id, project.id)
    expect(screen.videos.map((video) => video.channelName)).toEqual(["Keep"])
    expect(screen.creators.map((creator) => creator.name)).toEqual(["Keep"])
    expect(screen.hidden).toEqual([
      { platform: "youtube", channelId: "UCspam", channelName: "Spam" },
    ])
  })

  it("ranks the creators behind the results by how many hits they have", async () => {
    const project = await newProject()
    await addResult(project.id, "gym tips", { channelId: "UCone", channelName: "One" })
    await addResult(project.id, "gym tips", { channelId: "UCtwo", channelName: "Two" })
    await addResult(project.id, "gym tips", { channelId: "UCtwo", channelName: "Two" })

    const screen = await loadViralProjectScreen(user.id, project.id)
    expect(screen.creators.map((creator) => [creator.name, creator.hits])).toEqual([
      ["Two", 2],
      ["One", 1],
    ])
    expect(screen.creators[0].typicalScore).not.toBeNull()
  })

  it("marks a video saved only when this person saved it", async () => {
    const project = await newProject()
    await addResult(project.id, "gym tips", { platformVideoId: "studied" })
    const at = now()
    await database.insert(videoViralVideos).values({
      id: uuid(),
      ownerId: other.id,
      platform: "youtube",
      platformVideoId: "studied",
      sourceUrl: "https://www.youtube.com/shorts/studied",
      status: "ready",
      createdAt: at,
      updatedAt: at,
    })
    const screen = await loadViralProjectScreen(user.id, project.id)
    expect(screen.videos[0].savedStatus).toBeNull()
  })
})

describe("a followed creator's video that a keyword also found", () => {
  it("is one card, the search's", async () => {
    const project = await newProject()
    await addResult(project.id, "gym tips", { platformVideoId: "shared", channelId: "UCboth" })
    const at = now()
    const creatorId = uuid()
    await database.insert(videoCreators).values({
      id: creatorId,
      ownerId: user.id,
      platform: "youtube",
      handle: "both",
      platformChannelId: "UCboth",
      profileUrl: "https://www.youtube.com/channel/UCboth",
      watch: true,
      createdAt: at,
      updatedAt: at,
    })
    await database
      .insert(videoViralProjectCreators)
      .values({ projectId: project.id, creatorId, createdAt: at })
    await database.insert(videoCreatorPosts).values({
      id: uuid(),
      ownerId: user.id,
      creatorId,
      platform: "youtube",
      platformVideoId: "shared",
      url: "https://www.youtube.com/watch?v=shared",
      firstSeenAt: at,
    })
    const screen = await loadViralProjectScreen(user.id, project.id)
    expect(screen.videos.map((video) => [video.platformVideoId, video.source])).toEqual([
      ["shared", "search"],
    ])
  })
})

describe("changing the description", () => {
  it("clears the topic numbers judged against the old one, and only then", async () => {
    const project = await newProject()
    await addResult(project.id, "gym tips", { topicMatch: 70 })
    const settings = {
      name: project.name,
      description: project.description,
      days: project.days,
      minViews: 0,
      minScore: 0,
      videoLength: project.video_length,
      spendLimitCents: null,
    }
    await saveViralProjectSettings(user.id, project.id, { ...settings, minScore: 10 })
    expect((await database.select().from(videoViralProjectResults))[0].topicMatch).toBe(70)
    await saveViralProjectSettings(user.id, project.id, { ...settings, description: "Something else" })
    expect((await database.select().from(videoViralProjectResults))[0].topicMatch).toBeNull()
  })
})

describe("creators in several projects", () => {
  async function followed(projectIds: string[]) {
    const at = now()
    const id = uuid()
    await database.insert(videoCreators).values({
      id,
      ownerId: user.id,
      platform: "tiktok",
      handle: "zachking",
      profileUrl: "https://www.tiktok.com/@zachking",
      watch: true,
      createdAt: at,
      updatedAt: at,
    })
    for (const projectId of projectIds) {
      await database
        .insert(videoViralProjectCreators)
        .values({ projectId, creatorId: id, createdAt: at })
    }
    return id
  }

  it("unfollowing in one project keeps them in the other", async () => {
    const first = await newProject()
    const second = await newProject()
    const creatorId = await followed([first.id, second.id])

    await unfollowInProject(user.id, first.id, creatorId)
    expect(await database.select().from(videoCreators)).toHaveLength(1)
    const links = await database.select().from(videoViralProjectCreators)
    expect(links.map((link) => link.projectId)).toEqual([second.id])
  })

  it("unfollowing in the last project unfollows them for good", async () => {
    const only = await newProject()
    const creatorId = await followed([only.id])
    await unfollowInProject(user.id, only.id, creatorId)
    expect(await database.select().from(videoCreators)).toHaveLength(0)
  })
})

describe("the sample project", () => {
  it("is made with made-up results and no outside call", async () => {
    const sample = await createSampleViralProject(user.id)
    expect(sample.sample).toBe(true)
    expect(sample.result_count).toBe(12)
    const screen = await loadViralProjectScreen(user.id, sample.id)
    expect(screen.videos.every((video) => video.sample)).toBe(true)
    expect(screen.creators.length).toBeGreaterThan(0)
    expect(screen.creators.every((creator) => creator.profileUrl === "")).toBe(true)
  })
})
