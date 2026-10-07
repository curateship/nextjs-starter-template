import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { type CustomShellDb } from "@/server/db"
import {
  setEmailProviderFactoryForTests,
  type SendEmailParams,
} from "@/server/email/provider"
import { customShellEmailSettings } from "@/server/schema"
import { pomodoroRoomRepeats, roomInvites, rooms } from "@/server/pomodoro/schema"
import {
  bookDueRepeatRooms,
  cancelRoomRepeat,
  createRoomRepeat,
  listMyRoomRepeats,
  openDueRooms,
  skipNextRoomRepeat,
  type RoomRepeatInput,
} from "@/server/pomodoro/scheduled-rooms"
import { createTestDatabase, insertUser, insertWorkspace } from "@/server/test-support"

/**
 * Weekly rooms, against a real database, with the clock handed in.
 *
 * What has to hold: one room per Tuesday however many passes run, Cancel this
 * week leaves the series alive, Cancel the series stops the future and leaves
 * the past alone, and each room's invitations go out once.
 */

const TUESDAY = 1 << 2
const RULE: RoomRepeatInput = {
  name: "Tuesday writing",
  visibility: "unlisted",
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  autoStart: false,
  sound: "curated:rain",
  background: "scene:plain",
  weekdays: TUESDAY,
  startMinute: 9 * 60,
  timezone: "UTC",
  invites: ["sam@example.com", "alex@example.com"],
}
// Monday 5 Oct 2099 at 08:00 UTC: Tuesday 9am is 25 hours away, just outside
// the 24-hour lead.
const MONDAY_8AM = new Date("2099-10-05T08:00:00Z")
const hoursAfter = (date: Date, hours: number) => new Date(date.getTime() + hours * 3_600_000)

let client: PGlite
let db: CustomShellDb
let hostId: string
let sent: SendEmailParams[]

