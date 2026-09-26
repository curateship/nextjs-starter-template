import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { type CustomShellDb } from "@/server/db"
import {
  setEmailProviderFactoryForTests,
  type SendEmailParams,
} from "@/server/email/provider"
import { customShellEmailSettings } from "@/server/schema"
import { roomInvites, rooms } from "@/server/pomodoro/schema"
import {
  joinRoomBySlug,
  leaveRoom,
  lookupRoomBySlug,
  type RoomSettings,
} from "@/server/pomodoro/rooms"
import {
  cancelScheduledRoom,
  listUpcomingRooms,
  openDueRooms,
  scheduleRoomWithInvites,
  sendQueuedRoomInvites,
} from "@/server/pomodoro/scheduled-rooms"
import {
  createTestDatabase,
  insertUser,
  insertWorkspace,
} from "@/server/test-support"

/**
 * Booked rooms, against a real database.
 *
 * The three promises worth holding to: the room opens itself on time with no
 * browser involved, nobody can get into it before that, and cancelling stops
 * the invitations that have not left yet.
 *
 * No email leaves this file. The provider is replaced with one that records
 * what it was asked to send.
 */

const SETTINGS: RoomSettings = {
  name: "Evening deep work",
  visibility: "public",
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  autoStart: false,
}

let client: PGlite
let db: CustomShellDb
let hostId: string
let sent: SendEmailParams[]

beforeEach(async () => {
  ;({ client, db } = await createTestDatabase())
  const host = await insertUser(db, { name: "Sam Host" })
  hostId = host.id
  const workspace = await insertWorkspace(db, { userId: host.id })
  await db.insert(customShellEmailSettings).values({
    workspaceId: workspace.id,
    fromEmail: "rooms@example.test",
    fromName: "Focus",
    createdAt: new Date(),
    updatedAt: new Date(),
  })
  sent = []
  setEmailProviderFactoryForTests(() => ({
    async send(params) {
      sent.push(params)
      return { success: true, messageId: `test-${sent.length}` }
    },
  }))
})

afterEach(async () => {
  setEmailProviderFactoryForTests(null)
  await client.close()
})

const inTwoMinutes = () => new Date(Date.now() + 2 * 60_000)

async function book(
  startsAt = inTwoMinutes(),
  invites: string[] = [],
  overrides: Partial<typeof SETTINGS> = {}
) {
  return scheduleRoomWithInvites(
    hostId,
    `slug-${Math.random().toString(36).slice(2, 12)}pad`,
    { ...SETTINGS, ...overrides, startsAt, invites },
    db
  )
}

describe("booking a room", () => {
  it("makes a room nobody is in yet, waiting for its start time", async () => {
    const room = await book()
    expect(room.phase).toBe("scheduled")
    expect(room.startsAt).not.toBeNull()
    expect(room.sequence).toBe(0)
  })

  it("shows the booking as upcoming with its invite tally", async () => {
    const room = await book(inTwoMinutes(), ["sam@example.com", "alex@example.com"])
    const [upcoming] = await listUpcomingRooms(hostId, db)
    expect(upcoming.slug).toBe(room.slug)
    expect(upcoming.mine).toBe(true)
    expect(upcoming.invitedCount).toBe(2)
    expect(upcoming.emailedCount).toBe(0)
  })

  it("keeps somebody else's unlisted booking out of their list", async () => {
    await book(inTwoMinutes(), [], { visibility: "unlisted" })
    const stranger = await insertUser(db)
    expect(await listUpcomingRooms(stranger.id, db)).toEqual([])
  })
})

describe("before it opens", () => {
  it("refuses a join", async () => {
    const room = await book()
    const joiner = await insertUser(db)
    await expect(joinRoomBySlug(room.slug, joiner.id, db)).rejects.toThrow(
      "ROOM_NOT_OPEN_YET"
    )
  })

  it("cannot be closed by leaving it, which would strand its invitations", async () => {
    const room = await book(inTwoMinutes(), ["sam@example.com"])
    await expect(leaveRoom(room.slug, hostId, db)).rejects.toThrow(
      "ROOM_NOT_OPEN_YET"
    )
    const [after] = await db.select().from(rooms).where(eq(rooms.id, room.id))
    expect(after.phase).toBe("scheduled")
  })

  it("tells the invite link when it starts instead of offering a join", async () => {
    const room = await book()
    const lookup = await lookupRoomBySlug(room.slug, null, db)
    expect(lookup.status).toBe("scheduled")
  })
})

