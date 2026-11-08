import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lte,
  not,
  notInArray,
  or,
  sql,
} from "drizzle-orm"

import type { CrmAttachment, CrmInboxSort, CrmStage, CrmThreadStatus } from "@/lib/crm/crm"
import { messageSnippet } from "@/lib/crm/message-text"
import { now } from "@/server/auth/security"
import { db, type CustomShellDb } from "@/server/db"
import {
  customShellCrmLeadTags,
  customShellCrmLeads,
  customShellCrmMessages,
  customShellCrmThreads,
} from "@/server/schema"
import { listLeadTags } from "@/server/crm/lead-tags"

export type InboxFilter = {
  search?: string
  status?: CrmThreadStatus | "all"
  stage?: CrmStage | "all"
  unreadOnly?: boolean
  /** Only conversations somebody saved: the Saved tab. */
  savedOnly?: boolean
  /** Only mail that arrived at this address, from the Emails block. */
  toAddress?: string
  /**
   * With `toAddress`, also the conversations with no address recorded: they
   * came before the list, when the first address was the only one.
   */
  toAddressTakesUnknown?: boolean
  /** Only threads whose lead has a chase date that has already passed. */
  followUpDue?: boolean
  /**
   * Only the Waiting pill's conversations: they wrote last, before this
   * moment, and nobody has answered (`waitingConditions`).
   */
  waitingSince?: Date
  /** Only leads carrying this tag (CRM task 27). */
  tag?: string
  /** Which end of the conversation list comes first. Newest when unsaid. */
  sort?: CrmInboxSort
  limit?: number
  offset?: number
}

export type InboxThreadRow = {
  id: string
  subject: string
  status: CrmThreadStatus
  lastMessageAt: Date
  lastDirection: "in" | "out"
  messageCount: number
  readAt: Date | null
  savedAt: Date | null
  /** The address the mail arrived at, or null for mail from before the list. */
  toAddress: string | null
  leadId: string
  leadEmail: string
  leadName: string | null
  leadStage: CrmStage
  followUpAt: Date | null
  /** The start of the newest message, or null when its body has not landed. */
  snippet: string | null
  /** The lead's tags, A to Z. */
  tags: string[]
}

/**
 * "Waiting on you": an open conversation where their message is the last one,
 * it came before `waitedSince`, and the lead is not won or lost. One
 * definition for the Inbox's Waiting pill, its count, and the left page's
 * Waiting on you block, so the three always name the same conversations.
 */
export function waitingConditions(waitedSince: Date) {
  return and(
    eq(customShellCrmThreads.status, "open"),
    eq(customShellCrmThreads.lastDirection, "in"),
    lte(customShellCrmThreads.lastMessageAt, waitedSince),
    notInArray(customShellCrmLeads.stage, ["won", "lost"])
  )!
}

/** The moment a conversation has to be older than to count as waiting. */
export function waitingCutoff(unansweredDays: number): Date {
  return new Date(now().getTime() - unansweredDays * 86_400_000)
}

function filterConditions(workspaceId: string, filter: InboxFilter) {
  const conditions = [eq(customShellCrmThreads.workspaceId, workspaceId)]

  if (filter.status && filter.status !== "all") {
    conditions.push(eq(customShellCrmThreads.status, filter.status))
  }
  if (filter.stage && filter.stage !== "all") {
    conditions.push(eq(customShellCrmLeads.stage, filter.stage))
  }
  if (filter.unreadOnly) {
    conditions.push(isNull(customShellCrmThreads.readAt))
  }
  if (filter.savedOnly) {
    conditions.push(isNotNull(customShellCrmThreads.savedAt))
  }
  const toAddress = filter.toAddress?.trim().toLowerCase()
  if (toAddress) {
    conditions.push(
      filter.toAddressTakesUnknown
        ? sql`(lower(${customShellCrmThreads.toAddress}) = ${toAddress} or ${customShellCrmThreads.toAddress} is null)`
        : sql`lower(${customShellCrmThreads.toAddress}) = ${toAddress}`
    )
  }
  if (filter.followUpDue) {
    conditions.push(lte(customShellCrmLeads.followUpAt, now()))
  }
  if (filter.waitingSince) {
    conditions.push(waitingConditions(filter.waitingSince))
  }
  const tag = filter.tag?.trim().toLowerCase()
  if (tag) {
    conditions.push(
      sql`exists (
        select 1 from ${customShellCrmLeadTags}
        where ${customShellCrmLeadTags.leadId} = ${customShellCrmLeads.id}
          and ${customShellCrmLeadTags.tag} = ${tag}
      )`
    )
  }

  const search = filter.search?.trim()
  if (search) {
    const like = `%${search}%`
    conditions.push(
      // The subject, who it is with, and the words in the mail itself. The
      // last one is an EXISTS rather than a join, so a thread whose every
      // message matches still comes back once.
      or(
        ilike(customShellCrmThreads.subject, like),
        ilike(customShellCrmLeads.email, like),
        ilike(customShellCrmLeads.name, like),
        ilike(customShellCrmLeads.company, like),
        sql`exists (
          select 1 from ${customShellCrmMessages}
          where ${customShellCrmMessages.threadId} = ${customShellCrmThreads.id}
            and (${customShellCrmMessages.textBody} ilike ${like}
              or ${customShellCrmMessages.subject} ilike ${like})
        )`
      )!
    )
  }

  return and(...conditions)
}

