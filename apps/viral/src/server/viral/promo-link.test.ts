import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { now, uuid } from "@/server/auth/security"
import { type CustomShellDb } from "@/server/db"
import type { CustomShellUser } from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"
import { createSampleViralProject, createViralProject } from "@/server/viral/projects"
import { onPromoAddress, promoCallerOwnerId } from "@/server/viral/promo-link"
import { readCallBody } from "@/server/viral/video-link"
import { applyPromoPosted, listVaultPosts, sendPromoPost, writePromoPost } from "@/server/viral/promo-posts"
import { applyPromoReadAnswer, listSocialPosts, refreshPromoRead, requestPromoRead, requestThreadRead } from "@/server/viral/promo-reads"
import { viralPromoReads, viralPromoSends, viralSettings, viralVaultItems } from "@/server/viral/schema"
import { savePromoApiKey, savePromoUrl } from "@/server/viral/settings"

/**
 * The link with Promo, Viral's side (features task parts 11 to 14, 20 and
 * 21), with Promo and Gemini stubbed: reads and their answers, the thread
 * read, writing and sending a post, and Promo's news about a posted idea.
 */

vi.mock("@/server/auth/encryption", () => ({
  encryptSecret: (value: string) => `enc:${value}`,
  decryptSecret: (value: string) => value.replace(/^enc:/, ""),
}))

const writer = vi.hoisted(() => ({ answer: { title: "", pieces: ["Dinner in 10 minutes, for dads."] } as unknown, calls: [] as unknown[] }))
vi.mock("@/server/viral/writer", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/viral/writer")>()),
  askWriter: async (input: unknown) => {
    writer.calls.push(input)
    return writer.answer
  },
}))

const PROMO = "http://promo.test"
const KEY = "pvr_test_key_for_viral_links_000000000000000000"

let client: PGlite
let database: CustomShellDb
let user: CustomShellUser
let projectId: string

/** Answers each path with its JSON, recording every call. */
function fakePromo(answers: Record<string, { status?: number; body: unknown }>) {
  const calls: { url: string; body: unknown; auth: string | null }[] = []
  const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined, auth: new Headers(init?.headers).get("authorization") })
    const path = url.slice(PROMO.length).split("?")[0]!
    const match = Object.entries(answers).find(([key]) => path === key || (key.endsWith("*") && path.startsWith(key.slice(0, -1))))
    if (!match) return Response.json({ error: "no" }, { status: 404 })
    return Response.json(match[1].body, { status: match[1].status ?? 200 })
  }) as unknown as typeof fetch
  return { fetchImpl, calls }
}

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  user = await insertUser(database)
  projectId = (await createViralProject(user.id, { name: "Meal prep", description: "", keywords: [], folderId: null })).id
  await savePromoUrl(PROMO)
  await savePromoApiKey(KEY, user.id)
  writer.calls = []
  writer.answer = { title: "", pieces: ["Dinner in 10 minutes, for dads."] }
})

afterEach(async () => {
  await client.close()
})

async function vaultItem(status: "idea" | "posted" = "idea") {
  const at = now()
  const id = uuid()
  await database.insert(viralVaultItems).values({
    id,
    ownerId: user.id,
    projectId,
    platform: "youtube",
    platformVideoId: `v-${id}`,
    sourceUrl: "https://www.youtube.com/shorts/abc",
    title: "Meal prep in 10",
    stats: { views: 400_000, likes: null, comments: null, subscribers: null, durationSeconds: 30, postedAt: null, score: null, outlier: null },
    analysisTopic: "busy dads",
    analysis: {
      whyItWorks: { hook: "h", parts: [], whySpread: "w" },
      script: [{ role: "hook", seconds: 3, words: "Dads, listen" }],
      ideas: [],
      title: { title: "Dinner in 10", caption: "Quick", hashtags: ["#mealprep"] },
    },
    notes: "Film Sunday",
    status,
    createdAt: at,
    updatedAt: at,
  })
  return id
}

