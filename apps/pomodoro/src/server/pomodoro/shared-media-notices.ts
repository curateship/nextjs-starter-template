import { and, asc, count, countDistinct, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm"

import { db } from "@/server/db"
import { blockedUserIdsFor } from "@/server/pomodoro/blocks"
import { writeNotices } from "@/server/pomodoro/notices"
import { localDateFor } from "@/server/pomodoro/productivity"
import {
  pomodoroFollows,
  pomodoroMediaAdds,
  pomodoroMediaUploads,
  pomodoroNoticeLinks,
  pomodoroProfiles,
  pomodoroShareWeeklyNotes,
} from "@/server/pomodoro/schema"
import { sharedWithOthers } from "@/server/pomodoro/shared-media"
import { customShellMedia, customShellNotifications } from "@/server/schema"
import {
  MEDIA_PAGE,
  followedShareMessage,
  noticeName,
  shareWeeklyDetail,
  shareWeeklyMessage,
} from "@/lib/pomodoro/notices"
import { USED_BY_FLOOR } from "@/lib/pomodoro/shared-media"

/**
 * The bell for shared files (task 03, parts 6 and 12), on the media
 * worker's loop. See `workspace/docs/shared-media.md`.
 *
 * - **Followers** hear when somebody they follow shares, once the file is
 *   ready and out for everyone (so a share still waiting for an admin, or
 *   still being prepared, is told later). One notice per followed person per
 *   day: later files that day fold into it while it is unread.
 * - **Owners** get one note on Monday in their own timezone, when at least
 *   three people added their shared files in the last seven days.
 */

const DAY_MS = 24 * 60 * 60_000

/** How many files one pass announces, so a burst never holds the loop. */
const ANNOUNCE_BATCH = 100

/** The weekly note is looked for at most this often. */
const WEEKLY_EVERY_MS = 10 * 60_000
let weeklyCheckedAt = 0

export async function runSharedMediaNoticesPass(now = new Date()) {
  await announceNewShares(now)
  if (now.getTime() - weeklyCheckedAt >= WEEKLY_EVERY_MS) {
    weeklyCheckedAt = now.getTime()
    await sendWeeklyNotes(now)
  }
}

/** Tells followers about files shared since the last pass. */
export async function announceNewShares(now = new Date()) {
  const candidates = await db
    .select({
      mediaId: pomodoroMediaUploads.mediaId,
      ownerUserId: pomodoroMediaUploads.userId,
      purpose: pomodoroMediaUploads.purpose,
      name: sql<string>`coalesce(${pomodoroMediaUploads.name}, ${customShellMedia.originalName})`,
    })
    .from(pomodoroMediaUploads)
    .innerJoin(customShellMedia, eq(customShellMedia.id, pomodoroMediaUploads.mediaId))
    .where(and(sharedWithOthers, isNull(pomodoroMediaUploads.shareAnnouncedAt)))
    .orderBy(asc(pomodoroMediaUploads.sharedAt))
    .limit(ANNOUNCE_BATCH)
  if (!candidates.length) return 0

  // Claimed before anybody is told: of two overlapping passes, only the one
  // whose update marks a file announces it.
  const claimed = new Set(
    (
      await db
        .update(pomodoroMediaUploads)
        .set({ shareAnnouncedAt: now })
        .where(
          and(
            inArray(pomodoroMediaUploads.mediaId, candidates.map((file) => file.mediaId)),
            isNull(pomodoroMediaUploads.shareAnnouncedAt)
          )
        )
        .returning({ mediaId: pomodoroMediaUploads.mediaId })
    ).map((row) => row.mediaId)
  )
  const fresh = candidates.filter((file) => claimed.has(file.mediaId))

  const byOwner = new Map<string, typeof fresh>()
  for (const file of fresh)
    byOwner.set(file.ownerUserId, [...(byOwner.get(file.ownerUserId) ?? []), file])

  let told = 0
  for (const [ownerUserId, files] of byOwner)
    told += await tellFollowers(ownerUserId, files, now)
  return told
}

async function tellFollowers(
  ownerUserId: string,
  files: { purpose: string; name: string }[],
  now: Date
) {
  const [profile] = await db
    .select({
      publicDisplayName: pomodoroProfiles.publicDisplayName,
      handle: pomodoroProfiles.handle,
      profilePublic: pomodoroProfiles.profilePublic,
      hiddenAt: pomodoroProfiles.hiddenAt,
    })
    .from(pomodoroProfiles)
    .where(eq(pomodoroProfiles.userId, ownerUserId))
    .limit(1)
  // The notice leads to their page, so a page nobody can open tells nobody.
  if (!profile?.handle || !profile.profilePublic || profile.hiddenAt) return 0

  const [followers, blocked] = await Promise.all([
    db
      .select({ id: pomodoroFollows.followerUserId })
      .from(pomodoroFollows)
      .where(eq(pomodoroFollows.followedUserId, ownerUserId)),
    blockedUserIdsFor(ownerUserId),
  ])
  const recipients = followers.map((row) => row.id).filter((id) => !blocked.has(id))
  if (!recipients.length) return 0

  // Today's notice from this person to each follower, read or not.
  const todays = await db
    .select({
      id: customShellNotifications.id,
      recipientUserId: customShellNotifications.recipientUserId,
      readAt: customShellNotifications.readAt,
      foldCount: pomodoroNoticeLinks.foldCount,
    })
    .from(customShellNotifications)
    .innerJoin(pomodoroNoticeLinks, eq(pomodoroNoticeLinks.noticeId, customShellNotifications.id))
    .where(
      and(
        eq(pomodoroNoticeLinks.kind, "followed_share"),
        eq(customShellNotifications.actorUserId, ownerUserId),
        inArray(customShellNotifications.recipientUserId, recipients),
        gte(customShellNotifications.createdAt, new Date(now.getTime() - DAY_MS))
      )
    )
  const waiting = new Map(todays.map((row) => [row.recipientUserId, row]))
  const name = noticeName(profile)
  const purpose = files[0].purpose === "sound" ? "sound" : "background"
  const latest = files[files.length - 1].name

  await db.transaction(async (tx) => {
    const fresh = recipients.filter((id) => !waiting.has(id))
    await writeNotices(
      tx,
      fresh.map((recipientUserId) => ({
        recipientUserId,
        actorUserId: ownerUserId,
        kind: "followed_share" as const,
        message: followedShareMessage(name, files.length, purpose),
        detail: latest,
        foldCount: files.length,
      }))
    )
    // A notice already read today stays read: one a day is the rule. An
    // unread one gathers the new files, without moving up the tray.
    for (const notice of waiting.values()) {
      if (notice.readAt) continue
      const total = notice.foldCount + files.length
      await tx
        .update(customShellNotifications)
        .set({ message: followedShareMessage(name, total, purpose), detail: latest })
        .where(eq(customShellNotifications.id, notice.id))
      await tx
        .update(pomodoroNoticeLinks)
        .set({ foldCount: total })
        .where(eq(pomodoroNoticeLinks.noticeId, notice.id))
    }
  })
  return recipients.length
}

/**
 * The owners whose shared files at least three people added in the last
 * seven days, each told once on their own Monday.
 */
export async function sendWeeklyNotes(now = new Date()) {
  const since = new Date(now.getTime() - 7 * DAY_MS)
  const owners = await db
    .select({
      ownerUserId: pomodoroMediaUploads.userId,
      timezone: pomodoroProfiles.timezone,
      people: countDistinct(pomodoroMediaAdds.userId),
    })
    .from(pomodoroMediaAdds)
    .innerJoin(pomodoroMediaUploads, eq(pomodoroMediaUploads.mediaId, pomodoroMediaAdds.mediaId))
    .leftJoin(pomodoroProfiles, eq(pomodoroProfiles.userId, pomodoroMediaUploads.userId))
    .where(and(gte(pomodoroMediaAdds.createdAt, since), sharedWithOthers))
    .groupBy(pomodoroMediaUploads.userId, pomodoroProfiles.timezone)
    .having(sql`count(distinct ${pomodoroMediaAdds.userId}) >= ${USED_BY_FLOOR}`)

  let sent = 0
  for (const owner of owners) {
    const timezone = owner.timezone ?? "UTC"
    const today = localDateFor(timezone, now)
    if (new Date(`${today}T12:00:00Z`).getUTCDay() !== 1) continue

    const [top] = await db
      .select({
        name: sql<string>`coalesce(${pomodoroMediaUploads.name}, ${customShellMedia.originalName})`,
        purpose: pomodoroMediaUploads.purpose,
        people: count(),
      })
      .from(pomodoroMediaAdds)
      .innerJoin(pomodoroMediaUploads, eq(pomodoroMediaUploads.mediaId, pomodoroMediaAdds.mediaId))
      .innerJoin(customShellMedia, eq(customShellMedia.id, pomodoroMediaUploads.mediaId))
      .where(
        and(
          eq(pomodoroMediaUploads.userId, owner.ownerUserId),
          gte(pomodoroMediaAdds.createdAt, since),
          sharedWithOthers
        )
      )
      .groupBy(pomodoroMediaUploads.mediaId, pomodoroMediaUploads.name, customShellMedia.originalName, pomodoroMediaUploads.purpose)
      .orderBy(desc(count()))
      .limit(1)
    if (!top) continue

    const [{ adds }] = await db
      .select({ adds: count() })
      .from(pomodoroMediaAdds)
      .innerJoin(pomodoroMediaUploads, eq(pomodoroMediaUploads.mediaId, pomodoroMediaAdds.mediaId))
      .where(
        and(
          eq(pomodoroMediaUploads.userId, owner.ownerUserId),
          gte(pomodoroMediaAdds.createdAt, since)
        )
      )

    await db.transaction(async (tx) => {
      // The week's row is the claim, so two passes never send it twice.
      const [claimed] = await tx
        .insert(pomodoroShareWeeklyNotes)
        .values({ userId: owner.ownerUserId, weekStart: today })
        .onConflictDoNothing()
        .returning({ userId: pomodoroShareWeeklyNotes.userId })
      if (!claimed) return
      await writeNotices(tx, [
        {
          recipientUserId: owner.ownerUserId,
          kind: "share_weekly",
          message: shareWeeklyMessage(top.name, top.people),
          detail: shareWeeklyDetail(adds),
          href: top.purpose === "sound" ? MEDIA_PAGE.sound : MEDIA_PAGE.background,
        },
      ])
      sent += 1
    })
  }
  return sent
}
