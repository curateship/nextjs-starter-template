import type { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { eq } from "drizzle-orm"

import { uuid } from "@/server/auth/security"
import {
  createTestDatabase,
  insertUser,
  type TestDatabase,
} from "@/server/test-support"
import { buildDraftPrompt } from "@/server/social/drafts"
import { promoJobs, promoKeywords, promoSubredditRules } from "@/server/social/schema"
import { rulesSummaryText } from "@/lib/social/wording"

import {
  promptRules,
  queueRulesFor,
  queueRulesRead,
  readSubredditRules,
  rulesForSubreddit,
} from "./rules"
import { runKeywordSearch } from "./search"

vi.mock("@/server/browser/command", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/browser/command")>()
  return { ...actual, redditSearch: vi.fn(), redditRules: vi.fn() }
})

const { redditRules, redditSearch } = await import("@/server/browser/command")
const searchReddit = vi.mocked(redditSearch)
const readRules = vi.mocked(redditRules)

const target = { port: 1, token: "t" } as Parameters<typeof runKeywordSearch>[2]

const SELF_PROMOTION = {
  title: "No self-promotion",
  description: "Do not advertise your product or link to it.",
}

function post(redditId: string, subreddit: string) {
  return {
    redditId,
    permalink: `/r/${subreddit}/comments/${redditId}/`,
    subreddit,
    title: "A post",
    body: "",
    author: "someone",
    score: 1,
    commentCount: 1,
    postedAtSeconds: null,
    position: 0,
  }
}

/**
 * A subreddit's own rules are read once, when a post from it first turns up,
 * shown before writing, and handed to the AI labelled as the subreddit's.
 */
describe("subreddit rules", () => {
  let client: PGlite
  let db: TestDatabase
  let userId: string

  beforeEach(async () => {
    searchReddit.mockReset()
    readRules.mockReset()
    const made = await createTestDatabase()
    client = made.client
    db = made.db
    userId = (await insertUser(db, { role: "admin" })).id
  })

  afterEach(async () => {
    await client.close()
  })

  async function rulesJobs() {
    return db.select().from(promoJobs).where(eq(promoJobs.kind, "rules"))
  }

  it("queues a read for each subreddit a search brought in, and only once", async () => {
    const keywordId = uuid()
    await db.insert(promoKeywords).values({ id: keywordId, userId, term: "a term" })
    searchReddit.mockResolvedValue({
      source: "json",
      url: "",
      posts: [post("t3_a", "SaaS"), post("t3_b", "saas"), post("t3_c", "startups")],
    })

    await runKeywordSearch(userId, keywordId, target, db)
    let jobs = await rulesJobs()
    expect(jobs.map((job) => job.payload)).toEqual([
      { subreddits: ["SaaS"] },
      { subreddits: ["startups"] },
    ])

    // A second search while the reads wait queues nothing more.
    await runKeywordSearch(userId, keywordId, target, db)
    expect(await rulesJobs()).toHaveLength(2)

    // Once read, the next search does not read them again.
    readRules.mockResolvedValue({ answered: true, status: 200, source: "json", rules: [SELF_PROMOTION] })
    await readSubredditRules(userId, ["SaaS", "startups"], target, db)
    await db.update(promoJobs).set({ status: "done" })
    await runKeywordSearch(userId, keywordId, target, db)
    jobs = await rulesJobs()
    expect(jobs).toHaveLength(2)
    expect(readRules).toHaveBeenCalledTimes(2)
  })

  it("keeps the four answers apart", async () => {
    expect(await rulesForSubreddit(userId, "SaaS", db)).toMatchObject({ state: "unread", rules: [] })

    readRules.mockResolvedValueOnce({ answered: true, status: 200, source: "json", rules: [SELF_PROMOTION] })
    readRules.mockResolvedValueOnce({ answered: true, status: 200, source: "json", rules: [] })
    readRules.mockResolvedValueOnce({ answered: false, status: 403, source: "json", rules: [] })
    await readSubredditRules(userId, ["SaaS", "quiet", "secret"], target, db)

    expect(await rulesForSubreddit(userId, "saas", db)).toMatchObject({
      state: "read",
      rules: [SELF_PROMOTION],
    })
    expect(await rulesForSubreddit(userId, "quiet", db)).toMatchObject({ state: "none", rules: [] })
    expect(await rulesForSubreddit(userId, "secret", db)).toMatchObject({
      state: "failed",
      error: "Reddit says r/secret is private, so its rules cannot be read.",
    })
    // Only rules that were read reach the AI.
    expect(await promptRules(userId, "SaaS", db)).toEqual([SELF_PROMOTION])
    expect(await promptRules(userId, "secret", db)).toEqual([])
  })

  it("asks a refused subreddit again a day later, and a read one weeks later", async () => {
    readRules.mockResolvedValueOnce({ answered: false, status: 0, source: "json", rules: [] })
    readRules.mockResolvedValueOnce({ answered: true, status: 200, source: "json", rules: [] })
    await readSubredditRules(userId, ["flaky", "steady"], target, db)

    const later = new Date(Date.now() + 25 * 60 * 60 * 1000)
    expect(await queueRulesFor(userId, ["flaky", "steady"], db, later)).toBe(1)
    const [job] = await rulesJobs()
    expect(job.payload).toEqual({ subreddits: ["flaky"] })
  })

  it("rewrites a subreddit's reading in place rather than adding a second row", async () => {
    readRules.mockResolvedValue({ answered: true, status: 200, source: "json", rules: [] })
    await readSubredditRules(userId, ["SaaS"], target, db)
    readRules.mockResolvedValue({ answered: true, status: 200, source: "json", rules: [SELF_PROMOTION] })
    await readSubredditRules(userId, ["saas"], target, db)
    const rows = await db.select().from(promoSubredditRules)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ subreddit: "SaaS", status: "read" })
  })

  it("says a read is coming when a person asks, without queueing twice", async () => {
    await queueRulesRead(userId, "SaaS", db)
    await queueRulesRead(userId, "saas", db)
    expect(await rulesJobs()).toHaveLength(1)
    expect(await rulesForSubreddit(userId, "SaaS", db)).toMatchObject({ reading: true })
  })

  it("fails the job, writing nothing, when the browser cannot answer at all", async () => {
    readRules.mockRejectedValue(new Error("The browser did not answer reddit/rules within 60 seconds."))
    await expect(readSubredditRules(userId, ["SaaS"], target, db)).rejects.toThrow("did not answer")
    expect(await db.select().from(promoSubredditRules)).toEqual([])
  })
})

