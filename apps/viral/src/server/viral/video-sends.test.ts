import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { now, uuid } from "@/server/auth/security"
import { type CustomShellDb } from "@/server/db"
import { customShellMedia, type CustomShellUser } from "@/server/schema"
import { createTestDatabase, insertUser, insertWorkspace } from "@/server/test-support"
import { createViralProject } from "@/server/viral/projects"
import { viralProjects, viralSends, viralVaultItems } from "@/server/viral/schema"
import { saveVideoApiKey, saveVideoUrl } from "@/server/viral/settings"
import { isVideoCaller } from "@/server/viral/video-link"
import { applyVideoEvent, refreshSendStatus, sendForToken, sendToVideo } from "@/server/viral/video-sends"

/**
 * Send to Video, Viral's side (task part 22), with Video stubbed: the draft
 * message, the file link, Replace and Send as new, and Video's news.
 */

vi.mock("@/server/media/storage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/media/storage")>()),
  getPublicMediaUrl: async (path: string) => `https://media.test/${path}`,
}))

vi.mock("@/server/auth/encryption", () => ({
  encryptSecret: (value: string) => `enc:${value}`,
  decryptSecret: (value: string) => value.replace(/^enc:/, ""),
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
  await saveVideoUrl("http://video.test")
  await saveVideoApiKey("vv_secret_key_for_tests")
})

afterEach(async () => {
  await client.close()
})

async function vaultItem() {
  const project = await createViralProject(user.id, { name: "Meal prep", description: "", keywords: [], folderId: null })
  const at = now()
  const mediaId = uuid()
  await database.insert(customShellMedia).values({
    id: mediaId,
    workspaceId,
    userId: user.id,
    filename: `${mediaId}.mp4`,
    originalName: "Meal prep.mp4",
    fileSize: 12_345,
    mimeType: "video/mp4",
    fileType: "video",
    storagePath: `${user.id}/${mediaId}.mp4`,
    createdAt: at,
    updatedAt: at,
  })
  const id = uuid()
  await database.insert(viralVaultItems).values({
    id,
    ownerId: user.id,
    projectId: project.id,
    platform: "youtube",
    platformVideoId: "abc",
    sourceUrl: "https://www.youtube.com/shorts/abc",
    title: "Meal prep in 10",
    mediaId,
    stats: { views: 1, likes: null, comments: null, subscribers: null, durationSeconds: 30, postedAt: null, score: null, outlier: null },
    analysisTopic: "busy dads",
    analysis: {
      whyItWorks: { hook: "h", parts: [], whySpread: "w" },
      script: [
        { role: "hook", seconds: 3, words: "Dads, listen" },
        { role: "cta", seconds: 2, words: "Follow" },
      ],
      ideas: [],
      title: { title: "Dinner in 10", caption: "", hashtags: [] },
    },
    notes: "Film Sunday",
    createdAt: at,
    updatedAt: at,
  })
  return { project, id }
}

/** A Video that answers each draft with a new id, and writes every message down. */
function fakeVideo(answer: (body: Record<string, unknown>) => Response = () => Response.json({ videoId: "vid-1", editUrl: "http://video.test/admin/video-editor/p1?video=vid-1", status: "copying" })) {
  const messages: { url: string; body: Record<string, unknown>; auth: string | null; redirect?: RequestRedirect }[] = []
  const fetchFn = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : {}
    messages.push({ url: String(url), body, auth: new Headers(init?.headers).get("authorization"), redirect: init?.redirect })
    return answer(body)
  })
  return { fetchFn: fetchFn as unknown as typeof fetch, messages }
}