const xPost = (postId: string, extra: Record<string, unknown> = {}) => ({
  postId,
  url: `https://x.com/dad/status/${postId}`,
  title: "",
  text: "Meal prep thread",
  authorHandle: "dad",
  authorName: "Dad Cooks",
  authorFollowers: 5_000,
  postedSeconds: 1_790_000_000,
  views: 120_000,
  likes: 900,
  replies: 40,
  reposts: 12,
  link: "",
  community: "",
  topReplies: [],
  ...extra,
})

describe("reads through Promo", () => {
  it("asks Promo with the key and keeps the read waiting", async () => {
    const promo = fakePromo({ "/api/connect/viral/reads": { body: { readId: "x", status: "waiting", posts: [], error: "" } } })
    const read = await requestPromoRead(user.id, { projectId, network: "x", kind: "search", value: " meal prep " }, promo.fetchImpl)
    expect(read).toMatchObject({ status: "waiting", network: "x", kind: "search", value: "meal prep" })
    expect(promo.calls[0]).toMatchObject({ url: `${PROMO}/api/connect/viral/reads`, auth: `Bearer ${KEY}` })
    expect(promo.calls[0]!.body).toEqual({ readId: read.id, network: "x", kind: "search", value: "meal prep" })
  })

  it("files an answer Promo gives at once under the read just asked for, whatever id it echoes", async () => {
    const waiting = fakePromo({ "/api/connect/viral/reads": { body: { readId: "x", status: "waiting", posts: [], error: "" } } })
    const older = await requestPromoRead(user.id, { projectId, network: "x", kind: "search", value: "lunch" }, waiting.fetchImpl)
    const promo = fakePromo({
      "/api/connect/viral/reads": { body: { readId: older.id, status: "done", posts: [xPost("777")], error: "" } },
    })
    const read = await requestPromoRead(user.id, { projectId, network: "x", kind: "search", value: "meal prep" }, promo.fetchImpl)
    expect(read).toMatchObject({ status: "done", found: 1 })
    const [olderNow] = await database.select().from(viralPromoReads).where(eq(viralPromoReads.id, older.id))
    expect(olderNow!.status).toBe("waiting")
  })

  it("refuses a kind the network doesn't take, before asking Promo", async () => {
    const promo = fakePromo({})
    await expect(requestPromoRead(user.id, { projectId, network: "reddit", kind: "account", value: "dad" }, promo.fetchImpl)).rejects.toThrow(
      "Promo can't read a account on reddit."
    )
    expect(promo.calls).toHaveLength(0)
  })

  it("keeps Promo's refusal as the read's reason and says it", async () => {
    const promo = fakePromo({ "/api/connect/viral/reads": { status: 409, body: { error: "Add an X search account first." } } })
    await expect(requestPromoRead(user.id, { projectId, network: "x", kind: "search", value: "meal prep" }, promo.fetchImpl)).rejects.toThrow(
      "Add an X search account first."
    )
    const [row] = await database.select().from(viralPromoReads)
    expect(row).toMatchObject({ status: "failed", error: "Add an X search account first." })
  })

  it("stores the posts Promo answers with, once, and drops links off the network's site", async () => {
    const promo = fakePromo({ "/api/connect/viral/reads": { body: { readId: "x", status: "waiting", posts: [], error: "" } } })
    const read = await requestPromoRead(user.id, { projectId, network: "x", kind: "search", value: "meal prep" }, promo.fetchImpl)
    const answer = {
      readId: read.id,
      status: "done" as const,
      posts: [xPost("111"), xPost("222", { url: "https://evil.example/x" })],
      error: "",
    }
    expect(await applyPromoReadAnswer(user.id, answer)).toEqual({ ok: true, changed: true })
    // A call back that lands twice changes nothing.
    expect(await applyPromoReadAnswer(user.id, answer)).toEqual({ ok: true, changed: false })
    const posts = await listSocialPosts(user.id, projectId)
    expect(posts.map((post) => post.postId)).toEqual(["111"])
    expect(posts[0]).toMatchObject({ network: "x", views: 120_000, likes: 900, authorFollowers: 5_000, topReplies: [] })
    const [row] = await database.select().from(viralPromoReads)
    expect(row).toMatchObject({ status: "done", found: 2 })
  })

  it("ignores an answer for another person's read", async () => {
    const promo = fakePromo({ "/api/connect/viral/reads": { body: { readId: "x", status: "waiting", posts: [], error: "" } } })
    const read = await requestPromoRead(user.id, { projectId, network: "x", kind: "search", value: "meal prep" }, promo.fetchImpl)
    const other = await insertUser(database, { email: "other@example.test" })
    const answer = { readId: read.id, status: "done" as const, posts: [xPost("111")], error: "" }
    expect(await applyPromoReadAnswer(other.id, answer)).toEqual({ ok: true, changed: false })
    expect(await listSocialPosts(user.id, projectId)).toHaveLength(0)
    const [row] = await database.select().from(viralPromoReads)
    expect(row).toMatchObject({ status: "waiting" })
  })

  it("lets a call act only for the person who saved the key", async () => {
    const call = new Request("http://viral.test/api/connect/promo/events", { method: "POST", headers: { authorization: `Bearer ${KEY}` } })
    const other = await insertUser(database, { email: "other@example.test" })
    await savePromoApiKey(KEY, other.id)
    expect(await promoCallerOwnerId(call)).toBe(other.id)
    await database.update(viralSettings).set({ promoKeyOwnerId: null })
    expect(await promoCallerOwnerId(call)).toBeNull()
  })

  it("fills in a post's replies from a thread read without making a second post", async () => {
    const promo = fakePromo({ "/api/connect/viral/reads": { body: { readId: "x", status: "waiting", posts: [], error: "" } } })
    const search = await requestPromoRead(user.id, { projectId, network: "x", kind: "search", value: "meal prep" }, promo.fetchImpl)
    await applyPromoReadAnswer(user.id, { readId: search.id, status: "done", posts: [xPost("111")], error: "" })
    const [post] = await listSocialPosts(user.id, projectId)

    const thread = await requestThreadRead(user.id, post!.id, promo.fetchImpl)
    expect(promo.calls[1]!.body).toMatchObject({ network: "x", kind: "post", value: "111" })
    const replies = [{ author: "mum", text: "Saving this", likes: 30 }]
    await applyPromoReadAnswer(user.id, { readId: thread.id, status: "done", posts: [xPost("111", { topReplies: replies, views: 130_000 })], error: "" })

    const after = await listSocialPosts(user.id, projectId)
    expect(after).toHaveLength(1)
    expect(after[0]).toMatchObject({ views: 130_000, topReplies: replies })
    expect(after[0]!.repliesReadAt).not.toBeNull()
  })

  it("never asks Promo to read the sample project's made-up posts", async () => {
    const sample = await createSampleViralProject(user.id)
    const [post] = await listSocialPosts(user.id, sample.id)
    const promo = fakePromo({})
    await expect(requestThreadRead(user.id, post!.id, promo.fetchImpl)).rejects.toThrow(/sample project never reads/)
    expect(promo.calls).toHaveLength(0)
  })

  it("asks Promo how a waiting read stands and applies a failure", async () => {
    const start = fakePromo({ "/api/connect/viral/reads": { body: { readId: "x", status: "waiting", posts: [], error: "" } } })
    const read = await requestPromoRead(user.id, { projectId, network: "reddit", kind: "subreddit", value: "mealprep" }, start.fetchImpl)
    const asked = fakePromo({ "/api/connect/viral/reads/*": { body: { readId: read.id, status: "failed", posts: [], error: "The reader is signed in." } } })
    const after = await refreshPromoRead(user.id, read.id, asked.fetchImpl)
    expect(asked.calls[0]!.url).toBe(`${PROMO}/api/connect/viral/reads/${read.id}`)
    expect(after).toMatchObject({ status: "failed", error: "The reader is signed in." })
  })

  it("turns a read Promo never answered failed after two hours", async () => {
    const start = fakePromo({ "/api/connect/viral/reads": { body: { readId: "x", status: "waiting", posts: [], error: "" } } })
    const read = await requestPromoRead(user.id, { projectId, network: "x", kind: "account", value: "dad" }, start.fetchImpl)
    await database.update(viralPromoReads).set({ createdAt: new Date(Date.now() - 3 * 3600_000) }).where(eq(viralPromoReads.id, read.id))
    const asked = fakePromo({})
    expect(await refreshPromoRead(user.id, read.id, asked.fetchImpl)).toMatchObject({ status: "failed" })
    expect(asked.calls).toHaveLength(0)
  })

  it("lets in only a call carrying the saved Promo key", async () => {
    const call = (auth: string) => new Request("http://viral.test/api/connect/promo/reads", { method: "POST", headers: { authorization: auth } })
    expect(await promoCallerOwnerId(call(`Bearer ${KEY}`))).toBe(user.id)
    expect(await promoCallerOwnerId(call("Bearer pvr_wrong"))).toBeNull()
    expect(await promoCallerOwnerId(call(""))).toBeNull()
  })
})

