import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { now, uuid } from "@/server/auth/security"
import * as keys from "@/server/ai/keys"
import { type CustomShellDb } from "@/server/db"
import * as storage from "@/server/media/storage"
import { type CustomShellUser } from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"
import { createPostFolder } from "@/server/note/posts/folders"
import {
  analysePost,
  analysePosts,
  deletePost,
  listPostAuthors,
  listPosts,
  loadPost,
  mergePlans,
  movePost,
  retryPost,
  saveHighlights,
  savePlan,
  savePostLink,
} from "@/server/note/posts/posts"
import { notePosts } from "@/server/note/schema"
import { POST_SAYS } from "@/lib/note/posts/posts"
import { NOTE_SAYS } from "@/lib/note/videos"

/**
 * The rules a click runs into on the Posts screen: one row per post however
 * often it is saved, every read and change scoped to its owner, the filters,
 * Analyse waiting for the words and the video, the plan and the highlights
 * saving as the person left them, and Delete taking the stored pictures.
 *
 * Nothing here reads X, stores a file or asks an AI anything.
 */

let client: PGlite
let database: CustomShellDb
let user: CustomShellUser
let stranger: CustomShellUser

const LINK = "https://x.com/naval/status/1002103360646823936"

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  user = await insertUser(database)
  stranger = await insertUser(database)
  vi.spyOn(storage, "getPublicMediaUrl").mockImplementation(async (path) => `https://files.test/${path}`)
  vi.spyOn(storage, "deleteFromR2").mockResolvedValue(undefined)
  vi.spyOn(keys, "getAiKey").mockResolvedValue("test-key")
})

afterEach(async () => {
  await client.close()
  vi.restoreAllMocks()
})

/** A post as the worker leaves it once read. */
async function insertRead(values: Partial<typeof notePosts.$inferInsert> = {}) {
  const at = now()
  const [row] = await database
    .insert(notePosts)
    .values({
      id: uuid(),
      ownerId: user.id,
      kind: "post",
      postId: String(Math.floor(Math.random() * 1e15)),
      url: "https://x.com/naval/status/1",
      status: "saved",
      authorName: "Naval",
      authorHandle: "naval",
      text: "How to get rich without getting lucky",
      createdAt: at,
      updatedAt: at,
      ...values,
    })
    .returning()
  return row
}

async function rowOf(id: string) {
  const [row] = await database.select().from(notePosts).where(eq(notePosts.id, id))
  return row
}

describe("saving a link", () => {
  it("writes one waiting row, and the same post twice is that row", async () => {
    const first = await savePostLink(user.id, LINK)
    expect(first.alreadySaved).toBe(false)
    expect(first.post).toMatchObject({ status: "waiting", hasText: false, title: "X post" })
    const again = await savePostLink(user.id, "https://twitter.com/naval/status/1002103360646823936?s=20")
    expect(again).toMatchObject({ alreadySaved: true, post: { id: first.post.id } })
    // Another person saving the same post gets a row of their own.
    const theirs = await savePostLink(stranger.id, LINK)
    expect(theirs.post.id).not.toBe(first.post.id)
  })

  it("refuses a link that is not an X post", async () => {
    await expect(savePostLink(user.id, "https://example.com/a")).rejects.toThrow(POST_SAYS.notALink)
  })
})

describe("reading the list", () => {
  it("narrows by author, tag, plan progress and search, and only ever this person's", async () => {
    const done = await insertRead({ tags: ["wealth"], actionPlan: [{ text: "a", done: true }] })
    const started = await insertRead({
      authorHandle: "paulg",
      authorName: "Paul Graham",
      text: "Write simply",
      tags: ["writing"],
      actionPlan: [
        { text: "a", done: true },
        { text: "b", done: false },
      ],
      summary: ["Short words win."],
    })
    const fresh = await insertRead({ actionPlan: [{ text: "a", done: false }] })
    await database.insert(notePosts).values({
      id: uuid(),
      ownerId: stranger.id,
      kind: "post",
      postId: "9",
      status: "saved",
      authorHandle: "naval",
      text: "Theirs",
      createdAt: now(),
      updatedAt: now(),
    })

    const ids = async (filters: Parameters<typeof listPosts>[1]) =>
      (await listPosts(user.id, filters)).posts.map((post) => post.id).sort()
    expect(await ids({})).toEqual([done.id, started.id, fresh.id].sort())
    expect(await ids({ author: "PaulG" })).toEqual([started.id])
    expect(await ids({ tag: "wealth" })).toEqual([done.id])
    expect(await ids({ progress: "done" })).toEqual([done.id])
    expect(await ids({ progress: "in_progress" })).toEqual([started.id])
    expect(await ids({ progress: "not_started" })).toEqual([fresh.id])
    expect(await ids({ search: "short words" })).toEqual([started.id])
    expect(await ids({ search: "paul" })).toEqual([started.id])
    expect((await listPosts(user.id)).similarCount).toBe(1)
  })

  it("lists authors with a count each, most saved first", async () => {
    await insertRead()
    await insertRead()
    await insertRead({ authorHandle: "paulg", authorName: "Paul Graham" })
    expect(await listPostAuthors(user.id)).toEqual([
      { handle: "naval", name: "Naval", pictureUrl: null, count: 2 },
      { handle: "paulg", name: "Paul Graham", pictureUrl: null, count: 1 },
    ])
  })

  it("never shows another person's post", async () => {
    const post = await insertRead()
    await expect(loadPost(stranger.id, post.id)).rejects.toThrow(POST_SAYS.postNotFound)
    await expect(deletePost(stranger.id, post.id)).rejects.toThrow(POST_SAYS.postNotFound)
  })
})

