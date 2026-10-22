import { and, asc, eq, gt, gte, inArray, isNull, sql } from "drizzle-orm"

import { Refusal } from "@/server/browser/refusal"
import { uuid } from "@/server/auth/security"
import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { MAX_RESPONSE_CHARS, MEDIUM_WARM_UP_DAYS } from "@/lib/social/medium/options"
import { mediumPostingRefusal, type MediumPostingState } from "@/lib/social/medium/wording"
import { paceCounts, paceLimit } from "@/lib/social/pace"
import { isAwake, nextWakeAt } from "@/lib/social/waking"
import { handleWords } from "@/lib/social/networks"

import { accountTimeZone, isYoung, readBehaviour, warmUpEndsAt } from "../behaviour"
import { queueJob } from "../jobs"
import { pausedBy } from "../pause"
import { promoAccounts, promoJobs } from "../schema"
import { ownedMediumFind } from "./finds"
import { promoMediumArticles, promoMediumDrafts, promoMediumResponses } from "./schema"
import { refuseTooSimilar } from "./similar"

/**
 * Whether a Medium account may write now, and sending a response or an
 * answer (parts 3, 4, 17, 21, 22, 23 and 25).
 *
 * The same three things hold Medium back as Reddit, from Settings →
 * Behaviour, with Medium's own warm-up. A warming account is refused until
 * 7 days after Medium says it joined (Tyler, 21 Oct 2026: "7 days"). A
 * young account, under the young days, is held to Reddit's per-hour and
 * per-day numbers (Tyler: "Same as Reddit"). Outside the account's waking
 * hours a response is not refused: it waits for its morning.
 *
 * Responses and articles both count against the pace: they are the account
 * writing on Medium, and pace is about that. Nothing here posts. A person
 * pressing Post is the only way a response is written, and it can be taken
 * back for ten seconds, as on Reddit (Tyler, 12 Oct 2026).
 */

type AccountRow = typeof promoAccounts.$inferSelect

const DAY_MS = 86_400_000

/** Ten seconds to undo, the number Tyler picked for Reddit on 12 Oct 2026. */
const UNDO_SECONDS = 10

/** The account's Medium writing that went out in the last day, and what is waiting to go. */
async function recentWriting(
  userId: string,
  accountId: string,
  db: CustomShellDb,
  now: Date
): Promise<{ posted: Date[]; waiting: number }> {
  const since = new Date(now.getTime() - DAY_MS)
  const responses = await db
    .select({ at: promoMediumResponses.postedAt })
    .from(promoMediumResponses)
    .where(
      and(
        eq(promoMediumResponses.userId, userId),
        eq(promoMediumResponses.accountId, accountId),
        eq(promoMediumResponses.status, "posted"),
        gte(promoMediumResponses.postedAt, since)
      )
    )
  const articles = await db
    .select({ at: promoMediumArticles.publishedAt })
    .from(promoMediumArticles)
    .where(
      and(
        eq(promoMediumArticles.userId, userId),
        eq(promoMediumArticles.accountId, accountId),
        eq(promoMediumArticles.status, "published"),
        gte(promoMediumArticles.publishedAt, since)
      )
    )
  const [pending] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(promoJobs)
    .where(
      and(
        eq(promoJobs.userId, userId),
        inArray(promoJobs.kind, ["medium_respond", "medium_publish"]),
        inArray(promoJobs.status, ["queued", "running"]),
        sql`${promoJobs.payload}->>'accountId' = ${accountId}`
      )
    )
  const posted = [...responses, ...articles]
    .flatMap((row) => (row.at ? [row.at] : []))
    .sort((a, b) => a.getTime() - b.getTime())
  return { posted, waiting: pending?.n ?? 0 }
}

