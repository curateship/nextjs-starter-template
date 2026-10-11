import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { now, uuid } from "@/server/auth/security"
import { type CustomShellDb } from "@/server/db"
import { awardAchievements } from "@/server/pomodoro/achievements"
import {
  STREAK_NOTICES_PER_WEEK,
  followByHandle,
  tellFollowersOfStreak,
} from "@/server/pomodoro/following"
import {
  claimNextGeneration,
  creditsReturnDay,
  failGeneration,
  finishGeneration,
  requestGenerations,
  reserveGenerationCredit,
} from "@/server/pomodoro/generation"
import {
  createGroupFor,
  joinGroupByToken,
  listGroupMembers,
  removeGroupMember,
} from "@/server/pomodoro/groups"
import { failUploadJob } from "@/server/pomodoro/media-uploads"
import { pomodoroNoticeDetailsFor } from "@/server/pomodoro/notices"
import {
  pomodoroBlocks,
  pomodoroGroups,
  pomodoroMediaUploads,
  pomodoroNoticeLinks,
  pomodoroProfiles,
} from "@/server/pomodoro/schema"
import { customShellMedia, customShellNotifications } from "@/server/schema"
import {
  createTestDatabase,
  insertUser,
  insertWorkspace,
} from "@/server/test-support"
import { noticeKindFromWords } from "@/lib/pomodoro/notices"

/**
 * Group, badge, AI and streak notices, against a real database.
 *
 * For each kind: it is written once with its kind and link, a burst becomes
 * one line or is capped, and the cases that must stay quiet (yourself, a
 * block, a switch that is off, a file you deleted) write nothing.
 */

let client: PGlite
let db: CustomShellDb

beforeEach(async () => {
  ;({ client, db } = await createTestDatabase())
})

afterEach(async () => {
  await client.close()
})

async function member(profile: Partial<typeof pomodoroProfiles.$inferInsert> = {}) {
  const user = await insertUser(db)
  await db.insert(pomodoroProfiles).values({ userId: user.id, ...profile })
  return user.id
}

