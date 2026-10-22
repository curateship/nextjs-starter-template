import { createHash } from "node:crypto"

import { and, desc, eq, inArray, isNull, lte, ne, notExists, or, sql } from "drizzle-orm"

import type { CommandTarget } from "@/server/browser/command"
import { Refusal } from "@/server/browser/refusal"
import { uuid } from "@/server/auth/security"
import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { promoPhones } from "@/server/phones/schema"
import { refuseBrokenAction } from "@/server/phones/action-checks"
import { phoneStepRefusal } from "@/lib/phones/options"
import { NOTICE_HEADINGS } from "@/lib/social/notice-words"
import { handleWords, isNetwork, isPhoneAppNetwork, NETWORK_NAMES } from "@/lib/social/networks"
import {
  INBOX_LINES_KEPT,
  replyMax,
  type InboxKind,
  type InboxLine,
  type InboxStatus,
} from "@/lib/social/phone-apps"

import { askModel, pickProvider } from "../drafts"
import { queueJob } from "../jobs"
import { ringBell } from "../notices"
import { pausedBy } from "../pause"
import { projectDescription } from "../projects"
import { promoAccounts, promoInbox, promoInboxSeen, promoJobs } from "../schema"
import { wordsForAccount } from "../voices"
import { appInbox, appReply, type AppInboxReading } from "./calls"

/**
 * What people write to the phone accounts: direct messages on Reddit,
 * Instagram and TikTok, and comments under the account's own Instagram and
 * TikTok posts (phone farm file 06, parts 37 and 38).
 *
 * When to look is decided by the phone's own notifications, never a timer.
 * Tyler, 16 Oct 2026: "if it goes straight to the DM wouldnt that be
 * suspicious?" The rack reads the phone's notifications without opening an
 * app, and only when Instagram, TikTok or Reddit shows that something
 * arrived does an `inbox_read` job open the app, by tapping that
 * notification the way a person answers the buzz, then a minute in the feed.
 * The daily health visit glances at the inbox in case one was missed.
 *
 * Nothing replies by itself. Tyler, 16 Oct 2026, asked "does it auto respond
 * to everything with my voice?": no. Each conversation or comment is listed
 * with an AI suggestion in the account's voice, and a person sends it, edits
 * it, or skips it. Send is one `inbox_reply` job, tried once and never again.
 *
 * A conversation is kept only while it is open in Promo: answering or
 * skipping it deletes it, words and all. Only a hash of each line read stays
 * (`promo_inbox_seen`), so the same lines are not listed again.
 */

type AccountRow = typeof promoAccounts.$inferSelect

/** One alert from a phone's notifications, as the rack reports it with its check-in. */
export type AppAlert = { app: string; kind: InboxKind }

/** The hash a line is remembered by: who it is to, where, who wrote it, and its words. */
function lineKey(accountId: string, kind: InboxKind, thread: string, from: string, text: string): string {
  return createHash("sha256").update([accountId, kind, thread, from, text].join("\u0000")).digest("hex")
}

/**
 * Queues one read of an account's messages or comments, unless one is
 * already waiting or running for it, in which case that one will see this
 * too. Only an account on a phone, in use, not stopped by a ban screen.
 * Answers whether a read was queued.
 */
export async function queueInboxRead(
  userId: string,
  accountId: string,
  kind: InboxKind,
  via: "notification" | "inbox",
  db: CustomShellDb = defaultDb
): Promise<boolean> {
  const [account] = await db
    .select()
    .from(promoAccounts)
    .where(and(eq(promoAccounts.id, accountId), eq(promoAccounts.userId, userId)))
    .limit(1)
  if (!account?.phoneId || account.retiredAt || account.banScreenAt) return false
  if (kind === "comment" && !isPhoneAppNetwork(account.platform)) return false
  if (await pausedBy(userId, account, db)) return false
  const [waiting] = await db
    .select({ id: promoJobs.id })
    .from(promoJobs)
    .where(
      and(
        eq(promoJobs.userId, userId),
        eq(promoJobs.kind, "inbox_read"),
        inArray(promoJobs.status, ["queued", "running"]),
        sql`${promoJobs.payload}->>'accountId' = ${accountId}`,
        sql`${promoJobs.payload}->>'inboxKind' = ${kind}`
      )
    )
    .limit(1)
  if (waiting) return false
  await queueJob(userId, "inbox_read", { accountId, inboxKind: kind, via }, db)
  return true
}

