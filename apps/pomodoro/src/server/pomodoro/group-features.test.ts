import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { shiftLocalDate } from "@/lib/pomodoro/focus-history"
import { type CustomShellDb } from "@/server/db"
import { sendGroupCheer } from "@/server/pomodoro/following"
import {
  checkGroupScoresAfterFocus,
  groupWindowStart,
  mondayOf,
  readGroupBoard,
  readGroupPastWeeks,
  readGroupStanding,
  sendGroupWinners,
} from "@/server/pomodoro/group-scores"
import {
  acceptGroupInvite,
  answerGroupRequest,
  createGroupFor,
  declineGroupInvite,
  handOverGroup,
  joinGroupByToken,
  leaveGroup,
  letBackIn,
  listGroupEvents,
  listGroupMembers,
  listGroupRequests,
  listGroupsFor,
  listInvitableFollows,
  listKeptOut,
  listMyGroupInvites,
  lookupGroupInvite,
  removeGroupMember,
  resetGroupInvite,
  saveGroupDetails,
  saveGroupInviteSettings,
  sendGroupInvites,
} from "@/server/pomodoro/groups"
import { localDateFor } from "@/server/pomodoro/productivity"
import {
  dailyFocusStats,
  focusSessions,
  pomodoroBlocks,
  pomodoroFollows,
  pomodoroGroupInvites,
  pomodoroGroups,
  pomodoroNoticeLinks,
  pomodoroProfiles,
} from "@/server/pomodoro/schema"
import { customShellNotifications } from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"

/**
 * Groups task 01 against a real database: running a group, getting people
 * in, the board, and the scores. Every rule Tyler gave on 13 Oct 2026 has a
 * test here: waiting people let in when asking first goes off, only the
 * owner books a weekly room (in the rooms tests), ties name everybody, and
 * past weeks are worked out rather than stored.
 */

let client: PGlite
let db: CustomShellDb

beforeEach(async () => {
  ;({ client, db } = await createTestDatabase())
})

afterEach(async () => {
  await client.close()
})

async function member(name: string | null, extra: Partial<typeof pomodoroProfiles.$inferInsert> = {}) {
  const user = await insertUser(db)
  await db
    .insert(pomodoroProfiles)
    .values({ userId: user.id, publicDisplayName: name, timezone: "UTC", ...extra })
  return user.id
}

async function tokenOf(groupId: string) {
  const [group] = await db
    .select({ joinToken: pomodoroGroups.joinToken })
    .from(pomodoroGroups)
    .where(eq(pomodoroGroups.id, groupId))
  return group.joinToken
}

async function membershipOf(ownerId: string, groupId: string, name: string) {
  const members = await listGroupMembers(ownerId, groupId)
  const found = members.find((row) => row.name === name)
  if (!found) throw new Error(`no member ${name}`)
  return found.membershipId
}

async function noticesFor(userId: string, kind?: string) {
  const rows = await db
    .select({
      message: customShellNotifications.message,
      kind: pomodoroNoticeLinks.kind,
      href: pomodoroNoticeLinks.href,
    })
    .from(customShellNotifications)
    .innerJoin(
      pomodoroNoticeLinks,
      eq(pomodoroNoticeLinks.noticeId, customShellNotifications.id)
    )
    .where(eq(customShellNotifications.recipientUserId, userId))
  return kind ? rows.filter((row) => row.kind === kind) : rows
}

async function focus(userId: string, localDate: string, minutes: number, sessions = 1) {
  await db.insert(dailyFocusStats).values({
    userId,
    localDate,
    focusSessions: sessions,
    focusSeconds: minutes * 60,
  })
}

/** A group of an owner and the named members, all joined by the link. */
async function groupOf(names: string[], groupName = "Study Buddies") {
  const owner = await member("Olive")
  const groupId = await createGroupFor(owner, groupName)
  const token = await tokenOf(groupId)
  const ids: Record<string, string> = {}
  for (const name of names) {
    ids[name] = await member(name)
    await joinGroupByToken(ids[name], token)
  }
  return { owner, groupId, token, ids }
}

