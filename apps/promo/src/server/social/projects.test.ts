import type { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { uuid } from "@/server/auth/security"
import { createProfile } from "@/server/browser/profiles"
import { promoProfiles } from "@/server/browser/schema"
import { createTestDatabase, insertUser, type TestDatabase } from "@/server/test-support"
import type { ProfileIdentity } from "@/lib/social/options"
import type { WrittenPageNode } from "@/lib/pages/written-page-body"
import { projectDescriptionText } from "@/lib/social/project-description"

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
  addProjectNetwork,
  createProject,
  deleteProject,
  deleteProjects,
  listProjectRows,
  projectForOldScreen,
  readProjectView,
  removeAccountFromProject,
  removeProjectNetwork,
  setProjectDescriptionLocked,
  setProjectPinned,
  updateProject,
} = await import("./projects")
const { promoAccounts, promoComments, promoFinds, promoJobs, promoKeywords, promoPosts, promoProjects } = await import("./schema")
const { promoXPosts } = await import("./x/schema")
const { readPostCounts } = await import("./post-counts")
const { queueJob } = await import("./jobs")

const DAY_MS = 86_400_000

/** A description as the editor sends it: a paragraph per line. */
function doc(...lines: string[]): WrittenPageNode {
  return { type: "doc", content: lines.map((text) => ({ type: "paragraph", content: [{ type: "text", text }] })) }
}
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
    await updateProject(userId, second, { name: "Renamed", description: doc("A tool for teams.") }, db)

    const rows = await db.select().from(promoProjects).where(eq(promoProjects.userId, userId))
    expect(rows.map((row) => [row.id, row.name, projectDescriptionText(row.description)]).sort()).toEqual(
      [
        [first, "First", ""],
        [second, "Renamed", "A tool for teams."],
      ].sort()
    )
    await expect(createProject(userId, "   ", db)).rejects.toThrow("needs a name")
  })

  it("tells the AI the description as plain lines, and keeps an emptied one as none", async () => {
    const id = await createProject(userId, "Written", db)
    await updateProject(userId, id, { description: doc("We make invoices.", "For small teams.") }, db)
    expect((await readProjectView(userId, id, db)).project.description).toEqual(doc("We make invoices.", "For small teams."))
    const { projectDescription } = await import("./projects")
    expect(await projectDescription(userId, id, db)).toBe("We make invoices.\nFor small teams.")

    await updateProject(userId, id, { description: { type: "doc", content: [{ type: "paragraph" }] } }, db)
    const [row] = await db.select().from(promoProjects).where(eq(promoProjects.id, id))
    expect(row?.description).toBe("")
  })

  it("refuses a description past 4,000 letters rather than cutting it, and any change while it is locked", async () => {
    const id = await createProject(userId, "Locked", db)
    await updateProject(userId, id, { description: doc("Kept.") }, db)
    await expect(updateProject(userId, id, { description: doc("x".repeat(4_001)) }, db)).rejects.toThrow("Keep it under 4,000")
    // Empty paragraphs hold no letters, so the saved size has a limit of its own.
    const padded: WrittenPageNode = { type: "doc", content: Array.from({ length: 5_000 }, () => ({ type: "paragraph" as const })) }
    padded.content?.push({ type: "paragraph", content: [{ type: "text", text: "Hi." }] })
    await expect(updateProject(userId, id, { description: padded }, db)).rejects.toThrow("Keep it under 4,000")

    await setProjectDescriptionLocked(userId, id, true, db)
    expect((await readProjectView(userId, id, db)).project.descriptionLocked).toBe(true)
    await expect(updateProject(userId, id, { description: doc("Changed.") }, db)).rejects.toThrow("description is locked")
    // The name is not the description, so it still changes.
    await updateProject(userId, id, { name: "Still named" }, db)
    await setProjectDescriptionLocked(userId, id, false, db)
    await updateProject(userId, id, { description: doc("Changed.") }, db)
    expect(projectDescriptionText((await db.select().from(promoProjects).where(eq(promoProjects.id, id)))[0].description)).toBe("Changed.")
  })

  it("pins a project for the table, and another person's id pins nothing", async () => {
    const id = await createProject(userId, "Pinned", db)
    await setProjectPinned(userId, id, true, db)
    expect((await listProjectRows(userId, db)).find((row) => row.id === id)?.pinned).toBe(true)
    const stranger = (await insertUser(db, { role: "admin" })).id
    await expect(setProjectPinned(stranger, id, false, db)).rejects.toThrow("does not exist")
    await setProjectPinned(userId, id, false, db)
    expect((await listProjectRows(userId, db)).find((row) => row.id === id)?.pinned).toBe(false)
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

  it("counts each project's accounts and its own posts on every network for the table, leaving out failed and deleted ones", async () => {
    const a = await createProject(userId, "A", db)
    const b = await createProject(userId, "B", db)
    const { id: accountId } = await account({ projectId: a })
    await account({ projectId: a, retiredAt: NOW })
    const older = new Date("2099-01-01T00:00:00Z")
    const newer = new Date("2099-01-02T00:00:00Z")
    await db.insert(promoPosts).values([
      { id: uuid(), userId, accountId, projectId: a, subreddit: "SaaS", title: "Mine", postedAt: older },
      { id: uuid(), userId, accountId, projectId: a, subreddit: "SaaS", title: "Did not go", status: "failed", postedAt: newer },
    ])
    await db.insert(promoXPosts).values([
      { id: uuid(), userId, projectId: a, status: "posted", postedAt: newer },
      { id: uuid(), userId, projectId: a, status: "posted", postedAt: newer, deletedAt: newer },
      { id: uuid(), userId, projectId: a, status: "draft" },
    ])

    // Made in the same millisecond, so their stored order is not the test's business.
    const rows = (await listProjectRows(userId, db)).sort((x, y) => x.name.localeCompare(y.name))
    expect(rows.map((row) => [row.name, row.accountCount, row.postCount, row.lastPostAt?.toISOString() ?? null])).toEqual([
      ["A", 1, 2, newer.toISOString()],
      ["B", 0, 0, null],
    ])
    expect(rows[1].id).toBe(b)
  })

  it("counts a project's failed Reddit posts and its X drafts and failures on the network rows, leaving out dismissed ones and other projects", async () => {
    const a = await createProject(userId, "A", db, ["reddit", "x"])
    const b = await createProject(userId, "B", db, ["reddit"])
    const failedPost = async (projectId: string, dismissed = false) => {
      const id = await queueJob(userId, "submit", { projectId, accountId: "acc", subreddit: "SaaS", title: "Mine" }, db)
      await db.update(promoJobs).set({ status: "failed", dismissedAt: dismissed ? NOW : null }).where(eq(promoJobs.id, id))
    }
    await failedPost(a)
    await failedPost(a, true)
    await failedPost(b)
    await db.insert(promoXPosts).values([
      { id: uuid(), userId, projectId: a, status: "draft" },
      { id: uuid(), userId, projectId: a, status: "failed" },
      { id: uuid(), userId, projectId: a, status: "posted" },
    ])

    expect(await readPostCounts(userId, a, ["reddit", "x"], db)).toEqual({ reddit: 1, x: 2 })
    expect(await readPostCounts(userId, b, ["reddit"], db)).toEqual({ reddit: 1 })
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
    await updateProject(userId, a, { description: doc("Project A makes invoices.") }, db)
    await updateProject(userId, b, { description: doc("Project B makes rockets.") }, db)
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
    await updateProject(userId, a, { description: doc("Project A makes invoices.") }, db)
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

  it("uses the networks ticked when it is made, and adds or takes one off", async () => {
    const id = await createProject(userId, "Networked", db, ["reddit"])
    expect((await readProjectView(userId, id, db)).project.networks).toEqual(["reddit"])
    await expect(addProjectNetwork(userId, id, "reddit", db)).rejects.toThrow("Networked already uses Reddit.")

    const bare = await createProject(userId, "Bare", db)
    expect((await readProjectView(userId, bare, db)).project.networks).toEqual([])
    await addProjectNetwork(userId, bare, "reddit", db)
    expect((await readProjectView(userId, bare, db)).project.networks).toEqual(["reddit"])
    await removeProjectNetwork(userId, bare, "reddit", db)
    expect((await readProjectView(userId, bare, db)).project.networks).toEqual([])

    // Somebody else's project is never changed.
    const stranger = (await insertUser(db, { role: "admin" })).id
    await expect(addProjectNetwork(stranger, bare, "reddit", db)).rejects.toThrow("does not exist")
    await expect(addProjectNetwork(userId, bare, "myspace" as "reddit", db)).rejects.toThrow("cannot use that network")
  })

  it("refuses to take Reddit off while the project holds Reddit accounts or keywords, saying how many", async () => {
    const projectId = await createProject(userId, "Busy", db, ["reddit"])
    await account({ projectId })
    await find(projectId)
    await expect(removeProjectNetwork(userId, projectId, "reddit", db)).rejects.toThrow(
      "Busy still holds 1 Reddit account and 1 keyword. Take its accounts out and remove its keywords first, then take Reddit off."
    )
    expect((await readProjectView(userId, projectId, db)).project.networks).toEqual(["reddit"])
  })

  it("sends the old screens' addresses to the right project", async () => {
    expect(await projectForOldScreen(userId, "today", null, db)).toBeNull()
    expect(await projectForOldScreen(userId, "jobs", null, db)).toBeNull()

    const first = await createProject(userId, "First", db, ["reddit"])
    expect(await projectForOldScreen(userId, "today", null, db)).toBe(first)

    const second = await createProject(userId, "Second", db, ["reddit"])
    // With two to pick from, Today and Comments go to the Projects table;
    // Jobs is the same list from any project, so the first.
    expect(await projectForOldScreen(userId, "today", null, db)).toBeNull()
    expect(await projectForOldScreen(userId, "comments", null, db)).toBeNull()
    expect(await projectForOldScreen(userId, "jobs", null, db)).toBe(first)

    // A comment opens in the project its account is in now.
    const { id: accountId } = await account({ projectId: second })
    const findId = await find(second)
    const commentId = uuid()
    await db.insert(promoComments).values({
      id: commentId,
      userId,
      findId,
      accountId,
      text: "Try a kanban board.",
      status: "posted",
      postedAt: NOW,
    })
    expect(await projectForOldScreen(userId, "comments", commentId, db)).toBe(second)
    // Another person's comment id says nothing about where it is.
    const stranger = (await insertUser(db, { role: "admin" })).id
    expect(await projectForOldScreen(stranger, "comments", commentId, db)).toBeNull()
  })
})
