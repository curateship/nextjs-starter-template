import { createHmac } from "node:crypto"

import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { PROJECT_NOT_FOUND_MESSAGE } from "@/lib/video/projects"
import type { ProjectTimeline } from "@/lib/video/timeline-schema"
import { uuid } from "@/server/auth/security"
import { type CustomShellDb } from "@/server/db"
import { customShellMedia, type CustomShellUser } from "@/server/schema"
import { createTestDatabase, insertUser, insertWorkspace } from "@/server/test-support"
import { listOwnedProjectVersions } from "@/server/video/project-versions"
import {
  actorFor,
  actorForExport,
  actorForMedia,
  guestEditorName,
  projectHoldsMedia,
  signedInActor,
  type EditorCaller,
} from "@/server/video/project-guests"
import { acceptHandoff, readHandoffNote, GUEST_HOURS, type HandoffNote } from "@/server/video/project-handoff"
import { createOwnedProject, writeProjectTimeline } from "@/server/video/projects"
import { videoProjectGuests, videoProjectMedia, videoProjects, videoRenderJobs } from "@/server/video/schema"

const KEY = "shared-key-for-tests"
const ENV = { PROJECT_HANDOFF_KEY: KEY } as NodeJS.ProcessEnv
const AT = new Date("2099-03-02T09:00:00Z")

let client: PGlite
let database: CustomShellDb
let owner: CustomShellUser
let workspaceId: string
let projectId: string
let otherProjectId: string

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  owner = await insertUser(database, { role: "admin" })
  workspaceId = (await insertWorkspace(database, { userId: owner.id })).id
  projectId = (await createOwnedProject(owner.id, "Launch video", database)).id
  otherProjectId = (await createOwnedProject(owner.id, "Someone else's cut", database)).id
})

afterEach(async () => {
  await client.close()
})

function noteFor(overrides: Partial<HandoffNote> = {}): HandoffNote {
  return {
    v: 1,
    app: "video",
    record: projectId,
    sub: "project-person-1",
    name: "Sam",
    email: "sam@example.test",
    jti: "a".repeat(64),
    exp: AT.getTime() / 1000 + 60,
    ...overrides,
  }
}

/** Stamped the way Project stamps it (`apps/project/src/server/project/linked-records.ts`). */
function stamp(note: unknown, key = KEY) {
  const body = Buffer.from(JSON.stringify(note)).toString("base64url")
  return `${body}.${createHmac("sha256", key).update(body).digest("base64url")}`
}

function accept(raw: string, at = AT) {
  return acceptHandoff(raw, { database, env: ENV, at })
}

/** A browser holding a guest sign-in for the project, and no session. */
async function guestCaller(raw = stamp(noteFor())): Promise<EditorCaller> {
  const result = await accept(raw)
  if (!("token" in result)) throw new Error(`refused: ${result.refused}`)
  const guests = await database.select().from(videoProjectGuests).where(eq(videoProjectGuests.projectId, result.projectId))
  return { user: null, guests }
}

async function insertMedia() {
  const [row] = await database
    .insert(customShellMedia)
    .values({
      id: uuid(),
      workspaceId,
      userId: owner.id,
      filename: `${uuid()}.mp4`,
      originalName: "clip.mp4",
      fileSize: 1000,
      mimeType: "video/mp4",
      fileType: "video",
      storagePath: `${owner.id}/${uuid()}.mp4`,
      createdAt: AT,
      updatedAt: AT,
    })
    .returning()
  return row
}

function timelineUsing(mediaId: string, seconds = 5): ProjectTimeline {
  return {
    aspect: "9:16",
    tracks: [
      {
        id: "track-1",
        muted: false,
        clips: [
          {
            id: "clip-1",
            kind: "video",
            name: "clip.mp4",
            startMs: 0,
            durationMs: seconds * 1000,
            trimStartMs: 0,
            url: "https://example.test/a.mp4",
            mediaId,
          },
        ],
      },
    ],
  }
}

describe("reading Project's note", () => {
  it("takes a note Project stamped", () => {
    expect(readHandoffNote(stamp(noteFor()), KEY, AT)).toMatchObject({ record: projectId, name: "Sam" })
  })

  it("refuses a note with any one character changed", () => {
    const raw = stamp(noteFor())
    const swap = (char: string) => (char === "A" ? "B" : "A")
    // Every place in the note and its stamp, the last character included,
    // whose spare bits base64 decoding would ignore.
    for (let index = 0; index < raw.length; index += 1) {
      if (raw[index] === ".") continue
      const changed = raw.slice(0, index) + swap(raw[index]) + raw.slice(index + 1)
      expect(readHandoffNote(changed, KEY, AT), `character ${index}`).toBe("bad")
    }
  })

  it("refuses a note stamped with another key, made for another app, or shaped wrong", () => {
    expect(readHandoffNote(stamp(noteFor(), "another-key"), KEY, AT)).toBe("bad")
    expect(readHandoffNote(stamp({ ...noteFor(), app: "promo" }), KEY, AT)).toBe("bad")
    expect(readHandoffNote(stamp({ hello: "there" }), KEY, AT)).toBe("bad")
    expect(readHandoffNote("not-a-note", KEY, AT)).toBe("bad")
  })

  it("refuses a note older than its minute, and one that claims to live too long", () => {
    expect(readHandoffNote(stamp(noteFor()), KEY, new Date(AT.getTime() + 61_000))).toBe("expired")
    expect(readHandoffNote(stamp(noteFor({ exp: AT.getTime() / 1000 + 3600 })), KEY, AT)).toBe("bad")
  })
})

