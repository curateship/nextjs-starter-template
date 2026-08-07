import { desc, eq, inArray, isNotNull } from "drizzle-orm"

import { db, type CustomShellDb } from "@/server/db"
import {
  publishNotificationCreatedMany,
  type NotificationPublisher,
} from "@/server/notifications/events"
import {
  customShellChangelogEntries,
  customShellNotifications,
  customShellUsers,
  type CustomShellChangelogEntry,
} from "@/server/schema"
import { now, uuid } from "@/server/auth/security"

/**
 * Shipped-update entries, written by an admin and read by everyone. Publishing
 * one drops a notice in every person's notification tray, so read state, the
 * unread dot and "mark all as read" are the tray's job — the changelog itself
 * keeps no per-person state at all.
 */

export type ChangelogEntryInput = {
  title: string
  body: string
  published: boolean
}

/** Newest first, drafts included. Admin authoring reads this. */
export async function listChangelogEntries(database: CustomShellDb = db) {
  return database
    .select()
    .from(customShellChangelogEntries)
    .orderBy(
      desc(customShellChangelogEntries.publishedAt),
      desc(customShellChangelogEntries.createdAt)
    )
}

/** Newest first, published only. The What's new panel reads this. */
export async function listPublishedChangelogEntries(
  limit: number,
  database: CustomShellDb = db
) {
  return database
    .select()
    .from(customShellChangelogEntries)
    .where(isNotNull(customShellChangelogEntries.publishedAt))
    .orderBy(desc(customShellChangelogEntries.publishedAt))
    .limit(limit)
}

export async function createChangelogEntry(
  input: ChangelogEntryInput,
  database: CustomShellDb = db
) {
  const timestamp = now()
  const values = {
    id: uuid(),
    ...cleanEntryInput(input),
    publishedAt: input.published ? timestamp : null,
    createdAt: timestamp,
    updatedAt: timestamp,
  }

  // One transaction, the way a feedback vote and its notification are written:
  // an update that went out with nobody notified would look published and reach
  // nobody, and nothing afterwards would know to go back and fix it.
  return database.transaction(async (tx) => {
    const [entry] = await tx
      .insert(customShellChangelogEntries)
      .values(values)
      .returning()

    if (!entry) {
      throw new Error("CHANGELOG_ENTRY_NOT_SAVED")
    }

    if (entry.publishedAt) {
      await notifyEveryone(entry.id, timestamp, tx)
    }

    return entry
  })
}

export async function updateChangelogEntry(
  entryId: string,
  input: ChangelogEntryInput,
  database: CustomShellDb = db
) {
  const timestamp = now()
  const cleaned = cleanEntryInput(input)

  // Reading the current state, writing it back and announcing it all happen
  // together: two edits at once would otherwise be able to read the same "not
  // published yet" and both announce the same update.
  return database.transaction(async (tx) => {
    const [existing] = await tx
      .select({ publishedAt: customShellChangelogEntries.publishedAt })
      .from(customShellChangelogEntries)
      .where(eq(customShellChangelogEntries.id, entryId))
      .limit(1)

    if (!existing) {
      throw new Error("CHANGELOG_ENTRY_NOT_FOUND")
    }

    // Publishing stamps the moment it went out; editing an entry that is
    // already published leaves that stamp alone, so fixing a typo does not
    // re-announce it to everyone who has already read it. Unpublishing and
    // publishing again is a fresh announcement, which is what clearing the date
    // and re-stamping means.
    const wasPublished = Boolean(existing.publishedAt)
    const publishedAt = input.published
      ? (existing.publishedAt ?? timestamp)
      : null

    const [entry] = await tx
      .update(customShellChangelogEntries)
      .set({ ...cleaned, publishedAt, updatedAt: timestamp })
      .where(eq(customShellChangelogEntries.id, entryId))
      .returning()

    if (!entry) {
      throw new Error("CHANGELOG_ENTRY_NOT_FOUND")
    }

    // Only the draft → published step announces anything. Pulling an entry
    // takes its notices back with it, so republishing later reaches everyone
    // again rather than leaving the people who read the first version with
    // nothing.
    if (!wasPublished && entry.publishedAt) {
      await notifyEveryone(entry.id, timestamp, tx)
    }
    if (wasPublished && !entry.publishedAt) {
      await tx
        .delete(customShellNotifications)
        .where(eq(customShellNotifications.changelogEntryId, entry.id))
    }

    return entry
  })
}

/**
 * Drops the update in everyone's tray. One row per person is what makes read
 * state, the unread count and "mark all as read" work without the tray knowing
 * anything about changelogs. It is a write per account, so it is worth knowing
 * this scales with how many people are signed up.
 */
async function notifyEveryone(
  changelogEntryId: string,
  createdAt: Date,
  database: Pick<CustomShellDb, "select" | "insert"> & NotificationPublisher
) {
  const recipients = await database
    .select({ id: customShellUsers.id })
    .from(customShellUsers)

  if (!recipients.length) return

  await database.insert(customShellNotifications).values(
    recipients.map((recipient) => ({
      id: uuid(),
      recipientUserId: recipient.id,
      type: "changelog" as const,
      changelogEntryId,
      createdAt,
    }))
  )

  // Everyone who is looking at the app right now sees it appear. One statement
  // for the whole list, and inside the same transaction as the rows above, so
  // publishing an update that then fails to save announces nothing.
  await publishNotificationCreatedMany(
    recipients.map((recipient) => recipient.id),
    database
  )
}

export async function deleteChangelogEntries(
  entryIds: string[],
  database: CustomShellDb = db
) {
  const rows = await database
    .delete(customShellChangelogEntries)
    .where(inArray(customShellChangelogEntries.id, entryIds))
    .returning({ id: customShellChangelogEntries.id })

  if (!rows.length) {
    throw new Error("CHANGELOG_ENTRY_NOT_FOUND")
  }

  return { count: rows.length }
}

export function serializeChangelogEntry(entry: CustomShellChangelogEntry) {
  return {
    id: entry.id,
    title: entry.title,
    body: entry.body,
    publishedAt: entry.publishedAt?.toISOString() ?? null,
    createdAt: entry.createdAt.toISOString(),
  }
}

function cleanEntryInput(input: ChangelogEntryInput) {
  const title = input.title.trim()
  const body = input.body.trim()

  if (!title) {
    throw new Error("CHANGELOG_TITLE_REQUIRED")
  }
  if (!body) {
    throw new Error("CHANGELOG_BODY_REQUIRED")
  }

  return { title, body }
}
