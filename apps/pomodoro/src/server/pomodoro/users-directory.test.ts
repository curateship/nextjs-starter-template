import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { type CustomShellDb } from "@/server/db"
import {
  forgetUsersPages,
  readUsersPage,
} from "@/server/pomodoro/public-profile"
import { eq } from "drizzle-orm"

import {
  dailyFocusStats,
  focusSessions,
  pomodoroFollows,
  pomodoroProfiles,
} from "@/server/pomodoro/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"

/**
 * The `/users` directory as Tyler drew it on 8 Oct 2026: Most focused and
 * Newest, a search over names and handles, and each card knowing whether it
 * is yours and whether you follow it.
 */

let client: PGlite
let db: CustomShellDb

beforeEach(async () => {
  ;({ client, db } = await createTestDatabase())
  forgetUsersPages()
})

afterEach(async () => {
  await client.close()
})

async function listedPerson(
  name: string,
  handle: string,
  { hours = 0, showFigures = true, joined = new Date() } = {}
) {
  const user = await insertUser(db, { name, createdAt: joined })
  await db.insert(pomodoroProfiles).values({
    userId: user.id,
    publicDisplayName: name,
    handle,
    profilePublic: true,
    listed: true,
    showFigures,
  })
  if (hours)
    await db.insert(dailyFocusStats).values({
      userId: user.id,
      localDate: "2026-10-01",
      focusSeconds: hours * 3_600,
    })
  return user.id
}

const handles = (result: Awaited<ReturnType<typeof readUsersPage>>) =>
  result.rows.map((row) => row.handle)

describe("the users directory", () => {
  it("puts the most focused first, and a private figure last as null", async () => {
    await listedPerson("Mika K.", "mika", { hours: 214 })
    await listedPerson("Sana L.", "sana", { hours: 110 })
    await listedPerson("Quiet Q.", "quiet", { hours: 900, showFigures: false })
    const result = await readUsersPage(0, null)
    expect(handles(result)).toEqual(["mika", "sana", "quiet"])
    expect(result.rows.map((row) => row.focusHours)).toEqual([214, 110, null])
  })

  it("puts the newest first when asked", async () => {
    await listedPerson("Old O.", "old", { hours: 50, joined: new Date("2026-01-01") })
    await listedPerson("New N.", "new", { hours: 5, joined: new Date("2026-09-01") })
    expect(handles(await readUsersPage(0, null, { sort: "newest" }))).toEqual([
      "new",
      "old",
    ])
    expect(handles(await readUsersPage(0, null, { sort: "focused" }))).toEqual([
      "old",
      "new",
    ])
  })

  it("searches names and handles, and treats % and _ as plain characters", async () => {
    await listedPerson("Jonah R.", "jonah")
    await listedPerson("Eve V.", "eve_v")
    await listedPerson("Bo O.", "bo_o")
    // "Dave" has a letter before its v, which an unescaped _ would match.
    await listedPerson("Dave D.", "dave")
    expect(handles(await readUsersPage(0, null, { search: "JON" }))).toEqual([
      "jonah",
    ])
    expect(handles(await readUsersPage(0, null, { search: "_v" }))).toEqual([
      "eve_v",
    ])
    expect(handles(await readUsersPage(0, null, { search: "%" }))).toEqual([])
  })

  it("marks your own card and the people you follow", async () => {
    const me = await listedPerson("Ty the Focused", "sarah")
    const mika = await listedPerson("Mika K.", "mika")
    await listedPerson("Bo O.", "bo_o")
    await db
      .insert(pomodoroFollows)
      .values({ followerUserId: me, followedUserId: mika })
    const mine = await readUsersPage(0, me, { sort: "newest" })
    expect(
      mine.rows.map((row) => [row.handle, row.mine, row.following])
    ).toEqual([
      ["bo_o", false, false],
      ["mika", false, true],
      ["sarah", true, false],
    ])
    // A signed-out reader follows nobody, which is null rather than false.
    const visitor = await readUsersPage(0, null, { sort: "newest" })
    expect(visitor.rows.map((row) => row.following)).toEqual([null, null, null])
  })

  it("Online now shows only people mid-focus who chose to show it", async () => {
    const sharing = await listedPerson("Mika K.", "mika", { hours: 10 })
    const private_ = await listedPerson("Jonah R.", "jonah", { hours: 20 })
    const stale = await listedPerson("Sana L.", "sana", { hours: 30 })
    await listedPerson("Eve V.", "eve", { hours: 40 })
    for (const userId of [sharing, stale])
      await db
        .update(pomodoroProfiles)
        .set({ showFocusingNow: true })
        .where(eq(pomodoroProfiles.userId, userId))
    const now = Date.now()
    const focus = (userId: string, endsAt: number, key: string) =>
      db.insert(focusSessions).values({
        userId,
        mode: "focus",
        status: "running",
        plannedSeconds: 1500,
        targetEndsAt: new Date(endsAt),
        idempotencyKey: key,
      })
    await focus(sharing, now + 10 * 60_000, "a")
    // Running but not shared: Jonah keeps "Focusing right now" off.
    await focus(private_, now + 10 * 60_000, "b")
    // Shared but its clock ran out hours ago: a focus left open overnight.
    await focus(stale, now - 3 * 3_600_000, "c")
    expect(
      handles(await readUsersPage(0, null, { sort: "online" }, now))
    ).toEqual(["mika"])
  })
})