/**
 * How many conversations the filters match, how many of those are unread,
 * and how many are saved.
 *
 * **`unreadOnly` and `savedOnly` are deliberately ignored here.** These three
 * numbers are what the All, Unread and Saved tabs show, and a tab's own count
 * must not move when you press it. Counting the filtered list instead made "All" read 6 and then 2 the
 * moment Unread was chosen, because the list it was counting had become the
 * unread one.
 *
 * Both numbers obey every other filter, so a search for "kitchen" answers how
 * many of those there are and how many of those are unread. One query, so the
 * three can never disagree.
 */
export async function countInboxThreads(
  workspaceId: string,
  filter: InboxFilter = {},
  database: CustomShellDb = db,
  /**
   * The Waiting pill's cutoff, or null when chasing is off and the pill has
   * nothing to count. Separate from `filter.waitingSince`, because a pill's
   * count must not move when it is pressed.
   */
  waitingSince: Date | null = null
): Promise<{ all: number; unread: number; saved: number; waiting: number }> {
  const [row] = await database
    .select({
      all: count(),
      unread: sql<number>`count(*) filter (where ${customShellCrmThreads.readAt} is null)`,
      saved: sql<number>`count(*) filter (where ${customShellCrmThreads.savedAt} is not null)`,
      waiting: waitingSince
        ? sql<number>`count(*) filter (where ${waitingConditions(waitingSince)})`
        : sql<number>`0`,
    })
    .from(customShellCrmThreads)
    .innerJoin(
      customShellCrmLeads,
      eq(customShellCrmLeads.id, customShellCrmThreads.leadId)
    )
    .where(
      filterConditions(workspaceId, {
        ...filter,
        unreadOnly: false,
        savedOnly: false,
        waitingSince: undefined,
      })
    )

  return {
    all: Number(row?.all ?? 0),
    unread: Number(row?.unread ?? 0),
    saved: Number(row?.saved ?? 0),
    waiting: Number(row?.waiting ?? 0),
  }
}

/**
 * One page of the inbox, newest message first unless `sort` says otherwise.
 *
 * `sort: "oldest"` puts the person who has waited longest at the top, which is
 * the order for clearing the inbox rather than reading it.
 *
 * Both orders are plain `asc`/`desc` on `last_message_at`, which is `NOT NULL`,
 * so neither needs a `NULLS LAST`. That matters: Drizzle's
 * `asc(sql`col nulls last`)` builds SQL Postgres refuses, and it type checks
 * fine. `src/server/crm/reads.test.ts` runs both orders for that reason.
 *
 * The snippet is fetched in a second query rather than as a correlated
 * subquery on the first. Thirty threads means one extra read, and it keeps the
 * list query something a person can follow.
 */
