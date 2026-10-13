import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { type CustomShellDb } from "@/server/db"
import {
  listMyGroupRooms,
  openGroupRoom,
  tellGroupOfRoom,
} from "@/server/pomodoro/group-rooms"
import { createGroupFor, joinGroupByToken, leaveGroup } from "@/server/pomodoro/groups"
import {
  createRoomWithHost,
  joinRoomBySlug,
  lookupRoomBySlug,
} from "@/server/pomodoro/rooms"
import {
  bookDueRepeatRooms,
  createRoomRepeat,
} from "@/server/pomodoro/scheduled-rooms"
import {
  pomodoroGroups,
  pomodoroNoticeLinks,
  pomodoroProfiles,
  roomInvites,
  rooms,
} from "@/server/pomodoro/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"

/**
 * Group rooms (groups task 01, parts 11 and 12) against a real database.
 * Tyler, 13 Oct 2026: only the group's members can join a group room, and
 * only the group's owner books its weekly room. The second rule is checked by
 * the endpoint, the first here, in the join itself.
 */

let client: PGlite
let db: CustomShellDb

beforeEach(async () => {
  ;({ client, db } = await createTestDatabase())
})

afterEach(async () => {
  await client.close()
})

const SETTINGS = {
  name: "Study Buddies",
  visibility: "unlisted" as const,
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  autoStart: false,
  sound: "curated:rain",
  background: "scene:plain",
}

async function person(name: string, email?: string) {
  // An admin reads as Pro, so anybody here may host.
  const user = await insertUser(db, { role: "admin", ...(email ? { email } : {}) })
  await db
    .insert(pomodoroProfiles)
    .values({ userId: user.id, publicDisplayName: name, timezone: "UTC" })
  return user.id
}

async function groupWith(...members: string[]) {
  const owner = members[0]
  const groupId = await createGroupFor(owner, "Study Buddies")
  const [{ joinToken }] = await db
    .select({ joinToken: pomodoroGroups.joinToken })
    .from(pomodoroGroups)
    .where(eq(pomodoroGroups.id, groupId))
  for (const member of members.slice(1)) await joinGroupByToken(member, joinToken)
  return groupId
}

describe("a group room", () => {
  it("lets in the group's members and nobody else, even with the link", async () => {
    const owner = await person("Olive")
    const sam = await person("Sam")
    const stranger = await person("Stranger")
    const groupId = await groupWith(owner, sam)
    const { room } = await createRoomWithHost(owner, "group-room-slug-1", { ...SETTINGS, groupId })

    await expect(joinRoomBySlug(room.slug, stranger)).rejects.toThrow("ROOM_GROUP_ONLY")
    expect(await lookupRoomBySlug(room.slug, stranger)).toMatchObject({ status: "group_only" })
    await expect(joinRoomBySlug(room.slug, sam)).resolves.toBeTruthy()

    // Somebody who leaves the group cannot come back in.
    await leaveGroup(sam, groupId)
    await db
      .update(rooms)
      .set({ phase: "waiting" })
      .where(eq(rooms.id, room.id))
    const other = await person("Other")
    await expect(joinRoomBySlug(room.slug, other)).rejects.toThrow("ROOM_GROUP_ONLY")
  })

  it("shows on every member's card with who is in it, and is the group's one open room", async () => {
    const owner = await person("Olive")
    const sam = await person("Sam")
    const groupId = await groupWith(owner, sam)
    expect((await listMyGroupRooms(sam))[0].room).toBeNull()

    const { room } = await createRoomWithHost(owner, "group-room-slug-2", { ...SETTINGS, groupId })
    expect((await openGroupRoom(groupId))?.id).toBe(room.id)
    const [card] = await listMyGroupRooms(sam)
    expect(card).toMatchObject({
      groupName: "Study Buddies",
      isOwner: false,
      room: { slug: room.slug, memberCount: 1, hostName: "Olive", youAreIn: false },
    })
    expect(await listMyGroupRooms(await person("Nobody"))).toEqual([])
  })

  it("tells the other members once an hour, not the host", async () => {
    const owner = await person("Olive")
    const sam = await person("Sam")
    const groupId = await groupWith(owner, sam)
    const { room } = await createRoomWithHost(owner, "group-room-slug-3", { ...SETTINGS, groupId })
    await tellGroupOfRoom(owner, groupId, room)
    await tellGroupOfRoom(owner, groupId, room)
    const notices = await db
      .select({ kind: pomodoroNoticeLinks.kind })
      .from(pomodoroNoticeLinks)
      .where(eq(pomodoroNoticeLinks.kind, "group_room"))
    expect(notices).toHaveLength(1)
  })
})

describe("a weekly group room", () => {
  it("invites the group as it is each week, typed addresses too, each once", async () => {
    const owner = await person("Olive", "olive@example.com")
    const sam = await person("Sam", "sam@example.com")
    const groupId = await groupWith(owner, sam)
    const monday = new Date("2099-10-05T08:00:00Z")
    const { rule } = await createRoomRepeat(
      owner,
      {
        ...SETTINGS,
        groupId,
        weekdays: 1 << 2,
        startMinute: 9 * 60,
        timezone: "UTC",
        invites: ["sam@example.com", "friend@example.com"],
      },
      db,
      monday
    )
    // Lee joins before the first week is booked, so Lee is invited.
    const lee = await person("Lee", "lee@example.com")
    const [{ joinToken }] = await db
      .select({ joinToken: pomodoroGroups.joinToken })
      .from(pomodoroGroups)
      .where(eq(pomodoroGroups.id, groupId))
    await joinGroupByToken(lee, joinToken)

    await bookDueRepeatRooms(db, new Date(monday.getTime() + 2 * 3_600_000))
    const [booked] = await db.select().from(rooms).where(eq(rooms.repeatId, rule.id))
    expect(booked.groupId).toBe(groupId)
    const invites = await db
      .select({ email: roomInvites.email })
      .from(roomInvites)
      .where(eq(roomInvites.roomId, booked.id))
    expect(invites.map((row) => row.email).sort()).toEqual([
      "friend@example.com",
      "lee@example.com",
      "sam@example.com",
    ])
  })
})
