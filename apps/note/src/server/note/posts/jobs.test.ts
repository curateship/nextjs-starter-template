import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { now, uuid } from "@/server/auth/security"
import { type CustomShellDb } from "@/server/db"
import * as storage from "@/server/media/storage"
import { customShellNotifications, type CustomShellUser } from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"
import * as download from "@/server/note/download"
import * as files from "@/server/note/files"
import * as gemini from "@/server/note/gemini"
import * as analysis from "@/server/note/posts/analysis"
import { claimWaiting, postFailureWords, releaseAbandoned, runNext } from "@/server/note/posts/jobs"
import * as reader from "@/server/note/posts/reader"
import { saveAboutYou } from "@/server/note/posts/settings"
import type { ReadPost } from "@/server/note/posts/x-page"
import { SayableError } from "@/server/note/sayable"
import { noteNoticeLinks, notePosts } from "@/server/note/schema"
import { POST_SAYS } from "@/lib/note/posts/posts"

/**
 * The `note-posts` worker's own rules: a pasted post is read and its pictures
 * kept, a failure keeps its reason and rings the bell, a restart puts an
 * interrupted job back, and Analyse writes what the AI said with the about-you
 * line in the question. X, the bucket and Gemini are stood in for, so nothing
 * here touches the network.
 */

let client: PGlite
let database: CustomShellDb
let user: CustomShellUser

function readPost(values: Partial<ReadPost> = {}): ReadPost {
  return {
    postId: "100",
    authorName: "Naval",
    authorHandle: "naval",
    authorPictureUrl: "https://pbs.twimg.com/profile_images/1/a_400x400.jpg",
    postedAt: new Date("2026-10-18T09:00:00Z"),
    text: "Seek wealth, not money or status.",
    pictures: [{ url: "https://pbs.twimg.com/media/A.jpg?name=medium", width: 800, height: 600 }],
    url: "https://x.com/naval/status/100",
    likes: 1200,
    reposts: 30,
    quoted: null,
    thread: [{ postId: "101", text: "Wealth is assets that earn while you sleep.", pictures: [] }],
    threadStatus: "whole",
    articleUrl: "https://blog.example/post",
    video: null,
    ...values,
  }
}

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  user = await insertUser(database)
  vi.spyOn(storage, "uploadToR2").mockResolvedValue(undefined as never)
  vi.spyOn(storage, "deleteFromR2").mockResolvedValue(undefined)
  vi.spyOn(storage, "getPublicMediaUrl").mockImplementation(async (path) => `https://files.test/${path}`)
  vi.spyOn(gemini, "requireGeminiKey").mockResolvedValue("test-key")
  // Pictures come from X's picture host; anything else fails the test.
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = new URL(String(input))
    if (url.hostname !== "pbs.twimg.com") throw new Error(`Unexpected fetch of ${url}`)
    const answer = new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/jpeg" } })
    // A made-up answer has no address of its own; a real fetch sets it.
    Object.defineProperty(answer, "url", { value: url.toString() })
    return answer
  })
  vi.spyOn(download, "downloadVideo").mockRejectedValue(new SayableError("This post is private"))
})

afterEach(async () => {
  await client.close()
  vi.restoreAllMocks()
})