describe("Write a post for Promo", () => {
  it("writes an X post, metered under its own name for the idea's project", async () => {
    const itemId = await vaultItem()
    const written = await writePromoPost(user.id, itemId, "x")
    expect(written).toMatchObject({ network: "x", pieces: ["Dinner in 10 minutes, for dads."], status: "written", draftUrl: null })
    expect(writer.calls[0]).toMatchObject({ feature: "viral_promo_post", metadata: { vaultItemId: itemId, network: "x" } })
  })

  it("refuses words longer than the network takes", async () => {
    const itemId = await vaultItem()
    writer.answer = { title: "", pieces: ["x".repeat(281)] }
    await expect(writePromoPost(user.id, itemId, "x")).rejects.toThrow("It is 281 characters, and X takes 280. Press Write again.")
    writer.answer = { title: "", pieces: ["one", "two"] }
    await expect(writePromoPost(user.id, itemId, "linkedin")).rejects.toThrow("LinkedIn takes one post.")
  })

  it("sends a written post to Promo as a draft, keeping only a draft link on Promo's address", async () => {
    const itemId = await vaultItem()
    const written = await writePromoPost(user.id, itemId, "x")
    const promo = fakePromo({ "/api/connect/viral/posts": { body: { draftId: "d1", draftUrl: `${PROMO}/admin/projects/p1?network=x&tab=posts&open=r1` } } })
    const sent = await sendPromoPost(user.id, { sendId: written.id, promoProjectId: "p1", title: "", pieces: ["Edited words"] }, promo.fetchImpl)
    expect(promo.calls[0]!.body).toEqual({ sendId: written.id, projectId: "p1", network: "x", ideaId: itemId, pieces: ["Edited words"], title: "" })
    expect(sent).toMatchObject({ status: "sent", pieces: ["Edited words"], draftUrl: `${PROMO}/admin/projects/p1?network=x&tab=posts&open=r1` })
    await expect(sendPromoPost(user.id, { sendId: written.id, promoProjectId: "p1", title: "", pieces: ["Again"] }, promo.fetchImpl)).rejects.toThrow(
      "That post is in Promo already."
    )

    const other = await writePromoPost(user.id, itemId, "x")
    const elsewhere = fakePromo({ "/api/connect/viral/posts": { body: { draftId: "d2", draftUrl: "https://evil.example/draft" } } })
    expect((await sendPromoPost(user.id, { sendId: other.id, promoProjectId: "p1", title: "", pieces: ["Hi"] }, elsewhere.fetchImpl)).draftUrl).toBeNull()
  })

  it("keeps Promo's refusal on a failed send, and lets it be sent again", async () => {
    const itemId = await vaultItem()
    writer.answer = { title: "Dinner in 10", pieces: ["Body"] }
    const written = await writePromoPost(user.id, itemId, "reddit")
    const refused = fakePromo({ "/api/connect/viral/posts": { status: 404, body: { error: "That Promo project is not there any more. Pick another one." } } })
    await expect(sendPromoPost(user.id, { sendId: written.id, promoProjectId: "gone", title: "Dinner in 10", pieces: ["Body"] }, refused.fetchImpl)).rejects.toThrow(
      "That Promo project is not there any more."
    )
    const [row] = await database.select().from(viralPromoSends)
    expect(row).toMatchObject({ status: "failed", error: "That Promo project is not there any more. Pick another one." })
    const ok = fakePromo({ "/api/connect/viral/posts": { body: { draftId: "d1", draftUrl: `${PROMO}/admin/projects/p2?network=reddit&newPost=d1` } } })
    expect(await sendPromoPost(user.id, { sendId: written.id, promoProjectId: "p2", title: "Dinner in 10", pieces: ["Body"] }, ok.fetchImpl)).toMatchObject({ status: "sent" })
  })

  it("never sends a Threads post, because Promo has no Threads", async () => {
    const itemId = await vaultItem()
    const written = await writePromoPost(user.id, itemId, "threads")
    await expect(sendPromoPost(user.id, { sendId: written.id, promoProjectId: "p1", title: "", pieces: ["Hi"] }, fakePromo({}).fetchImpl)).rejects.toThrow(
      "Promo has no Threads"
    )
  })
})