export async function listInboxThreads(
  workspaceId: string,
  filter: InboxFilter = {},
  database: CustomShellDb = db
): Promise<InboxThreadRow[]> {
  const where = filterConditions(workspaceId, filter)

  const rows = await database
    .select({
      id: customShellCrmThreads.id,
      subject: customShellCrmThreads.subject,
      status: customShellCrmThreads.status,
      lastMessageAt: customShellCrmThreads.lastMessageAt,
      lastDirection: customShellCrmThreads.lastDirection,
      messageCount: customShellCrmThreads.messageCount,
      readAt: customShellCrmThreads.readAt,
      savedAt: customShellCrmThreads.savedAt,
      toAddress: customShellCrmThreads.toAddress,
      leadId: customShellCrmLeads.id,
      leadEmail: customShellCrmLeads.email,
      leadName: customShellCrmLeads.name,
      leadStage: customShellCrmLeads.stage,
      followUpAt: customShellCrmLeads.followUpAt,
    })
    .from(customShellCrmThreads)
    .innerJoin(
      customShellCrmLeads,
      eq(customShellCrmLeads.id, customShellCrmThreads.leadId)
    )
    .where(where)
    .orderBy(
      filter.sort === "oldest"
        ? asc(customShellCrmThreads.lastMessageAt)
        : desc(customShellCrmThreads.lastMessageAt)
    )
    .limit(filter.limit ?? 30)
    .offset(filter.offset ?? 0)

  const [snippets, tags] = await Promise.all([
    newestSnippets(
      rows.map((row) => row.id),
      database
    ),
    listLeadTags(
      [...new Set(rows.map((row) => row.leadId))],
      database
    ),
  ])

  return rows.map((row) => ({
    ...row,
    snippet: snippets.get(row.id) ?? null,
    tags: tags.get(row.leadId) ?? [],
  }))
}

/** The newest message of each thread, as a snippet, keyed by thread id. */
async function newestSnippets(
  threadIds: string[],
  database: CustomShellDb
): Promise<Map<string, string>> {
  const snippets = new Map<string, string>()
  if (threadIds.length === 0) return snippets

  const rows = await database
    .select({
      threadId: customShellCrmMessages.threadId,
      textBody: customShellCrmMessages.textBody,
      htmlBody: customShellCrmMessages.htmlBody,
      occurredAt: customShellCrmMessages.occurredAt,
    })
    .from(customShellCrmMessages)
    .where(inArray(customShellCrmMessages.threadId, threadIds))
    .orderBy(desc(customShellCrmMessages.occurredAt))

  // Newest first, so the first row seen for a thread is the one wanted.
  for (const row of rows) {
    if (snippets.has(row.threadId)) continue
    const snippet = messageSnippet(row.textBody, row.htmlBody)
    if (snippet) snippets.set(row.threadId, snippet)
  }
  return snippets
}

export type ThreadMessageRow = {
  id: string
  direction: "in" | "out"
  fromEmail: string
  fromName: string | null
  toEmail: string
  subject: string
  textBody: string | null
  htmlBody: string | null
  attachments: CrmAttachment[]
  bodyFetchedAt: Date | null
  bodyAttempts: number
  filesFetchedAt: Date | null
  fileAttempts: number
  occurredAt: Date
}

/**
 * One conversation and the lead it is with, or null when the id is not this
 * workspace's.
 *
 * The workspace check is in the where clause rather than after the read, so an
 * id belonging to somebody else answers "not found" and never a row.
 */
export async function getThread(
  workspaceId: string,
  threadId: string,
  database: CustomShellDb = db
) {
  const [row] = await database
    .select({
      id: customShellCrmThreads.id,
      subject: customShellCrmThreads.subject,
      status: customShellCrmThreads.status,
      snoozedUntil: customShellCrmThreads.snoozedUntil,
      lastMessageAt: customShellCrmThreads.lastMessageAt,
      messageCount: customShellCrmThreads.messageCount,
      readAt: customShellCrmThreads.readAt,
      savedAt: customShellCrmThreads.savedAt,
      toAddress: customShellCrmThreads.toAddress,
      summary: customShellCrmThreads.summary,
      summaryMessageCount: customShellCrmThreads.summaryMessageCount,
      leadId: customShellCrmLeads.id,
    })
    .from(customShellCrmThreads)
    .innerJoin(
      customShellCrmLeads,
      eq(customShellCrmLeads.id, customShellCrmThreads.leadId)
    )
    .where(
      and(
        eq(customShellCrmThreads.workspaceId, workspaceId),
        eq(customShellCrmThreads.id, threadId)
      )
    )
    .limit(1)

  return row ?? null
}

