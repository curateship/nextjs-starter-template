import { and, desc, eq, gte, sql } from "drizzle-orm"

import { db, type CustomShellDb } from "@/server/db"
import {
  customShellSystemEmailSends,
  customShellSystemEmails,
} from "@/server/schema"
import { now, uuid } from "@/server/auth/security"
import {
  parseStoredBlocks,
  type BroadcastBlock,
} from "@/lib/broadcasts/blocks"
import { renderBroadcastEmailHtml } from "@/lib/broadcasts/render"
import { sanitizeBlocks } from "@/server/email/broadcasts"
import {
  RECENT_SEND_DAYS,
  SYSTEM_EMAIL_KINDS,
  SYSTEM_EMAIL_META,
  createSystemEmailBlocks,
  type SystemEmailKind,
} from "@/lib/system-emails/kinds"

function thirtyDaysAgo() {
  const cutoff = now()
  cutoff.setDate(cutoff.getDate() - RECENT_SEND_DAYS)
  return cutoff
}

/**
 * The saved wording for one email, or null when nobody has edited it.
 *
 * Null is the ordinary state on a fresh install and means "use what is built
 * in". Nothing creates these rows behind anyone's back — see
 * `getOrCreateSystemEmail`, which is the editor opening one.
 */
export async function getSystemEmail(
  workspaceId: string,
  kind: SystemEmailKind,
  database: CustomShellDb = db
) {
  const [row] = await database
    .select()
    .from(customShellSystemEmails)
    .where(
      and(
        eq(customShellSystemEmails.workspaceId, workspaceId),
        eq(customShellSystemEmails.kind, kind)
      )
    )
    .limit(1)
  return row ?? null
}

/**
 * The saved wording, written out from the built-in version the first time.
 *
 * Saving a change is the moment an email's wording stops being the app's and
 * starts being yours, so this is where the row appears — never on the way in,
 * because the router preloads the editor as soon as a link is hovered and
 * merely looking must not count as editing. It is seeded with the same words
 * that were going out a second ago, so the save only changes what was changed.
 *
 * `onConflictDoNothing` because two tabs saving the same email at once is an
 * ordinary thing to do, not an error.
 */
