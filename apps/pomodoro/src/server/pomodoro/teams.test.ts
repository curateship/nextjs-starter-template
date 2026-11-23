import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { type CustomShellDb } from "@/server/db"
import { createGroupFor, leaveGroup } from "@/server/pomodoro/groups"
import {
  dailyFocusStats,
  pomodoroBlocks,
  pomodoroGroupMembers,
  pomodoroGroups,
  pomodoroProfiles,
} from "@/server/pomodoro/schema"
import {
  forgetTeamPages,
  readTeamPage,
  saveTeamPageSettings,
  type TeamPageView,
} from "@/server/pomodoro/teams"
import { createTestDatabase, insertUser } from "@/server/test-support"

/**
 * The team page against a real database. The rule under test is the one
 * Tyler set on 12 Oct 2026: a team page shows only what each member already
 * publishes on their own profile, with no exception for the owner.
 */

let client: PGlite
let db: CustomShellDb
// Inside every window, whatever today is: the windows count up to today.
const TODAY = new Date().toISOString().slice(0, 10)

beforeEach(async () => {
  ;({ client, db } = await createTestDatabase())
  forgetTeamPages()
})

afterEach(async () => {
  await client.close()
})

type Publishes = "figures" | "name" | "nothing"

/** A member who publishes as much as `publishes` says, with this much focus today. */
async function person(
  handle: string,
  publishes: Publishes,
  minutes = 60,
  role: "member" | "admin" = "member"
) {
  const user = await insertUser(db, { role })
  await db.insert(pomodoroProfiles).values({
    userId: user.id,
    publicDisplayName: `Name ${handle}`,
    handle,
    profilePublic: publishes !== "nothing",
    showFigures: publishes === "figures",
  })
  await db.insert(dailyFocusStats).values({
    userId: user.id,
    localDate: TODAY,
    focusSessions: 2,
    focusSeconds: minutes * 60,
  })
  return user.id
}

/** A group with a public page at /team/<handle>. An admin owner reads as Pro. */
async function team(ownerId: string, handle = "northfold") {
  const groupId = await createGroupFor(ownerId, "Northfold")
  await saveTeamPageSettings(ownerId, groupId, { handle, pagePublic: true })
  return groupId
}

async function join(groupId: string, userId: string) {
  await db.insert(pomodoroGroupMembers).values({ groupId, userId })
  forgetTeamPages()
}

/** The page with the reader-specific parts taken off, for comparing readers. */
function asAnybody(view: TeamPageView | null) {
  if (!view) return view
  const { isOwner: _isOwner, groupId: _groupId, boards, ...rest } = view
  return {
    ...rest,
    boards: Object.fromEntries(
      Object.entries(boards).map(([window, rows]) => [
        window,
        rows.map(({ isYou: _isYou, ...row }) => row),
      ])
    ),
  }
}