/** Every message in one conversation, oldest first, the way it is read. */
export async function listThreadMessages(
  workspaceId: string,
  threadId: string,
  database: CustomShellDb = db
): Promise<ThreadMessageRow[]> {
  return database
    .select({
      id: customShellCrmMessages.id,
      direction: customShellCrmMessages.direction,
      fromEmail: customShellCrmMessages.fromEmail,
      fromName: customShellCrmMessages.fromName,
      toEmail: customShellCrmMessages.toEmail,
      subject: customShellCrmMessages.subject,
      textBody: customShellCrmMessages.textBody,
      htmlBody: customShellCrmMessages.htmlBody,
      attachments: customShellCrmMessages.attachments,
      bodyFetchedAt: customShellCrmMessages.bodyFetchedAt,
      bodyAttempts: customShellCrmMessages.bodyAttempts,
      filesFetchedAt: customShellCrmMessages.filesFetchedAt,
      fileAttempts: customShellCrmMessages.fileAttempts,
      occurredAt: customShellCrmMessages.occurredAt,
    })
    .from(customShellCrmMessages)
    .where(
      and(
        eq(customShellCrmMessages.workspaceId, workspaceId),
        eq(customShellCrmMessages.threadId, threadId)
      )
    )
    .orderBy(asc(customShellCrmMessages.occurredAt))
}

/** Stamps a conversation as read. Already-read threads keep their first stamp. */
export async function markThreadRead(
  workspaceId: string,
  threadId: string,
  database: CustomShellDb = db
): Promise<boolean> {
  const changed = await database
    .update(customShellCrmThreads)
    .set({ readAt: now(), updatedAt: now() })
    .where(
      and(
        eq(customShellCrmThreads.workspaceId, workspaceId),
        eq(customShellCrmThreads.id, threadId),
        isNull(customShellCrmThreads.readAt)
      )
    )
    .returning({ id: customShellCrmThreads.id })
  return changed.length > 0
}

/**
 * Puts a conversation back to unread.
 *
 * Opening one marks it read, so without this there is no way back: a
 * conversation you opened by accident, or meant to deal with later, would look
 * dealt with. Every mail client has this button for the same reason.
 */
export async function markThreadUnread(
  workspaceId: string,
  threadId: string,
  database: CustomShellDb = db
): Promise<boolean> {
  const changed = await database
    .update(customShellCrmThreads)
    .set({ readAt: null, updatedAt: now() })
    .where(
      and(
        eq(customShellCrmThreads.workspaceId, workspaceId),
        eq(customShellCrmThreads.id, threadId)
      )
    )
    .returning({ id: customShellCrmThreads.id })
  return changed.length > 0
}

/**
 * Saves a conversation for the Saved tab, or takes the mark off. One mark for
 * the whole site (Tyler, 7 Nov 2026). Answers whether the conversation was
 * this workspace's.
 */
export async function setThreadSaved(
  workspaceId: string,
  threadId: string,
  saved: boolean,
  database: CustomShellDb = db
): Promise<boolean> {
  const changed = await database
    .update(customShellCrmThreads)
    .set({ savedAt: saved ? now() : null, updatedAt: now() })
    .where(
      and(
        eq(customShellCrmThreads.workspaceId, workspaceId),
        eq(customShellCrmThreads.id, threadId)
      )
    )
    .returning({ id: customShellCrmThreads.id })
  return changed.length > 0
}

/**
 * Opens, snoozes or closes a conversation.
 *
 * Snoozing without a date is the same as leaving it open, so the date is
 * required for that one and cleared for the other two.
 */
export async function setThreadStatus(
  workspaceId: string,
  threadId: string,
  status: CrmThreadStatus,
  snoozedUntil: Date | null,
  database: CustomShellDb = db
): Promise<boolean> {
  const changed = await database
    .update(customShellCrmThreads)
    .set({
      status,
      snoozedUntil: status === "snoozed" ? snoozedUntil : null,
      updatedAt: now(),
    })
    .where(
      and(
        eq(customShellCrmThreads.workspaceId, workspaceId),
        eq(customShellCrmThreads.id, threadId)
      )
    )
    .returning({ id: customShellCrmThreads.id })
  return changed.length > 0
}

/**
 * Wakes up every conversation whose snooze has run out.
 *
 * Run from the background pass. A snooze is "ask me again on Thursday", and
 * nothing would ask without this.
 */