describe("the rules in front of a person and the AI", () => {
  it("names the self-promotion rule on the folded line", () => {
    expect(
      rulesSummaryText("SaaS", [{ title: "Be kind", description: "" }, SELF_PROMOTION])
    ).toBe('r/SaaS has 2 rules, including "No self-promotion"')
    // r/SaaS's real order on 11 Oct 2026: the spam rule comes first, the
    // promotion rule last, and the promotion rule is the one named.
    expect(
      rulesSummaryText("SaaS", [
        { title: "No Vendor Spam on posts or comments", description: "" },
        { title: "No Promotional or Advertising SaaS", description: "" },
      ])
    ).toBe('r/SaaS has 2 rules, including "No Promotional or Advertising SaaS"')
    expect(rulesSummaryText("cats", [{ title: "Cats only", description: "" }])).toBe(
      "r/cats has 1 rule"
    )
  })

  it("hands the AI the rules labelled as the subreddit's own, apart from mine", () => {
    const prompt = buildDraftPrompt({
      subreddit: "SaaS",
      title: "t",
      body: "b",
      replies: [],
      voice: "",
      product: "My app",
      commentRules: "Never swear.",
      subredditRules: [SELF_PROMOTION],
      count: 2,
    })
    expect(prompt).toContain("MY RULES:\nNever swear.")
    expect(prompt).toContain(
      "THE RULES OF r/SaaS, posted by its moderators. These are the subreddit's own rules, not mine:\n1. No self-promotion: Do not advertise your product or link to it."
    )
    expect(prompt).toContain("- Break none of r/SaaS's own rules above.")
  })

  it("leaves the prompt as it was when there are no rules to hand over", () => {
    const base = {
      subreddit: "SaaS",
      title: "t",
      body: "b",
      replies: [],
      voice: "",
      product: "",
      commentRules: "",
      count: 2,
    }
    expect(buildDraftPrompt({ ...base, subredditRules: [] })).toBe(buildDraftPrompt(base))
    expect(buildDraftPrompt(base)).not.toContain("THE RULES OF")
  })
})
