import type { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { uuid } from "@/server/auth/security"
import { createProfile } from "@/server/browser/profiles"
import { promoProfiles } from "@/server/browser/schema"
import { createTestDatabase, insertUser, type TestDatabase } from "@/server/test-support"
import type { ProfileIdentity } from "@/lib/social/options"

vi.mock("@/server/ai/keys", () => ({ getAiKey: vi.fn(async () => "test-key") }))
vi.mock("@/server/ai/usage", () => ({
  runAiCall: vi.fn(async (_meta: unknown, call: () => Promise<{ result: unknown }>) => (await call()).result),
}))

const { readBehaviour, saveBehaviour } = await import("./behaviour")
const { draftComments } = await import("./drafts")
const { queueComment } = await import("./posting")
const {
  accountForFind,
  addAccountToProject,
  createProject,
  deleteProject,
  deleteProjects,
  listProjectRows,
  readProjectView,
  removeAccountFromProject,
  updateProject,
} = await import("./projects")
const { promoAccounts, promoComments, promoFinds, promoJobs, promoKeywords, promoProjects } = await import("./schema")

const DAY_MS = 86_400_000
const NOW = new Date()

/**
 * A project is one thing being promoted: its description, its accounts and
 * its keywords. These are the rules around it, on real rows; no browser runs
 * and no AI is called.
 */
describe("projects", () => {
  let client: PGlite
  let db: TestDatabase
  let userId: string

  beforeEach(async () => {
    const made = await createTestDatabase()
    client = made.client
    db = made.db
    userId = (await insertUser(db, { role: "admin" })).id
  })

  afterEach(async () => {
    vi.unstubAllGlobals()
    await client.close()
  })

  async function account(patch: Partial<typeof promoAccounts.$inferInsert> = {}) {
    const id = uuid()
    const profileId = await createProfile(userId, { name: `Profile ${id.slice(0, 4)}` }, db)
    await db.insert(promoAccounts).values({
      id,
      userId,
      profileId,
      handle: `persona_${id.slice(0, 4)}`,
      redditCreatedAt: new Date(NOW.getTime() - 365 * DAY_MS),
      ...patch,
    })
    return { id, profileId }
  }

  async function find(projectId: string) {
    const keywordId = uuid()
    await db.insert(promoKeywords).values({ id: keywordId, userId, projectId, term: `term ${keywordId}` })
    const id = uuid()
    await db.insert(promoFinds).values({
      id,
      userId,
      keywordId,
      redditId: `t3_${id.slice(0, 6)}`,
      permalink: `/r/x/comments/${id.slice(0, 6)}/`,
      subreddit: "x",
      title: "Which tool do you use?",
    })
    return id
  }

  it("is made, named and described, and a second one sits beside the first", async () => {
    const first = await createProject(userId, "  First  ", db)
    const second = await createProject(userId, "Second", db)
    await updateProject(userId, second, { name: "Renamed", description: "A tool for teams." }, db)

    const rows = await db.select().from(promoProjects).where(eq(promoProjects.userId, userId))
    expect(rows.map((row) => [row.id, row.name, row.description]).sort()).toEqual(
      [
        [first, "First", ""],
        [second, "Renamed", "A tool for teams."],
      ].sort()
    )
    await expect(createProject(userId, "   ", db)).rejects.toThrow("needs a name")
  })

  it("refuses a picture that is not the person's own upload, and takes one off with an empty address", async () => {
    const id = await createProject(userId, "Pictured", db)
    await expect(
      updateProject(userId, id, { imageUrl: "https://tracker.example/pixel.png" }, db)
    ).rejects.toThrow("not one of your uploaded images")
    await updateProject(userId, id, { imageUrl: "" }, db)
    const [row] = await db.select().from(promoProjects).where(eq(promoProjects.id, id))
    expect(row?.imageUrl).toBe("")
  })

  it("refuses to delete a project holding accounts or keywords, saying how many, and deletes nothing", async () => {
    const projectId = await createProject(userId, "Busy", db)
    await account({ projectId })
    await find(projectId)

    await expect(deleteProject(userId, projectId, db)).rejects.toThrow(
      "Busy still holds 1 account and 1 keyword."
    )
    expect(await db.select().from(promoProjects)).toHaveLength(1)
    expect(await db.select().from(promoKeywords)).toHaveLength(1)
  })

  it("deletes an empty project, and another person's id changes nothing", async () => {
    const projectId = await createProject(userId, "Empty", db)
    const stranger = (await insertUser(db, { role: "admin" })).id
    await expect(deleteProject(stranger, projectId, db)).rejects.toThrow("does not exist")
    await deleteProject(userId, projectId, db)
    expect(await db.select().from(promoProjects)).toHaveLength(0)
  })

  it("counts each project's accounts, keywords, waiting posts and sent comments for the table", async () => {
    const a = await createProject(userId, "A", db)
    const b = await createProject(userId, "B", db)
    const { id: accountId } = await account({ projectId: a })
    await account({ projectId: a, retiredAt: NOW })
    const findId = await find(a)
    await find(a)
    await db.update(promoFinds).set({ status: "skipped" }).where(eq(promoFinds.id, findId))
    await db.insert(promoComments).values({ id: uuid(), userId, findId, accountId, text: "Sent." })

    // Made in the same millisecond, so their stored order is not the test's business.
    const rows = (await listProjectRows(userId, db)).sort((x, y) => x.name.localeCompare(y.name))
    expect(rows.map((row) => [row.name, row.accountCount, row.keywordCount, row.waitingCount, row.commentCount])).toEqual([
      ["A", 1, 2, 1, 1],
      ["B", 0, 0, 0, 0],
    ])
    expect(rows[0].lastCommentAt).not.toBeNull()
    expect(rows[1].id).toBe(b)
  })

  it("deletes the empty projects of a ticked few and keeps the rest with why", async () => {
    const busy = await createProject(userId, "Busy", db)
    const empty = await createProject(userId, "Empty", db)
    await find(busy)

    const answer = await deleteProjects(userId, [busy, empty], db)
    expect(answer.deleted).toEqual([empty])
    expect(answer.kept).toEqual([{ id: busy, reason: "Busy still holds 1 keyword. Remove its keywords first, then delete it." }])
  })

  it("keeps an account to one project", async () => {
    const a = await createProject(userId, "A", db)
    const b = await createProject(userId, "B", db)
    const { id } = await account()

    await addAccountToProject(userId, a, id, db)
    await expect(addAccountToProject(userId, b, id, db)).rejects.toThrow("already in another project")
    await removeAccountFromProject(userId, id, db)
    await addAccountToProject(userId, b, id, db)

    const [row] = await db.select().from(promoAccounts).where(eq(promoAccounts.id, id))
    expect(row.projectId).toBe(b)
  })

  it("lists the project's accounts, and offers only accounts in no project", async () => {
    const a = await createProject(userId, "A", db)
    const b = await createProject(userId, "B", db)
    const mine = await account({ projectId: a })
    await account({ projectId: b })
    const free = await account()
    await account({ retiredAt: NOW })

    const view = await readProjectView(userId, a, db, NOW)
    expect(view.accounts.map((row) => row.id)).toEqual([mine.id])
    expect(view.freeAccounts.map((row) => row.id)).toEqual([free.id])
  })

  it("puts an awake account above an asleep one", async () => {
    const projectId = await createProject(userId, "A", db)
    // Twelve hours apart, with twelve waking hours, so at any moment exactly
    // one of the two is awake.
    await saveBehaviour(userId, { ...(await readBehaviour(userId, db)), wakeFromMinute: 480, wakeUntilMinute: 1200 }, db)
    const zone = async (profileId: string, timezone: string) =>
      db
        .update(promoProfiles)
        .set({ fingerprint: { seen: { timezone } } as ProfileIdentity })
        .where(eq(promoProfiles.id, profileId))
    const utc = await account({ projectId })
    const plusTwelve = await account({ projectId })
    await zone(utc.profileId, "UTC")
    // A fixed twelve hours ahead, with no summer time to move it.
    await zone(plusTwelve.profileId, "Etc/GMT-12")

    const view = await readProjectView(userId, projectId, db, NOW)
    const [top, bottom] = view.accounts
    expect(top.posting.awake).toBe(true)
    expect(bottom.posting.awake).toBe(false)
  })

  it("refuses a comment from an account in another project", async () => {
    const a = await createProject(userId, "A", db)
    const b = await createProject(userId, "B", db)
    const findId = await find(a)
    const outsider = await account({ projectId: b })
    const insider = await account({ projectId: a })

    await expect(accountForFind(userId, outsider.id, findId, db)).rejects.toThrow("not in this post's project")
    expect((await accountForFind(userId, insider.id, findId, db)).id).toBe(insider.id)
  })

  it("refuses Post for the warming account with when its warm-up ends, and sends from the ready one", async () => {
    const projectId = await createProject(userId, "A", db)
    await saveBehaviour(userId, { ...(await readBehaviour(userId, db)), wakeFromMinute: 0, wakeUntilMinute: 1439 }, db)
    const warming = await account({ projectId, redditCreatedAt: new Date(NOW.getTime() - DAY_MS) })
    const ready = await account({ projectId })
    const findId = await find(projectId)

    const warmingRow = await accountForFind(userId, warming.id, findId, db)
    await expect(
      queueComment(userId, warmingRow, { findId, text: "Hi.", draftId: null }, db, NOW)
    ).rejects.toThrow("still warming up. Its first comment is allowed")

    const readyRow = await accountForFind(userId, ready.id, findId, db)
    await queueComment(userId, readyRow, { findId, text: "Hi.", draftId: null }, db, NOW)
    const [job] = await db.select().from(promoJobs)
    expect(job.payload).toMatchObject({ findId, accountId: ready.id })
    expect(job.lane).toBe(ready.profileId)
  })

  it("tells a draft its own project's description and not another's", async () => {
    const a = await createProject(userId, "A", db)
    const b = await createProject(userId, "B", db)
    await updateProject(userId, a, { description: "Project A makes invoices." }, db)
    await updateProject(userId, b, { description: "Project B makes rockets." }, db)
    const inA = await account({ projectId: a })
    const findId = await find(a)

    const prompts: string[] = []
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: { body: string }) => {
        prompts.push(JSON.parse(init.body).messages[0].content)
        return new Response(
          JSON.stringify({ content: [{ text: "A draft long enough to count as one.\n---\nAnother draft long enough to count." }], usage: {} })
        )
      })
    )

    await draftComments({ userId, findId, accountId: inA.id }, db)
    // No account clicked yet: the post's own project is told.
    await draftComments({ userId, findId, accountId: null }, db)

    for (const prompt of prompts) {
      expect(prompt).toContain("Project A makes invoices.")
      expect(prompt).not.toContain("Project B makes rockets.")
    }
    expect(prompts).toHaveLength(2)
  })

  it("tells a draft from an account in no project nothing about a product", async () => {
    const a = await createProject(userId, "A", db)
    await updateProject(userId, a, { description: "Project A makes invoices." }, db)
    const loose = await account()
    const findId = await find(a)
    let prompt = ""
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: { body: string }) => {
        prompt = JSON.parse(init.body).messages[0].content
        return new Response(JSON.stringify({ content: [{ text: "A draft long enough to count as one." }], usage: {} }))
      })
    )

    await draftComments({ userId, findId, accountId: loose.id }, db)
    expect(prompt).not.toContain("WHAT I MAKE")
  })
})