describe("managing a group (section A)", () => {
  it("renames the group, saves its line, and writes it in the owner's activity", async () => {
    const { owner, groupId, ids } = await groupOf(["Sam"])
    await saveGroupDetails(owner, groupId, {
      name: "Thesis writers",
      description: "  Weekday mornings  ",
      timezone: "Asia/Manila",
      weeklyGoalHours: 40,
    })
    const [group] = await listGroupsFor(owner)
    expect(group).toMatchObject({
      name: "Thesis writers",
      description: "Weekday mornings",
      timezone: "Asia/Manila",
      weeklyGoalHours: 40,
    })
    const events = await listGroupEvents(owner, groupId)
    expect(events.map((event) => event.kind)).toContain("renamed")

    // A member cannot rename it, and hears the owner-only words.
    await expect(
      saveGroupDetails(ids.Sam, groupId, {
        name: "Mine now",
        description: null,
        timezone: "UTC",
        weeklyGoalHours: null,
      })
    ).rejects.toThrow("GROUP_NOT_OWNER")
    await expect(
      saveGroupDetails(owner, groupId, {
        name: "Thesis writers",
        description: null,
        timezone: "Not/AZone",
        weeklyGoalHours: null,
      })
    ).rejects.toThrow("GROUP_TIMEZONE")
  })

  it("hands the group to a member, who is told, and the old owner can then leave", async () => {
    const { owner, groupId, ids } = await groupOf(["Sam"])
    await expect(leaveGroup(owner, groupId)).rejects.toThrow("GROUP_OWNER_CANNOT_LEAVE")

    await handOverGroup(owner, groupId, await membershipOf(owner, groupId, "Sam"))
    const [samsView] = await listGroupsFor(ids.Sam)
    expect(samsView.isOwner).toBe(true)
    expect(await noticesFor(ids.Sam, "group_owner")).toHaveLength(1)

    await leaveGroup(owner, groupId)
    expect(await listGroupsFor(owner)).toHaveLength(0)
  })

  it("refuses a hand-over to somebody who already left", async () => {
    const { owner, groupId, ids } = await groupOf(["Sam"])
    const sam = await membershipOf(owner, groupId, "Sam")
    await leaveGroup(ids.Sam, groupId)
    await expect(handOverGroup(owner, groupId, sam)).rejects.toThrow("GROUP_NOT_MEMBER")
  })

  it("keeps a removed person out of the link until let back in", async () => {
    const { owner, groupId, token, ids } = await groupOf(["Sam", "Priya"])
    await removeGroupMember(owner, groupId, await membershipOf(owner, groupId, "Sam"), true)
    await removeGroupMember(owner, groupId, await membershipOf(owner, groupId, "Priya"))

    // Kept out: the link reads as dead, with no reason given.
    await expect(lookupGroupInvite(ids.Sam, token)).rejects.toThrow("GROUP_NOT_FOUND")
    await expect(joinGroupByToken(ids.Sam, token)).rejects.toThrow("GROUP_NOT_FOUND")
    // An ordinary removal can rejoin.
    await expect(joinGroupByToken(ids.Priya, token)).resolves.toMatchObject({ status: "joined" })

    const [kept] = await listKeptOut(owner, groupId)
    expect(kept.name).toBe("Sam")
    await letBackIn(owner, groupId, kept.banId)
    await expect(joinGroupByToken(ids.Sam, token)).resolves.toMatchObject({ status: "joined" })
  })

  it("pauses the link without changing it", async () => {
    const { owner, groupId, token } = await groupOf([])
    const sam = await member("Sam")
    await saveGroupInviteSettings(owner, groupId, { joinsPaused: true })
    expect((await lookupGroupInvite(sam, token)).joinsPaused).toBe(true)
    await expect(joinGroupByToken(sam, token)).rejects.toThrow("GROUP_JOINS_PAUSED")

    await saveGroupInviteSettings(owner, groupId, { joinsPaused: false })
    expect(await tokenOf(groupId)).toBe(token)
    await expect(joinGroupByToken(sam, token)).resolves.toMatchObject({ status: "joined" })
  })

  it("makes a join a request when the owner asks first, and lets it in or turns it down", async () => {
    const { owner, groupId, token } = await groupOf([])
    await saveGroupInviteSettings(owner, groupId, { approveJoins: true })
    const sam = await member("Sam")
    const priya = await member("Priya")

    expect(await joinGroupByToken(sam, token)).toMatchObject({ status: "requested" })
    // Twice is still one request, and not on the board.
    await joinGroupByToken(sam, token)
    await joinGroupByToken(priya, token)
    const requests = await listGroupRequests(owner, groupId)
    expect(requests.map((row) => row.name)).toEqual(["Sam", "Priya"])
    expect(await listGroupMembers(owner, groupId)).toHaveLength(1)
    // The owner's notice folds the two askers into one line.
    const [asked] = await noticesFor(owner, "group_request")
    expect(asked.message).toBe("Sam and 1 other asked to join Study Buddies.")
    expect((await lookupGroupInvite(sam, token)).waiting).toBe(true)

    await answerGroupRequest(owner, groupId, requests[0].requestId, true)
    await answerGroupRequest(owner, groupId, requests[1].requestId, false)
    expect((await listGroupMembers(owner, groupId)).map((row) => row.name)).toEqual([
      "Olive",
      "Sam",
    ])
    expect((await noticesFor(sam, "group_answer"))[0].message).toBe("You are in Study Buddies.")
    expect((await noticesFor(priya, "group_answer"))[0].message).toBe(
      "Your request to join Study Buddies wasn't accepted."
    )
  })

  it("lets everybody waiting in when asking first is switched off (Tyler, 13 Oct 2026)", async () => {
    const { owner, groupId, token } = await groupOf([])
    await saveGroupInviteSettings(owner, groupId, { approveJoins: true })
    for (const name of ["Sam", "Priya", "Lee"])
      await joinGroupByToken(await member(name), token)

    await saveGroupInviteSettings(owner, groupId, { approveJoins: false })
    expect(await listGroupRequests(owner, groupId)).toHaveLength(0)
    expect(await listGroupMembers(owner, groupId)).toHaveLength(4)
  })

  it("stops a 10-join link after its tenth join, and a new link starts the count again", async () => {
    const { owner, groupId, token } = await groupOf([])
    await saveGroupInviteSettings(owner, groupId, { linkLifetime: "ten" })
    for (let index = 0; index < 10; index += 1)
      await joinGroupByToken(await member(`Person ${index}`), token)
    const eleventh = await member("Eleventh")
    await expect(joinGroupByToken(eleventh, token)).rejects.toThrow("GROUP_NOT_FOUND")
    expect((await listGroupsFor(owner))[0].linkWorking).toBe(false)

    const fresh = await resetGroupInvite(owner, groupId)
    const [group] = await listGroupsFor(owner)
    expect(group).toMatchObject({ linkLifetime: "ten", linkJoinsLeft: 10, linkWorking: true })
    await expect(joinGroupByToken(eleventh, fresh)).resolves.toMatchObject({ status: "joined" })
  })

  it("stops a 7-day link once the days are up", async () => {
    const { owner, groupId, token } = await groupOf([])
    await saveGroupInviteSettings(owner, groupId, { linkLifetime: "week" })
    await db
      .update(pomodoroGroups)
      .set({ linkExpiresAt: new Date(Date.now() - 1_000) })
      .where(eq(pomodoroGroups.id, groupId))
    await expect(joinGroupByToken(await member("Late"), token)).rejects.toThrow("GROUP_NOT_FOUND")
  })
})

