import { and, desc, eq, inArray, isNotNull, isNull, lt, ne, or, sql } from "drizzle-orm"

import type { CommandTarget } from "@/server/browser/command"
import { Refusal } from "@/server/browser/refusal"
import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { NOTICE_HEADINGS } from "@/lib/social/notice-words"
import { MAX_RESPONSE_CHARS, type MediumIncoming } from "@/lib/social/medium/options"

import { queueJob, TryAgainLater } from "../jobs"
import { titleWords } from "../title-words"
import { noticeRung, ringBell } from "../notices"
import { promoAccounts, promoJobs } from "../schema"
import { mediumCheck, mediumDelete, mediumEdit, mediumFindResponse, mediumRespond, type MediumIncomingRead } from "./calls"
import { markStoryReplied } from "./finds"
import { mediumPostingRefusal } from "@/lib/social/medium/wording"
import { queueMediumAnswer, queueMediumResponse, readMediumPostingState, refuseOnPhone, writingAccount, type QueuedResponse } from "./posting"
import { refuseTooSimilar } from "./similar"
import { promoMediumArticles, promoMediumFinds, promoMediumKeywords, promoMediumResponses } from "./schema"

/**
 * The responses that went out on Medium, or tried to (parts 17, 35, 36, 37,
 * 38 and 39): sending one from the account's browser, the Responses tab,
 * reading each one again once a day, the responses people wrote under ours,
 * editing and deleting one, and the Failed list with Try again.
 */

type ResponseRow = typeof promoMediumResponses.$inferSelect

/** A sent response is read again once this long after its last reading. */
const CHECK_EVERY_MS = 24 * 3_600_000

/** One pass of the ticker asks for at most this many checks for a person. */
const CHECKS_PER_PASS = 20

/** The incoming responses as the app stores them. */
function incomingFrom(reads: MediumIncomingRead[]): MediumIncoming[] {
  return reads
    .filter((item) => !item.hidden && !item.deleted)
    .map((item) => ({
      id: item.id,
      writerId: item.writerId,
      writer: item.writer,
      text: item.text,
      claps: item.claps,
      postedAt: item.postedSeconds ? new Date(item.postedSeconds * 1000).toISOString() : null,
    }))
}

/** The project's Medium tags, which the visit before a response reads in. */
async function projectTags(userId: string, projectId: string | null, db: CustomShellDb): Promise<string[]> {
  if (!projectId) return []
  const rows = await db
    .select({ value: promoMediumKeywords.value })
    .from(promoMediumKeywords)
    .where(
      and(
        eq(promoMediumKeywords.userId, userId),
        eq(promoMediumKeywords.projectId, projectId),
        eq(promoMediumKeywords.kind, "tag")
      )
    )
  return rows.map((row) => row.value).slice(0, 10)
}

/**
 * Sends one waiting response from its account's browser. The row says what
 * happened either way, and a failure is thrown on so the job fails and the
 * bell rings. Never tried twice: the job is a write.
 */
