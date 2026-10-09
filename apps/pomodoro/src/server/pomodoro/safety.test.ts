import { PGlite } from "@electric-sql/pglite"
import { and, eq, isNull } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { type CustomShellDb } from "@/server/db"
import { listAdminReports } from "@/server/pomodoro/admin"
import {
  deleteChatMessages,
  listChatMessages,
  listChatRooms,
  listHiddenProfiles,
  listSuspensions,
  loadRoomChat,
  messageLiveRooms,
  releaseHeldMessages,
  showHiddenProfiles,
} from "@/server/pomodoro/admin-chat"
import { forgetAppSettings, saveAppSetting } from "@/server/pomodoro/app-settings"
import {
  createRoomWithHost,
  joinRoomBySlug,
  postRoomMessage,
  reportRoomMessage,
  roomSnapshot,
} from "@/server/pomodoro/rooms"
import { liftSuspensions, suspendMembers, warnMembers } from "@/server/pomodoro/safety"
import { createRoomRepeat, scheduleRoomWithInvites } from "@/server/pomodoro/scheduled-rooms"
import {
  pomodoroNoticeLinks,
  pomodoroProfiles,
  pomodoroWarnings,
  roomMemberships,
  roomInvites,
  roomMessages,
  roomReports,
  rooms,
} from "@/server/pomodoro/schema"
import { customShellNotifications } from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"

/**
 * Chat and safety (admin task 05), against a real database: the Chat
 * dashboard, held lines, warnings, suspensions, the pause switches, report
 * counts and the STAFF label.
 */

let client: PGlite
let db: CustomShellDb

beforeEach(async () => {
  ;({ client, db } = await createTestDatabase())
  forgetAppSettings()
})

afterEach(async () => {
  await client.close()
})

const SETTINGS = {
  visibility: "public" as const,
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  autoStart: false,
  sound: "curated:rain",
  background: "scene:plain",
}

async function openRoom(hostId: string, slug: string) {
  const { room } = await createRoomWithHost(hostId, slug, { name: slug, ...SETTINGS }, db)
  return room
}

async function setting(admin: string, key: Parameters<typeof saveAppSetting>[0]["key"], value: unknown) {
  await saveAppSetting({ key, value: value as never, actorUserId: admin })
  forgetAppSettings()
}

async function noticesFor(userId: string) {
  return db
    .select({ message: customShellNotifications.message, detail: customShellNotifications.detail, kind: pomodoroNoticeLinks.kind })
    .from(customShellNotifications)
    .innerJoin(pomodoroNoticeLinks, eq(pomodoroNoticeLinks.noticeId, customShellNotifications.id))
    .where(eq(customShellNotifications.recipientUserId, userId))
}

describe("the Chat dashboard", () => {
  it("lists rooms with chat, removes a line as an admin, and the room says who", async () => {
    const admin = (await insertUser(db, { role: "admin" })).id
    const [host, sam] = [(await insertUser(db)).id, (await insertUser(db)).id]
    const room = await openRoom(host, "study")
    await joinRoomBySlug(room.slug, sam, db)
    await postRoomMessage(room.slug, sam, "hello there", db)
    await postRoomMessage(room.slug, host, "welcome", db)

    const listed = await listChatRooms({ search: "", status: "all", sort: "last", direction: "desc", page: 1, pageSize: 25 })
    expect(listed.rows).toMatchObject([{ name: "study", messages: 2, held: 0, closed: false }])

    const { messages } = await loadRoomChat(room.id)
    const hello = messages.find((message) => message.body === "hello there")!
    expect(await deleteChatMessages({ messageIds: [hello.id], actorUserId: admin })).toMatchObject({ deleted: [hello.id], skipped: [], roomIds: [room.id] })

    const seen = await roomSnapshot(room.id, host, db)
    expect(seen.messages[0]).toMatchObject({ deleted: true, body: "", removedBy: "admin" })
    // The words stay for the admin.
    expect((await loadRoomChat(room.id)).messages[0]).toMatchObject({ body: "hello there", removedBy: "admin" })
    // Searching by person finds the line.
    const found = await listChatMessages({ search: "welcome", held: false, page: 1, pageSize: 25 })
    expect(found.rows.map((row) => row.body)).toEqual(["welcome"])
  })

  it("holds a line with a blocked word for its writer alone until let through", async () => {
    const admin = (await insertUser(db, { role: "admin" })).id
    const [host, sam] = [(await insertUser(db)).id, (await insertUser(db)).id]
    const room = await openRoom(host, "words")
    await joinRoomBySlug(room.slug, sam, db)
    await setting(admin, "chat.blockedWords", { words: ["ass"], rule: "hold" })

    expect(await postRoomMessage(room.slug, sam, "my class is fun", db)).toMatchObject({ held: false })
    expect(await postRoomMessage(room.slug, sam, "you ASS", db)).toMatchObject({ held: true })

    expect((await roomSnapshot(room.id, host, db)).messages.map((message) => message.body)).toEqual(["my class is fun"])
    expect((await roomSnapshot(room.id, sam, db)).messages.map((message) => [message.body, message.held])).toEqual([
      ["my class is fun", false],
      ["you ASS", true],
    ])
    const held = await listChatMessages({ search: "", held: true, page: 1, pageSize: 25 })
    expect(held.rows.map((row) => row.body)).toEqual(["you ASS"])

    await releaseHeldMessages({ messageIds: [held.rows[0].id], actorUserId: admin })
    expect((await roomSnapshot(room.id, host, db)).messages.map((message) => message.body)).toEqual(["my class is fun", "you ASS"])
  })

  it("turns a blocked word into stars under the replace rule", async () => {
    const admin = (await insertUser(db, { role: "admin" })).id
    const host = (await insertUser(db)).id
    const room = await openRoom(host, "stars")
    await setting(admin, "chat.blockedWords", { words: ["darn"], rule: "replace" })
    await postRoomMessage(room.slug, host, "Darn it", db)
    expect((await roomSnapshot(room.id, host, db)).messages[0].body).toBe("**** it")
  })

  it("pins one line in every live room and marks an admin as STAFF", async () => {
    const admin = (await insertUser(db, { role: "admin" })).id
    const [a, b] = [(await insertUser(db)).id, (await insertUser(db)).id]
    const first = await openRoom(a, "one")
    await openRoom(b, "two")
    await scheduleRoomWithInvites(b, "later", { name: "later", ...SETTINGS, startsAt: new Date(Date.now() + 3_600_000), invites: [] }, db)

    expect((await messageLiveRooms({ body: "Maintenance at 9pm", actorUserId: admin })).roomIds).toHaveLength(2)
    const seen = await roomSnapshot(first.id, a, db)
    expect(seen.pinned.map((line) => line.body)).toEqual(["Maintenance at 9pm"])
    expect(seen.messages).toEqual([])

    await joinRoomBySlug(first.slug, admin, db)
    const withAdmin = await roomSnapshot(first.id, a, db)
    expect(withAdmin.members.map((member) => member.staff)).toEqual([false, true])
  })
})

