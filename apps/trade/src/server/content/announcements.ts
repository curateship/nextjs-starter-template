import { and, desc, eq, gt, inArray, isNull, lte, or, sql } from "drizzle-orm"

import { db, type CustomShellDb } from "@/server/db"
import { publishNotificationCreated } from "@/server/notifications/events"
import {
  customShellAnnouncementDismissals,
  customShellAnnouncements,
  customShellNotifications,
  type CustomShellAnnouncement,
} from "@/server/schema"
import { now, uuid } from "@/server/auth/security"
import {
  ANNOUNCEMENT_LEVELS,
  DEFAULT_ANNOUNCEMENT_LEVEL,
  isAnnouncementLevel,
  MAX_ANNOUNCEMENT_BODY_LENGTH,
  MAX_ANNOUNCEMENT_TITLE_LENGTH,
  type AnnouncementAudience,
  type AnnouncementLevel,
  type UserAnnouncement,
  type VisitorAnnouncement,
} from "@/lib/announcement"

/**
 * A site's announcements: one message an admin writes once and that site's
 * people see. Another site's visitors never see it — every query below names a
 * workspace, and a banner that named no site would be shown to every customer
 * of every site on the deployment.
 *
 * It reaches people two ways and an admin picks either or both — a dismissible
 * banner across the top of the app, and a notice in the notification tray. The
 * banner is driven purely by the time window, so scheduling one for next Monday
 * needs nothing running in the background. The tray notice can't work that way
 * (a notice is a row per person), so it is written the first time somebody
 * loads the app while the announcement is live — see `loadUserAnnouncements`.
 */

export type AnnouncementInput = {
  title: string
  body: string
  level: AnnouncementLevel
  audience: AnnouncementAudience
  showBanner: boolean
  notify: boolean
  /** "yyyy-mm-dd", or empty for "starts the moment it is saved". */
  startsOn: string
  /** "yyyy-mm-dd", or empty for "runs until somebody retires it". */
  endsOn: string
}

/** Live public banners for one site. Filtering happens before data leaves. */
export async function loadVisitorAnnouncements(
  workspaceId: string,
  database: CustomShellDb = db
): Promise<VisitorAnnouncement[]> {
  const timestamp = now()
  const rows = await database
    .select({
      id: customShellAnnouncements.id,
      title: customShellAnnouncements.title,
      body: customShellAnnouncements.body,
      level: customShellAnnouncements.level,
      updatedAt: customShellAnnouncements.updatedAt,
    })
    .from(customShellAnnouncements)
    .where(
      and(
        eq(customShellAnnouncements.workspaceId, workspaceId),
        eq(customShellAnnouncements.audience, "everyone"),
        lte(customShellAnnouncements.startsAt, timestamp),
        or(
          isNull(customShellAnnouncements.endsAt),
          gt(customShellAnnouncements.endsAt, timestamp)
        )
      )
    )
    .orderBy(desc(customShellAnnouncements.startsAt))

  return rows
    .map((row) => ({
      id: row.id,
      title: row.title,
      body: row.body,
      level: isAnnouncementLevel(row.level)
        ? row.level
        : DEFAULT_ANNOUNCEMENT_LEVEL,
      updatedAt: row.updatedAt.toISOString(),
    }))
    .sort(
      (a, b) =>
        ANNOUNCEMENT_LEVELS.indexOf(b.level) -
        ANNOUNCEMENT_LEVELS.indexOf(a.level)
    )
}

/** Newest first. The admin dashboard reads this — every announcement, live or not. */
export async function listAnnouncements(
  workspaceId: string,
  database: CustomShellDb = db
) {
  return database
    .select()
    .from(customShellAnnouncements)
    .where(eq(customShellAnnouncements.workspaceId, workspaceId))
    .orderBy(
      desc(customShellAnnouncements.startsAt),
      desc(customShellAnnouncements.createdAt)
    )
}

