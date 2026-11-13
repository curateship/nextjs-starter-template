import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// A report is rate-limited by the caller's address, which only a real request has.
vi.mock("@/server/auth/origin", () => ({ requestIp: () => "203.0.113.7" }))

import { FLOWFLY_PAGE_ERRORS, FLOWFLY_SECTIONS_NODE } from "@/lib/pomodoro/flowfly-page"
import { type CustomShellDb } from "@/server/db"
import { readAdminRoomRecord, readFlowflyCounts, readFlowflyOverview, readWaitingList } from "@/server/pomodoro/flowfly-overview"
import { listAdminProfiles } from "@/server/pomodoro/admin-profiles"
import { getFlowflyPageAndSections, saveFlowflyPageBody, setFlowflyPageLock } from "@/server/pomodoro/flowfly-page"
import { createRoomWithHost, joinRoomBySlug, postRoomMessage, reportRoomMessage } from "@/server/pomodoro/rooms"
import { dailyFocusStats, pomodoroProfiles, roomMessages } from "@/server/pomodoro/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"

/**
 * What the Flowfly admin dashboard reads beyond its lists (Tyler, 13 Nov
 * 2026), against a real database: the Dashboards block's counts, Waiting on
 * you, the Overview's live rooms, a room's record, each admin's own page, and
 * Profiles' Focus time column.
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
  await db.insert(pomodoroProfiles).values({ userId: user.id, publicDisplayName: name, handle: name.toLowerCase(), profilePublic: true })
  return user.id
}

async function room(host: string, slug: string, name: string) {
  const { room } = await createRoomWithHost(
    host,
    slug,
    {
      name,
      visibility: "public",
      focusMinutes: 25,
      shortBreakMinutes: 5,
      longBreakMinutes: 15,
      autoStart: false,
      sound: "curated:rain",
      background: "scene:plain",
    },
    db
  )
  return room
}

describe("the Flowfly dashboard's reads", () => {
  it("counts the people in each live room, busiest first", async () => {
    const [ana, ben, cy] = [await person("Ana"), await person("Ben"), await person("Cyd")]
    const busy = await room(ana, "busy", "Busy room")
    await room(ben, "quiet", "Quiet room")
    await joinRoomBySlug(busy.slug, cy, db)

    const { roomsLive } = await readFlowflyOverview()
    // A hand-written count in a one-table select once counted nobody in every room.
    expect(roomsLive.busiest.map((row) => [row.name, row.people])).toEqual([
      ["Busy room", 2],
      ["Quiet room", 1],
    ])
    expect(roomsLive).toMatchObject({ open: 2, people: 3, held: 0 })
  })

  it("lists a waiting report, counts it for Safety, and shows it on the room's record", async () => {
    await person("Ada", "admin")
    const [host, sam] = [await person("Host"), await person("Sam")]
    const deep = await room(host, "deep-work", "Deep Work")
    await joinRoomBySlug(deep.slug, sam, db)
    await postRoomMessage(deep.slug, sam, "something rude", db)
    const [line] = await db.select({ id: roomMessages.id }).from(roomMessages)
    await reportRoomMessage(deep.slug, host, line.id, "rude", db)

    const waiting = await readWaitingList()
    expect(waiting).toMatchObject({ total: 1, reports: 1, shares: 0, held: 0 })
    expect(waiting.items).toEqual([expect.objectContaining({ kind: "report", label: "Message report, Deep Work", line: "rude" })])

    expect(await readFlowflyCounts()).toMatchObject({ rooms: 1, safety: 1, library: 0 })

    const record = await readAdminRoomRecord(deep.id)
    expect(record?.reports.map((report) => [report.reason, report.status])).toEqual([["rude", "pending"]])
    expect(record).toMatchObject({ invites: [], bans: [], weekly: null })
    expect(await readAdminRoomRecord(crypto.randomUUID())).toBeNull()
  })

  it("gives Profiles each person's all-time focus, sortable", async () => {
    const [ana, ben] = [await person("Ana"), await person("Ben")]
    await db.insert(dailyFocusStats).values([
      { userId: ana, localDate: "2026-11-01", focusSeconds: 1_800 },
      { userId: ana, localDate: "2026-11-02", focusSeconds: 1_800 },
      { userId: ben, localDate: "2026-11-02", focusSeconds: 7_200 },
    ])
    await person("Cyd")
    const list = await listAdminProfiles({ search: "", visibility: "all", sort: "focus", direction: "desc", page: 1, pageSize: 25 })
    expect(list.rows.map((row) => [row.name, row.focusSeconds])).toEqual([
      ["Ben", 7_200],
      ["Ana", 3_600],
      ["Cyd", 0],
    ])
  })

  it("keeps the Dashboards block on an admin's page and refuses a save while locked", async () => {
    const admin = await person("Ada", "admin")
    // A page saved without the fixed block gets it back at the top.
    await saveFlowflyPageBody(admin, JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Mine" }] }] }), db)
    const { page } = await getFlowflyPageAndSections(admin, db)
    const body = JSON.parse(page.body) as { content: { type: string }[] }
    expect(body.content[0].type).toBe(FLOWFLY_SECTIONS_NODE)
    expect(page.body).toContain("Mine")

    await setFlowflyPageLock(admin, true, db)
    await expect(saveFlowflyPageBody(admin, page.body, db)).rejects.toThrow(FLOWFLY_PAGE_ERRORS.locked)
  })
})