/** Every notice one person has, oldest first, with its saved kind and link. */
async function noticesFor(userId: string) {
  return db
    .select({
      id: customShellNotifications.id,
      message: customShellNotifications.message,
      detail: customShellNotifications.detail,
      actorUserId: customShellNotifications.actorUserId,
      seenAt: customShellNotifications.seenAt,
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
    .orderBy(customShellNotifications.createdAt)
}

async function tokenOf(groupId: string) {
  const [group] = await db
    .select({ joinToken: pomodoroGroups.joinToken })
    .from(pomodoroGroups)
    .where(eq(pomodoroGroups.id, groupId))
  return group.joinToken
}

describe("focus group notices", () => {
  it("tells the owner who joined, and folds later joins into one line", async () => {
    const owner = await member({ handle: "owner" })
    const sam = await member({ publicDisplayName: "Sam" })
    const priya = await member({ publicDisplayName: "Priya" })
    const groupId = await createGroupFor(owner, "Study Buddies")
    const token = await tokenOf(groupId)

    await joinGroupByToken(sam, token)
    let notices = await noticesFor(owner)
    expect(notices).toHaveLength(1)
    expect(notices[0]).toMatchObject({
      message: "Sam joined your group Study Buddies.",
      kind: "group_join",
      href: "/leaderboard",
      actorUserId: sam,
    })

    await db
      .update(customShellNotifications)
      .set({ seenAt: new Date() })
      .where(eq(customShellNotifications.id, notices[0].id))
    await joinGroupByToken(priya, token)
    // Following the same link again is not a join.
    await joinGroupByToken(priya, token)
    notices = await noticesFor(owner)
    expect(notices).toHaveLength(1)
    expect(notices[0]).toMatchObject({
      message: "Sam and 1 other joined your group Study Buddies.",
      foldCount: 2,
      // Back in the red number, because something new happened.
      seenAt: null,
    })
  })

  it("starts a new line once the folded one has been read", async () => {
    const owner = await member()
    const groupId = await createGroupFor(owner, "Study Buddies")
    const token = await tokenOf(groupId)
    await joinGroupByToken(await member({ publicDisplayName: "Sam" }), token)
    await db
      .update(customShellNotifications)
      .set({ readAt: new Date() })
      .where(eq(customShellNotifications.recipientUserId, owner))
    await joinGroupByToken(await member({ publicDisplayName: "Priya" }), token)
    expect((await noticesFor(owner)).map((notice) => notice.message)).toEqual([
      "Sam joined your group Study Buddies.",
      "Priya joined your group Study Buddies.",
    ])
  })

  it("says nothing when a blocked person joins", async () => {
    const owner = await member()
    const blocked = await member({ publicDisplayName: "Blocked" })
    await db
      .insert(pomodoroBlocks)
      .values({ blockerUserId: owner, blockedUserId: blocked })
    const groupId = await createGroupFor(owner, "Study Buddies")
    await joinGroupByToken(blocked, await tokenOf(groupId))
    expect(await noticesFor(owner)).toEqual([])
  })

  it("tells a removed member, naming the group and not the owner", async () => {
    const owner = await member({ publicDisplayName: "Owner" })
    const sam = await member({ publicDisplayName: "Sam" })
    const groupId = await createGroupFor(owner, "Study Buddies")
    await joinGroupByToken(sam, await tokenOf(groupId))
    const members = await listGroupMembers(owner, groupId)
    const samRow = members.find((row) => !row.isOwner) as { membershipId: string }
    await removeGroupMember(owner, groupId, samRow.membershipId)

    const [notice] = await noticesFor(sam)
    expect(notice).toMatchObject({
      message: "You were removed from the group Study Buddies.",
      kind: "group_removed",
      actorUserId: null,
      href: null,
    })
  })
})

describe("badge notices", () => {
  const counters = {
    focusSessions: 0,
    focusSeconds: 0,
    tasksCompleted: 0,
    bestStreak: 0,
    roomsHosted: 0,
  }

  it("says one badge by name, several as a count, and never the same badge twice", async () => {
    const userId = await member()
    await awardAchievements(userId, { ...counters, focusSessions: 1 })
    await awardAchievements(userId, { ...counters, focusSessions: 1 })
    await awardAchievements(userId, {
      ...counters,
      focusSessions: 10,
      bestStreak: 7,
    })

    const notices = await noticesFor(userId)
    expect(notices.map((notice) => notice.message)).toEqual([
      "You earned the First focus badge.",
      expect.stringMatching(/^You earned \d+ badges\.$/),
    ])
    expect(notices.every((notice) => notice.href === "/history")).toBe(true)
    expect(notices[1].detail).toContain("A week running")
  })
})

describe("AI and upload notices", () => {
  async function insertMedia(userId: string) {
    const workspace = await insertWorkspace(db)
    const id = uuid()
    const timestamp = now()
    await db.insert(customShellMedia).values({
      id,
      workspaceId: workspace.id,
      userId,
      filename: `${id}.mp4`,
      originalName: "rain.mp4",
      altText: null,
      fileSize: 1234,
      mimeType: "video/mp4",
      fileType: "video",
      storagePath: `${userId}/${id}.mp4`,
      emailProtectedAt: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    return id
  }

  it("says a finished AI file is ready, and a failed one that the credit is back", async () => {
    const userId = await member()
    for (const prompt of ["rain on a tin roof", "a storm"]) {
      await requestGenerations(userId, [{ kind: "background", prompt }], {
        background: 20,
        soundscape: 20,
      })
    }
    const first = await claimNextGeneration()
    await finishGeneration(first!, await insertMedia(userId))
    const second = await claimNextGeneration()
    await failGeneration(second!, "provider down", { retry: false })

    const notices = (await noticesFor(userId)).filter(
      (notice) => notice.kind !== "credits_low"
    )
    expect(notices).toMatchObject([
      {
        message: "Your AI background is ready.",
        kind: "media_ready",
        href: "/uploads?kind=background",
      },
      {
        message: "Your AI background couldn't be made.",
        detail: "The credit is back.",
        kind: "media_failed",
        href: "/uploads?kind=background",
      },
    ])
  })

  it("stays quiet on a retry and when the member deleted the upload", async () => {
    const userId = await member()
    const mediaId = await insertMedia(userId)
    await db.insert(pomodoroMediaUploads).values({
      mediaId,
      userId,
      purpose: "sound",
      kind: "video",
      status: "processing",
      originalBytes: 1234,
      attempts: 1,
    })
    const [job] = await db
      .select()
      .from(pomodoroMediaUploads)
      .where(eq(pomodoroMediaUploads.mediaId, mediaId))

    await failUploadJob(job, "busy machine")
    await failUploadJob(job, "deleted", { retry: false, tell: false })
    expect(await noticesFor(userId)).toEqual([])

    await failUploadJob(job, "This file could not be prepared.", {
      retry: false,
    })
    expect(await noticesFor(userId)).toMatchObject([
      {
        message: "Your upload couldn't be prepared.",
        detail: "This file could not be prepared.",
        href: "/uploads?kind=sound",
      },
    ])
  })

  it("warns at one credit left and at none, once each per month", async () => {
    const userId = await member()
    const month = "2026-10-01"
    await reserveGenerationCredit(userId, "soundscape", 3, month)
    expect(await noticesFor(userId)).toEqual([])
    await reserveGenerationCredit(userId, "soundscape", 3, month)
    await reserveGenerationCredit(userId, "soundscape", 3, month)

    // A refund lifts the count back to one left; that warning was already sent.
    const { settleGenerationCredit } = await import(
      "@/server/pomodoro/generation"
    )
    await settleGenerationCredit(userId, "soundscape", month, false)
    await reserveGenerationCredit(userId, "soundscape", 3, month)

    expect(await noticesFor(userId)).toMatchObject([
      { message: "1 AI soundscape left this month.", href: "/uploads?kind=sound" },
      {
        message: "No AI soundscapes left this month.",
        detail: "They come back on 1 November.",
      },
    ])
    expect(creditsReturnDay("2026-12-01")).toBe("1 January")
  })
})

describe("streak notices to followers", () => {
  async function streaker(profile: Partial<typeof pomodoroProfiles.$inferInsert> = {}) {
    return member({
      handle: "sam",
      publicDisplayName: "Sam",
      profilePublic: true,
      showFigures: true,
      ...profile,
    })
  }

  it("tells each follower, with a link to the streaker's page", async () => {
    const sam = await streaker()
    const fan = await member()
    await followByHandle(fan, "sam")

    expect(await tellFollowersOfStreak(sam, 30)).toBe(1)
    const [notice] = await noticesFor(fan)
    expect(notice).toMatchObject({
      message: "Sam hit a 30-day streak.",
      kind: "followed_streak",
      actorUserId: sam,
    })
    expect(await pomodoroNoticeDetailsFor(fan, [notice.id], db)).toEqual({
      [notice.id]: { kind: "followed_streak", categoryId: "social", href: "/u/sam" },
    })
  })

  it("tells nobody when the streak is not published, or across a block", async () => {
    const sam = await streaker({ showFigures: false })
    const fan = await member()
    await followByHandle(fan, "sam")
    expect(await tellFollowersOfStreak(sam, 30)).toBe(0)

    await db
      .update(pomodoroProfiles)
      .set({ showFigures: true })
      .where(eq(pomodoroProfiles.userId, sam))
    await db.insert(pomodoroBlocks).values({ blockerUserId: fan, blockedUserId: sam })
    expect(await tellFollowersOfStreak(sam, 30)).toBe(0)
    expect(await noticesFor(fan)).toEqual([])
  })

  it(`sends one person at most ${STREAK_NOTICES_PER_WEEK} a week`, async () => {
    const fan = await member()
    for (let index = 0; index <= STREAK_NOTICES_PER_WEEK; index += 1) {
      const handle = `streaker-${index}`
      const userId = await streaker({ handle })
      await followByHandle(fan, handle)
      await tellFollowersOfStreak(userId, 7)
    }
    expect(await noticesFor(fan)).toHaveLength(STREAK_NOTICES_PER_WEEK)
  })
})

describe("reading a notice's kind from its words", () => {
  it("recognises every sentence this app writes", async () => {
    const owner = await member()
    const groupId = await createGroupFor(owner, "Study Buddies")
    await joinGroupByToken(
      await member({ publicDisplayName: "Sam" }),
      await tokenOf(groupId)
    )
    await awardAchievements(owner, {
      focusSessions: 1,
      focusSeconds: 0,
      tasksCompleted: 0,
      bestStreak: 0,
      roomsHosted: 0,
    })
    await reserveGenerationCredit(owner, "background", 1)

    for (const notice of await noticesFor(owner)) {
      expect(
        noticeKindFromWords({ type: "app_activity", message: notice.message })
      ).toBe(notice.kind)
    }
    expect(
      noticeKindFromWords({
        type: "app_activity",
        message: "Your upload couldn't be prepared.",
      })
    ).toBe("media_failed")
    expect(
      noticeKindFromWords({
        type: "app_activity",
        message: "You were removed from the group Study Buddies.",
      })
    ).toBe("group_removed")
    expect(
      noticeKindFromWords({
        type: "app_activity",
        message: "Sam hit a 365-day streak.",
      })
    ).toBe("followed_streak")
    expect(
      noticeKindFromWords({
        type: "app_activity",
        message: "Your upload is ready.",
      })
    ).toBe("media_ready")
  })
})