describe("warnings and suspensions", () => {
  it("warns by the bell, keeps the warning, and never fails on a missing email setup", async () => {
    const admin = (await insertUser(db, { role: "admin" })).id
    const sam = (await insertUser(db)).id
    const result = await warnMembers({ userIds: [sam], message: "Please be kind.", actorUserId: admin, database: db })
    expect(result.warned).toHaveLength(1)
    expect(await noticesFor(sam)).toEqual([
      { message: "You have a warning from the Pomoder team.", detail: "Please be kind.", kind: "admin_warning" },
    ])
    expect(await db.select({ message: pomodoroWarnings.message }).from(pomodoroWarnings)).toEqual([{ message: "Please be kind." }])
  })

  it("refuses a suspended member everywhere, takes them out, and lets them back on the date", async () => {
    const admin = (await insertUser(db, { role: "admin" })).id
    const [host, sam] = [(await insertUser(db)).id, (await insertUser(db)).id]
    const room = await openRoom(host, "busy")
    await joinRoomBySlug(room.slug, sam, db)
    const now = new Date()

    const { touchedRooms } = await suspendMembers({ userIds: [sam], days: 7, reason: "Spamming the chat.", actorUserId: admin, database: db, now })
    expect(touchedRooms).toEqual([{ id: room.id, closed: false }])
    const inside = await db.select().from(roomMemberships).where(and(eq(roomMemberships.userId, sam), isNull(roomMemberships.leftAt)))
    expect(inside).toEqual([])
    expect((await noticesFor(sam))[0]).toMatchObject({ kind: "rooms_suspended", detail: "Spamming the chat." })

    await expect(joinRoomBySlug(room.slug, sam, db)).rejects.toThrow(/ROOM_REFUSED: You can't use rooms until .+\. Spamming the chat\./)
    await expect(createRoomWithHost(sam, "mine", { name: "mine", ...SETTINGS }, db)).rejects.toThrow("ROOM_REFUSED")
    await expect(
      scheduleRoomWithInvites(sam, "booked", { name: "b", ...SETTINGS, startsAt: new Date(Date.now() + 3_600_000), invites: [] }, db)
    ).rejects.toThrow("ROOM_REFUSED")
    await expect(
      createRoomRepeat(sam, { name: "w", ...SETTINGS, weekdays: 2, startMinute: 600, timezone: "UTC", invites: [] }, db)
    ).rejects.toThrow("ROOM_REFUSED")

    // Eight days on, nobody has pressed anything and the door is open.
    await expect(joinRoomBySlug(room.slug, sam, db, new Date(now.getTime() + 8 * 86_400_000))).resolves.toBeTruthy()
  })

  it("cancels the rooms a suspended host booked, invitations and all", async () => {
    const admin = (await insertUser(db, { role: "admin" })).id
    const host = (await insertUser(db)).id
    const booked = await scheduleRoomWithInvites(
      host,
      "booked-later",
      { name: "Later", ...SETTINGS, startsAt: new Date(Date.now() + 3_600_000), invites: ["a@example.com"] },
      db
    )
    await suspendMembers({ userIds: [host], days: 7, reason: "Abuse.", actorUserId: admin, database: db })
    const [room] = await db.select().from(rooms).where(eq(rooms.id, booked.id))
    expect(room.phase).toBe("closed")
    const [invite] = await db.select().from(roomInvites)
    expect(invite.status).toBe("cancelled")
  })

  it("ends a suspended host's own room, and lifting lets them back at once", async () => {
    const admin = (await insertUser(db, { role: "admin" })).id
    const host = (await insertUser(db)).id
    const room = await openRoom(host, "hosted")
    const { suspended, touchedRooms } = await suspendMembers({ userIds: [host], days: null, reason: "Abuse.", actorUserId: admin, database: db })
    expect(touchedRooms).toEqual([{ id: room.id, closed: true }])
    expect((await listSuspensions({ search: "", page: 1, pageSize: 25 })).rows).toHaveLength(1)

    await liftSuspensions({ suspensionIds: suspended, actorUserId: admin, database: db })
    expect((await listSuspensions({ search: "", page: 1, pageSize: 25 })).rows).toHaveLength(0)
    await expect(openRoom(host, "again")).resolves.toBeTruthy()
  })
})

describe("pause switches", () => {
  it("stops new rooms and chat, and rooms already open carry on", async () => {
    const admin = (await insertUser(db, { role: "admin" })).id
    const host = (await insertUser(db)).id
    const room = await openRoom(host, "open")
    await setting(admin, "safety.pause", { newRooms: true, chat: true })

    await expect(openRoom(admin, "new")).rejects.toThrow("ROOM_REFUSED: New rooms are paused for a little while.")
    await expect(postRoomMessage(room.slug, host, "hi", db)).rejects.toThrow("ROOM_REFUSED: Chat is paused for a little while.")
    expect((await roomSnapshot(room.id, host, db)).chatPaused).toBe(true)
  })

  it("uses the admin's chat speed", async () => {
    const admin = (await insertUser(db, { role: "admin" })).id
    const host = (await insertUser(db)).id
    const room = await openRoom(host, "fast")
    await setting(admin, "chat.speed", { messagesPerMinute: 2 })
    await postRoomMessage(room.slug, host, "one", db)
    await postRoomMessage(room.slug, host, "two", db)
    await expect(postRoomMessage(room.slug, host, "three", db)).rejects.toThrow("RATE_LIMITED")
  })
})

describe("report counts and hidden profiles", () => {
  it("counts earlier reports about a person and a reporter's dismissed ones", async () => {
    const [host, sam, kim] = [(await insertUser(db)).id, (await insertUser(db)).id, (await insertUser(db)).id]
    const room = await openRoom(host, "reported")
    await joinRoomBySlug(room.slug, sam, db)
    await joinRoomBySlug(room.slug, kim, db)
    for (const body of ["one", "two", "three"]) await postRoomMessage(room.slug, sam, body, db)
    const lines = await db.select().from(roomMessages).orderBy(roomMessages.createdAt)
    for (const line of lines) {
      await reportRoomMessage(room.slug, kim, line.id, "rude", db)
      await new Promise((resolve) => setTimeout(resolve, 5))
    }
    await db.update(roomReports).set({ status: "dismissed" }).where(eq(roomReports.messageId, lines[0].id))

    const { rows } = await listAdminReports({ search: "", status: "all", sort: "created", direction: "desc", page: 1, pageSize: 25 })
    expect(rows[0]).toMatchObject({ subjectUserId: sam, subjectPriorReports: 2, reporterPastReports: 2, reporterPastDismissed: 1 })
    const byPerson = await listAdminReports({ search: "", status: "all", sort: "created", direction: "desc", page: 1, pageSize: 25, person: sam })
    expect(byPerson.total).toBe(3)
  })

  it("lists hidden profiles and tells the owner when one is shown again", async () => {
    const admin = (await insertUser(db, { role: "admin" })).id
    const sam = (await insertUser(db)).id
    await db.insert(pomodoroProfiles).values({ userId: sam, hiddenAt: new Date() }).onConflictDoUpdate({ target: pomodoroProfiles.userId, set: { hiddenAt: new Date() } })
    expect((await listHiddenProfiles({ search: "", page: 1, pageSize: 25 })).total).toBe(1)
    await showHiddenProfiles({ userIds: [sam], actorUserId: admin })
    expect((await listHiddenProfiles({ search: "", page: 1, pageSize: 25 })).total).toBe(0)
    expect(await noticesFor(sam)).toMatchObject([{ kind: "profile_restored", message: "Your public profile is visible again." }])
  })
})
