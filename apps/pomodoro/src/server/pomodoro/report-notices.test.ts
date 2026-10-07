import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// A profile report is rate-limited by the caller's address, which only a real
// request has.
vi.mock("@/server/auth/origin", () => ({ requestIp: () => "203.0.113.7" }))

import {
  noticeKindFromWords,
  PROFILE_HIDDEN_MESSAGE,
  REPORT_REVIEWED_MESSAGE,
} from "@/lib/pomodoro/notices"
import { type CustomShellDb } from "@/server/db"
import { reviewRoomReports } from "@/server/pomodoro/admin"
import { reportProfile, setProfilesHidden } from "@/server/pomodoro/profile-reports"
import {
  createRoomWithHost,
  joinRoomBySlug,
  postRoomMessage,
  reportRoomMessage,
} from "@/server/pomodoro/rooms"
import {
  pomodoroNoticeLinks,
  pomodoroProfiles,
  roomMessages,
  roomReports,
} from "@/server/pomodoro/schema"
import { customShellNotifications } from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"

/**
 * Moderation notices, against a real database: admins hear a report land,
 * the reporter hears it was reviewed in words that never say how, and a
 * hidden profile's owner hears it in the bell.
 */

let client: PGlite
let db: CustomShellDb

beforeEach(async () => {
  ;({ client, db } = await createTestDatabase())
})

afterEach(async () => {
  await client.close()
})

async function person(name: string, role = "member") {
  const user = await insertUser(db, { name, role })
  await db.insert(pomodoroProfiles).values({
    userId: user.id,
    publicDisplayName: name,
    handle: name.toLowerCase(),
    profilePublic: true,
  })
  return user.id
}