export async function createAnnouncement(
  workspaceId: string,
  input: AnnouncementInput,
  database: CustomShellDb = db
) {
  const timestamp = now()
  const [announcement] = await database
    .insert(customShellAnnouncements)
    .values({
      id: uuid(),
      workspaceId,
      ...cleanAnnouncementInput(input, timestamp),
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .returning()

  if (!announcement) {
    throw new Error("ANNOUNCEMENT_NOT_SAVED")
  }

  return announcement
}

export async function updateAnnouncement(
  workspaceId: string,
  announcementId: string,
  input: AnnouncementInput,
  database: CustomShellDb = db
) {
  const timestamp = now()
  const cleaned = cleanAnnouncementInput(input, timestamp)

  return database.transaction(async (tx) => {
    const [announcement] = await tx
      .update(customShellAnnouncements)
      .set({ ...cleaned, updatedAt: timestamp })
      // The workspace is part of the where rather than checked first: an id
      // from another site simply matches nothing, and "not found" is the right
      // answer to give somebody asking about a site that is not theirs.
      .where(
        and(
          eq(customShellAnnouncements.id, announcementId),
          eq(customShellAnnouncements.workspaceId, workspaceId)
        )
      )
      .returning()

    if (!announcement) {
      throw new Error("ANNOUNCEMENT_NOT_FOUND")
    }

    // Turning the tray off means "don't send this one that way", so the notices
    // already sitting in people's trays go with it. Turning it back on lets the
    // fan-out below write them again on the next load.
    if (!announcement.notify) {
      await tx
        .delete(customShellNotifications)
        .where(eq(customShellNotifications.announcementId, announcement.id))
    }

    return announcement
  })
}

/**
 * Takes an announcement down now without deleting it. Closing the window is the
 * only way anything is hidden, so there is no second "retired" flag that could
 * disagree with the dates. One that had not started yet has its start pulled
 * back too, leaving a window of no length — which is to say it never shows.
 */
export async function retireAnnouncements(
  workspaceId: string,
  announcementIds: string[],
  database: CustomShellDb = db
) {
  const timestamp = now()
  const rows = await database
    .update(customShellAnnouncements)
    .set({
      startsAt: sql`least(${customShellAnnouncements.startsAt}, ${timestamp})`,
      endsAt: timestamp,
      updatedAt: timestamp,
    })
    .where(
      and(
        eq(customShellAnnouncements.workspaceId, workspaceId),
        inArray(customShellAnnouncements.id, announcementIds),
        // Already over? Leave the dates it actually ran on alone.
        or(
          isNull(customShellAnnouncements.endsAt),
          gt(customShellAnnouncements.endsAt, timestamp)
        )
      )
    )
    .returning({ id: customShellAnnouncements.id })

  return { count: rows.length }
}

export async function deleteAnnouncements(
  workspaceId: string,
  announcementIds: string[],
  database: CustomShellDb = db
) {
  const rows = await database
    .delete(customShellAnnouncements)
    .where(
      and(
        eq(customShellAnnouncements.workspaceId, workspaceId),
        inArray(customShellAnnouncements.id, announcementIds)
      )
    )
    .returning({ id: customShellAnnouncements.id })

  if (!rows.length) {
    throw new Error("ANNOUNCEMENT_NOT_FOUND")
  }

  return { count: rows.length }
}

/**
 * The banners this person should see right now, and — as a side effect — the
 * tray notices they are owed.
 *
 * The shell asks for this on every signed-in page load, so it is one query: the
 * live announcements, with whether this person has already dismissed each one
 * and whether they already have a notice for it. Anything live, set to notify
 * and missing its notice gets one written here. That is what makes a scheduled
 * announcement reach the tray at the right time with nothing running in the
 * background — the cost is one insert per person per announcement, once.
 *
 * `noticesCreated` is how many it wrote. The shell runs this alongside its
 * unread count rather than before it, so that count can miss a notice written
 * in the same breath; this is what tells the shell the rare load where it has
 * to ask again. See `loadShellBootstrap`.
 */
export async function loadUserAnnouncements(
  workspaceId: string,
  userId: string,
  database: CustomShellDb = db
): Promise<{ banners: UserAnnouncement[]; noticesCreated: number }> {
  const timestamp = now()
  const rows = await database
    .select({
      id: customShellAnnouncements.id,
      title: customShellAnnouncements.title,
      body: customShellAnnouncements.body,
      level: customShellAnnouncements.level,
      showBanner: customShellAnnouncements.showBanner,
      notify: customShellAnnouncements.notify,
      dismissedAt: customShellAnnouncementDismissals.createdAt,
      notificationId: customShellNotifications.id,
    })
    .from(customShellAnnouncements)
    .leftJoin(
      customShellAnnouncementDismissals,
      and(
        eq(
          customShellAnnouncementDismissals.announcementId,
          customShellAnnouncements.id
        ),
        eq(customShellAnnouncementDismissals.userId, userId)
      )
    )
    .leftJoin(
      customShellNotifications,
      and(
        eq(customShellNotifications.announcementId, customShellAnnouncements.id),
        eq(customShellNotifications.recipientUserId, userId)
      )
    )
    .where(
      and(
        eq(customShellAnnouncements.workspaceId, workspaceId),
        lte(customShellAnnouncements.startsAt, timestamp),
        or(
          isNull(customShellAnnouncements.endsAt),
          gt(customShellAnnouncements.endsAt, timestamp)
        )
      )
    )
    .orderBy(desc(customShellAnnouncements.startsAt))

  const owed = rows.filter((row) => row.notify && !row.notificationId)
  let noticesCreated = 0
  if (owed.length) {
    // Two tabs opening together both read "no notice yet"; the unique index is
    // what stops the second one writing a duplicate, and this is what stops it
    // failing the whole page load over it. Counting what was actually written
    // (rather than what was owed) keeps the loser of that race honest.
    const written = await database
      .insert(customShellNotifications)
      .values(
        owed.map((row) => ({
          id: uuid(),
          recipientUserId: userId,
          type: "announcement" as const,
          announcementId: row.id,
          createdAt: timestamp,
        }))
      )
      .onConflictDoNothing()
      .returning({ id: customShellNotifications.id })

    noticesCreated = written.length
    // This person's *other* tabs. The tab that ran this already has the new
    // count in the page it is loading, so the nudge is for the ones that are
    // just sitting there.
    if (noticesCreated) await publishNotificationCreated(userId, database)
  }

  return {
    banners: rows
      .filter((row) => row.showBanner && !row.dismissedAt)
      .map((row) => ({
        id: row.id,
        title: row.title,
        body: row.body,
        level: isAnnouncementLevel(row.level)
          ? row.level
          : DEFAULT_ANNOUNCEMENT_LEVEL,
      }))
      // The loudest one goes on top: an outage outranks a heads-up, which
      // outranks today's news, whatever order they were posted in. The query
      // already handed these over newest first and this sort keeps equal levels
      // in that order, so within one level the newest is still first.
      .sort(
        (a, b) =>
          ANNOUNCEMENT_LEVELS.indexOf(b.level) -
          ANNOUNCEMENT_LEVELS.indexOf(a.level)
      ),
    noticesCreated,
  }
}

/** Hides one banner for one person. Dismissing twice is not an error. */
export async function dismissAnnouncement(
  workspaceId: string,
  userId: string,
  announcementId: string,
  database: CustomShellDb = db
) {
  const [announcement] = await database
    .select({ id: customShellAnnouncements.id })
    .from(customShellAnnouncements)
    .where(
      and(
        eq(customShellAnnouncements.id, announcementId),
        eq(customShellAnnouncements.workspaceId, workspaceId)
      )
    )
    .limit(1)

  if (!announcement) {
    throw new Error("ANNOUNCEMENT_NOT_FOUND")
  }

  await database
    .insert(customShellAnnouncementDismissals)
    .values({ announcementId, userId, createdAt: now() })
    .onConflictDoNothing()

  return { announcementId }
}

export function serializeAnnouncement(announcement: CustomShellAnnouncement) {
  return {
    id: announcement.id,
    title: announcement.title,
    body: announcement.body,
    level: isAnnouncementLevel(announcement.level)
      ? announcement.level
      : DEFAULT_ANNOUNCEMENT_LEVEL,
    audience: announcement.audience,
    showBanner: announcement.showBanner,
    notify: announcement.notify,
    startsAt: announcement.startsAt.toISOString(),
    endsAt: announcement.endsAt?.toISOString() ?? null,
  }
}

function cleanAnnouncementInput(input: AnnouncementInput, timestamp: Date) {
  const title = input.title.trim().slice(0, MAX_ANNOUNCEMENT_TITLE_LENGTH)
  const body = input.body.trim().slice(0, MAX_ANNOUNCEMENT_BODY_LENGTH)

  if (!title) {
    throw new Error("ANNOUNCEMENT_TITLE_REQUIRED")
  }
  if (!body) {
    throw new Error("ANNOUNCEMENT_BODY_REQUIRED")
  }
  if (!input.showBanner && !input.notify) {
    throw new Error("ANNOUNCEMENT_CHANNEL_REQUIRED")
  }

  // The form picks whole days. Read them as UTC days so an announcement runs on
  // the dates it says it does no matter which machine the app happens to be on.
  const startsAt = input.startsOn
    ? new Date(`${input.startsOn}T00:00:00.000Z`)
    : timestamp
  const endsAt = input.endsOn
    ? new Date(`${input.endsOn}T23:59:59.999Z`)
    : null

  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt?.getTime() ?? 0)) {
    throw new Error("ANNOUNCEMENT_WINDOW_INVALID")
  }
  if (endsAt && endsAt <= startsAt) {
    throw new Error("ANNOUNCEMENT_WINDOW_INVALID")
  }

  return {
    title,
    body,
    level: input.level,
    audience: input.audience,
    showBanner: input.showBanner,
    notify: input.notify,
    startsAt,
    endsAt,
  }
}