describe("the team page", () => {
  it("ranks those who publish hours, names those who do not, and only counts the rest", async () => {
    const owner = await person("owner", "figures", 30, "admin")
    const groupId = await team(owner)
    await join(groupId, await person("sam", "figures", 120))
    await join(groupId, await person("quiet", "name", 600))
    await join(groupId, await person("private", "nothing", 900))

    const page = await readTeamPage("northfold", null)
    expect(page).not.toBeNull()
    expect(page!.memberCount).toBe(4)
    expect(page!.boards.week.map((row) => [row.handle, row.name, row.focusSeconds])).toEqual([
      ["sam", "Name sam", 120 * 60],
      ["owner", "Name owner", 30 * 60],
    ])
    expect(page!.quiet).toEqual([{ name: "Name quiet", handle: "quiet" }])
    expect(page!.unnamedCount).toBe(1)
    // Nobody's private hours or name are anywhere in the answer.
    const json = JSON.stringify(page)
    expect(json).not.toContain("Name private")
    expect(json).not.toContain(String(600 * 60))
    expect(json).not.toContain(owner)
  })

  it("shows the owner no more than a stranger", async () => {
    const owner = await person("owner", "figures", 30, "admin")
    const groupId = await team(owner)
    await join(groupId, await person("sam", "figures"))
    await join(groupId, await person("quiet", "name"))
    await join(groupId, await person("private", "nothing"))

    const stranger = await readTeamPage("northfold", null)
    const asOwner = await readTeamPage("northfold", owner)
    expect(asOwner!.isOwner).toBe(true)
    expect(asOwner!.groupId).toBe(groupId)
    expect(stranger!.groupId).toBeNull()
    expect(asAnybody(asOwner)).toEqual(asAnybody(stranger))
  })

  it("takes somebody off the page the moment they leave", async () => {
    const owner = await person("owner", "figures", 30, "admin")
    const groupId = await team(owner)
    const sam = await person("sam", "figures")
    await join(groupId, sam)
    expect((await readTeamPage("northfold", null))!.boards.all).toHaveLength(2)

    await leaveGroup(sam, groupId)
    const after = await readTeamPage("northfold", null)
    expect(after!.boards.all.map((row) => row.handle)).toEqual(["owner"])
    expect(after!.memberCount).toBe(1)
  })

  it("never holds a page that was being built when somebody left", async () => {
    const owner = await person("owner", "figures", 30, "admin")
    const groupId = await team(owner)
    const sam = await person("sam", "figures")
    await join(groupId, sam)

    // The read starts, Sam leaves before it finishes, then a fresh read.
    const during = readTeamPage("northfold", null)
    await leaveGroup(sam, groupId)
    await during
    const after = await readTeamPage("northfold", null)
    expect(after!.boards.all.map((row) => row.handle)).toEqual(["owner"])
  })

  it("hides a member from a reader who blocked them", async () => {
    const owner = await person("owner", "figures", 30, "admin")
    const groupId = await team(owner)
    const sam = await person("sam", "figures")
    await join(groupId, sam)
    const reader = await insertUser(db)
    await db
      .insert(pomodoroBlocks)
      .values({ blockerUserId: reader.id, blockedUserId: sam })

    const page = await readTeamPage("northfold", reader.id)
    expect(page!.boards.all.map((row) => row.handle)).toEqual(["owner"])
  })

  it("answers nothing for a page that is off, a free owner, or a bad address", async () => {
    const owner = await person("owner", "figures", 30, "admin")
    const groupId = await team(owner)
    await saveTeamPageSettings(owner, groupId, {
      handle: "northfold",
      pagePublic: false,
    })
    expect(await readTeamPage("northfold", null)).toBeNull()

    // A free owner's switch can be on in the table and the page still 404s.
    const free = await person("free", "figures")
    const freeGroup = await createGroupFor(free, "Free crew")
    await db
      .update(pomodoroGroups)
      .set({ handle: "freecrew", pagePublic: true })
      .where(eq(pomodoroGroups.id, freeGroup))
    expect(await readTeamPage("freecrew", null)).toBeNull()

    expect(await readTeamPage("Not A Handle\u0000", null)).toBeNull()
    expect(await readTeamPage("admin", null)).toBeNull()
  })

  it("costs the same few queries for eleven members as for one, and none once held", async () => {
    const owner = await person("owner", "figures", 30, "admin")
    const groupId = await team(owner)
    const spy = vi.spyOn(client, "query")

    forgetTeamPages()
    await readTeamPage("northfold", null)
    const forOne = spy.mock.calls.length
    // Ten, measured on 12 Oct 2026: the group, five for the owner's plan,
    // the roster and one ranking per window. Zero would mean the spy missed
    // them.
    expect(forOne).toBeGreaterThan(0)
    expect(forOne).toBeLessThanOrEqual(10)

    for (let index = 0; index < 10; index += 1)
      await join(groupId, await person(`member${index}`, index % 2 ? "figures" : "name"))
    spy.mockClear()
    await readTeamPage("northfold", null)
    const forEleven = spy.mock.calls.length
    expect(forEleven).toBe(forOne)

    spy.mockClear()
    await readTeamPage("northfold", null)
    expect(spy.mock.calls.length).toBe(0)
  })
})

describe("the owner's settings", () => {
  it("refuses a free owner, a missing address, a taken address and a stranger", async () => {
    const free = await person("free", "figures")
    const freeGroup = await createGroupFor(free, "Free crew")
    await expect(
      saveTeamPageSettings(free, freeGroup, { handle: "freecrew", pagePublic: true })
    ).rejects.toThrow("UPGRADE_REQUIRED:teamPage")
    // Picking an address with the page off needs no plan.
    await expect(
      saveTeamPageSettings(free, freeGroup, { handle: "freecrew", pagePublic: false })
    ).resolves.toMatchObject({ handle: "freecrew", pagePublic: false, canPublish: false })

    const owner = await person("owner", "figures", 30, "admin")
    const groupId = await createGroupFor(owner, "Northfold")
    await expect(
      saveTeamPageSettings(owner, groupId, { handle: null, pagePublic: true })
    ).rejects.toThrow("TEAM_HANDLE_NEEDED")
    await expect(
      saveTeamPageSettings(owner, groupId, { handle: "freecrew", pagePublic: true })
    ).rejects.toThrow("TEAM_HANDLE_TAKEN")
    await expect(
      saveTeamPageSettings(owner, groupId, { handle: "login", pagePublic: true })
    ).rejects.toThrow("TEAM_HANDLE_SHAPE")
    await expect(
      saveTeamPageSettings(free, groupId, { handle: "mine", pagePublic: false })
    ).rejects.toThrow("GROUP_NOT_OWNER")
  })
})