describe("getting people in (section B)", () => {
  async function follow(follower: string, followed: string) {
    const [row] = await db
      .insert(pomodoroFollows)
      .values({ followerUserId: follower, followedUserId: followed })
      .returning({ id: pomodoroFollows.id })
    return row.id
  }

  it("invites people you follow in the bell, once each, and Join puts them in", async () => {
    const { owner, groupId } = await groupOf([])
    const sam = await member("Sam", { handle: "sam" })
    const priya = await member("Priya", { handle: "priya" })
    const blocked = await member("Blocked", { handle: "blocked" })
    const samFollow = await follow(owner, sam)
    const priyaFollow = await follow(owner, priya)
    const blockedFollow = await follow(owner, blocked)
    await db.insert(pomodoroBlocks).values({ blockerUserId: blocked, blockedUserId: owner })

    const invitable = await listInvitableFollows(owner, groupId)
    expect(invitable.map((row) => row.name).sort()).toEqual(["Priya", "Sam"])

    await sendGroupInvites(owner, groupId, [samFollow, priyaFollow, blockedFollow])
    // A second send while unread sends nothing new.
    await sendGroupInvites(owner, groupId, [samFollow])
    expect(await noticesFor(sam, "group_invite")).toHaveLength(1)
    expect(await noticesFor(blocked, "group_invite")).toHaveLength(0)

    const [samInvite] = await listMyGroupInvites(sam)
    expect(samInvite).toMatchObject({ groupName: "Study Buddies", inviterName: "Olive" })
    await acceptGroupInvite(sam, samInvite.inviteId)
    expect((await listGroupsFor(sam))[0].name).toBe("Study Buddies")
    // Joining takes the unread invite out of the bell.
    expect(await noticesFor(sam, "group_invite")).toHaveLength(0)

    const [priyaInvite] = await listMyGroupInvites(priya)
    await declineGroupInvite(priya, priyaInvite.inviteId)
    expect(await listMyGroupInvites(priya)).toHaveLength(0)
    expect(await noticesFor(priya, "group_invite")).toHaveLength(0)
    expect(await listGroupsFor(priya)).toHaveLength(0)
  })

  it("holds an invite to the pause and to asking first", async () => {
    const { owner, groupId } = await groupOf([])
    const sam = await member("Sam", { handle: "sam" })
    await sendGroupInvites(owner, groupId, [await follow(owner, sam)])
    await saveGroupInviteSettings(owner, groupId, { joinsPaused: true })
    const [invite] = await listMyGroupInvites(sam)
    await expect(acceptGroupInvite(sam, invite.inviteId)).rejects.toThrow("GROUP_JOINS_PAUSED")

    await saveGroupInviteSettings(owner, groupId, { joinsPaused: false, approveJoins: true })
    expect(await acceptGroupInvite(sam, invite.inviteId)).toMatchObject({ status: "requested" })
  })

  it("allows 20 invites a day per sender", async () => {
    const { owner, groupId } = await groupOf([])
    const follows: string[] = []
    for (let index = 0; index < 21; index += 1)
      follows.push(await follow(owner, await member(`Friend ${index}`, { handle: `friend${index}` })))
    await sendGroupInvites(owner, groupId, follows.slice(0, 20))
    await expect(sendGroupInvites(owner, groupId, follows.slice(20))).rejects.toThrow(
      "GROUP_INVITE_LIMIT"
    )
    const sent = await db
      .select({ id: pomodoroGroupInvites.id })
      .from(pomodoroGroupInvites)
      .where(eq(pomodoroGroupInvites.inviterUserId, owner))
    expect(sent).toHaveLength(20)
  })

  it("says on the invite page when the reader has no display name", async () => {
    const { token } = await groupOf([])
    const nameless = await member(null)
    expect((await lookupGroupInvite(nameless, token)).needsName).toBe(true)
    expect((await lookupGroupInvite(await member("Sam"), token)).needsName).toBe(false)
  })
})