describe("accepting a handoff", () => {
  it("signs in a guest for 12 hours, once", async () => {
    const raw = stamp(noteFor())
    const first = await accept(raw)
    expect(first).toMatchObject({ projectId })
    const [guest] = await database.select().from(videoProjectGuests)
    expect(guest).toMatchObject({ projectId, personName: "Sam", personEmail: "sam@example.test" })
    expect(guest.expiresAt.getTime() - AT.getTime()).toBe(GUEST_HOURS * 3600_000)
    // The cookie's token is never stored, only its hash.
    expect("token" in first && guest.tokenHash).not.toBe("token" in first && first.token)

    // The same address pasted into a second browser.
    expect(await accept(raw)).toEqual({ refused: "used" })
    expect(await database.select().from(videoProjectGuests)).toHaveLength(1)
  })

  it("lets only one of two tabs racing with the same note in", async () => {
    const raw = stamp(noteFor())
    const results = await Promise.all([accept(raw), accept(raw)])
    expect(results.filter((result) => "token" in result)).toHaveLength(1)
    expect(results.filter((result) => "refused" in result)).toEqual([{ refused: "used" }])
  })

  it("refuses a deleted project, and a server with no key", async () => {
    expect(await accept(stamp(noteFor({ record: "no-such-project" })))).toEqual({ refused: "gone" })
    expect(await acceptHandoff(stamp(noteFor()), { database, env: {} as NodeJS.ProcessEnv, at: AT })).toEqual({
      refused: "off",
    })
  })

  it("refuses an expired note without saving anything", async () => {
    expect(await accept(stamp(noteFor()), new Date(AT.getTime() + 120_000))).toEqual({ refused: "expired" })
    expect(await database.select().from(videoProjectGuests)).toHaveLength(0)
  })
})

describe("what a guest reaches", () => {
  it("acts as the project's owner on its own project", async () => {
    const caller = await guestCaller()
    const actor = await actorFor(caller, projectId, database)
    expect(actor.userId).toBe(owner.id)
    expect(guestEditorName(actor.guest)).toBe("Sam via Project")
  })

  it("is told any other project isn't there", async () => {
    const caller = await guestCaller()
    await expect(actorFor(caller, otherProjectId, database)).rejects.toThrow(PROJECT_NOT_FOUND_MESSAGE)
  })

  it("is refused a call that names no project", async () => {
    const caller = await guestCaller()
    expect(() => signedInActor(caller)).toThrow("AUTH_REQUIRED")
  })

  it("reaches its own project's exports and no others", async () => {
    const caller = await guestCaller()
    const exportOf = async (project: string) => {
      const id = uuid()
      await database.insert(videoRenderJobs).values({
        id,
        userId: owner.id,
        projectId: project,
        status: "queued",
        quality: "high",
        aspect: "9:16",
        createdAt: AT,
        updatedAt: AT,
      })
      return id
    }
    expect((await actorForExport(caller, await exportOf(projectId), database)).userId).toBe(owner.id)
    await expect(actorForExport(caller, await exportOf(otherProjectId), database)).rejects.toThrow(
      PROJECT_NOT_FOUND_MESSAGE
    )
  })

  it("reaches a file on its project's shelf or timeline, and no other file", async () => {
    const caller = await guestCaller()
    const onShelf = await insertMedia()
    const onTimeline = await insertMedia()
    const elsewhere = await insertMedia()
    await database.insert(videoProjectMedia).values({ projectId, mediaId: onShelf.id, createdAt: AT })
    await database.insert(videoProjectMedia).values({ projectId: otherProjectId, mediaId: elsewhere.id, createdAt: AT })
    await database
      .update(videoProjects)
      .set({ timeline: timelineUsing(onTimeline.id) })
      .where(eq(videoProjects.id, projectId))

    expect(await projectHoldsMedia(projectId, onShelf.id, database)).toBe(true)
    expect(await projectHoldsMedia(projectId, onTimeline.id, database)).toBe(true)
    expect((await actorForMedia(caller, onTimeline.id, database)).userId).toBe(owner.id)
    await expect(actorForMedia(caller, elsewhere.id, database)).rejects.toThrow(PROJECT_NOT_FOUND_MESSAGE)
  })

  it("leaves a signed-in person acting as themselves", async () => {
    const caller: EditorCaller = { user: owner, guests: [] }
    expect(await actorFor(caller, otherProjectId, database)).toEqual({ userId: owner.id, guest: null })
  })
})

describe("a guest's saves in History", () => {
  it("marks the project and the versions kept from a guest's save", async () => {
    const media = await insertMedia()
    const project = await createOwnedProject(owner.id, "Reel", database)
    const first = await writeProjectTimeline(owner.id, project.id, timelineUsing(media.id, 5), project.version, database, "Sam via Project")
    const [row] = await database.select().from(videoProjects).where(eq(videoProjects.id, project.id))
    expect(row.lastEditedBy).toBe("Sam via Project")

    // Back after a break, the owner's save keeps Sam's cut as a version.
    await database
      .update(videoProjects)
      .set({ updatedAt: new Date(Date.now() - 31 * 60_000) })
      .where(eq(videoProjects.id, project.id))
    await writeProjectTimeline(owner.id, project.id, timelineUsing(media.id, 6), first.version, database)
    const [kept] = await listOwnedProjectVersions(owner.id, project.id, database)
    expect(kept.edited_by).toBe("Sam via Project")
    const [after] = await database.select().from(videoProjects).where(eq(videoProjects.id, project.id))
    expect(after.lastEditedBy).toBeNull()
  })
})
