import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { PROJECT_NOT_FOUND_MESSAGE } from "@/lib/video/projects"
import { uuid } from "@/server/auth/security"
import { type CustomShellDb } from "@/server/db"
import { type CustomShellUser } from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"
import {
  checkInEditorWindow,
  leaveEditorWindow,
} from "@/server/video/editor-windows"
import { createOwnedProject } from "@/server/video/projects"
import { videoEditorWindows } from "@/server/video/schema"

let client: PGlite
let database: CustomShellDb
let user: CustomShellUser

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  user = await insertUser(database)
})

afterEach(async () => {
  vi.useRealTimers()
  await client.close()
})

describe("editor windows", () => {
  it("tells a second window about the first, and never a window about itself", async () => {
    const project = await createOwnedProject(user.id, "Reel", database)
    const first = uuid()
    const second = uuid()

    const alone = await checkInEditorWindow(user.id, project.id, first, "edit", database)
    expect(alone.others_editing).toEqual([])

    const joined = await checkInEditorWindow(user.id, project.id, second, "edit", database)
    expect(joined.others_editing).toHaveLength(1)

    // The first window checking in again still only sees the second.
    const again = await checkInEditorWindow(user.id, project.id, first, "edit", database)
    expect(again.others_editing).toHaveLength(1)
  })

  it("does not count a read-only window as editing", async () => {
    const project = await createOwnedProject(user.id, "Reel", database)
    await checkInEditorWindow(user.id, project.id, uuid(), "view", database)
    const answer = await checkInEditorWindow(user.id, project.id, uuid(), "edit", database)
    expect(answer.others_editing).toEqual([])
  })

  it("forgets a window that has not checked in for 90 seconds", async () => {
    const project = await createOwnedProject(user.id, "Reel", database)
    const gone = uuid()
    vi.useFakeTimers({ now: new Date("2026-09-24T10:00:00Z"), toFake: ["Date"] })
    await checkInEditorWindow(user.id, project.id, gone, "edit", database)

    vi.setSystemTime(new Date("2026-09-24T10:01:29Z"))
    const stillThere = await checkInEditorWindow(user.id, project.id, uuid(), "edit", database)
    expect(stillThere.others_editing).toHaveLength(1)

    vi.setSystemTime(new Date("2026-09-24T10:01:31Z"))
    const answer = await checkInEditorWindow(user.id, project.id, uuid(), "edit", database)
    // Only the window from 10:01:29 is left; the silent one is deleted.
    expect(answer.others_editing).toEqual(["2026-09-24T10:01:29.000Z"])
    const rows = await database
      .select()
      .from(videoEditorWindows)
      .where(eq(videoEditorWindows.windowId, gone))
    expect(rows).toEqual([])
  })

  it("keeps the time a window was opened when it checks in again", async () => {
    const project = await createOwnedProject(user.id, "Reel", database)
    const first = uuid()
    vi.useFakeTimers({ now: new Date("2026-09-24T10:00:00Z"), toFake: ["Date"] })
    await checkInEditorWindow(user.id, project.id, first, "edit", database)
    vi.setSystemTime(new Date("2026-09-24T10:00:45Z"))
    await checkInEditorWindow(user.id, project.id, first, "edit", database)

    const answer = await checkInEditorWindow(user.id, project.id, uuid(), "edit", database)
    expect(answer.others_editing).toEqual(["2026-09-24T10:00:00.000Z"])
  })

  it("stops counting a window once it leaves", async () => {
    const project = await createOwnedProject(user.id, "Reel", database)
    const first = uuid()
    await checkInEditorWindow(user.id, project.id, first, "edit", database)
    await leaveEditorWindow(user.id, project.id, first, database)
    const answer = await checkInEditorWindow(user.id, project.id, uuid(), "edit", database)
    expect(answer.others_editing).toEqual([])
  })

  it("refuses somebody else's project and never deletes their rows", async () => {
    const stranger = await insertUser(database)
    const theirs = await createOwnedProject(stranger.id, "Theirs", database)
    const theirWindow = uuid()
    await checkInEditorWindow(stranger.id, theirs.id, theirWindow, "edit", database)

    await expect(
      checkInEditorWindow(user.id, theirs.id, uuid(), "edit", database)
    ).rejects.toThrowError(PROJECT_NOT_FOUND_MESSAGE)

    await leaveEditorWindow(user.id, theirs.id, theirWindow, database)
    const rows = await database
      .select()
      .from(videoEditorWindows)
      .where(eq(videoEditorWindows.windowId, theirWindow))
    expect(rows).toHaveLength(1)
  })
})