export async function getOrCreateSystemEmail(
  workspaceId: string,
  kind: SystemEmailKind,
  database: CustomShellDb = db
) {
  const existing = await getSystemEmail(workspaceId, kind, database)
  if (existing) return existing

  const meta = SYSTEM_EMAIL_META[kind]
  const blocks = createSystemEmailBlocks(kind)
  const timestamp = now()

  await database
    .insert(customShellSystemEmails)
    .values({
      workspaceId,
      kind,
      subject: meta.defaults.subject,
      preheader: "",
      fromName: null,
      blocks,
      renderedHtml: renderBroadcastEmailHtml(blocks),
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .onConflictDoNothing()

  const created = await getSystemEmail(workspaceId, kind, database)
  if (!created) throw new Error("CREATE_FAILED")
  return created
}

export async function updateSystemEmail(
  workspaceId: string,
  kind: SystemEmailKind,
  input: {
    subject?: string
    preheader?: string
    fromName?: string | null
    blocks?: BroadcastBlock[]
  },
  database: CustomShellDb = db
) {
  // Created rather than demanded: a save arriving for an email whose row was
  // never written is a tab that was open before this feature existed, not a
  // reason to lose what was typed.
  const existing = await getOrCreateSystemEmail(workspaceId, kind, database)

  const values: Partial<typeof customShellSystemEmails.$inferInsert> = {
    updatedAt: now(),
  }
  if (input.subject !== undefined) values.subject = input.subject
  if (input.preheader !== undefined) values.preheader = input.preheader
  if (input.fromName !== undefined) {
    values.fromName = input.fromName?.trim() || null
  }
  if (input.blocks !== undefined) values.blocks = sanitizeBlocks(input.blocks)

  // Kept in step with the words, so the send never has to re-render and a
  // half-saved edit cannot go out.
  if (input.blocks !== undefined || input.preheader !== undefined) {
    const blocks =
      input.blocks !== undefined
        ? (values.blocks as BroadcastBlock[])
        : parseStoredBlocks(existing.blocks)
    values.renderedHtml = renderBroadcastEmailHtml(blocks, {
      preheader: input.preheader ?? existing.preheader,
    })
  }

  const [updated] = await database
    .update(customShellSystemEmails)
    .set(values)
    .where(
      and(
        eq(customShellSystemEmails.workspaceId, workspaceId),
        eq(customShellSystemEmails.kind, kind)
      )
    )
    .returning()
  return updated ?? existing
}

/** Removes one saved version so the built-in wording takes over again. */
export async function resetSystemEmail(
  workspaceId: string,
  kind: SystemEmailKind,
  database: CustomShellDb = db
) {
  await database
    .delete(customShellSystemEmails)
    .where(
      and(
        eq(customShellSystemEmails.workspaceId, workspaceId),
        eq(customShellSystemEmails.kind, kind)
      )
    )
}

/** One attempt at one of these emails, written whether it worked or not. */
export async function recordSystemEmailSend(
  entry: {
    /** Empty when the email went out before any site existed. */
    workspaceId: string | null
    kind: SystemEmailKind
    toEmail: string
    subject: string
    providerMessageId?: string | null
    status: "sent" | "failed"
    error?: string | null
  },
  database: CustomShellDb = db
) {
  await database.insert(customShellSystemEmailSends).values({
    id: uuid(),
    workspaceId: entry.workspaceId,
    kind: entry.kind,
    toEmail: entry.toEmail.slice(0, 255),
    subject: entry.subject,
    providerMessageId: entry.providerMessageId ?? null,
    status: entry.status,
    error: entry.error ?? null,
    createdAt: now(),
  })
}

/**
 * The newest attempts at one email, newest first.
 *
 * Asks for one more than it was given and hands back whether there was one, so
 * "is there another page" costs nothing — the same trick the newsletter's
 * delivery list uses.
 */
export async function listSystemEmailSends(
  workspaceId: string,
  kind: SystemEmailKind,
  options: { limit?: number; offset?: number } = {},
  database: CustomShellDb = db
) {
  const limit = Math.min(Math.max(options.limit ?? 25, 1), 100)
  const offset = Math.max(options.offset ?? 0, 0)

  const rows = await database
    .select()
    .from(customShellSystemEmailSends)
    .where(
      and(
        eq(customShellSystemEmailSends.workspaceId, workspaceId),
        eq(customShellSystemEmailSends.kind, kind)
      )
    )
    .orderBy(desc(customShellSystemEmailSends.createdAt))
    .limit(limit + 1)
    .offset(offset)

  return { sends: rows.slice(0, limit), hasMore: rows.length > limit }
}

/** Sent and failed counts per kind over the last thirty days. */
export async function countRecentSystemEmailSends(
  workspaceId: string,
  database: CustomShellDb = db
) {
  const rows = await database
    .select({
      kind: customShellSystemEmailSends.kind,
      sent: sql<number>`count(*) filter (where ${customShellSystemEmailSends.status} = 'sent')`,
      failed: sql<number>`count(*) filter (where ${customShellSystemEmailSends.status} = 'failed')`,
    })
    .from(customShellSystemEmailSends)
    .where(
      and(
        eq(customShellSystemEmailSends.workspaceId, workspaceId),
        gte(customShellSystemEmailSends.createdAt, thirtyDaysAgo())
      )
    )
    .groupBy(customShellSystemEmailSends.kind)

  const counts = new Map<string, { sent: number; failed: number }>()
  for (const row of rows) {
    counts.set(row.kind, { sent: Number(row.sent), failed: Number(row.failed) })
  }
  return counts
}

/** Every email, edited or not, with how busy each has been. */
export async function listSystemEmails(
  workspaceId: string,
  database: CustomShellDb = db
) {
  const [rows, counts] = await Promise.all([
    database
      .select()
      .from(customShellSystemEmails)
      .where(eq(customShellSystemEmails.workspaceId, workspaceId)),
    countRecentSystemEmailSends(workspaceId, database),
  ])
  const saved = new Map(rows.map((row) => [row.kind, row]))

  return SYSTEM_EMAIL_KINDS.map((kind) => {
    const row = saved.get(kind)
    const count = counts.get(kind)
    return {
      kind,
      subject: row?.subject || SYSTEM_EMAIL_META[kind].defaults.subject,
      edited: row !== undefined,
      updatedAt: row?.updatedAt ?? null,
      recentSent: count?.sent ?? 0,
      recentFailed: count?.failed ?? 0,
    }
  })
}