describe("sending a vault item", () => {
  it("makes a draft with the script, the notes, a link back and a two-hour file link", async () => {
    const { project, id } = await vaultItem()
    const video = fakeVideo()
    const item = await sendToVideo(user.id, { itemId: id, videoProjectId: "p1", mode: null }, video.fetchFn)

    const [message] = video.messages
    expect(message.url).toBe("http://video.test/api/connect/viral/drafts")
    expect(message.auth).toBe("Bearer vv_secret_key_for_tests")
    expect(message.redirect).toBe("error")
    expect(message.body.title).toBe("Dinner in 10")
    expect(message.body.script).toBe("Hook (3s)\nDads, listen\n\nThe ask (2s)\nFollow")
    expect(message.body.notes).toBe("Film Sunday")
    expect(String(message.body.vaultItemUrl)).toContain(`/admin/vault?open=${id}`)
    expect(message.body.viralProjectName).toBe("Meal prep")
    const file = message.body.file as { token: string; size: number; contentType: string }
    expect(file.size).toBe(12_345)
    expect(file.contentType).toBe("video/mp4")
    expect((await sendForToken(file.token))?.itemId).toBe(id)
    expect(await sendForToken("x".repeat(43))).toBeNull()

    expect(item.status).toBe("sent")
    expect(item.sentEditUrl).toContain("vid-1")
    expect(item.send?.status).toBe("copying")
    const [after] = await database.select().from(viralProjects).where(eq(viralProjects.id, project.id))
    expect(after.lastVideoProjectId).toBe("p1")
  })

  it("asks Replace or Send as new the second time, and Replace names the draft", async () => {
    const { id } = await vaultItem()
    const video = fakeVideo()
    await sendToVideo(user.id, { itemId: id, videoProjectId: "p1", mode: null }, video.fetchFn)
    await expect(sendToVideo(user.id, { itemId: id, videoProjectId: "p1", mode: null }, video.fetchFn)).rejects.toThrow(
      "Pick Replace or Send as new"
    )
    await sendToVideo(user.id, { itemId: id, videoProjectId: "p1", mode: "replace" }, video.fetchFn)
    expect(video.messages[1].body.replaceVideoId).toBe("vid-1")
    await sendToVideo(user.id, { itemId: id, videoProjectId: "p1", mode: "new" }, video.fetchFn)
    expect(video.messages[2].body.replaceVideoId).toBeUndefined()
    // Every send has its own id, so Try again never reuses a failed one.
    expect(new Set(video.messages.map((one) => one.body.sendId)).size).toBe(3)
  })

  it("keeps Video's refusal as the send's reason and leaves the item unsent", async () => {
    const { id } = await vaultItem()
    const video = fakeVideo(() => Response.json({ error: "That Video project isn't there any more." }, { status: 404 }))
    await expect(sendToVideo(user.id, { itemId: id, videoProjectId: "gone", mode: null }, video.fetchFn)).rejects.toThrow(
      "isn't there any more"
    )
    const [send] = await database.select().from(viralSends)
    expect(send.status).toBe("failed")
    expect(send.tokenHash).toBeNull()
    const [item] = await database.select().from(viralVaultItems)
    expect(item.status).toBe("idea")
  })
})

