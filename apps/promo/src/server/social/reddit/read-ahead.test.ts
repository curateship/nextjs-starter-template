import type { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { and, eq } from "drizzle-orm"

import { uuid } from "@/server/auth/security"
import {
  createTestDatabase,
  insertUser,
  type TestDatabase,
} from "@/server/test-support"
import { createProject } from "@/server/social/projects"
import { createProfile } from "@/server/browser/profiles"
import { readBehaviour, saveBehaviour } from "@/server/social/behaviour"
import { loadFindDetail } from "@/server/social/keywords"
import { promoFinds, promoJobs, promoKeywords } from "@/server/social/schema"

import {
  MAX_THREADS_PER_SEARCH,
  loadFindThread,
  queueThreadRead,
  runKeywordSearch,
} from "./search"

vi.mock("@/server/browser/command", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/browser/command")>()
  return { ...actual, redditSearch: vi.fn(), redditThread: vi.fn(), redditRules: vi.fn() }
})

const { redditSearch, redditThread } = await import("@/server/browser/command")
const searchReddit = vi.mocked(redditSearch)
const readThread = vi.mocked(redditThread)

const target = { port: 1, token: "t" } as Parameters<typeof runKeywordSearch>[2]

/**
 * A post as the browser hands it back. `fresh` makes it today's with one
 * reply at the top of Reddit's order, which ranks Strong fit; without it the
 * post has no date and ranks Possible.
 */
function post(redditId: string, position: number, fresh: boolean) {
  return {
    redditId,
    permalink: `/r/SaaS/comments/${redditId}/`,
    subreddit: "SaaS",
    title: `Post ${redditId}`,
    body: "",
    linkUrl: "",
    author: "someone",
    score: 1,
    commentCount: 1,
    postedAtSeconds: fresh ? Math.floor(Date.now() / 1000) - 60 : null,
    position,
  }
}

/**
 * After a search, the replies of the best few posts are read on their own,
 * so a Strong fit post opens ready to answer with no Read the replies press.
 */