describe("How your version did", () => {
  const posted = (ideaId: string, views: number | null) => ({
    type: "posted" as const,
    ideaId,
    postKey: "x:row-1",
    network: "x",
    url: "https://x.com/me/status/9",
    views,
    likes: 10,
    comments: 2,
    postedAt: "2026-11-04T10:00:00.000Z",
  })

  it("turns the idea Posted and keeps your views, updated by a later report", async () => {
    const itemId = await vaultItem()
    expect(await applyPromoPosted(user.id, posted(itemId, 0))).toEqual({ ok: true, status: "kept" })
    const [item] = await database.select({ status: viralVaultItems.status }).from(viralVaultItems).where(eq(viralVaultItems.id, itemId))
    expect(item!.status).toBe("posted")
    await applyPromoPosted(user.id, posted(itemId, 12_000))
    const posts = await listVaultPosts(user.id, itemId)
    expect(posts).toHaveLength(1)
    expect(posts[0]).toMatchObject({ network: "x", views: 12_000, url: "https://x.com/me/status/9" })
  })

  it("never touches another person's idea, whoever the key belongs to", async () => {
    const itemId = await vaultItem()
    const other = await insertUser(database, { email: "other@example.test" })
    expect(await applyPromoPosted(other.id, posted(itemId, 9))).toEqual({ ok: true, status: "gone" })
    const [item] = await database.select({ status: viralVaultItems.status }).from(viralVaultItems).where(eq(viralVaultItems.id, itemId))
    expect(item!.status).toBe("idea")
    expect(await listVaultPosts(user.id, itemId)).toHaveLength(0)
  })

  it("answers gone for an idea no longer in the vault", async () => {
    expect(await applyPromoPosted(user.id, posted("not-there", 5))).toEqual({ ok: true, status: "gone" })
  })

  it("keeps a link only on Promo's own address", () => {
    expect(onPromoAddress(PROMO, `${PROMO}/admin/projects/1`)).toBe(true)
    expect(onPromoAddress(PROMO, "https://evil.example/admin")).toBe(false)
    expect(onPromoAddress("", `${PROMO}/x`)).toBe(false)
  })
})

describe("the body of a call from Promo or Video", () => {
  const call = (body: string, headers: Record<string, string> = {}) =>
    new Request("http://viral.test/api/connect/promo/events", { method: "POST", body, headers })

  it("is refused by its real length, whatever content-length claims", async () => {
    const big = JSON.stringify({ text: "x".repeat(100) })
    expect(await readCallBody(call(big), 50)).toEqual({ tooLarge: true })
    expect(await readCallBody(call(big, { "content-length": "not a number" }), 500)).toEqual({ tooLarge: true })
  })

  it("reads JSON, and anything else as null", async () => {
    expect(await readCallBody(call('{"ok":1}'), 50)).toEqual({ tooLarge: false, body: { ok: 1 } })
    expect(await readCallBody(call("not json"), 50)).toEqual({ tooLarge: false, body: null })
  })
})