export async function runMediumRespond(
  userId: string,
  responseId: string,
  target: CommandTarget,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<void> {
  const [row] = await db
    .select()
    .from(promoMediumResponses)
    .where(and(eq(promoMediumResponses.id, responseId), eq(promoMediumResponses.userId, userId)))
    .limit(1)
  if (!row) throw new Refusal("That response was taken back before it went.")
  if (row.status !== "waiting") throw new Refusal("That response has been dealt with already.")
  const tags = await projectTags(userId, row.projectId, db)
  // Only the send itself can fail the row. Once Medium has it, nothing after
  // may mark it failed, or Try again would send it a second time.
  let sent: Awaited<ReturnType<typeof mediumRespond>>
  try {
    sent = await mediumRespond(target, { storyId: row.storyId, text: row.text, line: row.line, tags })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await db
      .update(promoMediumResponses)
      .set({ status: "failed", lastError: message.slice(0, 2_000) })
      .where(eq(promoMediumResponses.id, row.id))
    throw error
  }
  await db
    .update(promoMediumResponses)
    .set({ status: "posted", responseId: sent.responseId.slice(0, 16), responseUrl: sent.responseUrl.slice(0, 600), postedAt: now, lastError: "" })
    .where(eq(promoMediumResponses.id, row.id))
  await db.update(promoAccounts).set({ lastPostedAt: now }).where(eq(promoAccounts.id, row.accountId))
  if (row.findId) await markStoryReplied(userId, row.storyId, db)
  // A phone's Medium app does not show where a response landed, so the
  // reader looks it up under the story a minute later. With no reader to do
  // it, the response stays posted without its address.
  if (!sent.responseId) {
    try {
      await queueJob(userId, "medium_find", { responseId: row.id }, db, new Date(now.getTime() + 60_000))
    } catch (error) {
      console.warn(`Medium response ${row.id} went out, but its address cannot be looked up: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
}

export type MediumResponseView = {
  id: string
  account: { id: string; handle: string } | null
  storyId: string
  storyUrl: string
  storyTitle: string
  text: string
  line: string
  helpOnly: boolean
  status: ResponseRow["status"]
  responseUrl: string
  lastError: string
  /** Null until read; "not read yet" is never shown as 0 or "gone". */
  claps: number | null
  stillVisible: boolean | null
  checkedAt: Date | null
  /** The responses under ours, null until a check has read them. */
  incoming: MediumIncoming[] | null
  /** The ones of those nobody has answered from Promo yet. */
  toAnswer: number
  /** For an answer: what it answered. */
  replyTo: MediumIncoming | null
  isAnswer: boolean
  editedAt: Date | null
  deletedAt: Date | null
  createdAt: Date
  postedAt: Date | null
  /** True when the failed one may be on Medium anyway, because the browser stopped after Respond. */
  mayHaveLanded: boolean
}

/** The ids of incoming responses Promo already answered or is answering, by the story they sit under. */
export async function answeredIds(userId: string, db: CustomShellDb): Promise<Set<string>> {
  const rows = await db
    .select({ storyId: promoMediumResponses.storyId })
    .from(promoMediumResponses)
    .where(
      and(
        eq(promoMediumResponses.userId, userId),
        or(isNotNull(promoMediumResponses.parentId), isNotNull(promoMediumResponses.articleId)),
        inArray(promoMediumResponses.status, ["waiting", "posted"])
      )
    )
  return new Set(rows.map((row) => row.storyId))
}

/** How many incoming responses under a row nobody has answered. */
export function toAnswerCount(incoming: MediumIncoming[] | null, answered: Set<string>): number {
  return (incoming ?? []).filter((item) => !answered.has(item.id)).length
}

function view(row: ResponseRow, handle: string | null, answered: Set<string>): MediumResponseView {
  return {
    id: row.id,
    account: handle === null ? null : { id: row.accountId, handle },
    storyId: row.storyId,
    storyUrl: row.storyUrl,
    storyTitle: row.storyTitle,
    text: row.text,
    line: row.line,
    helpOnly: row.helpOnly,
    status: row.status,
    responseUrl: row.responseUrl,
    lastError: row.lastError,
    claps: row.claps,
    stillVisible: row.stillVisible,
    checkedAt: row.checkedAt,
    incoming: row.incoming,
    toAnswer: toAnswerCount(row.incoming, answered),
    replyTo: row.replyTo,
    isAnswer: Boolean(row.parentId || row.articleId),
    editedAt: row.editedAt,
    deletedAt: row.deletedAt,
    createdAt: row.createdAt,
    postedAt: row.postedAt,
    mayHaveLanded: row.status === "failed" && /may already be on Medium/i.test(row.lastError),
  }
}

/**
 * The Responses tab: every response this project's accounts sent, newest
 * first (`sent`), or the ones that did not go out and nobody has dealt with
 * yet (`failed`).
 */
export async function listMediumResponses(
  userId: string,
  projectId: string,
  list: "sent" | "failed",
  db: CustomShellDb = defaultDb
): Promise<MediumResponseView[]> {
  const rows = await db
    .select({ row: promoMediumResponses, handle: promoAccounts.handle, dismissedAt: promoJobs.dismissedAt })
    .from(promoMediumResponses)
    .leftJoin(promoAccounts, eq(promoAccounts.id, promoMediumResponses.accountId))
    .leftJoin(promoJobs, eq(promoJobs.id, promoMediumResponses.jobId))
    .where(
      and(
        eq(promoMediumResponses.userId, userId),
        eq(promoMediumResponses.projectId, projectId),
        list === "failed"
          ? eq(promoMediumResponses.status, "failed")
          : ne(promoMediumResponses.status, "failed")
      )
    )
    .orderBy(desc(promoMediumResponses.createdAt))
    .limit(300)
  const answered = await answeredIds(userId, db)
  return rows
    .filter((item) => list !== "failed" || !item.dismissedAt)
    .map((item) => view(item.row, item.handle, answered))
}

/** A response of the person's, or a refusal. */
async function ownedResponse(userId: string, responseId: string, db: CustomShellDb): Promise<ResponseRow> {
  const [row] = await db
    .select()
    .from(promoMediumResponses)
    .where(and(eq(promoMediumResponses.id, responseId), eq(promoMediumResponses.userId, userId)))
    .limit(1)
  if (!row) throw new Error("That response is not one Promo sent.")
  return row
}

export type PastMediumAnswer = { id: string; storyTitle: string; text: string; claps: number | null; responseUrl: string; postedAt: Date | null }

/**
 * What you said before on stories like this one (part 16): up to three
 * responses that landed and are still up, under the same keyword first,
 * then by how many words their story's title shares with this one's. The
 * same rule as Reddit's past answers, over Medium's own responses.
 */
export async function pastMediumAnswers(
  userId: string,
  find: { id: string; storyId: string; keywordId: string; title: string },
  db: CustomShellDb = defaultDb
): Promise<PastMediumAnswer[]> {
  const rows = await db
    .select({
      id: promoMediumResponses.id,
      storyTitle: promoMediumResponses.storyTitle,
      text: promoMediumResponses.text,
      claps: promoMediumResponses.claps,
      responseUrl: promoMediumResponses.responseUrl,
      postedAt: promoMediumResponses.postedAt,
      keywordId: promoMediumFinds.keywordId,
    })
    .from(promoMediumResponses)
    .leftJoin(promoMediumFinds, eq(promoMediumFinds.id, promoMediumResponses.findId))
    .where(
      and(
        eq(promoMediumResponses.userId, userId),
        eq(promoMediumResponses.status, "posted"),
        isNull(promoMediumResponses.parentId),
        isNull(promoMediumResponses.articleId),
        isNull(promoMediumResponses.deletedAt),
        ne(promoMediumResponses.storyId, find.storyId)
      )
    )
    .orderBy(desc(promoMediumResponses.postedAt))
    .limit(300)
  const wanted = titleWords(find.title)
  return rows
    .map((row) => {
      const shared = [...titleWords(row.storyTitle)].filter((word) => wanted.has(word)).length
      return { row, score: (row.keywordId === find.keywordId ? 100 : 0) + shared }
    })
    // A response under another keyword sharing one word is a coincidence.
    .filter((item) => item.score >= 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(({ row }) => ({
      id: row.id,
      storyTitle: row.storyTitle,
      text: row.text,
      claps: row.claps,
      responseUrl: row.responseUrl,
      postedAt: row.postedAt,
    }))
}

/**
 * Asks for a fresh reading of sent responses: the ones named, or, from the
 * ticker, those whose last reading is a day old. Read in the reader browser,
 * signed in to nobody, so the check is how a stranger sees it.
 */
export async function queueResponseChecks(
  userId: string,
  responseIds: string[] | null,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<number> {
  if (responseIds && !responseIds.length) return 0
  const due = await db
    .select({ id: promoMediumResponses.id })
    .from(promoMediumResponses)
    .where(
      and(
        eq(promoMediumResponses.userId, userId),
        eq(promoMediumResponses.status, "posted"),
        isNull(promoMediumResponses.deletedAt),
        responseIds
          ? inArray(promoMediumResponses.id, responseIds)
          : or(isNull(promoMediumResponses.checkedAt), lt(promoMediumResponses.checkedAt, new Date(now.getTime() - CHECK_EVERY_MS)))
      )
    )
    .limit(responseIds ? 50 : CHECKS_PER_PASS)
  const waiting = await db
    .select({ payload: promoJobs.payload })
    .from(promoJobs)
    .where(and(eq(promoJobs.userId, userId), eq(promoJobs.kind, "medium_check"), inArray(promoJobs.status, ["queued", "running"])))
  const already = new Set(waiting.map((job) => String(job.payload?.responseId ?? "")))
  let queued = 0
  for (const row of due) {
    if (already.has(row.id)) continue
    await queueJob(userId, "medium_check", { responseId: row.id }, db)
    queued += 1
  }
  return queued
}

/**
 * Writes one response's fresh reading. A new response under ours rings the
 * bell once (part 39), as does one of ours that has gone: hidden by the
 * story's writer, by Medium, or deleted.
 */
export async function recordResponseCheck(
  userId: string,
  responseId: string,
  target: CommandTarget,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<void> {
  const row = await ownedResponse(userId, responseId, db)
  if (!row.responseId) throw new Refusal("That response never landed, so there is nothing to read.")
  // The story it sits under: the story itself, or for an answer the
  // response it answered, which is a story of its own on Medium.
  const read = await mediumCheck(target, { storyId: row.storyId, responseId: row.responseId })
  const incoming = incomingFrom(read.incoming)
  const before = new Set((row.incoming ?? []).map((item) => item.id))
  await db
    .update(promoMediumResponses)
    .set({
      claps: read.claps,
      replyCount: incoming.length,
      stillVisible: read.visible,
      checkedAt: now,
      incoming,
    })
    .where(eq(promoMediumResponses.id, row.id))

  const href = row.projectId
    ? `/admin/projects/${encodeURIComponent(row.projectId)}?network=medium&tab=responses&open=${encodeURIComponent(row.id)}`
    : "/admin/projects"
  if (row.stillVisible !== false && !read.visible && !row.deletedAt) {
    await ringBell(
      userId,
      {
        kind: "medium_gone",
        targetId: row.id,
        message: `${NOTICE_HEADINGS.medium_gone} your response on "${row.storyTitle.slice(0, 80)}"`,
        detail: "It no longer shows under the story. The story's writer or Medium hid it, or it was deleted.",
        href,
      },
      db,
      now
    )
  }
  for (const item of incoming) {
    if (before.has(item.id) || (await noticeRung("medium_reply", item.id, db))) continue
    await ringBell(
      userId,
      {
        kind: "medium_reply",
        targetId: item.id,
        message: `${NOTICE_HEADINGS.medium_reply} from ${item.writer ? `@${item.writer}` : "a reader"}`,
        detail: item.text.slice(0, 300),
        href,
      },
      db,
      now
    )
  }
}

/**
 * Queues an edit or a delete of a sent response or a published article
 * (part 37), from the account that wrote it. Each goes through the same
 * pause, warm-up, pace and waking checks as a new response, since each is
 * another visit to Medium, and an edit's new words through the too-similar
 * check too.
 */
export async function queueMediumChange(
  userId: string,
  input: { responseId?: string; articleId?: string; action: "edit" | "delete"; text?: string; title?: string },
  db: CustomShellDb = defaultDb
): Promise<string> {
  const kind = input.action === "edit" ? "medium_edit" : "medium_delete"
  let accountId: string
  if (input.responseId) {
    const row = await ownedResponse(userId, input.responseId, db)
    if (row.status !== "posted" || !row.responseId) throw new Refusal("Only a response that landed can be changed.")
    if (row.deletedAt) throw new Refusal("That response is deleted already.")
    accountId = row.accountId
    if (input.action === "edit") {
      const text = (input.text ?? "").trim()
      if (!text) throw new Refusal("Write the new words first.")
      if (text.length > MAX_RESPONSE_CHARS) throw new Refusal(`Medium responses here stop at ${MAX_RESPONSE_CHARS} characters.`)
      if (text === row.text) throw new Refusal("Those are the words it has already.")
    }
  } else if (input.articleId) {
    const [article] = await db
      .select()
      .from(promoMediumArticles)
      .where(and(eq(promoMediumArticles.id, input.articleId), eq(promoMediumArticles.userId, userId)))
      .limit(1)
    if (!article || article.status !== "published" || !article.storyId || !article.accountId) {
      throw new Refusal("Only an article that was published can be changed on Medium.")
    }
    if (article.deletedAt) throw new Refusal("That article is deleted already.")
    accountId = article.accountId
    if (input.action === "edit" && !(input.text ?? "").trim()) throw new Refusal("Write the new words first.")
  } else {
    throw new Error("Name the response or the article to change.")
  }
  const owner = await writingAccount(userId, accountId, db)
  refuseOnPhone(owner, input.action === "edit" ? "Editing on Medium" : "Deleting on Medium")
  const state = await readMediumPostingState(userId, owner, db)
  const refusal = mediumPostingRefusal(state, new Date(), state.timeZone)
  if (refusal) throw new Refusal(refusal)
  if (input.action === "edit") await refuseTooSimilar(userId, accountId, (input.text ?? "").trim(), db)
  const [busy] = await db
    .select({ id: promoJobs.id })
    .from(promoJobs)
    .where(
      and(
        eq(promoJobs.userId, userId),
        inArray(promoJobs.kind, ["medium_edit", "medium_delete"]),
        inArray(promoJobs.status, ["queued", "running"]),
        input.responseId
          ? sql`${promoJobs.payload}->>'responseId' = ${input.responseId}`
          : sql`${promoJobs.payload}->>'articleId' = ${input.articleId ?? ""}`
      )
    )
    .limit(1)
  if (busy) throw new Refusal("A change to that one is already on its way.")
  return queueJob(
    userId,
    kind,
    {
      accountId,
      ...(input.responseId ? { responseId: input.responseId } : { articleId: input.articleId }),
      ...(input.action === "edit" ? { text: (input.text ?? "").trim(), title: (input.title ?? "").trim() } : {}),
    },
    db
  )
}

/** Runs an edit or a delete in the account's browser and writes down what it found afterwards. */
export async function runMediumChange(
  userId: string,
  kind: "medium_edit" | "medium_delete",
  payload: Record<string, unknown>,
  target: CommandTarget,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<void> {
  const responseId = typeof payload.responseId === "string" ? payload.responseId : ""
  const articleId = typeof payload.articleId === "string" ? payload.articleId : ""
  const text = typeof payload.text === "string" ? payload.text : ""
  const title = typeof payload.title === "string" ? payload.title : ""
  if (responseId) {
    const row = await ownedResponse(userId, responseId, db)
    if (kind === "medium_delete") {
      const { done } = await mediumDelete(target, { storyId: row.responseId })
      if (!done) throw new Error("Delete was pressed but the response still shows on Medium. Look at it there.")
      await db.update(promoMediumResponses).set({ deletedAt: now, stillVisible: false }).where(eq(promoMediumResponses.id, row.id))
    } else {
      const { done } = await mediumEdit(target, { storyId: row.responseId, text })
      if (!done) throw new Error("Save was pressed but Medium still shows the old words. Look at it there.")
      await db
        .update(promoMediumResponses)
        .set({ text, editedAt: now, originalText: row.originalText ?? row.text })
        .where(eq(promoMediumResponses.id, row.id))
    }
    return
  }
  if (!articleId) throw new Error("That change names no response or article.")
  const [article] = await db
    .select()
    .from(promoMediumArticles)
    .where(and(eq(promoMediumArticles.id, articleId), eq(promoMediumArticles.userId, userId)))
    .limit(1)
  if (!article || !article.storyId) throw new Error("That article is not one Promo published.")
  if (kind === "medium_delete") {
    const { done } = await mediumDelete(target, { storyId: article.storyId })
    if (!done) throw new Error("Delete was pressed but the article still shows on Medium. Look at it there.")
    await db.update(promoMediumArticles).set({ deletedAt: now, stillVisible: false, updatedAt: now }).where(eq(promoMediumArticles.id, article.id))
  } else {
    const { done } = await mediumEdit(target, { storyId: article.storyId, text, title: title || article.title })
    if (!done) throw new Error("Save was pressed but Medium still shows the old words. Look at it there.")
    await db
      .update(promoMediumArticles)
      .set({ body: text, ...(title ? { title } : {}), editedAt: now, updatedAt: now })
      .where(eq(promoMediumArticles.id, article.id))
  }
}

/**
 * Takes a failed response off the Failed list without sending it again.
 * The record stays.
 */
export async function dismissFailedResponse(userId: string, responseId: string, db: CustomShellDb = defaultDb): Promise<void> {
  const row = await ownedResponse(userId, responseId, db)
  if (row.status !== "failed" || !row.jobId) throw new Error("That response did not fail.")
  await db.update(promoJobs).set({ dismissedAt: new Date() }).where(and(eq(promoJobs.id, row.jobId), eq(promoJobs.userId, userId)))
}

/**
 * Try again on a failed response (part 38): the same words, from the same
 * account, through every check a first press goes through. The first try's
 * record stays, off the Failed list. A first try that landed after all is
 * not sent twice: the browser looks for it under the story before typing,
 * and reports it as sent when it is there (`medium_respond` in
 * `docker/browser/routines/medium.py`).
 */
export async function retryFailedResponse(
  userId: string,
  responseId: string,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<QueuedResponse> {
  const row = await ownedResponse(userId, responseId, db)
  if (row.status !== "failed") throw new Error("That response did not fail.")
  // Taken off the Failed list first, and only once, so a second press or a
  // stale tab cannot send the same words again after the first try lands.
  if (row.jobId) {
    const taken = await db
      .update(promoJobs)
      .set({ dismissedAt: now })
      .where(and(eq(promoJobs.id, row.jobId), eq(promoJobs.userId, userId), isNull(promoJobs.dismissedAt)))
      .returning({ id: promoJobs.id })
    if (!taken.length) throw new Refusal("That response was already tried again or dismissed.")
  }
  try {
    if (row.parentId || row.articleId) {
      if (!row.replyTo) throw new Error("That answer no longer says what it answered.")
      return await queueMediumAnswer(
        userId,
        {
          under: row.parentId ? { responseId: row.parentId } : { articleId: row.articleId ?? "" },
          incomingId: row.replyTo.id,
          text: row.text,
        },
        db,
        now
      )
    }
    if (!row.findId) throw new Refusal("The story this was for has been tidied away, so it cannot be sent from here again.")
    return await queueMediumResponse(
      userId,
      { findId: row.findId, accountId: row.accountId, text: row.text, line: row.line, helpOnly: row.helpOnly },
      db,
      now
    )
  } catch (error) {
    // Refused, so it stays on the Failed list to try again later.
    if (row.jobId) await db.update(promoJobs).set({ dismissedAt: null }).where(eq(promoJobs.id, row.jobId))
    throw error
  }
}

/**
 * Finds Medium's id for a response a phone sent, by the account's name and
 * the opening words, and writes its address. Not found yet is tried again a
 * little later, three times, since a new response can take a moment to show.
 */
export async function findPhoneResponse(
  userId: string,
  responseId: string,
  target: CommandTarget,
  db: CustomShellDb = defaultDb
): Promise<void> {
  const [row] = await db
    .select({ response: promoMediumResponses, handle: promoAccounts.handle })
    .from(promoMediumResponses)
    .innerJoin(promoAccounts, eq(promoAccounts.id, promoMediumResponses.accountId))
    .where(and(eq(promoMediumResponses.id, responseId), eq(promoMediumResponses.userId, userId)))
    .limit(1)
  if (!row) throw new Refusal("That response is not one Promo sent.")
  if (row.response.responseId) return
  const found = await mediumFindResponse(target, { storyId: row.response.storyId, writer: row.handle, text: row.response.text })
  if (!found.responseId) throw new TryAgainLater("The response is not under the story yet.", 5 * 60_000)
  await db
    .update(promoMediumResponses)
    .set({ responseId: found.responseId.slice(0, 16), responseUrl: `https://medium.com/p/${found.responseId}` })
    .where(eq(promoMediumResponses.id, row.response.id))
}