describe("Video's news", () => {
  it("arrived marks the send ready and ends the file link", async () => {
    const { id } = await vaultItem()
    const video = fakeVideo()
    await sendToVideo(user.id, { itemId: id, videoProjectId: "p1", mode: null }, video.fetchFn)
    const sendId = String(video.messages[0].body.sendId)
    const token = (video.messages[0].body.file as { token: string }).token
    await applyVideoEvent({ type: "arrived", sendId, videoId: "vid-1", editUrl: "http://video.test/e" })
    const [send] = await database.select().from(viralSends)
    expect(send.status).toBe("ready")
    expect(await sendForToken(token)).toBeNull()
  })

  it("a failed new draft stops the item saying Sent; a failed Replace keeps it", async () => {
    const { id } = await vaultItem()
    const video = fakeVideo()
    await sendToVideo(user.id, { itemId: id, videoProjectId: "p1", mode: null }, video.fetchFn)
    await applyVideoEvent({ type: "failed", sendId: String(video.messages[0].body.sendId), error: "Too big" })
    let [item] = await database.select().from(viralVaultItems)
    expect(item.status).toBe("scripted")
    expect(item.sentVideoId).toBeNull()

    await sendToVideo(user.id, { itemId: id, videoProjectId: "p1", mode: null }, video.fetchFn)
    await applyVideoEvent({ type: "arrived", sendId: String(video.messages[1].body.sendId), videoId: "vid-1", editUrl: "http://video.test/e" })
    await sendToVideo(user.id, { itemId: id, videoProjectId: "p1", mode: "replace" }, video.fetchFn)
    await applyVideoEvent({ type: "failed", sendId: String(video.messages[2].body.sendId), error: "Too big" })
    ;[item] = await database.select().from(viralVaultItems)
    expect(item.status).toBe("sent")
    expect(item.sentVideoId).toBe("vid-1")
  })

  it("asking Video how a copy is doing turns 'gone' into a failure", async () => {
    const { id } = await vaultItem()
    const video = fakeVideo((body) =>
      body.sendId ? Response.json({ videoId: "vid-1", editUrl: "http://video.test/e", status: "copying" }) : Response.json({ status: "gone" })
    )
    await sendToVideo(user.id, { itemId: id, videoProjectId: "p1", mode: null }, video.fetchFn)
    const sendId = String(video.messages[0].body.sendId)
    const item = await refreshSendStatus(user.id, sendId, video.fetchFn)
    expect(video.messages[1].url).toBe(`http://video.test/api/connect/viral/sends/${sendId}`)
    expect(item.send?.status).toBe("failed")
  })

  it("news about a finished send, or naming another draft, changes nothing", async () => {
    const { id } = await vaultItem()
    const video = fakeVideo()
    await sendToVideo(user.id, { itemId: id, videoProjectId: "p1", mode: null }, video.fetchFn)
    const sendId = String(video.messages[0].body.sendId)
    await applyVideoEvent({ type: "arrived", sendId, videoId: "someone-elses", editUrl: "http://video.test/x" })
    let [send] = await database.select().from(viralSends)
    expect(send.status).toBe("copying")

    await applyVideoEvent({ type: "arrived", sendId, videoId: "vid-1", editUrl: "http://video.test/e" })
    await applyVideoEvent({ type: "failed", sendId, error: "Too big" })
    ;[send] = await database.select().from(viralSends)
    expect(send.status).toBe("ready")
    const [item] = await database.select().from(viralVaultItems)
    expect(item.status).toBe("sent")
    expect(item.sentVideoId).toBe("vid-1")
  })

  it("keeps an Open in Video link only when it is on Video's own address", async () => {
    const { id } = await vaultItem()
    const scripted = fakeVideo(() => Response.json({ videoId: "vid-1", editUrl: "javascript:alert(1)", status: "copying" }))
    let item = await sendToVideo(user.id, { itemId: id, videoProjectId: "p1", mode: null }, scripted.fetchFn)
    expect(item.sentEditUrl).toBeNull()

    const elsewhere = fakeVideo(() => Response.json({ videoId: "vid-2", editUrl: "https://evil.test/e", status: "ready" }))
    item = await sendToVideo(user.id, { itemId: id, videoProjectId: "p1", mode: "new" }, elsewhere.fetchFn)
    expect(item.sentEditUrl).toBeNull()

    await applyVideoEvent({ type: "arrived", sendId: String(scripted.messages[0].body.sendId), videoId: "vid-1", editUrl: "https://evil.test/e" })
    const sends = await database.select().from(viralSends)
    expect(sends.map((one) => one.editUrl)).toEqual(["", ""])
  })

  it("an answer in a shape Viral doesn't know fails the send and ends its file link", async () => {
    const { id } = await vaultItem()
    const video = fakeVideo(() => Response.json({ videoId: "x".repeat(80), editUrl: "http://video.test/e", status: "done" }))
    await expect(sendToVideo(user.id, { itemId: id, videoProjectId: "p1", mode: null }, video.fetchFn)).rejects.toThrow(
      "doesn't know"
    )
    const [send] = await database.select().from(viralSends)
    expect(send.status).toBe("failed")
    expect(send.tokenHash).toBeNull()
  })

  it("news that lands before Video's answer is kept: a failed copy leaves the item unsent", async () => {
    const { id } = await vaultItem()
    const video = fakeVideo((body) => {
      // Video fails the copy and says so before its answer to the send reaches Viral.
      return Response.json({ videoId: "vid-1", editUrl: "http://video.test/e", status: "copying", sendId: body.sendId })
    })
    const realFetch = video.fetchFn
    const racing = (async (url: RequestInfo | URL, init?: RequestInit) => {
      const reply = await realFetch(url, init)
      const sendId = JSON.parse(String(init?.body)).sendId
      await applyVideoEvent({ type: "failed", sendId, error: "Too big" })
      return reply
    }) as typeof fetch
    await sendToVideo(user.id, { itemId: id, videoProjectId: "p1", mode: null }, racing)
    const [send] = await database.select().from(viralSends)
    expect(send.status).toBe("failed")
    const [item] = await database.select().from(viralVaultItems)
    expect(item.status).toBe("idea")
    expect(item.sentVideoId).toBeNull()
  })

  it("a send stuck at sending for two minutes turns failed when asked", async () => {
    const { id } = await vaultItem()
    const at = new Date(Date.now() - 3 * 60 * 1000)
    await database.insert(viralSends).values({ id: "stuck", ownerId: user.id, itemId: id, videoProjectId: "p1", status: "sending", tokenHash: "a".repeat(64), createdAt: at, updatedAt: at })
    const item = await refreshSendStatus(user.id, "stuck", fakeVideo().fetchFn)
    expect(item.send?.status).toBe("failed")
    const [send] = await database.select().from(viralSends)
    expect(send.tokenHash).toBeNull()
  })

  it("only Video's key opens Viral's doors", async () => {
    const asking = (auth: string | null) => new Request("http://viral.test/api/connect/video/events", auth ? { headers: { authorization: auth } } : {})
    expect(await isVideoCaller(asking("Bearer vv_secret_key_for_tests"))).toBe(true)
    expect(await isVideoCaller(asking("Bearer vv_wrong"))).toBe(false)
    expect(await isVideoCaller(asking(null))).toBe(false)
  })
})
