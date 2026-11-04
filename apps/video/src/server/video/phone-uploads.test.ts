import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { PROJECT_NOT_FOUND_MESSAGE } from "@/lib/video/projects"
import { type CustomShellDb } from "@/server/db"
import { type CustomShellUser } from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"
import { createOwnedProject } from "@/server/video/projects"
import { videoPhoneLinks } from "@/server/video/schema"

// The cookie calls only run inside a request; nothing here sets a cookie.
vi.mock("@tanstack/react-start/server", () => ({
  getCookie: () => undefined,
  setCookie: () => undefined,
  getRequestProtocol: () => "http",
}))

const {
  countPhoneFile,
  createPhoneLink,
  endPhoneLink,
  findPhoneSession,
  openPhoneLink,
  phoneLinkStatus,
  PHONE_LINK_MINUTES,
  PHONE_SESSION_HOURS,
} = await import("@/server/video/phone-uploads")

let client: PGlite
let database: CustomShellDb
let owner: CustomShellUser
let projectId: string

const START = new Date("2026-11-04T10:00:00Z")
const minutes = (count: number) => new Date(START.getTime() + count * 60_000)

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  owner = await insertUser(database)
  projectId = (await createOwnedProject(owner.id, "Cooking", database)).project.id
})

afterEach(async () => {
  await client.close()
})

describe("making a phone link", () => {
  it("is only for the owner's own project", async () => {
    const stranger = await insertUser(database)
    await expect(createPhoneLink(stranger.id, projectId, database, START)).rejects.toThrow(
      PROJECT_NOT_FOUND_MESSAGE
    )
  })

  it("keeps only a hash of the secret", async () => {
    const link = await createPhoneLink(owner.id, projectId, database, START)
    const [row] = await database.select().from(videoPhoneLinks)
    expect(row.tokenHash).not.toBe(link.token)
    expect(row.tokenHash).toHaveLength(64)
    expect(link.expiresAt).toEqual(minutes(PHONE_LINK_MINUTES))
  })

  it("clears links and phone sign-ins past both their times", async () => {
    await createPhoneLink(owner.id, projectId, database, START)
    const opened = await createPhoneLink(owner.id, projectId, database, START)
    await openPhoneLink(opened.token, database, minutes(1))
    // 20 minutes on, the unopened one has run out; the opened phone has not.
    await createPhoneLink(owner.id, projectId, database, minutes(20))
    expect(await database.select().from(videoPhoneLinks)).toHaveLength(2)
  })
})

describe("opening it on the phone", () => {
  it("opens once, with the project's name and a sign-in", async () => {
    const link = await createPhoneLink(owner.id, projectId, database, START)
    const opened = await openPhoneLink(link.token, database, minutes(5))
    expect(opened).toMatchObject({ projectName: "Cooking" })
    expect(await openPhoneLink(link.token, database, minutes(6))).toEqual({ refused: "used" })
  })

  it("refuses a link past its 15 minutes", async () => {
    const link = await createPhoneLink(owner.id, projectId, database, START)
    expect(await openPhoneLink(link.token, database, minutes(PHONE_LINK_MINUTES))).toEqual({
      refused: "expired",
    })
  })

  it("refuses a secret nobody made, and anything not shaped like one", async () => {
    await createPhoneLink(owner.id, projectId, database, START)
    expect(await openPhoneLink("a".repeat(64), database, START)).toEqual({ refused: "bad" })
    expect(await openPhoneLink("' or 1=1 --", database, START)).toEqual({ refused: "bad" })
  })
})

describe("the phone's sign-in", () => {
  async function openedSession() {
    const link = await createPhoneLink(owner.id, projectId, database, START)
    const opened = await openPhoneLink(link.token, database, minutes(1))
    if (!("session" in opened)) throw new Error("not opened")
    return { link, session: opened.session }
  }

  it("names the owner and the one project, for two hours", async () => {
    const { session } = await openedSession()
    const found = await findPhoneSession(session, database, minutes(60))
    expect(found).toMatchObject({ userId: owner.id, projectId })
    expect(await findPhoneSession(session, database, minutes(1 + PHONE_SESSION_HOURS * 60))).toBeNull()
  })

  it("is not the link's own secret", async () => {
    const { link } = await openedSession()
    expect(await findPhoneSession(link.token, database, minutes(2))).toBeNull()
  })

  it("tells the editor's window how it stands and what arrived", async () => {
    const { link } = await openedSession()
    expect(await phoneLinkStatus(owner.id, link.id, database, minutes(2))).toEqual({
      state: "open",
      files: 0,
    })
    await countPhoneFile(link.id, database)
    await countPhoneFile(link.id, database)
    expect((await phoneLinkStatus(owner.id, link.id, database, minutes(3))).files).toBe(2)
    expect(
      (await phoneLinkStatus(owner.id, link.id, database, minutes(2 + PHONE_SESSION_HOURS * 60))).state
    ).toBe("ended")
  })

  it("shows somebody else nothing about the link", async () => {
    const { link } = await openedSession()
    const stranger = await insertUser(database)
    expect(await phoneLinkStatus(stranger.id, link.id, database, minutes(2))).toEqual({
      state: "ended",
      files: 0,
    })
  })

  it("stops at once when the owner stops it, and only for the owner", async () => {
    const { link, session } = await openedSession()
    const stranger = await insertUser(database)
    await endPhoneLink(stranger.id, link.id, database, minutes(3))
    expect(await findPhoneSession(session, database, minutes(4))).not.toBeNull()
    await endPhoneLink(owner.id, link.id, database, minutes(3))
    expect(await findPhoneSession(session, database, minutes(4))).toBeNull()
  })

  it("stops when the owner's account is suspended", async () => {
    const { session } = await openedSession()
    const { customShellUsers } = await import("@/server/schema")
    const { eq } = await import("drizzle-orm")
    await database.update(customShellUsers).set({ status: "suspended" }).where(eq(customShellUsers.id, owner.id))
    expect(await findPhoneSession(session, database, minutes(2))).toBeNull()
  })

  it("waits while nobody has scanned the code", async () => {
    const link = await createPhoneLink(owner.id, projectId, database, START)
    expect((await phoneLinkStatus(owner.id, link.id, database, minutes(1))).state).toBe("waiting")
    expect((await phoneLinkStatus(owner.id, link.id, database, minutes(16))).state).toBe("ended")
  })
})
