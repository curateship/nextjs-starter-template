import { createHmac } from "node:crypto"
import { readFileSync } from "node:fs"
import { join } from "node:path"

import type { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { uuid } from "@/server/auth/security"
import { createTestDatabase, insertUser, type TestDatabase } from "@/server/test-support"
import type { CustomShellUser } from "@/server/schema"

import { acceptHandoff, handoffResponse, readHandoffNote } from "./project-handoff"
import {
  actorFor,
  actorForComment,
  actorForFind,
  actorForFinds,
  actorForInbox,
  actorForJobs,
  actorForKeyword,
  guestOnlyDescription,
  guestProjectView,
  guestSenderName,
  onlyGuestProject,
  refuseGuestDelete,
  type EditorCaller,
} from "./project-guests"
import { listSentComments } from "./comments"
import { createProject } from "./projects"
import {
  promoAccounts,
  promoComments,
  promoFinds,
  promoInbox,
  promoJobs,
  promoKeywords,
  promoProjectGuests,
  type PromoProjectGuestRow,
} from "./schema"

/**
 * Guests sent from Project (`workspace/docs/project-guests.md`): the stamped
 * note that signs one in, and the checks that keep them inside their one
 * project.
 */

const KEY = "promo-key-for-tests"
const AT = new Date("2099-03-02T09:00:00Z")
const ENV = { PROJECT_HANDOFF_KEY: KEY } as NodeJS.ProcessEnv

/** A note as Project writes it (`apps/project/src/server/project/linked-records.ts`). */
function stamp(fields: Record<string, unknown>, key = KEY) {
  const body = Buffer.from(JSON.stringify(fields)).toString("base64url")
  return `${body}.${createHmac("sha256", key).update(body).digest("base64url")}`
}

function note(projectId: string, overrides: Record<string, unknown> = {}) {
  return stamp({
    v: 1,
    app: "promo",
    record: projectId,
    sub: "project-person-1",
    name: "Sam",
    email: "sam@example.test",
    jti: uuid().replace(/-/g, ""),
    exp: AT.getTime() / 1000 + 60,
    ...overrides,
  })
}

let client: PGlite
let db: TestDatabase
let owner: CustomShellUser
let projectId: string
let otherProjectId: string

beforeEach(async () => {
  const made = await createTestDatabase()
  client = made.client
  db = made.db
  owner = await insertUser(db, { role: "admin" })
  projectId = await createProject(owner.id, "Launch", db, ["reddit"])
  otherProjectId = await createProject(owner.id, "Other", db, ["reddit"])
})

afterEach(async () => {
  await client.close()
})

describe("reading a stamped note", () => {
  it("takes a note Project stamped with the shared key", () => {
    expect(readHandoffNote(note(projectId), KEY, AT)).toMatchObject({ app: "promo", record: projectId, name: "Sam" })
  })

  it("refuses a note with any one character changed", () => {
    const good = note(projectId)
    for (let index = 0; index < good.length; index += 1) {
      if (good[index] === ".") continue
      const changed = good.slice(0, index) + (good[index] === "A" ? "B" : "A") + good.slice(index + 1)
      expect(readHandoffNote(changed, KEY, AT), `character ${index}`).toBe("bad")
    }
    expect(readHandoffNote(note(projectId), "another-key", AT)).toBe("bad")
    expect(readHandoffNote("not a note", KEY, AT)).toBe("bad")
  })

  it("refuses a note older than its 60 seconds", () => {
    expect(readHandoffNote(note(projectId), KEY, new Date(AT.getTime() + 61_000))).toBe("expired")
  })

  it("refuses a note meant for another app, or claiming to live too long", () => {
    expect(readHandoffNote(note(projectId, { app: "video" }), KEY, AT)).toBe("bad")
    expect(readHandoffNote(note(projectId, { exp: AT.getTime() / 1000 + 3600 }), KEY, AT)).toBe("bad")
  })
})

describe("accepting a note", () => {
  it("signs in a 12-hour guest once, and refuses the same note after", async () => {
    const raw = note(projectId)
    const first = await acceptHandoff(raw, { database: db, env: ENV, at: AT })
    expect(first).toMatchObject({ projectId })
    expect(await acceptHandoff(raw, { database: db, env: ENV, at: AT })).toEqual({ refused: "used" })

    const guests = await db.select().from(promoProjectGuests)
    expect(guests).toHaveLength(1)
    expect(guests[0]).toMatchObject({ projectId, personName: "Sam", personId: "project-person-1" })
    expect(guests[0].expiresAt.getTime() - AT.getTime()).toBe(12 * 3600_000)
    // Only the token's hash is kept.
    expect("token" in first && guests[0].tokenHash).not.toBe("token" in first && first.token)
  })

  it("refuses everything while Promo has no key, and a project that is gone", async () => {
    expect(await acceptHandoff(note(projectId), { database: db, env: {} as NodeJS.ProcessEnv, at: AT })).toEqual({
      refused: "off",
    })
    expect(await acceptHandoff(note("missing-project"), { database: db, env: ENV, at: AT })).toEqual({
      refused: "gone",
    })
  })

  it("sends the browser on with the cookie, or to the page that says why not", async () => {
    const raw = note(projectId)
    const request = () => new Request(`https://promo.example.test/handoff/project?note=${encodeURIComponent(raw)}`)
    const signedIn = await handoffResponse(request(), { database: db, env: ENV, at: AT })
    expect(signedIn.status).toBe(302)
    expect(signedIn.headers.get("Location")).toBe(`/guest/promo/${projectId}`)
    expect(signedIn.headers.get("Set-Cookie")).toMatch(/^promo_project_guest=[0-9a-f]{64}; Max-Age=43200; Path=\/; HttpOnly; SameSite=Lax; Secure$/)

    // The same address pasted into a second browser.
    const again = await handoffResponse(request(), { database: db, env: ENV, at: AT })
    expect(again.headers.get("Location")).toBe("/guest/refused?why=used")
    expect(again.headers.get("Set-Cookie")).toBeNull()
  })
})

describe("who a guest's call acts as", () => {
  let guest: PromoProjectGuestRow
  let asGuest: EditorCaller
  let accountId: string
  let otherAccountId: string
  let keywordId: string
  let otherKeywordId: string
  let findId: string
  let otherFindId: string

  beforeEach(async () => {
    const accepted = await acceptHandoff(note(projectId), { database: db, env: ENV, at: AT })
    if (!("token" in accepted)) throw new Error("the note was refused")
    ;[guest] = await db.select().from(promoProjectGuests)
    asGuest = { user: null, guests: [guest] }

    accountId = uuid()
    otherAccountId = uuid()
    await db.insert(promoAccounts).values([
      { id: accountId, userId: owner.id, handle: "launch_account", projectId },
      { id: otherAccountId, userId: owner.id, handle: "other_account", projectId: otherProjectId },
    ])
    keywordId = uuid()
    otherKeywordId = uuid()
    await db.insert(promoKeywords).values([
      { id: keywordId, userId: owner.id, projectId, term: "launch" },
      { id: otherKeywordId, userId: owner.id, projectId: otherProjectId, term: "other" },
    ])
    findId = uuid()
    otherFindId = uuid()
    await db.insert(promoFinds).values([
      { id: findId, userId: owner.id, keywordId, redditId: "t3_a", permalink: "/r/a/1/", subreddit: "a", title: "A" },
      { id: otherFindId, userId: owner.id, keywordId: otherKeywordId, redditId: "t3_b", permalink: "/r/b/1/", subreddit: "b", title: "B" },
    ])
  })

  it("acts as the project's owner, inside the guest's own project", async () => {
    expect(await actorFor(asGuest, projectId, db)).toMatchObject({ userId: owner.id, guest: { projectId } })
    expect(await actorForKeyword(asGuest, keywordId, db)).toMatchObject({ userId: owner.id })
    expect(await actorForFind(asGuest, findId, db)).toMatchObject({ userId: owner.id })
  })

  it("refuses another project, and its keyword, post, comment and account by id", async () => {
    const commentId = uuid()
    await db.insert(promoComments).values({ id: commentId, userId: owner.id, findId: otherFindId, accountId: otherAccountId, text: "hi" })
    const inboxId = uuid()
    await db.insert(promoInbox).values({
      id: inboxId,
      userId: owner.id,
      accountId: otherAccountId,
      kind: "comment",
      platform: "instagram",
      thread: "t1",
      author: "someone",
    })

    await expect(actorFor(asGuest, otherProjectId, db)).rejects.toThrow("That project does not exist.")
    await expect(actorForKeyword(asGuest, otherKeywordId, db)).rejects.toThrow("That project does not exist.")
    await expect(actorForFind(asGuest, otherFindId, db)).rejects.toThrow("That project does not exist.")
    await expect(actorForComment(asGuest, commentId, db)).rejects.toThrow("That project does not exist.")
    await expect(actorForInbox(asGuest, [inboxId], db)).rejects.toThrow("That project does not exist.")
    await expect(actorForFind(asGuest, "no-such-post", db)).rejects.toThrow("That project does not exist.")
  })

  it("refuses a batch with even one post from another project", async () => {
    await expect(actorForFinds(asGuest, [findId, otherFindId], db)).rejects.toThrow("That project does not exist.")
    expect(await actorForFinds(asGuest, [findId], db)).toMatchObject({ userId: owner.id })
  })

  it("finds a job's project through what it names", async () => {
    const own = uuid()
    const other = uuid()
    await db.insert(promoJobs).values([
      { id: own, userId: owner.id, kind: "comment", payload: { findId, accountId, text: "hi" } },
      { id: other, userId: owner.id, kind: "submit", payload: { projectId: otherProjectId, accountId: otherAccountId } },
    ] as (typeof promoJobs.$inferInsert)[])
    expect(await actorForJobs(asGuest, [own], db)).toMatchObject({ userId: owner.id })
    await expect(actorForJobs(asGuest, [other], db)).rejects.toThrow("That project does not exist.")
  })

  it("lets a signed-in admin through as before, and refuses a member", async () => {
    expect(await actorFor({ user: owner, guests: [] }, otherProjectId, db)).toEqual({ userId: owner.id, guest: null })
    const member = await insertUser(db, { role: "member" })
    await expect(actorFor({ user: member, guests: [] }, projectId, db)).rejects.toThrow("FORBIDDEN")
  })

  it("takes the owner's other projects out of what a guest is shown", async () => {
    const actor = await actorFor(asGuest, projectId, db)
    const view = await guestProjectView(
      {
        freeAccounts: [{ id: "free", handle: "x", profileName: null }],
        jobs: { queued: 2, running: 0, failed: 0, searchingKeywordIds: [keywordId, otherKeywordId], programRunning: true },
      },
      projectId,
      db
    )
    expect(view.freeAccounts).toEqual([])
    expect(view.jobs.searchingKeywordIds).toEqual([keywordId])

    const rows = [{ project: projectId }, { project: otherProjectId }, { project: null }]
    expect(onlyGuestProject(actor, rows, (row) => row.project)).toEqual([{ project: projectId }])
    expect(onlyGuestProject({ userId: owner.id, guest: null }, rows, (row) => row.project)).toHaveLength(3)
  })

  it("shows the owner who sent a guest's comment", async () => {
    await db.insert(promoComments).values([
      { id: uuid(), userId: owner.id, findId, accountId, text: "Mine.", commentUrl: "https://www.reddit.com/r/a/1/x/" },
      { id: uuid(), userId: owner.id, findId, accountId, text: "Sam's.", commentUrl: "https://www.reddit.com/r/a/1/y/", sentBy: "Sam via Project" },
    ])
    const rows = await listSentComments(owner.id, db)
    expect(Object.fromEntries(rows.map((row) => [row.text, row.sentBy]))).toEqual({
      "Mine.": null,
      "Sam's.": "Sam via Project",
    })
  })

  it("keeps a guest to the description, to editing, and names them on what they send", async () => {
    const actor = await actorFor(asGuest, projectId, db)
    expect(() => guestOnlyDescription({ name: "New name" })).toThrow("description only")
    expect(() => guestOnlyDescription({ imageUrl: "" })).toThrow("description only")
    expect(() => guestOnlyDescription({})).not.toThrow()
    expect(() => refuseGuestDelete(actor, "delete")).toThrow("cannot delete")
    expect(() => refuseGuestDelete(actor, "edit")).not.toThrow()
    expect(guestSenderName(actor)).toBe("Sam via Project")
    expect(guestSenderName({ userId: owner.id, guest: null })).toBeNull()
  })
})

/**
 * What a guest may never do stays behind the shell's admin-only guards, which
 * a guest never passes because a guest has no session. This reads the
 * endpoint files, so switching one of these to the guest door fails here.
 */
describe("the calls a guest is never let into", () => {
  const ADMIN_ONLY: Record<string, string[]> = {
    "social/projects.ts": ["deleteManyFn", "createFn", "networkFn", "deleteFn", "pauseFn", "addAccountFn", "removeAccountFn"],
    "social/reddit/keywords.ts": ["ideasFn"],
    "social/reddit/drafts.ts": ["draftFn", "checkFn", "rewriteFn"],
    "social/reddit/own-posts.ts": ["draftFn"],
    "social/reddit/blocked.ts": ["blockFn", "unblockFn"],
    "social/comments.ts": ["markFn", "draftFn"],
    "social/jobs.ts": ["loadFn", "cancelFn", "retryFn"],
    "social/phone-apps.ts": ["captionFn", "postFn", "cancelFn", "draftReplyFn"],
  }

  for (const [file, names] of Object.entries(ADMIN_ONLY)) {
    it(`keeps ${file} ${names.join(", ")} admin-only`, () => {
      const source = readFileSync(join(process.cwd(), "src/lib/api", file), "utf8")
      for (const name of names) {
        const opening = `const ${name} = createServerFn(`
        const start = source.indexOf(opening)
        expect(start, `${file}:${name} exists`).toBeGreaterThanOrEqual(0)
        const next = source.indexOf("createServerFn(", start + opening.length)
        const body = source.slice(start, next === -1 ? undefined : next)
        expect(body, `${file}:${name}`).toMatch(/\.middleware\(\[admin(Get|Post)\]\)/)
      }
    })
  }
})