beforeEach(async () => {
  ;({ client, db } = await createTestDatabase())
  // An admin reads as paid, so the host may host without a plan row.
  const host = await insertUser(db, { name: "Sam Host", role: "admin" })
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

const roomsOf = (repeatId: string) => db.select().from(rooms).where(eq(rooms.repeatId, repeatId))

describe("a Tuesday rule", () => {
  it("books nothing until the day is within a day of starting", async () => {
    const { rule } = await createRoomRepeat(hostId, RULE, db, MONDAY_8AM)
    expect(await roomsOf(rule.id)).toHaveLength(0)
    expect(rule.nextStartsAt?.toISOString()).toBe("2099-10-06T09:00:00.000Z")
  })

  it("books one room per Tuesday however many passes run", async () => {
    const { rule } = await createRoomRepeat(hostId, RULE, db, MONDAY_8AM)
    const later = hoursAfter(MONDAY_8AM, 2)
    await bookDueRepeatRooms(db, later)
    await bookDueRepeatRooms(db, later)
    await openDueRooms(db, later)
    const made = await roomsOf(rule.id)
    expect(made).toHaveLength(1)
    expect(made[0].phase).toBe("scheduled")
    expect(made[0].occurrenceDate).toBe("2099-10-06")

    // The week after is booked the Monday after, and not before.
    await bookDueRepeatRooms(db, hoursAfter(MONDAY_8AM, 24 * 6))
    expect(await roomsOf(rule.id)).toHaveLength(1)
    await bookDueRepeatRooms(db, hoursAfter(MONDAY_8AM, 24 * 7 + 2))
    const dates = (await roomsOf(rule.id)).map((room) => room.occurrenceDate).sort()
    expect(dates).toEqual(["2099-10-06", "2099-10-13"])
  })

  it("sends each room's invitations once", async () => {
    await createRoomRepeat(hostId, RULE, db, MONDAY_8AM)
    const later = hoursAfter(MONDAY_8AM, 2)
    await openDueRooms(db, later)
    await openDueRooms(db, later)
    expect(sent.map((email) => email.to).sort()).toEqual(["alex@example.com", "sam@example.com"])
    await openDueRooms(db, hoursAfter(MONDAY_8AM, 24 * 7 + 2))
    expect(sent).toHaveLength(4)
  })

  it("opens on the day like any booking", async () => {
    const { rule } = await createRoomRepeat(hostId, RULE, db, MONDAY_8AM)
    await openDueRooms(db, hoursAfter(MONDAY_8AM, 2))
    await openDueRooms(db, new Date("2099-10-06T09:00:05Z"))
    const [room] = await roomsOf(rule.id)
    expect(room.phase).toBe("waiting")
  })

  it("books a day that is already within reach the moment it is saved", async () => {
    const { rule } = await createRoomRepeat(hostId, RULE, db, hoursAfter(MONDAY_8AM, 2))
    expect(await roomsOf(rule.id)).toHaveLength(1)
  })
})

describe("Cancel this week", () => {
  it("cancels a booked day and keeps the rule booking the next one", async () => {
    const { rule } = await createRoomRepeat(hostId, RULE, db, hoursAfter(MONDAY_8AM, 2))
    const result = await skipNextRoomRepeat(hostId, rule.id, db, hoursAfter(MONDAY_8AM, 3))
    expect(result.cancelledInvites).toBe(2)
    const [cancelled] = await roomsOf(rule.id)
    expect(cancelled.phase).toBe("closed")
    const invites = await db.select().from(roomInvites).where(eq(roomInvites.roomId, cancelled.id))
    expect(invites.every((invite) => invite.status === "cancelled")).toBe(true)

    await openDueRooms(db, hoursAfter(MONDAY_8AM, 24 * 7 + 2))
    const open = (await roomsOf(rule.id)).filter((room) => room.phase === "scheduled")
    expect(open.map((room) => room.occurrenceDate)).toEqual(["2099-10-13"])
    expect(sent.every((email) => !email.html.includes(cancelled.slug))).toBe(true)
  })

  it("passes over a day that has no room yet", async () => {
    const { rule } = await createRoomRepeat(hostId, RULE, db, MONDAY_8AM)
    const result = await skipNextRoomRepeat(hostId, rule.id, db, MONDAY_8AM)
    expect(result.skippedStartsAt.toISOString()).toBe("2099-10-06T09:00:00.000Z")
    await openDueRooms(db, hoursAfter(MONDAY_8AM, 2))
    expect(await roomsOf(rule.id)).toHaveLength(0)
    await openDueRooms(db, hoursAfter(MONDAY_8AM, 24 * 7 + 2))
    expect((await roomsOf(rule.id)).map((room) => room.occurrenceDate)).toEqual(["2099-10-13"])
  })
})

describe("Cancel the series", () => {
  it("stops future rooms and leaves the ones that ran untouched", async () => {
    const { rule } = await createRoomRepeat(hostId, RULE, db, hoursAfter(MONDAY_8AM, 2))
    await openDueRooms(db, new Date("2099-10-06T09:00:05Z"))
    await openDueRooms(db, hoursAfter(MONDAY_8AM, 24 * 7 + 2))

    const result = await cancelRoomRepeat(hostId, rule.id, db, hoursAfter(MONDAY_8AM, 24 * 7 + 3))
    expect(result.cancelledRooms).toBe(1)
    const byDate = Object.fromEntries((await roomsOf(rule.id)).map((room) => [room.occurrenceDate, room.phase]))
    expect(byDate).toEqual({ "2099-10-06": "waiting", "2099-10-13": "closed" })

    await openDueRooms(db, hoursAfter(MONDAY_8AM, 24 * 14 + 2))
    expect(await roomsOf(rule.id)).toHaveLength(2)
    expect(await listMyRoomRepeats(hostId, db)).toEqual([])
  })

  it("answers somebody else's rule as if it did not exist", async () => {
    const { rule } = await createRoomRepeat(hostId, RULE, db, MONDAY_8AM)
    const stranger = await insertUser(db)
    await expect(cancelRoomRepeat(stranger.id, rule.id, db)).rejects.toThrow("ROOM_REPEAT_NOT_FOUND")
    await expect(skipNextRoomRepeat(stranger.id, rule.id, db)).rejects.toThrow("ROOM_REPEAT_NOT_FOUND")
  })
})

describe("a host who can no longer host", () => {
  it("is skipped, not cancelled", async () => {
    const { rule } = await createRoomRepeat(hostId, RULE, db, MONDAY_8AM)
    await db.update((await import("@/server/schema")).customShellUsers).set({ role: "member" })
    await openDueRooms(db, hoursAfter(MONDAY_8AM, 2))
    expect(await roomsOf(rule.id)).toHaveLength(0)
    const [after] = await db.select().from(pomodoroRoomRepeats).where(eq(pomodoroRoomRepeats.id, rule.id))
    expect(after.cancelledAt).toBeNull()
    expect(after.nextStartsAt?.toISOString()).toBe("2099-10-13T09:00:00.000Z")
  })
})