describe("reading the best posts' replies after a search", () => {
  let client: PGlite
  let db: TestDatabase
  let userId: string
  let keywordId: string

  beforeEach(async () => {
    searchReddit.mockReset()
    readThread.mockReset()
    const made = await createTestDatabase()
    client = made.client
    db = made.db
    userId = (await insertUser(db, { role: "admin" })).id
    const readerId = await createProfile(userId, { name: "Reader" }, db)
    await saveBehaviour(userId, { ...(await readBehaviour(userId, db)), readerProfileId: readerId }, db)
    keywordId = uuid()
    await db.insert(promoKeywords).values({
      id: keywordId,
      userId,
      projectId: await createProject(userId, "A project", db),
      term: "a term",
    })
  })

  afterEach(async () => {
    await client.close()
  })

  async function threadJobs() {
    return db.select().from(promoJobs).where(eq(promoJobs.kind, "thread"))
  }

  async function findId(redditId: string) {
    const [find] = await db
      .select({ id: promoFinds.id })
      .from(promoFinds)
      .where(and(eq(promoFinds.keywordId, keywordId), eq(promoFinds.redditId, redditId)))
    return find.id
  }

  it("queues at most the cap from a search of 25, Strong fit only, best first", async () => {
    // Twenty Strong fit posts and five Possible ones.
    const posts = [
      ...Array.from({ length: 20 }, (_, index) => post(`t3_s${index}`, index, true)),
      ...Array.from({ length: 5 }, (_, index) => post(`t3_p${index}`, 20 + index, false)),
    ]
    searchReddit.mockResolvedValue({ source: "json", url: "", posts })

    await runKeywordSearch(userId, keywordId, target, db)

    const jobs = await threadJobs()
    expect(MAX_THREADS_PER_SEARCH).toBe(5)
    expect(jobs).toHaveLength(MAX_THREADS_PER_SEARCH)
    // The top five of Reddit's order, which rank highest.
    const expected = await Promise.all(["t3_s0", "t3_s1", "t3_s2", "t3_s3", "t3_s4"].map(findId))
    expect(jobs.map((job) => job.payload.findId).sort()).toEqual(expected.sort())
  })

  it("queues nothing for a search with no Strong fit post", async () => {
    searchReddit.mockResolvedValue({
      source: "json",
      url: "",
      posts: [post("t3_a", 0, false), post("t3_b", 1, false)],
    })
    await runKeywordSearch(userId, keywordId, target, db)
    expect(await threadJobs()).toHaveLength(0)
  })

  it("never reads a thread again on a second run, and never queues one twice", async () => {
    searchReddit.mockResolvedValue({
      source: "json",
      url: "",
      posts: [post("t3_a", 0, true), post("t3_b", 1, true)],
    })
    await runKeywordSearch(userId, keywordId, target, db)
    expect(await threadJobs()).toHaveLength(2)

    // A second run while both reads still wait adds nothing.
    await runKeywordSearch(userId, keywordId, target, db)
    expect(await threadJobs()).toHaveLength(2)

    // Both read, and the jobs done.
    readThread.mockResolvedValue({ source: "json", post: null, replies: [] })
    await loadFindThread(userId, await findId("t3_a"), target, db)
    await loadFindThread(userId, await findId("t3_b"), target, db)
    await db.update(promoJobs).set({ status: "done" })

    await runKeywordSearch(userId, keywordId, target, db)
    expect(await threadJobs()).toHaveLength(2)
  })

  it("leaves out posts already skipped or commented on", async () => {
    searchReddit.mockResolvedValue({
      source: "json",
      url: "",
      posts: [post("t3_a", 0, true), post("t3_b", 1, true), post("t3_c", 2, true)],
    })
    // Stored by an earlier run with no Strong fit, so nothing was read.
    await db.insert(promoFinds).values([
      { id: uuid(), userId, keywordId, redditId: "t3_a", permalink: "/r/SaaS/comments/t3_a/", status: "skipped" },
      { id: uuid(), userId, keywordId, redditId: "t3_b", permalink: "/r/SaaS/comments/t3_b/", status: "commented" },
    ])

    await runKeywordSearch(userId, keywordId, target, db)

    const jobs = await threadJobs()
    expect(jobs.map((job) => job.payload.findId)).toEqual([await findId("t3_c")])
  })

  it("says a read is on its way, and the button does not queue a second", async () => {
    searchReddit.mockResolvedValue({ source: "json", url: "", posts: [post("t3_a", 0, true)] })
    await runKeywordSearch(userId, keywordId, target, db)
    const id = await findId("t3_a")

    expect(await loadFindDetail(userId, id, db)).toMatchObject({ thread: null, threadReading: true })

    await queueThreadRead(userId, id, db)
    expect(await threadJobs()).toHaveLength(1)

    await db.update(promoJobs).set({ status: "done" })
    expect(await loadFindDetail(userId, id, db)).toMatchObject({ threadReading: false })
    await queueThreadRead(userId, id, db)
    expect(await threadJobs()).toHaveLength(2)
  })

  it("keeps a search that worked when the reads cannot be queued", async () => {
    // No reader picked, so a reader job is refused when it is queued.
    await saveBehaviour(userId, { ...(await readBehaviour(userId, db)), readerProfileId: null }, db)
    searchReddit.mockResolvedValue({ source: "json", url: "", posts: [post("t3_a", 0, true)] })
    const errors = vi.spyOn(console, "error").mockImplementation(() => {})

    const outcome = await runKeywordSearch(userId, keywordId, target, db)

    expect(outcome.seen).toBe(1)
    expect(await threadJobs()).toHaveLength(0)
    expect(errors).toHaveBeenCalled()
    errors.mockRestore()
  })
})
