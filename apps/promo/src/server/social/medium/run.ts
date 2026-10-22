import { and, eq, inArray, sql } from "drizzle-orm"

import type { CommandTarget } from "@/server/browser/command"
import { Refusal } from "@/server/browser/refusal"
import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { isMediumSignInLink } from "@/lib/social/medium/options"
import type { JobKind } from "@/lib/social/options"

import { queueJob, type QueuedJob } from "../jobs"
import { promoAccounts, promoJobs } from "../schema"
import { recordArticleCheck, recordArticleStats, runMediumPublish } from "./articles"
import { mediumProfile, mediumSignIn, type MediumState } from "./calls"
import { runAddToList } from "./lists"
import { recordPublicationCheck } from "./publications"
import { findPhoneResponse, recordResponseCheck, runMediumChange, runMediumRespond } from "./responses"
import { readMediumStory, runMediumSearch } from "./search"
import { runMediumWarmUp } from "./warm-up"

/**
 * Medium's jobs, handed out by the browser program's runner
 * (`../runner.ts`), which has already found the job's browser: the reader's
 * for the reads, the account's own for everything else. Kept beside
 * Medium's code so the runner only learns that Medium exists.
 */

/** Medium's reads, in the reader browser, signed in to nobody. */
export const MEDIUM_READER_KINDS: readonly JobKind[] = ["medium_search", "medium_story", "medium_check", "medium_profile", "medium_find"]

/** Medium's work in an account's own browser. Only a Medium account does these. */
export const MEDIUM_ACCOUNT_KINDS: readonly JobKind[] = [
  "medium_sign_in",
  "medium_respond",
  "medium_publish",
  "medium_edit",
  "medium_delete",
  "medium_stats",
  "medium_warm_up",
  "medium_list_add",
  "medium_publication",
]

function text(value: unknown): string {
  return typeof value === "string" ? value : ""
}

export async function runMediumReaderJob(
  job: QueuedJob,
  target: CommandTarget,
  db: CustomShellDb = defaultDb
): Promise<void> {
  if (job.kind === "medium_search") {
    const keywordId = text(job.payload.keywordId)
    if (!keywordId) throw new Error("That Medium search names no keyword.")
    await runMediumSearch(job.userId, keywordId, target, db)
  } else if (job.kind === "medium_story") {
    const findId = text(job.payload.findId)
    if (!findId) throw new Error("That read names no Medium story.")
    await readMediumStory(job.userId, findId, target, db)
  } else if (job.kind === "medium_check") {
    const responseId = text(job.payload.responseId)
    const articleId = text(job.payload.articleId)
    if (responseId) await recordResponseCheck(job.userId, responseId, target, db)
    else if (articleId) await recordArticleCheck(job.userId, articleId, target, db)
    else throw new Error("That check names no response or article.")
  } else if (job.kind === "medium_profile") {
    await recordMediumProfile(job.userId, text(job.payload.accountId), target, db)
  } else if (job.kind === "medium_find") {
    await findPhoneResponse(job.userId, text(job.payload.responseId), target, db)
  } else {
    throw new Error(`There is no Medium reader job called "${job.kind}".`)
  }
}

export async function runMediumAccountJob(
  job: QueuedJob,
  account: typeof promoAccounts.$inferSelect,
  target: CommandTarget,
  db: CustomShellDb = defaultDb
): Promise<void> {
  if (job.kind === "medium_sign_in") {
    const url = text(job.payload.url)
    // The link signs in whoever opens it, so it is wiped from the job as soon
    // as the browser has taken it, whatever happened.
    await db.update(promoJobs).set({ payload: { accountId: account.id } }).where(eq(promoJobs.id, job.id))
    if (!isMediumSignInLink(url)) throw new Refusal("That is not a sign-in link on medium.com, so the browser was not sent to it.")
    const state = await mediumSignIn(target, { url })
    await saveMediumSignIn(account.id, state, db)
    if (!state.handle) {
      throw new Refusal(
        state.blocked
          ? `The link opened, but Medium is in the way: ${state.reason}. Take control of the browser on the Browser profiles dashboard.`
          : "The link opened, but the browser is not signed in to Medium. The link may have run out; ask Medium for a new one and paste it straight away."
      )
    }
  } else if (job.kind === "medium_respond") {
    await runMediumRespond(job.userId, text(job.payload.responseId), target, db)
  } else if (job.kind === "medium_publish") {
    await runMediumPublish(job.userId, text(job.payload.articleId), target, db)
  } else if (job.kind === "medium_edit" || job.kind === "medium_delete") {
    await runMediumChange(job.userId, job.kind, job.payload, target, db)
  } else if (job.kind === "medium_stats") {
    await recordArticleStats(job.userId, text(job.payload.articleId), target, db)
  } else if (job.kind === "medium_warm_up") {
    await runMediumWarmUp(job.userId, account, target, db)
  } else if (job.kind === "medium_list_add") {
    await runAddToList(job.userId, text(job.payload.listItemId), target, db)
  } else if (job.kind === "medium_publication") {
    await recordPublicationCheck(job.userId, job.payload, target, db)
  } else {
    throw new Error(`There is no Medium job called "${job.kind}".`)
  }
}