export async function readMediumPostingState(
  userId: string,
  account: Pick<AccountRow, "id" | "profileId" | "phoneId" | "mediumJoinedAt" | "pausedAt" | "projectId" | "platform">,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<MediumPostingState> {
  const behaviour = await readBehaviour(userId, db)
  const timeZone = await accountTimeZone(account, db)
  const ends = warmUpEndsAt(account.mediumJoinedAt, MEDIUM_WARM_UP_DAYS, now)
  const young = isYoung(account.mediumJoinedAt, behaviour.youngDays, now)
  const { posted, waiting } = await recentWriting(userId, account.id, db, now)
  return {
    paused: await pausedBy(userId, account, db),
    timeZone,
    awake: isAwake(now, timeZone, behaviour.wakeFromMinute, behaviour.wakeUntilMinute),
    nextWakeAt: nextWakeAt(now, timeZone, behaviour.wakeFromMinute, behaviour.wakeUntilMinute),
    warmUp: { endsAt: ends ?? null, ageUnknown: ends === undefined },
    young,
    ...paceCounts(posted, now),
    warnPerHour: behaviour.warnPerHour,
    youngPerHour: behaviour.youngPerHour,
    youngPerDay: behaviour.youngPerDay,
    limit: young
      ? paceLimit({ posted, waiting, now, perHour: behaviour.youngPerHour, perDay: behaviour.youngPerDay })
      : null,
  }
}

/** A Medium account of the person's, still in use, or a refusal saying what is wrong with it. */
export async function writingAccount(
  userId: string,
  accountId: string,
  db: CustomShellDb = defaultDb
): Promise<AccountRow> {
  const [account] = await db
    .select()
    .from(promoAccounts)
    .where(and(eq(promoAccounts.id, accountId), eq(promoAccounts.userId, userId)))
    .limit(1)
  if (!account || account.platform !== "medium") throw new Refusal("Pick a Medium account first.")
  if (account.retiredAt) throw new Refusal("This account is retired. Bring it back on the Accounts dashboard first.")
  if (!account.profileId && !account.phoneId) {
    throw new Refusal("This Medium account has no browser profile or phone. Pick where it runs on the Accounts dashboard.")
  }
  if (!account.handle) {
    throw new Refusal(
      "Promo has not seen this account signed in to Medium. Sign it in, then press Check who is signed in on the Accounts dashboard."
    )
  }
  return account
}

/**
 * Refuses what the Medium app on a phone does not do (part 42). On a phone
 * the app reads who is signed in, sends responses and answers, and warms
 * up; everything else needs the account on a browser profile.
 */
export function refuseOnPhone(account: Pick<AccountRow, "phoneId" | "handle">, what: string): void {
  if (!account.phoneId) return
  throw new Refusal(
    `${account.handle ? handleWords("medium", account.handle) : "This account"} runs on a phone, and the Medium app there sends responses and answers only. ${what} needs a Medium account on a browser profile. Nothing was sent.`
  )
}

/**
 * Refuses when one of the person's accounts already responded on this story,
 * or has a response on its way (part 21). Every project counts: two accounts
 * from two projects meeting under one story is the same link.
 */
export async function refuseSecondAccountOnStory(
  userId: string,
  accountId: string,
  storyId: string,
  db: CustomShellDb = defaultDb
): Promise<void> {
  const [other] = await db
    .select({ handle: promoAccounts.handle, accountId: promoMediumResponses.accountId })
    .from(promoMediumResponses)
    .innerJoin(promoAccounts, eq(promoAccounts.id, promoMediumResponses.accountId))
    .where(
      and(
        eq(promoMediumResponses.userId, userId),
        eq(promoMediumResponses.storyId, storyId),
        sql`${promoMediumResponses.accountId} <> ${accountId}`,
        inArray(promoMediumResponses.status, ["waiting", "posted"]),
        isNull(promoMediumResponses.deletedAt)
      )
    )
    .limit(1)
  if (other) {
    throw new Refusal(
      `${other.handle ? handleWords("medium", other.handle) : "Another of your accounts"} already responded on this story. One of your accounts per story, so they are never seen together. Nothing was sent.`
    )
  }
}

export type QueuedResponse = { responseId: string; jobId: string; runAfter: Date | null; undoUntil: Date | null }

/** The checks every response and answer share, then the row and the job. */
async function queueWriting(
  userId: string,
  account: AccountRow,
  row: {
    storyId: string
    storyUrl: string
    storyTitle: string
    text: string
    line: string
    helpOnly: boolean
    findId: string | null
    draftId: string | null
    parentId: string | null
    articleId: string | null
    replyTo: typeof promoMediumResponses.$inferInsert.replyTo
    sentBy?: string | null
  },
  db: CustomShellDb,
  now: Date
): Promise<QueuedResponse> {
  const text = row.text.trim()
  if (!text) throw new Refusal("Write the response first.")
  if (text.length > MAX_RESPONSE_CHARS) {
    throw new Refusal(`The response is ${text.length} characters. Medium responses here stop at ${MAX_RESPONSE_CHARS}.`)
  }
  // Checked and written under locks on the story and the account, so two
  // presses at once, from one account or two, cannot both pass the checks.
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`promo-medium-story:${userId}:${row.storyId}`}))`)
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`promo-medium-write:${account.id}`}))`)
    const [onItsWay] = await tx
      .select({ id: promoMediumResponses.id })
      .from(promoMediumResponses)
      .where(
        and(
          eq(promoMediumResponses.userId, userId),
          eq(promoMediumResponses.accountId, account.id),
          eq(promoMediumResponses.storyId, row.storyId),
          eq(promoMediumResponses.status, "waiting")
        )
      )
      .limit(1)
    if (onItsWay) throw new Refusal("A response here is already on its way. Take it back first to send a different one.")

    const state = await readMediumPostingState(userId, account, tx, now)
    const refusal = mediumPostingRefusal(state, now, state.timeZone)
    if (refusal) throw new Refusal(refusal)
    if (!row.parentId && !row.articleId) await refuseSecondAccountOnStory(userId, account.id, row.storyId, tx)
    await refuseTooSimilar(userId, account.id, text, tx)

    // A draft named by the browser counts only when it is the person's own.
    const [draft] = row.draftId
      ? await tx
          .select({ id: promoMediumDrafts.id })
          .from(promoMediumDrafts)
          .where(and(eq(promoMediumDrafts.id, row.draftId), eq(promoMediumDrafts.userId, userId)))
          .limit(1)
      : []
    const draftId = draft?.id ?? null

    const id = uuid()
    const jobId = uuid()
    const runAfter = state.nextWakeAt
    const undoUntil = runAfter ? null : new Date(now.getTime() + UNDO_SECONDS * 1000)
    await tx.insert(promoMediumResponses).values({
      id,
      userId,
      accountId: account.id,
      projectId: account.projectId,
      findId: row.findId,
      draftId,
      parentId: row.parentId,
      articleId: row.articleId,
      replyTo: row.replyTo,
      storyId: row.storyId,
      storyUrl: row.storyUrl.slice(0, 600),
      storyTitle: row.storyTitle.slice(0, 600),
      text,
      line: row.line,
      helpOnly: row.helpOnly,
      status: "waiting",
      jobId,
      sentBy: row.sentBy ?? null,
      createdAt: now,
    })
    await queueJob(userId, "medium_respond", { responseId: id, accountId: account.id }, tx, runAfter ?? undoUntil, jobId)
    if (draftId) await tx.update(promoMediumDrafts).set({ status: "sent" }).where(eq(promoMediumDrafts.id, draftId))
    return { responseId: id, jobId, runAfter, undoUntil }
  })
}

