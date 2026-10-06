import { randomUUID } from "node:crypto"
import { readFile } from "node:fs/promises"

import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { cheerNoticeMessage, noticeKindFromWords } from "@/lib/pomodoro/notices"
import { type CustomShellDb } from "@/server/db"
import { followByHandle, sendCheer } from "@/server/pomodoro/following"
import {
  markRoomNoticesRead,
  pomodoroNoticeDetailsFor,
} from "@/server/pomodoro/notices"
import {
  pomodoroBlocks,
  pomodoroNoticeLinks,
  pomodoroProfiles,
  rooms,
} from "@/server/pomodoro/schema"
import { customShellNotifications } from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"

/**
 * The app's bell notices, against a real database.
 *
 * Three rules worth a test: a cheer is saved with its kind and leads to the
 * sender's page only while that page opens for the reader; nobody can ask
 * about somebody else's notices; and opening a room clears that room's
 * notices and nothing else.
 */

let client: PGlite
let db: CustomShellDb

beforeEach(async () => {
  ;({ client, db } = await createTestDatabase())
})

afterEach(async () => {
  await client.close()
})

async function member(profile: Partial<typeof pomodoroProfiles.$inferInsert>) {
  const user = await insertUser(db)
  await db.insert(pomodoroProfiles).values({ userId: user.id, ...profile })
  return user.id
}

async function notice(recipientUserId: string, actorUserId: string | null) {
  const id = randomUUID()
  await db.insert(customShellNotifications).values({
    id,
    recipientUserId,
    actorUserId,
    type: "app_activity",
    message: cheerNoticeMessage("Sam"),
    createdAt: new Date(),
  })
  return id
}

describe("a cheer in the bell", () => {
  it("is saved with its kind and opens the sender's page", async () => {
    const sender = await member({ handle: "sam", profilePublic: true })
    const reader = await member({ handle: "riley", profilePublic: true })
    await followByHandle(sender, "riley")
    await sendCheer({ fromUserId: sender, handle: "riley", cheerId: "keep-going" })

    const [row] = await db
      .select({ id: customShellNotifications.id, kind: pomodoroNoticeLinks.kind })
      .from(customShellNotifications)
      .innerJoin(
        pomodoroNoticeLinks,
        eq(pomodoroNoticeLinks.noticeId, customShellNotifications.id)
      )
      .where(eq(customShellNotifications.recipientUserId, reader))
    expect(row?.kind).toBe("cheer")

    expect(await pomodoroNoticeDetailsFor(reader, [row.id], db)).toEqual({
      [row.id]: { kind: "cheer", categoryId: "social", href: "/u/sam" },
    })
  })

  it("opens nothing when the sender's page is off, hidden or blocked", async () => {
    const reader = await member({ handle: "riley", profilePublic: true })
    const off = await member({ handle: "off", profilePublic: false })
    const hidden = await member({
      handle: "hidden",
      profilePublic: true,
      hiddenAt: new Date(),
    })
    const blocker = await member({ handle: "blocker", profilePublic: true })
    await db
      .insert(pomodoroBlocks)
      .values({ blockerUserId: blocker, blockedUserId: reader })

    for (const sender of [off, hidden, blocker]) {
      const id = await notice(reader, sender)
      await db.insert(pomodoroNoticeLinks).values({ noticeId: id, kind: "cheer" })
      const details = await pomodoroNoticeDetailsFor(reader, [id], db)
      expect(details[id]?.href).toBeNull()
    }
  })

  it("answers nothing about another person's notice or one this app did not write", async () => {
    const reader = await member({})
    const stranger = await member({})
    const theirs = await notice(stranger, null)
    await db
      .insert(pomodoroNoticeLinks)
      .values({ noticeId: theirs, kind: "cheer" })
    const unlinked = await notice(reader, null)

    expect(await pomodoroNoticeDetailsFor(reader, [theirs, unlinked], db)).toEqual(
      {}
    )
  })

  it("is labelled by the migration when it was sent before the table existed", async () => {
    const reader = await member({})
    const sender = await member({})
    const oldCheer = await notice(reader, sender)
    const systemNotice = await notice(reader, null)

    // The backfill statement from the migration, run again over a cheer that
    // was written without a link row, the way every cheer before it was.
    const migration = await readFile(
      new URL("../../../drizzle/0113_pomodoro_notice_links.sql", import.meta.url),
      "utf8"
    )
    const backfill = migration.slice(migration.indexOf("INSERT INTO"))
    await client.exec(backfill)

    const links = await db
      .select({ id: pomodoroNoticeLinks.noticeId, kind: pomodoroNoticeLinks.kind })
      .from(pomodoroNoticeLinks)
    expect(links).toEqual([{ id: oldCheer, kind: "cheer" }])
    expect(links.some((link) => link.id === systemNotice)).toBe(false)
  })

  it("is recognised from its own words for the first paint", () => {
    expect(
      noticeKindFromWords({ type: "app_activity", message: cheerNoticeMessage("Sam") })
    ).toBe("cheer")
    expect(
      noticeKindFromWords({ type: "changelog", message: cheerNoticeMessage("Sam") })
    ).toBeNull()
  })
})

describe("opening a room", () => {
  it("marks that room's unread notices read and shown, and nothing else", async () => {
    const reader = await member({})
    const other = await member({})
    const [room, elsewhere] = await db
      .insert(rooms)
      .values([
        { hostUserId: other, slug: "deep-work", name: "Deep Work" },
        { hostUserId: other, slug: "elsewhere", name: "Elsewhere" },
      ])
      .returning({ id: rooms.id })

    const thisRoom = await notice(reader, other)
    const otherRoom = await notice(reader, other)
    const someoneElses = await notice(other, reader)
    const unrelated = await notice(reader, other)
    await db.insert(pomodoroNoticeLinks).values([
      { noticeId: thisRoom, kind: "cheer", roomId: room.id },
      { noticeId: otherRoom, kind: "cheer", roomId: elsewhere.id },
      { noticeId: someoneElses, kind: "cheer", roomId: room.id },
    ])

    expect(await markRoomNoticesRead(reader, room.id, db)).toBe(1)

    const state = Object.fromEntries(
      (
        await db
          .select({
            id: customShellNotifications.id,
            readAt: customShellNotifications.readAt,
            seenAt: customShellNotifications.seenAt,
          })
          .from(customShellNotifications)
      ).map((row) => [row.id, row])
    )
    expect(state[thisRoom].readAt).not.toBeNull()
    expect(state[thisRoom].seenAt).not.toBeNull()
    for (const id of [otherRoom, someoneElses, unrelated]) {
      expect(state[id].readAt).toBeNull()
    }

    // A second open has nothing left to mark.
    expect(await markRoomNoticesRead(reader, room.id, db)).toBe(0)
  })
})