async function insertPost(values: Partial<typeof notePosts.$inferInsert> = {}) {
  const at = now()
  const [row] = await database
    .insert(notePosts)
    .values({
      id: uuid(),
      ownerId: user.id,
      kind: "post",
      postId: "100",
      url: "https://x.com/i/status/100",
      status: "waiting",
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

async function notices() {
  return database
    .select({ message: customShellNotifications.message, detail: customShellNotifications.detail, postId: noteNoticeLinks.postId })
    .from(customShellNotifications)
    .innerJoin(noteNoticeLinks, eq(noteNoticeLinks.noticeId, customShellNotifications.id))
}

describe("reading a pasted post", () => {
  it("saves the words, the author, the thread and the counts, and keeps the pictures", async () => {
    vi.spyOn(reader, "readXPost").mockResolvedValue(readPost())
    const post = await insertPost()
    await runNext()
    const row = await rowOf(post.id)
    expect(row).toMatchObject({
      status: "saved",
      url: "https://x.com/naval/status/100",
      authorHandle: "naval",
      text: "Seek wealth, not money or status.",
      threadStatus: "whole",
      articleUrl: "https://blog.example/post",
      likesWhenSaved: 1200,
      repostsWhenSaved: 30,
      videoStatus: "none",
      leaseToken: null,
    })
    expect(row.pictures).toEqual([{ path: `note-posts/${user.id}/${post.id}/p1.jpg`, width: 800, height: 600 }])
    expect(row.authorPicturePath).toBe(`note-posts/${user.id}/${post.id}/author.jpg`)
    expect(row.thread).toEqual([{ postId: "101", text: "Wealth is assets that earn while you sleep.", pictures: [] }])
    // Saving rings nothing: the person watched it arrive.
    expect(await notices()).toEqual([])
  })

  it("fails with X's reason, rings the bell once, and throws the pictures away", async () => {
    vi.spyOn(reader, "readXPost").mockRejectedValue(new SayableError(POST_SAYS.deleted))
    const post = await insertPost()
    await runNext()
    expect(await rowOf(post.id)).toMatchObject({ status: "failed", error: POST_SAYS.deleted, text: null })
    expect(await notices()).toEqual([{ message: "Failed: X post", detail: POST_SAYS.deleted, postId: post.id }])
  })

  it("keeps the words when the video will not download, and says why", async () => {
    vi.spyOn(reader, "readXPost").mockResolvedValue(
      readPost({ video: { url: "https://video.twimg.com/vid/avc1/720x1280/b.mp4", seconds: 78, coverUrl: null } })
    )
    const post = await insertPost()
    await runNext()
    expect(await rowOf(post.id)).toMatchObject({
      status: "saved",
      videoStatus: "failed",
      videoError: "This post is private",
      videoSeconds: 78,
      leaseToken: null,
    })
    expect((await notices())[0].message).toBe("The video couldn't be saved: @naval")
  })

  it("never throws away a saved post's pictures over its video", async () => {
    vi.spyOn(reader, "readXPost").mockResolvedValue(
      readPost({ video: { url: "https://video.twimg.com/vid/avc1/720x1280/b.mp4", seconds: 78, coverUrl: null } })
    )
    const post = await insertPost()
    await runNext()
    expect(storage.deleteFromR2).not.toHaveBeenCalledWith(`note-posts/${user.id}/${post.id}/p1.jpg`)
    expect((await rowOf(post.id)).pictures).toHaveLength(1)
  })

  it("stores nothing when the post went away during the download", async () => {
    vi.spyOn(reader, "readXPost").mockResolvedValue(
      readPost({ video: { url: "https://video.twimg.com/vid/avc1/720x1280/b.mp4", seconds: 78, coverUrl: null } })
    )
    const store = vi.spyOn(files, "storeFile")
    const post = await insertPost()
    vi.mocked(download.downloadVideo).mockImplementation(async () => {
      // Deleted while the file was coming down.
      await database.delete(notePosts).where(eq(notePosts.id, post.id))
      return {
        dir: "/nonexistent-note-post-test",
        filePath: "/nonexistent-note-post-test/v.mp4",
        mimeType: "video/mp4",
        kind: "video",
        sizeBytes: 10,
        source: "generic",
        platformVideoId: null,
        title: null,
        channelName: null,
        durationSeconds: 78,
        postedAt: null,
      }
    })
    await runNext()
    expect(store).not.toHaveBeenCalled()
  })

  it("does not download a video over 30 minutes", async () => {
    vi.spyOn(reader, "readXPost").mockResolvedValue(
      readPost({ video: { url: "https://video.twimg.com/vid/avc1/720x1280/b.mp4", seconds: 31 * 60, coverUrl: null } })
    )
    const post = await insertPost()
    await runNext()
    expect(await rowOf(post.id)).toMatchObject({ videoStatus: "too_long", leaseToken: null })
    expect(download.downloadVideo).not.toHaveBeenCalled()
  })

  it("puts a read whose worker went away back to waiting", async () => {
    vi.spyOn(reader, "readXPost").mockResolvedValue(readPost())
    const post = await insertPost()
    const claimed = await claimWaiting()
    expect(claimed?.id).toBe(post.id)
    await database.update(notePosts).set({ leaseExpiresAt: new Date(Date.now() - 1000) }).where(eq(notePosts.id, post.id))
    await releaseAbandoned()
    expect(await rowOf(post.id)).toMatchObject({ status: "waiting", leaseToken: null })
  })
})

describe("analysing", () => {
  it("writes the AI's answer with the about-you line in the question, and rings the bell", async () => {
    await saveAboutYou("writes a newsletter about AI")
    const summarise = vi.spyOn(analysis, "summarisePost").mockResolvedValue({
      summary: ["Wealth beats money."],
      actionPlan: [{ text: "List what earns while you sleep", done: false }],
      tags: ["wealth"],
      folderId: null,
      similarPostId: null,
    })
    const post = await insertPost({
      status: "queued",
      text: "Seek wealth",
      authorHandle: "naval",
      actionPlan: [{ text: "Old ticked step", done: true }],
    })
    await runNext()
    expect(summarise).toHaveBeenCalledWith(expect.objectContaining({ aboutYou: "writes a newsletter about AI" }))
    expect(await rowOf(post.id)).toMatchObject({
      status: "ready",
      summary: ["Wealth beats money."],
      // Analyse again replaces the plan, ticks and all.
      actionPlan: [{ text: "List what earns while you sleep", done: false }],
      tags: ["wealth"],
      leaseToken: null,
    })
    expect((await notices())[0].message).toBe("Analysed: @naval")
  })

  it("fails with the AI's own sentence and keeps the words", async () => {
    vi.spyOn(analysis, "summarisePost").mockRejectedValue(new SayableError("Analysing failed (HTTP 500)"))
    const post = await insertPost({ status: "queued", text: "Seek wealth", authorHandle: "naval" })
    await runNext()
    expect(await rowOf(post.id)).toMatchObject({ status: "failed", error: "Analysing failed (HTTP 500)", text: "Seek wealth" })
  })

  it("merges plans from the posts still there", async () => {
    const a = await insertPost({ postId: "1", status: "ready", authorHandle: "naval", actionPlan: [{ text: "a", done: false }] })
    const b = await insertPost({ postId: "2", status: "ready", authorHandle: "paulg", actionPlan: [{ text: "b", done: false }] })
    const merge = vi
      .spyOn(analysis, "mergePostPlans")
      .mockResolvedValue([{ text: "Do both", done: false, from: "@naval" }])
    const merged = await insertPost({ postId: null, kind: "merged", status: "queued", sourcePostIds: [a.id, b.id] })
    await runNext()
    expect(merge).toHaveBeenCalledWith(
      expect.objectContaining({ posts: [expect.objectContaining({ title: "@naval" }), expect.objectContaining({ title: "@paulg" })] })
    )
    expect(await rowOf(merged.id)).toMatchObject({ status: "ready", actionPlan: [{ text: "Do both", done: false, from: "@naval" }] })
    expect((await notices())[0].message).toBe("Plan ready: Plan from 2 posts")
  })
})

describe("postFailureWords", () => {
  it("lets only sentences written for the owner through", () => {
    expect(postFailureWords(new SayableError("X didn't answer. Try again in a minute."))).toBe(
      "X didn't answer. Try again in a minute."
    )
    expect(postFailureWords(new Error(POST_SAYS.private))).toBe(POST_SAYS.private)
    expect(postFailureWords(new Error('relation "x" does not exist'))).toBe(
      "Something went wrong on the server. Try again."
    )
  })
})