describe("the clock opening it", () => {
  it("leaves a room whose time has not come", async () => {
    const room = await book()
    const result = await openDueRooms(db, new Date())
    expect(result.opened).toBe(0)
    const [after] = await db.select().from(rooms).where(eq(rooms.id, room.id))
    expect(after.phase).toBe("scheduled")
  })

  it("opens it to waiting once its time passes, with nobody watching", async () => {
    const room = await book()
    const result = await openDueRooms(db, new Date(Date.now() + 3 * 60_000))
    expect(result.opened).toBe(1)
    const [after] = await db.select().from(rooms).where(eq(rooms.id, room.id))
    expect(after.phase).toBe("waiting")
    expect(after.sequence).toBe(1)
  })

  it("opens it straight into focus when the host asked for auto-start", async () => {
    const room = await book(inTwoMinutes(), [], { autoStart: true })
    await openDueRooms(db, new Date(Date.now() + 3 * 60_000))
    const [after] = await db.select().from(rooms).where(eq(rooms.id, room.id))
    expect(after.phase).toBe("focus")
    expect(after.phaseEndsAt).not.toBeNull()
  })

  it("does not open the same room twice", async () => {
    await book()
    const later = new Date(Date.now() + 3 * 60_000)
    expect((await openDueRooms(db, later)).opened).toBe(1)
    expect((await openDueRooms(db, later)).opened).toBe(0)
  })
})

describe("the invitations", () => {
  it("emails each address once, with the link and the time in the subject", async () => {
    const room = await book(inTwoMinutes(), ["sam@example.com", "alex@example.com"])
    const first = await openDueRooms(db)
    expect(first.emailed).toBe(2)
    expect(sent.map((email) => email.to).sort()).toEqual([
      "alex@example.com",
      "sam@example.com",
    ])
    expect(sent[0].subject).toContain("Sam Host invited you to Evening deep work")
    expect(sent[0].html).toContain(`/rooms/${room.slug}`)

    // A second pass has nothing left to send.
    expect((await openDueRooms(db)).emailed).toBe(0)
    expect(sent).toHaveLength(2)
  })

  it("emails nobody twice when two passes overlap", async () => {
    // The real overlap: the worker fires again while a slow provider is
    // still answering the first pass. Without a claim that moves the row out
    // of 'queued', both passes read the same invitation and both send.
    let release = () => {}
    const inFlight = new Promise<void>((resolve) => {
      release = resolve
    })
    // Only the first send is slow. A second one, which must never happen,
    // returns at once so this test fails on its assertions rather than by
    // timing out.
    setEmailProviderFactoryForTests(() => ({
      async send(params) {
        sent.push(params)
        if (sent.length === 1) await inFlight
        return { success: true, messageId: `test-${sent.length}` }
      },
    }))

    const room = await book(inTwoMinutes(), ["sam@example.com"])
    const first = sendQueuedRoomInvites(db)
    // The second pass starts while the first is still inside the provider.
    await new Promise((resolve) => setTimeout(resolve, 50))
    const second = await sendQueuedRoomInvites(db)
    release()
    await first

    expect(second).toBe(0)
    expect(sent).toHaveLength(1)
    const [invite] = await db
      .select()
      .from(roomInvites)
      .where(eq(roomInvites.roomId, room.id))
    expect(invite.status).toBe("sent")
  })

  it("writes down an address the provider refused instead of retrying it", async () => {
    setEmailProviderFactoryForTests(() => ({
      async send() {
        return { success: false, error: "That address does not exist" }
      },
    }))
    const room = await book(inTwoMinutes(), ["nobody@example.com"])
    expect((await openDueRooms(db)).emailed).toBe(0)
    const [invite] = await db
      .select()
      .from(roomInvites)
      .where(eq(roomInvites.roomId, room.id))
    expect(invite.status).toBe("failed")
    expect(invite.failureReason).toContain("does not exist")
  })
})

describe("cancelling", () => {
  it("kills the room and the invitations that had not gone out", async () => {
    const room = await book(inTwoMinutes(), ["sam@example.com"])
    const { cancelledInvites } = await cancelScheduledRoom(room.slug, hostId, db)
    expect(cancelledInvites).toBe(1)

    const [after] = await db.select().from(rooms).where(eq(rooms.id, room.id))
    expect(after.phase).toBe("closed")
    expect(after.closedAt).not.toBeNull()

    const result = await openDueRooms(db, new Date(Date.now() + 3 * 60_000))
    expect(result).toEqual({ opened: 0, emailed: 0 })
    expect(sent).toEqual([])
  })

  it("is the host's alone", async () => {
    const room = await book()
    const stranger = await insertUser(db)
    await expect(
      cancelScheduledRoom(room.slug, stranger.id, db)
    ).rejects.toThrow("ROOM_HOST_REQUIRED")
  })

  it("refuses once the room has opened, because closing it is a different act", async () => {
    const room = await book()
    await openDueRooms(db, new Date(Date.now() + 3 * 60_000))
    await expect(cancelScheduledRoom(room.slug, hostId, db)).rejects.toThrow(
      "ROOM_ALREADY_OPEN"
    )
  })
})