describe("Analyse", () => {
  it("queues a read post, and waits for words and for the video", async () => {
    const post = await insertRead()
    expect((await analysePost(user.id, post.id)).status).toBe("queued")
    const waiting = await insertRead({ status: "reading", text: null })
    await expect(analysePost(user.id, waiting.id)).rejects.toThrow(POST_SAYS.notReadable)
    const video = await insertRead({ videoStatus: "downloading" })
    await expect(analysePost(user.id, video.id)).rejects.toThrow(POST_SAYS.videoStillSaving)
  })

  it("says so at the button when no Gemini key is saved", async () => {
    vi.mocked(keys.getAiKey).mockResolvedValue(null)
    const post = await insertRead()
    await expect(analysePost(user.id, post.id)).rejects.toThrow(NOTE_SAYS.noGeminiKey)
    expect((await rowOf(post.id)).status).toBe("saved")
  })

  it("queues several in one request and says why each skipped one stayed", async () => {
    const a = await insertRead()
    const b = await insertRead({ status: "waiting", text: null })
    const result = await analysePosts(user.id, [a.id, b.id, "missing"])
    expect(result.posts.map((post) => post.id)).toEqual([a.id])
    expect(result.skipped).toEqual([
      { id: b.id, reason: POST_SAYS.notReadable },
      { id: "missing", reason: POST_SAYS.postNotFound },
    ])
  })

  it("Try again reads a post never read, and re-queues one that was", async () => {
    const unread = await insertRead({ status: "failed", text: null, error: "X didn't answer." })
    expect((await retryPost(user.id, unread.id)).status).toBe("waiting")
    const read = await insertRead({ status: "failed", error: "Analysing failed (HTTP 500)" })
    expect((await retryPost(user.id, read.id)).status).toBe("queued")
  })
})

describe("the plan and the highlights", () => {
  it("saves the plan as the person left it, tidied", async () => {
    const post = await insertRead({ status: "ready", actionPlan: [{ text: "Old", done: false }] })
    const card = await savePlan(user.id, post.id, [
      { text: "  Second   now ", done: true },
      { text: "Added", done: false },
    ])
    expect(card.progress).toBe("in_progress")
    expect((await rowOf(post.id)).actionPlan).toEqual([
      { text: "Second now", done: true },
      { text: "Added", done: false },
    ])
    await expect(savePlan(user.id, post.id, [{ text: " ", done: false }])).rejects.toThrow(POST_SAYS.stepEmpty)
  })

  it("will not change a plan while it is being analysed", async () => {
    const post = await insertRead({ status: "analysing", actionPlan: [{ text: "Old", done: false }] })
    await expect(savePlan(user.id, post.id, [{ text: "New", done: false }])).rejects.toThrow(POST_SAYS.stillAnalysing)
  })

  it("keeps only highlights that fit the post's words", async () => {
    const post = await insertRead({ text: "Seek wealth, not money" })
    const card = await saveHighlights(user.id, post.id, [
      { part: "post", start: 0, end: 11 },
      { part: "quoted", start: 0, end: 3 },
    ])
    expect(card.firstHighlight).toBe("Seek wealth")
    expect((await rowOf(post.id)).highlights).toEqual([{ part: "post", start: 0, end: 11 }])
  })
})

describe("folders, merging and deleting", () => {
  it("moves a post into one of the person's folders and clears the AI's suggestion", async () => {
    const folders = await createPostFolder(user.id, "Newsletter")
    const folderId = folders.folders[0].id
    const post = await insertRead({ suggestedFolderId: folderId })
    expect((await movePost(user.id, post.id, folderId)).folderId).toBe(folderId)
    expect((await rowOf(post.id)).suggestedFolderId).toBeNull()
    const theirs = await createPostFolder(stranger.id, "Theirs")
    await expect(movePost(user.id, post.id, theirs.folders[0].id)).rejects.toThrow(NOTE_SAYS.folderNotFound)
  })

  it("merges two analysed posts into a queued plan, and refuses one with no plan", async () => {
    const a = await insertRead({ status: "ready", actionPlan: [{ text: "a", done: false }] })
    const b = await insertRead({ status: "ready", actionPlan: [{ text: "b", done: false }] })
    const card = await mergePlans(user.id, [a.id, b.id])
    expect(card).toMatchObject({ kind: "merged", status: "queued", title: "Plan from 2 posts" })
    const bare = await insertRead()
    await expect(mergePlans(user.id, [a.id, bare.id])).rejects.toThrow(POST_SAYS.noPlanYet)
    await expect(mergePlans(user.id, [a.id])).rejects.toThrow(POST_SAYS.pickTwo)
  })

  it("deleting a post takes its stored pictures and leaves a merged plan as it is", async () => {
    const a = await insertRead({
      status: "ready",
      actionPlan: [{ text: "a", done: false }],
      pictures: [{ path: `note-posts/${user.id}/x/p1.jpg`, width: 1, height: 1 }],
      authorPicturePath: `note-posts/${user.id}/x/author.jpg`,
    })
    const b = await insertRead({ status: "ready", actionPlan: [{ text: "b", done: false }] })
    const merged = await mergePlans(user.id, [a.id, b.id])
    await deletePost(user.id, a.id)
    expect(storage.deleteFromR2).toHaveBeenCalledWith(`note-posts/${user.id}/x/p1.jpg`)
    expect(storage.deleteFromR2).toHaveBeenCalledWith(`note-posts/${user.id}/x/author.jpg`)
    expect(await rowOf(a.id)).toBeUndefined()
    const left = await loadPost(user.id, merged.id)
    expect(left.sources.map((source) => source.id)).toEqual([b.id])
  })
})