async function noticesFor(userId: string) {
  return db
    .select({
      message: customShellNotifications.message,
      actorUserId: customShellNotifications.actorUserId,
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
}

async function reportIds() {
  return (await db.select({ id: roomReports.id }).from(roomReports)).map(
    (row) => row.id
  )
}

describe("a new report", () => {
  it("tells each admin once, never the admin who filed it, and names nobody", async () => {
    const [ada, bo] = [await person("Ada", "admin"), await person("Bob", "admin")]
    await person("Sam")
    await reportProfile({ handle: "sam", reason: "words", reporterUserId: ada })

    expect(await noticesFor(ada)).toEqual([])
    const [notice] = await noticesFor(bo)
    expect(notice).toMatchObject({
      message: "New report: a profile.",
      kind: "report_new",
      href: "/admin/pomodoro-reports",
      actorUserId: null,
      foldCount: 1,
    })
    expect(noticeKindFromWords({ type: "app_activity", message: notice.message })).toBe(
      "report_new"
    )
  })

  it("folds five reports into one notice per admin", async () => {
    const admin = await person("Ada", "admin")
    for (const name of ["Sam", "Kim", "Lee", "Max", "Ray"]) {
      await person(name)
      await reportProfile({ handle: name.toLowerCase(), reason: "words", reporterUserId: null })
    }
    const notices = await noticesFor(admin)
    expect(notices).toHaveLength(1)
    expect(notices[0]).toMatchObject({ message: "5 new reports.", foldCount: 5 })
    expect(noticeKindFromWords({ type: "app_activity", message: "5 new reports." })).toBe(
      "report_new"
    )
  })

  it("says a room message was reported, once however often it is reported", async () => {
    const admin = await person("Ada", "admin")
    const [host, sam] = [await person("Host"), await person("Sam")]
    const { room } = await createRoomWithHost(host, "deep-work", {
      name: "Deep Work",
      visibility: "public",
      focusMinutes: 25,
      shortBreakMinutes: 5,
      longBreakMinutes: 15,
      autoStart: false,
    }, db)
    await joinRoomBySlug(room.slug, sam, db)
    await postRoomMessage(room.slug, sam, "something rude", db)
    const [line] = await db.select({ id: roomMessages.id }).from(roomMessages)

    await reportRoomMessage(room.slug, host, line.id, "rude", db)
    await reportRoomMessage(room.slug, host, line.id, "rude", db)

    const notices = await noticesFor(admin)
    expect(notices).toHaveLength(1)
    expect(notices[0].message).toBe("New report: a room message.")
  })

  it("turns the admins' notices read once nothing in the queue is open", async () => {
    const admin = await person("Ada", "admin")
    await person("Sam")
    await person("Kim")
    await reportProfile({ handle: "sam", reason: "words", reporterUserId: null })
    await reportProfile({ handle: "kim", reason: "words", reporterUserId: null })
    const [first, second] = await reportIds()

    await reviewRoomReports({ reportIds: [first], decision: "dismissed", actorUserId: admin })
    expect((await noticesFor(admin))[0].readAt).toBeNull()

    await reviewRoomReports({ reportIds: [second], decision: "resolved", actorUserId: admin })
    expect((await noticesFor(admin))[0].readAt).not.toBeNull()
  })
})

describe("the reporter hears it was reviewed", () => {
  it("in the same words for resolved and dismissed, naming nobody", async () => {
    const admin = await person("Ada", "admin")
    const [reporterA, reporterB] = [await person("Rae"), await person("Ola")]
    await person("Sam")
    await reportProfile({ handle: "sam", reason: "words", reporterUserId: reporterA })
    await reportProfile({ handle: "sam", reason: "picture", reporterUserId: reporterB })
    const reports = await db
      .select({ id: roomReports.id, reporter: roomReports.reporterUserId })
      .from(roomReports)
    const of = (who: string) => reports.find((row) => row.reporter === who)!.id

    await reviewRoomReports({ reportIds: [of(reporterA)], decision: "resolved", actorUserId: admin })
    await reviewRoomReports({ reportIds: [of(reporterB)], decision: "dismissed", actorUserId: admin })

    const [resolved] = await noticesFor(reporterA)
    const [dismissed] = await noticesFor(reporterB)
    expect(resolved.message).toBe(REPORT_REVIEWED_MESSAGE)
    expect(dismissed.message).toBe(resolved.message)
    expect(resolved).toMatchObject({ kind: "report_reviewed", actorUserId: null, href: null })
    expect(dismissed).toMatchObject({ kind: "report_reviewed", actorUserId: null, href: null })
  })

  it("once per press however many of their reports it closes, and not again after a reopen", async () => {
    const admin = await person("Ada", "admin")
    const reporter = await person("Rae")
    await person("Sam")
    await reportProfile({ handle: "sam", reason: "words", reporterUserId: reporter })
    await reportProfile({ handle: "sam", reason: "picture", reporterUserId: reporter })
    const ids = await reportIds()

    await reviewRoomReports({ reportIds: ids, decision: "resolved", actorUserId: admin })
    await reviewRoomReports({ reportIds: ids, decision: "pending", actorUserId: admin })
    await reviewRoomReports({ reportIds: ids, decision: "dismissed", actorUserId: admin })

    expect(await noticesFor(reporter)).toHaveLength(1)
  })
})

describe("a hidden profile", () => {
  it("tells its owner once, with no name, and leads to Settings", async () => {
    const admin = await person("Ada", "admin")
    const owner = await person("Sam")
    await reportProfile({ handle: "sam", reason: "words", reporterUserId: null })
    await reportProfile({ handle: "sam", reason: "picture", reporterUserId: null })
    const ids = await reportIds()

    await setProfilesHidden({ reportIds: ids, hidden: true, actorUserId: admin })
    await setProfilesHidden({ reportIds: ids, hidden: true, actorUserId: admin })

    const notices = await noticesFor(owner)
    expect(notices).toHaveLength(1)
    expect(notices[0]).toMatchObject({
      message: PROFILE_HIDDEN_MESSAGE,
      kind: "profile_hidden",
      href: "/settings?tab=public",
      actorUserId: null,
    })
  })
})