/**
 * Writes who a Medium account is signed in as, when Medium says it joined,
 * and how many follow it, from one look. A look that was not taken on a
 * Medium page changes nothing. A ban screen's stop stays until a person
 * lets the account run again, whatever a later look says.
 *
 * Returns the handle when the account was signed out and now is signed in.
 */
export async function saveMediumSignIn(
  accountId: string,
  state: MediumState,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<string | null> {
  if (!state.checked) return null
  const [before] = await db
    .select({ handle: promoAccounts.handle })
    .from(promoAccounts)
    .where(eq(promoAccounts.id, accountId))
    .limit(1)
  await db
    .update(promoAccounts)
    .set({
      handle: state.handle ?? "",
      blocked: sql`CASE WHEN ${promoAccounts.banScreenAt} IS NULL THEN ${state.blocked} ELSE true END`,
      blockedReason: sql`CASE WHEN ${promoAccounts.banScreenAt} IS NULL THEN ${state.blocked ? state.reason : ""} ELSE ${promoAccounts.blockedReason} END`,
      stateReadAt: now,
      ...(state.handle && state.joinedSeconds ? { mediumJoinedAt: new Date(state.joinedSeconds * 1000) } : {}),
      ...(state.handle && state.followers !== null ? { followers: state.followers } : {}),
      signedInAt: state.handle ? sql`coalesce(${promoAccounts.signedInAt}, ${now.toISOString()}::timestamptz)` : null,
    })
    .where(eq(promoAccounts.id, accountId))
  return before && !before.handle && state.handle ? state.handle : null
}


/**
 * When a Medium account on a phone joined, and its followers, read by the
 * reader off its public page, because the app shows neither. Queued the first
 * time a phone reads the account signed in.
 */
export async function recordMediumProfile(
  userId: string,
  accountId: string,
  target: CommandTarget,
  db: CustomShellDb = defaultDb
): Promise<void> {
  const [account] = await db
    .select({ handle: promoAccounts.handle })
    .from(promoAccounts)
    .where(and(eq(promoAccounts.id, accountId), eq(promoAccounts.userId, userId)))
    .limit(1)
  if (!account?.handle) throw new Refusal("That account has no Medium name yet, so its page cannot be read.")
  const profile = await mediumProfile(target, { handle: account.handle })
  await db
    .update(promoAccounts)
    .set({
      ...(profile.joinedSeconds ? { mediumJoinedAt: new Date(profile.joinedSeconds * 1000) } : {}),
      ...(profile.followers !== null ? { followers: profile.followers } : {}),
    })
    .where(eq(promoAccounts.id, accountId))
}

/**
 * Asks the reader for a phone account's joined date, once, while none is
 * known and none is on its way. True when a read was asked for, false when
 * one waits already or none can be.
 */
export async function queueMediumProfileRead(
  userId: string,
  accountId: string,
  db: CustomShellDb = defaultDb
): Promise<boolean> {
  const [account] = await db
    .select({ joined: promoAccounts.mediumJoinedAt, handle: promoAccounts.handle })
    .from(promoAccounts)
    .where(and(eq(promoAccounts.id, accountId), eq(promoAccounts.userId, userId)))
    .limit(1)
  if (!account?.handle || account.joined) return false
  const [waiting] = await db
    .select({ id: promoJobs.id })
    .from(promoJobs)
    .where(
      and(
        eq(promoJobs.userId, userId),
        eq(promoJobs.kind, "medium_profile"),
        inArray(promoJobs.status, ["queued", "running"]),
        sql`${promoJobs.payload}->>'accountId' = ${accountId}`
      )
    )
    .limit(1)
  if (waiting) return false
  try {
    await queueJob(userId, "medium_profile", { accountId }, db)
  } catch (error) {
    // No reader picked: it is asked again after the next job on the phone.
    if (!(error instanceof Refusal)) throw error
    return false
  }
  return true
}