export async function wakeSnoozedThreads(
  database: CustomShellDb = db
): Promise<number> {
  const woken = await database
    .update(customShellCrmThreads)
    .set({ status: "open", snoozedUntil: null, updatedAt: now() })
    .where(
      and(
        eq(customShellCrmThreads.status, "snoozed"),
        lte(customShellCrmThreads.snoozedUntil, now())
      )
    )
    .returning({ id: customShellCrmThreads.id })
  return woken.length
}

/**
 * What a many-conversations write did, counted honestly.
 *
 * `changed` is how many rows the statement actually wrote. `unchanged` is how
 * many of the asked-for ids were this workspace's and were already in the
 * state being asked for, which is the difference between "17 closed" and
 * "17 closed, 3 were already closed". An id belonging to another workspace,
 * or one that no longer exists, is in neither number: nothing happened to it
 * and nothing is claimed about it.
 */
export type ManyThreadsResult = { changed: number; unchanged: number }

/** How many of these ids are this workspace's, whatever state they are in. */
async function countThreadsHere(
  workspaceId: string,
  threadIds: string[],
  database: CustomShellDb
): Promise<number> {
  const [row] = await database
    .select({ here: count() })
    .from(customShellCrmThreads)
    .where(
      and(
        eq(customShellCrmThreads.workspaceId, workspaceId),
        inArray(customShellCrmThreads.id, threadIds)
      )
    )
  return Number(row?.here ?? 0)
}

/**
 * Stamps many conversations as read in one statement.
 *
 * One statement rather than one per row, so twenty rows is one trip and either
 * all twenty are read or none are. Already-read threads keep their first
 * stamp, which is why `isNull` is still in the where clause.
 */
export async function markThreadsRead(
  workspaceId: string,
  threadIds: string[],
  database: CustomShellDb = db
): Promise<ManyThreadsResult> {
  if (threadIds.length === 0) return { changed: 0, unchanged: 0 }

  const changed = await database
    .update(customShellCrmThreads)
    .set({ readAt: now(), updatedAt: now() })
    .where(
      and(
        eq(customShellCrmThreads.workspaceId, workspaceId),
        inArray(customShellCrmThreads.id, threadIds),
        isNull(customShellCrmThreads.readAt)
      )
    )
    .returning({ id: customShellCrmThreads.id })

  const here = await countThreadsHere(workspaceId, threadIds, database)
  return { changed: changed.length, unchanged: here - changed.length }
}

/**
 * Opens, snoozes or closes many conversations in one statement.
 *
 * Rows already in the asked-for state are left out of the write rather than
 * written over, so `changed` is the number a person can be told. A row that is
 * already closed would otherwise come back from `RETURNING` and be counted as
 * something this press did.
 *
 * A fresh snooze date always counts as a change, because the date is part of
 * the state and the new one is never the old one to the millisecond.
 */
export async function setThreadStatuses(
  workspaceId: string,
  threadIds: string[],
  status: CrmThreadStatus,
  snoozedUntil: Date | null,
  database: CustomShellDb = db
): Promise<ManyThreadsResult> {
  if (threadIds.length === 0) return { changed: 0, unchanged: 0 }

  const nextSnooze = status === "snoozed" ? snoozedUntil : null
  // `isNotNull` before the date comparison, and not for tidiness. A snoozed
  // row with no date — which `setThreadStatus` still allows, because the
  // one-thread endpoint's date is optional — makes `snoozed_until = $1`
  // answer NULL rather than false, and `NOT NULL` is NULL, so the row matches
  // nothing and is skipped. It would then be left dateless and reported as
  // "already snoozed until then". `IS NOT NULL` is false there, which makes
  // the whole AND false, so the row is written like any other.
  const alreadyThere = and(
    eq(customShellCrmThreads.status, status),
    nextSnooze
      ? and(
          isNotNull(customShellCrmThreads.snoozedUntil),
          eq(customShellCrmThreads.snoozedUntil, nextSnooze)
        )
      : isNull(customShellCrmThreads.snoozedUntil)
  )!

  const changed = await database
    .update(customShellCrmThreads)
    .set({ status, snoozedUntil: nextSnooze, updatedAt: now() })
    .where(
      and(
        eq(customShellCrmThreads.workspaceId, workspaceId),
        inArray(customShellCrmThreads.id, threadIds),
        not(alreadyThere)
      )
    )
    .returning({ id: customShellCrmThreads.id })

  const here = await countThreadsHere(workspaceId, threadIds, database)
  return { changed: changed.length, unchanged: here - changed.length }
}