describe("the board (section D)", () => {
  it("shows when each person joined and links only a public page", async () => {
    const owner = await member("Olive", { handle: "olive", profilePublic: true })
    const groupId = await createGroupFor(owner, "Study Buddies")
    const sam = await member("Sam", { handle: "sam", profilePublic: false })
    await joinGroupByToken(sam, await tokenOf(groupId))
    const rows = await listGroupMembers(owner, groupId)
    expect(rows.find((row) => row.name === "Olive")?.handle).toBe("olive")
    expect(rows.find((row) => row.name === "Sam")?.handle).toBeNull()
    expect(rows.every((row) => row.joinedAt instanceof Date)).toBe(true)
  })

  it("counts the week from Monday in the group's timezone, the same for every reader", async () => {
    expect(mondayOf("2026-10-13")).toBe("2026-10-12")
    expect(mondayOf("2026-10-12")).toBe("2026-10-12")
    expect(mondayOf("2026-10-18")).toBe("2026-10-12")
    expect(groupWindowStart("week", "2026-10-14")).toBe("2026-10-12")
    expect(groupWindowStart("month", "2026-10-14")).toBe("2026-10-01")

    const { owner, groupId, ids } = await groupOf(["Sam"])
    await db
      .update(pomodoroProfiles)
      .set({ timezone: "Pacific/Kiritimati" })
      .where(eq(pomodoroProfiles.userId, ids.Sam))
    const ownerBoard = await readGroupBoard({ userId: owner, groupId, window: "week", order: "hours" })
    const samBoard = await readGroupBoard({ userId: ids.Sam, groupId, window: "week", order: "hours" })
    expect(samBoard.start).toBe(ownerBoard.start)
    expect(samBoard.timezone).toBe("UTC")
  })

  it("orders by hours, sessions or days, and marks who is focusing now", async () => {
    const { owner, groupId, ids } = await groupOf(["Hours", "Days"])
    const today = localDateFor("UTC")
    const monday = mondayOf(today)
    await focus(ids.Hours, today, 300, 2)
    // Days only has more days when the week has had a day before today.
    await focus(ids.Days, today, 20, 1)
    if (monday !== today) await focus(ids.Days, shiftLocalDate(today, -1), 20, 1)
    await focus(owner, today, 30, 6)
    await db.insert(focusSessions).values({
      userId: ids.Days,
      mode: "focus",
      status: "running",
      plannedSeconds: 1500,
      targetEndsAt: new Date(Date.now() + 10 * 60_000),
      idempotencyKey: "running-now",
    })

    const read = async (order: "hours" | "sessions" | "days") =>
      (await readGroupBoard({ userId: owner, groupId, window: "week", order })).leaders
    expect((await read("hours"))[0].name).toBe("Hours")
    expect((await read("sessions"))[0].name).toBe("Olive")
    if (monday !== today) expect((await read("days"))[0].name).toBe("Days")

    const board = await read("hours")
    expect(board.find((row) => row.name === "Days")?.focusingNow).toBe(true)
    expect(board.find((row) => row.name === "Hours")?.focusingNow).toBe(false)
    expect(board.every((row) => typeof row.membershipId === "string")).toBe(true)
    expect(board.some((row) => "userId" in row)).toBe(false)
  })

  it("cheers a member from the board, and never yourself", async () => {
    const { owner, groupId, ids } = await groupOf(["Sam"])
    const samRow = await membershipOf(owner, groupId, "Sam")
    await sendGroupCheer({ fromUserId: owner, groupId, membershipId: samRow, cheerId: "keep-going" })
    expect(await noticesFor(ids.Sam, "cheer")).toHaveLength(1)

    const ownRow = await membershipOf(owner, groupId, "Olive")
    await expect(
      sendGroupCheer({ fromUserId: owner, groupId, membershipId: ownRow, cheerId: "keep-going" })
    ).rejects.toThrow("CANNOT_CHEER_SELF")
    const outsider = await member("Outsider")
    await expect(
      sendGroupCheer({ fromUserId: outsider, groupId, membershipId: samRow, cheerId: "keep-going" })
    ).rejects.toThrow("GROUP_NOT_MEMBER")
  })
})

