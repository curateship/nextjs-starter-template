import { PGlite } from "@electric-sql/pglite"
import { and, eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { noticeKindFromWords } from "@/lib/pomodoro/notices"
import { type CustomShellDb } from "@/server/db"
import { followByHandle } from "@/server/pomodoro/following"
import {
  FOLLOWED_ROOMS_PER_DAY,
  banRoomMember,
  createRoomWithHost,
  deleteRoomMessage,
  joinRoomBySlug,
  leaveRoom,
  postRoomMessage,
  removeRoomMember,
  toggleRoomReaction,
  type RoomSettings,
} from "@/server/pomodoro/rooms"
import {
  cancelScheduledRoom,
  openScheduledRoom,
  scheduleRoomWithInvites,
} from "@/server/pomodoro/scheduled-rooms"
import {
  pomodoroBlocks,
  pomodoroNoticeLinks,
  pomodoroProfiles,
  roomMemberships,
  roomMessages,
  rooms,
} from "@/server/pomodoro/schema"
import { customShellNotifications } from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"

/**
 * Room notices, against a real database.
 *
 * For each kind: who is told and in what words, what folds, and the people
 * who must hear nothing (the person who did it, anybody looking at the room,
 * anybody across a block). Plus the clean-up: a deleted line, a taken-back
 * reaction, a cancelled booking and a closed room take their notices away.
 */

let client: PGlite
let db: CustomShellDb

beforeEach(async () => {
  ;({ client, db } = await createTestDatabase())
})

afterEach(async () => {
  await client.close()
})

const SETTINGS: RoomSettings = {
  name: "Deep Work",
  visibility: "public",
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  autoStart: false,
}

async function person(
  name: string,
  profile: Partial<typeof pomodoroProfiles.$inferInsert> = {},
  account: Parameters<typeof insertUser>[1] = {}
) {
  const user = await insertUser(db, { name, ...account })
  await db
    .insert(pomodoroProfiles)
    .values({ userId: user.id, publicDisplayName: name, ...profile })
  return user.id
}

async function noticesFor(userId: string) {
  return db
    .select({
      message: customShellNotifications.message,
      detail: customShellNotifications.detail,
      readAt: customShellNotifications.readAt,
      kind: pomodoroNoticeLinks.kind,
      href: pomodoroNoticeLinks.href,
      foldCount: pomodoroNoticeLinks.foldCount,
    })
    .from(customShellNotifications)
    .innerJoin(
      pomodoroNoticeLinks,
      eq(pomodoroNoticeLinks.noticeId, customShellNotifications.id)
    )
    .where(eq(customShellNotifications.recipientUserId, userId))
    .orderBy(customShellNotifications.createdAt)
}

async function hostRoom(hostId: string, settings: Partial<RoomSettings> = {}) {
  const { room } = await createRoomWithHost(
    hostId,
    `room-${Math.random().toString(36).slice(2, 10)}`,
    { ...SETTINGS, ...settings },
    db
  )
  return room
}

/** Puts a member's room on their screen, the way the live connection does. */
async function watching(roomId: string, userId: string) {
  await db
    .update(roomMemberships)
    .set({ watchingUntil: new Date(Date.now() + 40_000) })
    .where(and(eq(roomMemberships.roomId, roomId), eq(roomMemberships.userId, userId)))
}

async function membershipOf(roomId: string, userId: string) {
  const [row] = await db
    .select({ id: roomMemberships.id })
    .from(roomMemberships)
    .where(and(eq(roomMemberships.roomId, roomId), eq(roomMemberships.userId, userId)))
  return row.id
}

describe("joined your room", () => {
  it("tells the host and folds later joins into one line", async () => {
    const host = await person("Host")
    const room = await hostRoom(host)
    const sam = await person("Sam")
    const priya = await person("Priya")

    await joinRoomBySlug(room.slug, sam, db)
    // Pressing Join again while already in the room is not a join.
    await joinRoomBySlug(room.slug, sam, db)
    await joinRoomBySlug(room.slug, priya, db)

    expect(await noticesFor(host)).toMatchObject([
      {
        message: "Sam and 1 other joined your room Deep Work.",
        kind: "room_join",
        href: `/rooms/${room.slug}`,
        foldCount: 2,
      },
    ])
  })

  it("says nothing to a host who is watching, or about a blocked joiner", async () => {
    const host = await person("Host")
    const room = await hostRoom(host)
    await watching(room.id, host)
    await joinRoomBySlug(room.slug, await person("Sam"), db)

    const other = await person("Other host")
    const otherRoom = await hostRoom(other)
    const blocked = await person("Blocked")
    await db.insert(pomodoroBlocks).values({ blockerUserId: other, blockedUserId: blocked })
    await joinRoomBySlug(otherRoom.slug, blocked, db)

    expect(await noticesFor(host)).toEqual([])
    expect(await noticesFor(other)).toEqual([])
  })
})

describe("room chat", () => {
  it("tells members who are away, folding into a count", async () => {
    const host = await person("Host")
    const room = await hostRoom(host)
    const away = await person("Away")
    const here = await person("Here")
    await joinRoomBySlug(room.slug, away, db)
    await joinRoomBySlug(room.slug, here, db)
    await watching(room.id, here)

    await postRoomMessage(room.slug, host, "starting in five", db)
    expect(await noticesFor(away)).toMatchObject([
      { message: "Host wrote in Deep Work.", detail: "starting in five", kind: "room_chat" },
    ])
    await postRoomMessage(room.slug, host, "go go go", db)
    expect(await noticesFor(away)).toMatchObject([
      { message: "2 new messages in Deep Work.", detail: "Host: go go go", foldCount: 2 },
    ])
    expect(await noticesFor(here)).toEqual([])
    // The writer is never told about their own line.
    expect((await noticesFor(host)).filter((n) => n.kind === "room_chat")).toEqual([])
  })

  it("always tells somebody named with @, and a deleted line takes the mention away", async () => {
    const host = await person("Host")
    const room = await hostRoom(host)
    const sam = await person("Sam", { handle: "sam" })
    await joinRoomBySlug(room.slug, sam, db)
    await watching(room.id, sam)

    await postRoomMessage(room.slug, host, "@sam can you start?", db)
    expect(await noticesFor(sam)).toMatchObject([
      {
        message: "Host mentioned you in Deep Work.",
        detail: "@sam can you start?",
        kind: "room_mention",
      },
    ])

    const [line] = await db.select({ id: roomMessages.id }).from(roomMessages)
    await deleteRoomMessage(room.slug, host, line.id, db)
    expect(await noticesFor(sam)).toEqual([])
  })
})

describe("reactions", () => {
  it("counts the people who reacted, and taking them all back removes the notice", async () => {
    const host = await person("Host")
    const room = await hostRoom(host)
    const sam = await person("Sam")
    const priya = await person("Priya")
    await joinRoomBySlug(room.slug, sam, db)
    await joinRoomBySlug(room.slug, priya, db)
    await postRoomMessage(room.slug, host, "two more sessions today", db)
    const [line] = await db.select({ id: roomMessages.id }).from(roomMessages)

    await toggleRoomReaction(room.slug, sam, line.id, "🔥", db)
    await toggleRoomReaction(room.slug, sam, line.id, "💪", db)
    await toggleRoomReaction(room.slug, priya, line.id, "🔥", db)
    // Reacting to your own line tells nobody.
    await toggleRoomReaction(room.slug, host, line.id, "👍", db)

    const reactions = () =>
      noticesFor(host).then((notices) => notices.filter((n) => n.kind === "room_reaction"))
    expect(await reactions()).toMatchObject([
      {
        message: "Sam and 1 other reacted to your message in Deep Work.",
        detail: "two more sessions today",
        foldCount: 2,
      },
    ])

    await toggleRoomReaction(room.slug, sam, line.id, "🔥", db)
    await toggleRoomReaction(room.slug, sam, line.id, "💪", db)
    expect(await reactions()).toMatchObject([
      { message: "Priya reacted to your message in Deep Work.", foldCount: 1 },
    ])
    await toggleRoomReaction(room.slug, priya, line.id, "🔥", db)
    expect(await reactions()).toEqual([])
  })
})

describe("removed or banned", () => {
  it("tells the person once, naming the room and never the host", async () => {
    const host = await person("Host")
    const room = await hostRoom(host)
    const sam = await person("Sam")
    const priya = await person("Priya")
    await joinRoomBySlug(room.slug, sam, db)
    await joinRoomBySlug(room.slug, priya, db)

    await removeRoomMember(room.slug, host, await membershipOf(room.id, sam), db)
    const priyaMembership = await membershipOf(room.id, priya)
    await banRoomMember(room.slug, host, priyaMembership, db)
    await banRoomMember(room.slug, host, priyaMembership, db)

    expect(await noticesFor(sam)).toMatchObject([
      { message: "You were removed from the room Deep Work.", kind: "room_removed", href: null },
    ])
    expect(await noticesFor(priya)).toMatchObject([
      { message: "You can't rejoin the room Deep Work.", kind: "room_removed" },
    ])
  })
})

describe("someone you follow opened a room", () => {
  it("tells followers about public rooms only, three a day, and forgets a closed one", async () => {
    const host = await person("Host", { handle: "host", profilePublic: true })
    const fan = await person("Fan")
    await followByHandle(fan, "host")

    await hostRoom(host, { visibility: "unlisted" })
    expect(await noticesFor(fan)).toEqual([])

    const room = await hostRoom(host)
    expect(await noticesFor(fan)).toMatchObject([
      {
        message: "Host opened the room Deep Work.",
        kind: "followed_room",
        href: `/rooms/${room.slug}`,
      },
    ])

    // Closing it takes the unread invitation away.
    await leaveRoom(room.slug, host, db)
    expect(await noticesFor(fan)).toEqual([])

  })

  it(`announces at most ${FOLLOWED_ROOMS_PER_DAY} rooms a day, even when each one is closed`, async () => {
    const host = await person("Host", { handle: "host", profilePublic: true })
    const fan = await person("Fan")
    await followByHandle(fan, "host")
    const sent = () =>
      db
        .select({ id: customShellNotifications.id })
        .from(customShellNotifications)
        .innerJoin(pomodoroNoticeLinks, eq(pomodoroNoticeLinks.noticeId, customShellNotifications.id))
        .where(and(eq(customShellNotifications.recipientUserId, fan), eq(pomodoroNoticeLinks.kind, "followed_room")))

    // Open, close, open, close: each close takes the unread notice away,
    // so the count has to come from the host's rooms, not from the notices.
    let written = 0
    for (let index = 0; index < FOLLOWED_ROOMS_PER_DAY + 2; index += 1) {
      const room = await hostRoom(host)
      written += (await sent()).length
      await leaveRoom(room.slug, host, db)
    }
    expect(written).toBe(FOLLOWED_ROOMS_PER_DAY)
  })
})

describe("booked rooms", () => {
  async function book(hostId: string, invites: string[]) {
    return scheduleRoomWithInvites(
      hostId,
      `booked-${Math.random().toString(36).slice(2, 10)}`,
      { ...SETTINGS, startsAt: new Date("2099-10-09T09:00:00Z"), invites },
      db
    )
  }

  it("invites verified accounts in their own timezone, and opening replaces the invite", async () => {
    const host = await person("Host")
    const guest = await person("Guest", { timezone: "America/Toronto" }, { email: "guest@example.test" })
    const unverified = await person("Unverified", {}, { email: "unverified@example.test", emailVerifiedAt: null })
    const room = await book(host, ["guest@example.test", "unverified@example.test", "nobody@example.test"])

    expect(await noticesFor(guest)).toMatchObject([
      {
        message: "Host invited you to Deep Work.",
        detail: expect.stringContaining("Friday 9 October"),
        kind: "room_invite",
        href: `/rooms/${room.slug}`,
      },
    ])
    expect((await noticesFor(guest))[0].detail).toMatch(/05:00|5:00/)
    expect(await noticesFor(unverified)).toEqual([])

    await openScheduledRoom(room.id, room.sequence, db, new Date("2099-10-09T09:00:01Z"))
    expect(await noticesFor(guest)).toMatchObject([
      { message: "Deep Work is open now.", kind: "room_open" },
    ])
    expect(await noticesFor(host)).toMatchObject([
      { message: "Deep Work is open now.", kind: "room_open" },
    ])
  })

  it("takes an unread invitation away when the booking is cancelled", async () => {
    const host = await person("Host")
    const guest = await person("Guest", {}, { email: "guest@example.test" })
    const room = await book(host, ["guest@example.test"])
    await cancelScheduledRoom(room.slug, host, db)
    expect(await noticesFor(guest)).toEqual([])
    const [closed] = await db.select({ phase: rooms.phase }).from(rooms).where(eq(rooms.id, room.id))
    expect(closed.phase).toBe("closed")
  })
})

describe("reading a room notice's kind from its words", () => {
  it("recognises every room sentence", () => {
    const cases: [string, string][] = [
      ["Sam and 2 others joined your room Deep Work.", "room_join"],
      ["Sam wrote in Deep Work.", "room_chat"],
      ["4 new messages in Deep Work.", "room_chat"],
      ["Sam mentioned you in Deep Work.", "room_mention"],
      ["Sam reacted to your message in Deep Work.", "room_reaction"],
      ["Sam invited you to Deep Work.", "room_invite"],
      ["Deep Work is open now.", "room_open"],
      ["You were removed from the room Deep Work.", "room_removed"],
      ["You can't rejoin the room Deep Work.", "room_removed"],
      ["Sam opened the room Deep Work.", "followed_room"],
    ]
    for (const [message, kind] of cases) {
      expect(noticeKindFromWords({ type: "app_activity", message })).toBe(kind)
    }
  })
})
