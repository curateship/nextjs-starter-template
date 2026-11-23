import type { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { uuid } from "@/server/auth/security"
import { createTestDatabase, insertUser, type TestDatabase } from "@/server/test-support"

vi.mock("@/server/ai/keys", () => ({ getAiKey: vi.fn(async () => "test-key") }))
vi.mock("@/server/ai/usage", async (original) => ({
  ...(await original<typeof import("@/server/ai/usage")>()),
  runAiCall: vi.fn(async (_meta: unknown, call: () => Promise<{ result: unknown }>) => (await call()).result),
}))

const { createProject } = await import("./projects")
const { redditPostIdeas } = await import("./reddit/post-ideas")
const { xPostIdeas } = await import("./x/post-ideas")
const { promoFinds, promoKeywords } = await import("./schema")
const { promoXFinds, promoXKeywords } = await import("./x/schema")

/**
 * Post ideas for Reddit and X (part 3 of
 * workspace/tasks/New features/new-features-18-nov.md): the questions in a
 * project's own finds, handed to the AI, and the ideas tied back to the find
 * each came from. The model's answer is written here, so nothing is sent.
 */
describe("post ideas", () => {
  let client: PGlite
  let db: TestDatabase
  let userId: string
  let prompts: string[]

  beforeEach(async () => {
    const made = await createTestDatabase()
    client = made.client
    db = made.db
    userId = (await insertUser(db, { role: "admin" })).id
    prompts = []
  })

  afterEach(async () => {
    vi.unstubAllGlobals()
    await client.close()
  })

  /** The model answers with `text`, and the prompt it was sent is kept. */
  function modelAnswers(text: string) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: { body: string }) => {
        prompts.push(JSON.parse(init.body).messages[0].content)
        return new Response(JSON.stringify({ content: [{ type: "text", text }], usage: { input_tokens: 1, output_tokens: 1 } }))
      })
    )
  }

  async function redditFind(projectId: string, title: string, subreddit = "SaaS") {
    const keywordId = uuid()
    await db.insert(promoKeywords).values({ id: keywordId, userId, projectId, term: `term ${keywordId}` })
    const id = uuid()
    await db.insert(promoFinds).values({
      id,
      userId,
      keywordId,
      redditId: `t3_${id.slice(0, 6)}`,
      permalink: `/r/${subreddit}/comments/${id.slice(0, 6)}/`,
      subreddit,
      title,
    })
    return id
  }

  it("reads only the project's Reddit posts that ask something, and names the subreddit each idea came from", async () => {
    const projectId = await createProject(userId, "Taskly", db)
    const other = await createProject(userId, "Other", db)
    const asked = await redditFind(projectId, "How do you keep a small team on one board?", "projectmanagement")
    await redditFind(projectId, "We shipped our kanban board")
    await redditFind(other, "Which CRM do you use?")
    modelAnswers("IDEA: [1] How do small teams keep one board? | The three columns we never drop.\nnot an idea")

    const ideas = await redditPostIdeas(userId, projectId, db)
    expect(ideas).toEqual([
      { question: "How do small teams keep one board?", about: "The three columns we never drop.", findId: asked, subreddit: "projectmanagement" },
    ])
    expect(prompts[0]).toContain("These are Reddit posts and their replies.")
    expect(prompts[0]).toContain("How do you keep a small team on one board?")
    expect(prompts[0]).not.toContain("Which CRM")
    expect(prompts[0]).not.toContain("We shipped")
  })

  it("refuses with what to do when no Reddit post asks a question, and another person's project finds nothing", async () => {
    const projectId = await createProject(userId, "Taskly", db)
    await redditFind(projectId, "We shipped our kanban board")
    await expect(redditPostIdeas(userId, projectId, db)).rejects.toThrow("No Reddit post found for this project asks a question yet.")
    const stranger = (await insertUser(db, { role: "admin" })).id
    await expect(redditPostIdeas(stranger, projectId, db)).rejects.toThrow("does not exist")
  })

  it("reads the X posts and their top replies that ask something, for the project only", async () => {
    const projectId = await createProject(userId, "Taskly", db)
    const keywordId = uuid()
    await db.insert(promoXKeywords).values({ id: keywordId, userId, projectId, kind: "search", value: "kanban" })
    const findId = uuid()
    await db.insert(promoXFinds).values({
      id: findId,
      userId,
      keywordId,
      postId: "1800000000000000001",
      url: "https://x.com/i/status/1800000000000000001",
      text: "Our team moved off Trello.",
      topReplies: [{ id: "1800000000000000002", handle: "sam", name: "Sam", text: "What did you move to?", likes: 3 }],
    })
    modelAnswers("IDEA: [1] What do teams move to after Trello? | What we picked and why.")

    expect(await xPostIdeas(userId, projectId, db)).toEqual([
      { question: "What do teams move to after Trello?", about: "What we picked and why.", findId },
    ])
    expect(prompts[0]).toContain("These are X posts and their replies.")
    expect(prompts[0]).toContain("What did you move to?")
  })
})