describe("keeping score (section E)", () => {
  it("shows the week's hours against the goal, and tells everybody once when it is reached", async () => {
    const { owner, groupId, ids } = await groupOf(["Sam"])
    await saveGroupDetails(owner, groupId, {
      name: "Study Buddies",
      description: null,
      timezone: "UTC",
      weeklyGoalHours: 2,
    })
    const today = localDateFor("UTC")
    await focus(ids.Sam, today, 90)
    await checkGroupScoresAfterFocus(ids.Sam)
    expect(await noticesFor(owner, "group_goal")).toHaveLength(0)

    await focus(owner, today, 40)
    await checkGroupScoresAfterFocus(owner)
    await checkGroupScoresAfterFocus(ids.Sam)
    const standing = await readGroupStanding(owner, groupId)
    expect(standing.weekSeconds).toBe(130 * 60)
    for (const userId of [owner, ids.Sam]) {
      const goal = await noticesFor(userId, "group_goal")
      expect(goal).toHaveLength(1)
      expect(goal[0].message).toBe("Study Buddies reached its goal of 2 hours this week.")
    }
  })

  it("counts a group streak of days with any member's focus, alive through today", async () => {
    const { owner, groupId, ids } = await groupOf(["Sam"])
    const today = localDateFor("UTC")
    await focus(ids.Sam, shiftLocalDate(today, -1), 25)
    await focus(owner, shiftLocalDate(today, -2), 25)
    await focus(owner, shiftLocalDate(today, -4), 25)
    expect((await readGroupStanding(owner, groupId)).streakDays).toBe(2)
    await focus(ids.Sam, today, 25)
    expect((await readGroupStanding(owner, groupId)).streakDays).toBe(3)
  })

  it("sends each milestone once, as one notice about the highest crossed", async () => {
    const { owner, groupId, ids } = await groupOf(["Sam"])
    await focus(ids.Sam, localDateFor("UTC"), 55 * 60)
    await checkGroupScoresAfterFocus(ids.Sam)
    await checkGroupScoresAfterFocus(ids.Sam)
    const notices = await noticesFor(owner, "group_milestone")
    expect(notices).toHaveLength(1)
    expect(notices[0].message).toBe("Study Buddies passed 50 hours together.")
    expect((await readGroupStanding(owner, groupId)).milestones).toEqual([10, 50])
  })

  it("names last week's winner on the first pass of the week, once, and every one tied", async () => {
    const { owner, groupId, ids } = await groupOf(["Sam", "Ana"])
    const lastMonday = shiftLocalDate(mondayOf(localDateFor("UTC")), -7)
    await db
      .update(pomodoroGroups)
      .set({ createdAt: new Date(`${shiftLocalDate(lastMonday, -1)}T12:00:00Z`) })
      .where(eq(pomodoroGroups.id, groupId))
    await focus(ids.Sam, shiftLocalDate(lastMonday, 1), 14 * 60)
    await focus(ids.Ana, shiftLocalDate(lastMonday, 3), 14 * 60)
    await focus(owner, shiftLocalDate(lastMonday, 2), 60)

    await sendGroupWinners()
    await sendGroupWinners()
    const winner = await noticesFor(owner, "group_winner")
    expect(winner).toHaveLength(1)
    expect(winner[0].message).toBe("Ana and Sam topped Study Buddies last week with 14 hours each.")
    expect(await noticesFor(ids.Ana, "group_winner")).toHaveLength(1)
  })

  it("sends no winner for a week before the group existed", async () => {
    const { owner } = await groupOf(["Sam"])
    await sendGroupWinners()
    expect(await noticesFor(owner, "group_winner")).toHaveLength(0)
  })

  it("works out past weeks' top three from today's members, nothing stored", async () => {
    const { owner, groupId, ids } = await groupOf(["Sam", "Ana", "Lee", "Kim"])
    const lastMonday = shiftLocalDate(mondayOf(localDateFor("UTC")), -7)
    await focus(ids.Sam, lastMonday, 100)
    await focus(ids.Ana, lastMonday, 90)
    await focus(ids.Lee, lastMonday, 80)
    await focus(ids.Kim, lastMonday, 70)
    const weeks = await readGroupPastWeeks(owner, groupId)
    expect(weeks).toHaveLength(8)
    expect(weeks[0].start).toBe(lastMonday)
    expect(weeks[0].top.map((row) => row.name)).toEqual(["Sam", "Ana", "Lee"])
    expect(weeks[1].top).toHaveLength(0)

    // Somebody who leaves drops out of old weeks at once.
    await leaveGroup(ids.Sam, groupId)
    const after = await readGroupPastWeeks(owner, groupId)
    expect(after[0].top.map((row) => row.name)).toEqual(["Ana", "Lee", "Kim"])
  })
})