/**
 * Queues a response under a story a person pressed Post for, or refuses it
 * with why. The account must be one of the story's project's Medium accounts.
 */
export async function queueMediumResponse(
  userId: string,
  input: {
    findId: string
    accountId: string
    text: string
    line?: string
    helpOnly?: boolean
    draftId?: string | null
    sentBy?: string | null
  },
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<QueuedResponse> {
  const find = await ownedMediumFind(userId, input.findId, db)
  if (!find) throw new Error("That Medium story is no longer saved.")
  const account = await writingAccount(userId, input.accountId, db)
  if (account.projectId !== find.projectId) {
    throw new Refusal("That account is not in this story's project, so it does not respond here.")
  }
  const line = (input.line ?? "").trim()
  if (line) refuseOnPhone(account, "Answering one highlighted line")
  if (line && find.text && !find.text.includes(line)) {
    throw new Refusal("That line is not in the story as Promo read it. Pick a sentence from the story, or leave the line empty.")
  }
  return queueWriting(
    userId,
    account,
    {
      storyId: find.storyId,
      storyUrl: find.url,
      storyTitle: find.title,
      text: input.text,
      line: line.slice(0, 500),
      helpOnly: Boolean(input.helpOnly),
      findId: find.id,
      draftId: input.draftId ?? null,
      parentId: null,
      articleId: null,
      replyTo: null,
      sentBy: input.sentBy,
    },
    db,
    now
  )
}

/**
 * Queues an answer to somebody who responded under one of the account's own
 * responses or articles (part 36). It goes out from the account that wrote
 * the response or the article, under the response being answered: on Medium
 * a response is a story of its own, and answering it is responding under it.
 */
export async function queueMediumAnswer(
  userId: string,
  input: { under: { responseId: string } | { articleId: string }; incomingId: string; text: string },
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<QueuedResponse> {
  let accountId: string | null = null
  let incoming: Array<NonNullable<typeof promoMediumResponses.$inferSelect.incoming>[number]> = []
  let parentId: string | null = null
  let articleId: string | null = null
  if ("responseId" in input.under) {
    const [parent] = await db
      .select()
      .from(promoMediumResponses)
      .where(and(eq(promoMediumResponses.id, input.under.responseId), eq(promoMediumResponses.userId, userId)))
      .limit(1)
    if (!parent || parent.status !== "posted") throw new Error("That response is not one Promo sent.")
    accountId = parent.accountId
    incoming = parent.incoming ?? []
    parentId = parent.id
  } else {
    const [article] = await db
      .select()
      .from(promoMediumArticles)
      .where(and(eq(promoMediumArticles.id, input.under.articleId), eq(promoMediumArticles.userId, userId)))
      .limit(1)
    if (!article || article.status !== "published" || !article.accountId) throw new Error("That article is not one Promo published.")
    accountId = article.accountId
    incoming = article.incoming ?? []
    articleId = article.id
  }
  const reply = incoming.find((item) => item.id === input.incomingId)
  if (!reply) throw new Error("That response is not there any more. Check again to read the newest ones.")
  const [answered] = await db
    .select({ id: promoMediumResponses.id })
    .from(promoMediumResponses)
    .where(
      and(
        eq(promoMediumResponses.userId, userId),
        eq(promoMediumResponses.storyId, reply.id),
        inArray(promoMediumResponses.status, ["waiting", "posted"])
      )
    )
    .limit(1)
  if (answered) throw new Refusal("That response has an answer already, or one on its way.")
  const account = await writingAccount(userId, accountId, db)
  return queueWriting(
    userId,
    account,
    {
      storyId: reply.id,
      storyUrl: `https://medium.com/p/${reply.id}`,
      storyTitle: reply.text.slice(0, 120),
      text: input.text,
      line: "",
      helpOnly: false,
      findId: null,
      draftId: null,
      parentId,
      articleId,
      replyTo: reply,
    },
    db,
    now
  )
}

/**
 * Takes back a response still waiting: in its ten seconds, or held for the
 * account's morning. One that has started cannot be taken back: it may
 * already be on Medium.
 */
export async function cancelMediumResponse(
  userId: string,
  responseId: string,
  db: CustomShellDb = defaultDb
): Promise<void> {
  const [row] = await db
    .select({ jobId: promoMediumResponses.jobId, status: promoMediumResponses.status, draftId: promoMediumResponses.draftId })
    .from(promoMediumResponses)
    .where(and(eq(promoMediumResponses.id, responseId), eq(promoMediumResponses.userId, userId)))
    .limit(1)
  if (!row || row.status !== "waiting" || !row.jobId) throw new Error("That response is no longer waiting.")
  const removed = await db
    .delete(promoJobs)
    .where(and(eq(promoJobs.id, row.jobId), eq(promoJobs.userId, userId), eq(promoJobs.status, "queued")))
    .returning({ id: promoJobs.id })
  if (!removed.length) {
    throw new Error("That response is no longer waiting. It may have started going to Medium.")
  }
  await db.delete(promoMediumResponses).where(eq(promoMediumResponses.id, responseId))
  // Taken back, its draft is a draft again.
  if (row.draftId) await db.update(promoMediumDrafts).set({ status: "draft" }).where(eq(promoMediumDrafts.id, row.draftId))
}

/** The responses and articles an account has waiting for its morning, for the line under Post. */
export async function heldForMorning(
  userId: string,
  accountId: string,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<Array<{ responseId: string; runAfter: Date }>> {
  const rows = await db
    .select({ payload: promoJobs.payload, runAfter: promoJobs.runAfter })
    .from(promoJobs)
    .where(
      and(
        eq(promoJobs.userId, userId),
        eq(promoJobs.kind, "medium_respond"),
        eq(promoJobs.status, "queued"),
        gt(promoJobs.runAfter, now),
        sql`${promoJobs.payload}->>'accountId' = ${accountId}`
      )
    )
    .orderBy(asc(promoJobs.runAfter))
  return rows.flatMap((row) =>
    typeof row.payload.responseId === "string" && row.runAfter ? [{ responseId: row.payload.responseId, runAfter: row.runAfter }] : []
  )
}
