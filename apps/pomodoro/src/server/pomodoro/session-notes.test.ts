import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { SESSION_NOTE_MAX_LENGTH } from "@/lib/pomodoro/session-notes"
import { buildFocusHistoryCsv } from "@/lib/pomodoro/report-csv"
import { type CustomShellDb } from "@/server/db"
import { listAdminSessions } from "@/server/pomodoro/admin"
import {
  loadFocusReport,
  loadFocusReportSessions,
} from "@/server/pomodoro/focus-report"
import { saveSessionNote } from "@/server/pomodoro/productivity"
import { focusSessions, tasks } from "@/server/pomodoro/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"

/**
 * Session notes, against a real database.
 *
 * The two rules worth a test rather than a comment: a note reaches the
 * person's own History and CSV, and it reaches nobody else — not another
 * account, and not the operator screens.
 */

const TODAY = "2026-09-25"
const UTC = "UTC"

let client: PGlite
let db: CustomShellDb
let userId: string

beforeEach(async () => {
  ;({ client, db } = await createTestDatabase())
  const user = await insertUser(db)
  userId = user.id
})

afterEach(async () => {
  await client.close()
})

async function addSession(
  overrides: Partial<typeof focusSessions.$inferInsert> = {}
) {
  const [session] = await db
    .insert(focusSessions)
    .values({
      userId,
      mode: "focus",
      status: "completed",
      plannedSeconds: 1500,
      accumulatedSeconds: 1500,
      completedAt: new Date(`${TODAY}T12:00:00Z`),
      idempotencyKey: `key-${Math.random()}`,
      ...overrides,
    })
    .returning()
  return session
}

describe("writing a note", () => {
  it("saves the line on the session that just finished", async () => {
    const session = await addSession()
    const saved = await saveSessionNote(userId, session.id, "Drafted the intro")
    expect(saved.note).toBe("Drafted the intro")
  })

  it("trims the line and caps it at the column's length", async () => {
    const session = await addSession()
    const saved = await saveSessionNote(
      userId,
      session.id,
      `  ${"x".repeat(400)}  `
    )
    expect(saved.note).toHaveLength(SESSION_NOTE_MAX_LENGTH)
  })

  it("clears the note when the line is emptied", async () => {
    const session = await addSession()
    await saveSessionNote(userId, session.id, "Typed by mistake")
    const cleared = await saveSessionNote(userId, session.id, "   ")
    expect(cleared.note).toBe(null)
  })

  it("refuses a break, a session still running, and another person's", async () => {
    const aBreak = await addSession({ mode: "short" })
    await expect(saveSessionNote(userId, aBreak.id, "note")).rejects.toThrow(
      "SESSION_NOT_FOUND"
    )
    const running = await addSession({ status: "running", completedAt: null })
    await expect(saveSessionNote(userId, running.id, "note")).rejects.toThrow(
      "SESSION_NOT_FOUND"
    )
    const mine = await addSession()
    const other = await insertUser(db)
    await expect(saveSessionNote(other.id, mine.id, "note")).rejects.toThrow(
      "SESSION_NOT_FOUND"
    )
    const [untouched] = await db
      .select({ note: focusSessions.note })
      .from(focusSessions)
      .where(eq(focusSessions.id, mine.id))
    expect(untouched.note).toBe(null)
  })
})

describe("where a note shows up", () => {
  it("appears on its row in History, and unnoted rows stay null", async () => {
    const noted = await addSession()
    await saveSessionNote(userId, noted.id, "Drafted the intro")
    await addSession({ completedAt: new Date(`${TODAY}T13:00:00Z`) })

    const report = await loadFocusReport(userId, "7d", TODAY, UTC)
    const rows = report.sessions.rows
    expect(rows).toHaveLength(2)
    expect(rows.find((row) => row.id === noted.id)?.note).toBe(
      "Drafted the intro"
    )
    expect(rows.filter((row) => row.note === null)).toHaveLength(1)
  })

  it("appears in the CSV, with an empty cell when there is no note", async () => {
    const [task] = await db
      .insert(tasks)
      .values({ userId, title: "Write the intro", plannedDate: TODAY })
      .returning()
    const noted = await addSession({ taskId: task.id })
    await saveSessionNote(userId, noted.id, "Drafted the intro")
    await addSession({ completedAt: new Date(`${TODAY}T13:00:00Z`) })

    const report = await loadFocusReportSessions(userId, "7d", TODAY, UTC)
    const csv = buildFocusHistoryCsv(report.rows)
    const lines = csv.trimEnd().split("\r\n")
    expect(lines[0].endsWith(",Note")).toBe(true)
    expect(lines[1].endsWith(",Drafted the intro")).toBe(true)
    expect(lines[2].endsWith(",")).toBe(true)
  })

  it("quotes a note holding a comma and defuses one that looks like a formula", () => {
    const csv = buildFocusHistoryCsv([
      {
        localDate: TODAY,
        localTime: "12:00",
        taskTitle: null,
        note: "Drafted the intro, then the outline",
        plannedSeconds: 1500,
        accumulatedSeconds: 1500,
      },
      {
        localDate: TODAY,
        localTime: "13:00",
        taskTitle: null,
        note: "=SUM(A1:A9)",
        plannedSeconds: 1500,
        accumulatedSeconds: 1500,
      },
    ])
    expect(csv).toContain('"Drafted the intro, then the outline"')
    expect(csv).toContain("'=SUM(A1:A9)")
  })

  // The task's privacy rule, checked against the screen that would leak it.
  it("never reaches the admin sessions dashboard", async () => {
    const session = await addSession()
    await saveSessionNote(userId, session.id, "Something private")

    const admin = await listAdminSessions({
      page: 1,
      pageSize: 20,
      sort: "started",
      direction: "desc",
      search: "",
      mode: "all",
      status: "all",
      userId: null,
    })
    expect(admin.rows).toHaveLength(1)
    expect(JSON.stringify(admin.rows)).not.toContain("Something private")
    expect("note" in admin.rows[0]).toBe(false)
  })
})