/**
 * The alerts a rack's check-in carried for one phone: each one queues a read
 * for the phone's account on that app. An alert from an app with no account
 * on the phone is left alone.
 */
export async function noteAppAlerts(
  userId: string,
  phoneId: string,
  alerts: AppAlert[],
  db: CustomShellDb = defaultDb
): Promise<number> {
  if (!alerts.length) return 0
  const accounts = await db
    .select({ id: promoAccounts.id, platform: promoAccounts.platform })
    .from(promoAccounts)
    .where(and(eq(promoAccounts.userId, userId), eq(promoAccounts.phoneId, phoneId), isNull(promoAccounts.retiredAt)))
  let queued = 0
  const asked = new Set<string>()
  for (const alert of alerts) {
    const account = accounts.find((row) => row.platform === alert.app)
    const kind: InboxKind = alert.kind === "comment" ? "comment" : "message"
    if (!account || asked.has(`${account.id}:${kind}`)) continue
    asked.add(`${account.id}:${kind}`)
    if (await queueInboxRead(userId, account.id, kind, "notification", db)) queued += 1
  }
  return queued
}

/** Runs an `inbox_read` job on the account's phone, and keeps what is new. */
export async function runInboxRead(
  userId: string,
  account: AccountRow,
  target: CommandTarget,
  payload: Record<string, unknown>,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<void> {
  if (!isNetwork(account.platform) || account.platform === "medium") {
    throw new Refusal("That account is on a network whose inbox Promo does not read.")
  }
  const kind: InboxKind = payload.inboxKind === "comment" ? "comment" : "message"
  const via = payload.via === "inbox" ? "inbox" : "notification"
  const reading = await appInbox(target, account.platform, { kind, via, handle: account.handle })
  await storeInboxReading(userId, account, reading, db, now)
}

/**
 * Keeps what a read found that was not listed before. A conversation with a
 * new line from the other person opens, or opens again, with its newest
 * lines; its own lines are shown for context. A comment not seen before is
 * listed once. Each new row rings the bell. Answers how many rows opened.
 */
async function storeInboxReading(
  userId: string,
  account: Pick<AccountRow, "id" | "platform" | "handle" | "projectId">,
  reading: AppInboxReading,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<number> {
  let opened = 0
  const name = handleWords(account.platform, account.handle) || "your account"
  const network = isNetwork(account.platform) ? NETWORK_NAMES[account.platform] : account.platform

  for (const conversation of reading.conversations) {
    const thread = clean(conversation.thread, 200)
    if (!thread) continue
    const lines: InboxLine[] = conversation.lines
      .map((line) => ({ from: clean(line.from, 120), text: clean(line.text, 4_000), mine: line.mine }))
      .filter((line) => line.text)
      .slice(-INBOX_LINES_KEPT)
    const theirs = lines.filter((line) => !line.mine)
    const keys = theirs.map((line) => lineKey(account.id, "message", thread, line.from, line.text))
    const fresh = await unseen(account.id, keys, db)
    if (!fresh.length) continue
    const author = theirs[theirs.length - 1]?.from || thread
    const [existing] = await db
      .select({ id: promoInbox.id })
      .from(promoInbox)
      .where(and(eq(promoInbox.accountId, account.id), eq(promoInbox.kind, "message"), eq(promoInbox.thread, thread)))
      .limit(1)
    if (existing) {
      // The new lines show beside a reply on its way, which keeps going: the
      // status changes in the same statement only when none is, so a Send
      // pressed meanwhile is never undone.
      await db.update(promoInbox).set({ lines, author, updatedAt: now }).where(eq(promoInbox.id, existing.id))
      await db
        .update(promoInbox)
        .set({ status: "open" })
        .where(and(eq(promoInbox.id, existing.id), ne(promoInbox.status, "sending")))
      await remember(account.id, fresh, db, now)
      continue
    }
    await db.insert(promoInbox).values({
      id: uuid(),
      userId,
      accountId: account.id,
      platform: account.platform,
      kind: "message",
      thread,
      author,
      lines,
      createdAt: now,
      updatedAt: now,
    })
    // Remembered once kept, so a read that fails part-way lists them next time.
    await remember(account.id, fresh, db, now)
    opened += 1
    await ringBell(
      userId,
      {
        kind: "new_message",
        targetId: `${account.id}:${thread}`,
        message: `${NOTICE_HEADINGS.new_message} ${name} on ${network}`,
        // Who wrote and what is left out: a conversation is kept only while it
        // is open in Promo, and a notice outlives it.
        detail: `A new message to ${name}. It is on the Messages dashboard with a suggested answer; nothing is sent until you press Send.`,
        href: "/admin/messages",
      },
      db,
      now
    )
  }

  for (const comment of reading.comments) {
    const thread = clean(comment.thread, 200)
    const author = clean(comment.author, 120)
    const text = clean(comment.text, 4_000)
    if (!text || !author) continue
    const key = lineKey(account.id, "comment", thread, author, text)
    if (!(await unseen(account.id, [key], db)).length) continue
    const id = uuid()
    await db.insert(promoInbox).values({
      id,
      userId,
      accountId: account.id,
      platform: account.platform,
      kind: "comment",
      thread,
      author,
      lines: [{ from: author, text, mine: false }],
      createdAt: now,
      updatedAt: now,
    })
    await remember(account.id, [key], db, now)
    opened += 1
    await ringBell(
      userId,
      {
        kind: "new_comment",
        targetId: id,
        message: `${NOTICE_HEADINGS.new_comment} ${name} on ${network}`,
        detail: `${author}: "${text.slice(0, 200)}". Answer it from the project's ${network} Comments tab; nothing is sent until you press Send.`,
        href: account.projectId
          ? `/admin/projects/${encodeURIComponent(account.projectId)}?network=${encodeURIComponent(account.platform)}&view=comments`
          : "/admin/projects",
      },
      db,
      now
    )
  }
  return opened
}

function clean(value: string, max: number): string {
  return value.replace(/\s+/g, " ").trim().slice(0, max)
}

async function unseen(accountId: string, keys: string[], db: CustomShellDb): Promise<string[]> {
  if (!keys.length) return []
  const seen = await db
    .select({ key: promoInboxSeen.key })
    .from(promoInboxSeen)
    .where(and(eq(promoInboxSeen.accountId, accountId), inArray(promoInboxSeen.key, keys)))
  const known = new Set(seen.map((row) => row.key))
  return [...new Set(keys.filter((key) => !known.has(key)))]
}

async function remember(accountId: string, keys: string[], db: CustomShellDb, now: Date): Promise<void> {
  if (!keys.length) return
  await db
    .insert(promoInboxSeen)
    .values(keys.map((key) => ({ accountId, key, seenAt: now })))
    .onConflictDoNothing()
}

export type InboxRow = {
  id: string
  kind: InboxKind
  platform: string
  account: { id: string; handle: string; projectId: string | null }
  thread: string
  author: string
  lines: InboxLine[]
  /** A reply whose job failed or was dropped reads as open again, with why. */
  status: InboxStatus
  draft: string
  replyText: string
  lastError: string
  updatedAt: Date
}

/**
 * The open conversations or comments, newest first. Messages across every
 * phone account, for the Messages dashboard; comments for one project's
 * network, for its Comments tab, answered and skipped ones included.
 */
export async function listInbox(
  userId: string,
  filter: { kind: "message" } | { kind: "comment"; projectId: string; platform: string },
  db: CustomShellDb = defaultDb
): Promise<InboxRow[]> {
  const rows = await db
    .select({
      item: promoInbox,
      handle: promoAccounts.handle,
      projectId: promoAccounts.projectId,
      jobStatus: promoJobs.status,
      jobError: promoJobs.lastError,
    })
    .from(promoInbox)
    .innerJoin(promoAccounts, eq(promoAccounts.id, promoInbox.accountId))
    .leftJoin(promoJobs, eq(promoJobs.id, promoInbox.jobId))
    .where(
      and(
        eq(promoInbox.userId, userId),
        eq(promoInbox.kind, filter.kind),
        ...(filter.kind === "comment"
          ? [eq(promoAccounts.projectId, filter.projectId), eq(promoInbox.platform, filter.platform)]
          : [])
      )
    )
    .orderBy(desc(promoInbox.updatedAt))
    .limit(500)
  return rows.map(({ item, handle, projectId, jobStatus, jobError }) => {
    // The job carrying the reply failed, or was dropped with its account's
    // other jobs by a ban screen: the reply did not reach the phone, or may
    // have, and a person decides.
    const lost = item.status === "sending" && (jobStatus === "failed" || jobStatus === null)
    return {
      id: item.id,
      kind: item.kind,
      platform: item.platform,
      account: { id: item.accountId, handle, projectId },
      thread: item.thread,
      author: item.author,
      lines: item.lines,
      status: lost ? "open" : item.status,
      draft: item.draft,
      replyText: item.replyText,
      lastError: lost ? jobError || "The phone did not send it. Check the app before sending again." : item.lastError,
      updatedAt: item.updatedAt,
    }
  })
}

async function ownItem(userId: string, inboxId: string, db: CustomShellDb) {
  const [row] = await db
    .select({ item: promoInbox, account: promoAccounts })
    .from(promoInbox)
    .innerJoin(promoAccounts, eq(promoAccounts.id, promoInbox.accountId))
    .where(and(eq(promoInbox.id, inboxId), eq(promoInbox.userId, userId)))
    .limit(1)
  if (!row) throw new Error("That message is not there any more. It may have been answered or skipped.")
  return row
}

/** The words the AI is given for an answer: the voice, its rules, what you make, and what was written. */
export function buildReplyPrompt(input: {
  network: string
  kind: InboxKind
  handle: string
  voice: string
  rules: string
  product: string
  thread: string
  lines: InboxLine[]
  max: number
}): string {
  const said = input.lines
    .map((line) => `${line.mine ? `You (${input.handle || "the account"})` : line.from || "Them"}: ${line.text}`)
    .join("\n")
  return [
    input.kind === "message"
      ? `You are answering a direct message on ${input.network}, as the account ${input.handle || "you"}.`
      : `You are answering a comment under your own ${input.network} post, as the account ${input.handle || "you"}.`,
    input.voice ? `How you write:\n${input.voice}` : "",
    input.rules ? `Rules you always follow:\n${input.rules}` : "",
    input.product ? `What you make, for context only. Mention it only if they asked about it:\n${input.product}` : "",
    input.kind === "comment" && input.thread ? `Your post begins: ${input.thread}` : "",
    `${input.kind === "message" ? "The conversation so far, oldest first" : "The comment"}:\n${said}`,
    `Write one answer, at most ${input.max} characters, as plain text. No quotation marks around it, no hashtags, no preamble.`,
  ]
    .filter(Boolean)
    .join("\n\n")
}

/** Writes an AI suggestion for an open conversation or comment, saves it on the row, and hands it back. */
export async function draftInboxReply(
  userId: string,
  inboxId: string,
  db: CustomShellDb = defaultDb
): Promise<string> {
  const { item, account } = await ownItem(userId, inboxId, db)
  const { provider, model, key } = await pickProvider()
  const words = await wordsForAccount(userId, account.id, db)
  const max = replyMax(item.kind, item.platform)
  const prompt = buildReplyPrompt({
    network: isNetwork(item.platform) ? NETWORK_NAMES[item.platform] : item.platform,
    kind: item.kind,
    handle: handleWords(account.platform, account.handle),
    voice: words.voice,
    rules: words.commentRules,
    product: await projectDescription(userId, account.projectId, db),
    thread: item.thread,
    lines: item.lines,
    max,
  })
  const draft = await askModel(
    {
      userId,
      provider,
      model,
      feature: item.kind === "message" ? "phone-message-reply" : "phone-comment-reply",
      metadata: { inboxId, platform: item.platform },
      prompt,
      key,
    },
    (answer) => {
      const text = answer.trim().replace(/^["“]|["”]$/g, "").trim().slice(0, max)
      if (!text) throw new Error(`${provider} answered, but nothing in the answer looked like a reply.`)
      return text
    }
  )
  await db.update(promoInbox).set({ draft }).where(eq(promoInbox.id, inboxId))
  return draft
}

/**
 * Sends a person's answer, from the account the message or comment came to,
 * on its phone: one `inbox_reply` job, tried once. Only an open row can be
 * answered, and taking it is one statement, so a second press while the
 * first is on its way is refused rather than sending twice.
 */
export async function sendInboxReply(
  userId: string,
  inboxId: string,
  text: string,
  db: CustomShellDb = defaultDb
): Promise<void> {
  const { item, account } = await ownItem(userId, inboxId, db)
  const words = text.trim()
  if (!words) throw new Error("Write the answer first.")
  const max = replyMax(item.kind, item.platform)
  if (words.length > max) throw new Error(`The answer is ${words.length} characters, and it may be ${max}. Shorten it first.`)
  if (item.status === "answered" || item.status === "skipped") {
    throw new Error("That one has been answered or skipped already, so nothing was sent.")
  }
  await refuseAccountCannotAnswer(userId, account, item.platform, db)

  // Taken in one statement, compared against what was read, so two presses
  // cannot both send. A reply whose job failed or was dropped reads as open
  // (`listInbox`), and may be sent again once a person has looked.
  const lost = item.status === "sending" && (await replyJobLost(item.jobId, db))
  if (item.status === "sending" && !lost) {
    throw new Error("An answer to that one is already on its way, so nothing more was sent.")
  }
  const jobId = uuid()
  const [taken] = await db
    .update(promoInbox)
    .set({ status: "sending", replyText: words, lastError: "", jobId })
    .where(
      and(
        eq(promoInbox.id, inboxId),
        eq(promoInbox.status, item.status),
        item.jobId ? eq(promoInbox.jobId, item.jobId) : isNull(promoInbox.jobId)
      )
    )
    .returning({ id: promoInbox.id })
  if (!taken) throw new Error("An answer to that one is already on its way, so nothing more was sent.")
  // `readTo` is the newest line the person saw when they pressed Send.
  await queueJob(
    userId,
    "inbox_reply",
    { accountId: account.id, inboxId, inboxKind: item.kind, text: words, readTo: item.updatedAt.toISOString() },
    db,
    null,
    jobId
  )
}

/** True when the job that was carrying a reply failed or is gone. */
async function replyJobLost(jobId: string | null, db: CustomShellDb): Promise<boolean> {
  if (!jobId) return true
  const [job] = await db.select({ status: promoJobs.status }).from(promoJobs).where(eq(promoJobs.id, jobId)).limit(1)
  return !job || job.status === "failed"
}

/** Refuses an answer the account's phone cannot send now, with what to do about it. */
async function refuseAccountCannotAnswer(
  userId: string,
  account: AccountRow,
  platform: string,
  db: CustomShellDb
): Promise<void> {
  const name = handleWords(account.platform, account.handle) || "This account"
  if (!account.phoneId) {
    throw new Error(`${name} is not on a phone any more, so it cannot answer here. Pick a phone for it on the Accounts dashboard.`)
  }
  if (account.retiredAt) throw new Error(`${name} is retired, so it does not answer. Bring it back on the Accounts dashboard first.`)
  if (account.banScreenAt) {
    throw new Error(`${name} hit a ban screen and was stopped. Let it run again from its settings on the Accounts dashboard once it is sorted.`)
  }
  const [phone] = await db
    .select({ name: promoPhones.name, kind: promoPhones.kind })
    .from(promoPhones)
    .where(eq(promoPhones.id, account.phoneId))
    .limit(1)
  const routine = platform === "reddit" ? "reddit/reply_message" : `${platform}/reply`
  if (!phone) throw new Error("That account's phone is not there any more. Pick where it runs on the Accounts dashboard.")
  const cannot = phoneStepRefusal(routine, phone.name)
  if (cannot) throw new Error(cannot)
  await refuseBrokenAction(userId, routine, phone.kind, db)
}

/**
 * Runs an `inbox_reply` job on the phone. Once the phone says it sent, a
 * conversation is deleted, words and all, since it is no longer open in
 * Promo; a comment stays, marked answered with what was sent. A conversation
 * that took a new line after Send was pressed stays open instead, so that
 * line is not deleted unread. A failure puts the row back as open with why,
 * and is never sent again by itself. Either way the job forgets the words.
 */
export async function runInboxReply(
  userId: string,
  account: AccountRow,
  target: CommandTarget,
  payload: Record<string, unknown>,
  jobId: string,
  db: CustomShellDb = defaultDb
): Promise<void> {
  const inboxId = String(payload.inboxId ?? "")
  const text = String(payload.text ?? "")
  const readTo = new Date(String(payload.readTo ?? ""))
  if (!inboxId || !text || Number.isNaN(readTo.getTime())) {
    throw new Error("That answer job is missing its message or its words.")
  }
  try {
    await sendOnPhone(userId, account, target, inboxId, text, readTo, jobId, db)
  } finally {
    await db
      .update(promoJobs)
      .set({ payload: { accountId: account.id, inboxId, inboxKind: payload.inboxKind } })
      .where(eq(promoJobs.id, jobId))
  }
}

async function sendOnPhone(
  userId: string,
  account: AccountRow,
  target: CommandTarget,
  inboxId: string,
  text: string,
  readTo: Date,
  jobId: string,
  db: CustomShellDb
): Promise<void> {
  const [item] = await db
    .select()
    .from(promoInbox)
    .where(and(eq(promoInbox.id, inboxId), eq(promoInbox.userId, userId), eq(promoInbox.accountId, account.id)))
    .limit(1)
  if (!item) throw new Refusal("That message was skipped or deleted before the phone got to it. Nothing was sent.")
  if (item.status !== "sending" || item.jobId !== jobId) {
    throw new Refusal("That message is not waiting for this answer any more. Nothing was sent.")
  }
  if (!isNetwork(item.platform) || item.platform === "medium") throw new Refusal("That message is on a network Promo does not answer.")
  const quote = [...item.lines].reverse().find((line) => !line.mine)
  try {
    const answer = await appReply(target, item.platform, {
      kind: item.kind,
      thread: item.thread,
      author: item.author,
      quote: quote?.text ?? "",
      text,
    })
    if (!answer.sent) throw new Error("The phone pressed Send but could not see the answer go out. Check the app before sending again.")
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await db
      .update(promoInbox)
      .set({ status: "open", lastError: message.slice(0, 2_000) })
      .where(and(eq(promoInbox.id, inboxId), eq(promoInbox.jobId, jobId)))
    throw error
  }
  if (item.kind === "message") {
    const mine = and(eq(promoInbox.id, inboxId), eq(promoInbox.jobId, jobId))
    const [gone] = await db
      .delete(promoInbox)
      .where(and(mine, lte(promoInbox.updatedAt, readTo)))
      .returning({ id: promoInbox.id })
    if (!gone) {
      await db
        .update(promoInbox)
        .set({ status: "open", jobId: null, draft: "", replyText: "", lastError: "" })
        .where(mine)
    }
  } else {
    await db.update(promoInbox).set({ status: "answered", lastError: "" }).where(eq(promoInbox.id, inboxId))
  }
}

/**
 * Skips conversations or comments. A conversation is deleted, words and all;
 * a comment stays, marked skipped. One with an answer on its way is left
 * alone, unless that answer's job failed or was dropped (`listInbox` shows it
 * as open). Answers which were done and which were not.
 */
export async function skipInbox(
  userId: string,
  ids: string[],
  db: CustomShellDb = defaultDb
): Promise<{ completed: string[]; skipped: string[] }> {
  if (!ids.length) return { completed: [], skipped: [] }
  const onItsWay = db
    .select({ id: promoJobs.id })
    .from(promoJobs)
    .where(and(eq(promoJobs.id, promoInbox.jobId), ne(promoJobs.status, "failed")))
  const mine = and(
    eq(promoInbox.userId, userId),
    inArray(promoInbox.id, ids),
    or(ne(promoInbox.status, "sending"), notExists(onItsWay))
  )
  const gone = await db
    .delete(promoInbox)
    .where(and(mine, eq(promoInbox.kind, "message")))
    .returning({ id: promoInbox.id })
  const marked = await db
    .update(promoInbox)
    .set({ status: "skipped" })
    .where(and(mine, eq(promoInbox.kind, "comment")))
    .returning({ id: promoInbox.id })
  const completed = [...gone, ...marked].map((row) => row.id)
  return { completed, skipped: ids.filter((id) => !completed.includes(id)) }
}

/** Asks an account's phone to read its messages now, from the Messages dashboard's Check now. */
export async function checkInboxNow(
  userId: string,
  accountId: string,
  db: CustomShellDb = defaultDb
): Promise<boolean> {
  return queueInboxRead(userId, accountId, "message", "inbox", db)
}
