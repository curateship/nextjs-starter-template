import { and, eq } from "drizzle-orm"

import {
  redditQuickState,
  redditState,
  type CommandTarget,
} from "@/server/browser/command"
import { Refusal } from "@/server/browser/refusal"
import { promoProfiles } from "@/server/browser/schema"
import { runSiteCheck } from "@/server/browser/site-check"
import {
  ensureSession,
  stopSession,
  touchSession,
} from "@/server/browser/session"
import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { NO_PROFILE_MESSAGE } from "@/lib/social/options"

import { postComment } from "./reddit/post-comment"
import { JOB_MAX_ATTEMPTS, claimNextJob, failJob, finishJob, type QueuedJob } from "./jobs"
import { loadFindThread, runKeywordSearch } from "./reddit/search"
import { promoAccounts } from "./schema"

/**
 * One turn of the browser work.
 *
 * Kept apart from `worker/src/social-browser.ts` so the loop is a few lines
 * and the work is testable without starting a process.
 *
 * The browser program is the only thing that opens, drives or closes a
 * browser, so every one of those is a job here, including the ones a person
 * asks for from a dashboard. A job goes from its keyword or post to the
 * account, from the account to its browser profile, and opens that profile's
 * browser. The browser stays open between jobs: opening it costs about a
 * minute, and doing that per job would make ten keywords take ten minutes.
 */

export type TurnResult =
  | { did: "nothing" }
  | { did: "job"; kind: string; jobId: string; ok: boolean; error?: string }

type Account = typeof promoAccounts.$inferSelect

export async function runOneJob(
  claimToken: string,
  db: CustomShellDb = defaultDb
): Promise<TurnResult> {
  const job = await claimNextJob(claimToken, db)
  if (!job) return { did: "nothing" }

  try {
    await runJob(job, db)
    await finishJob(job.id, claimToken, db)
    return { did: "job", kind: job.kind, jobId: job.id, ok: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    // Fails at once, never re-queued, for two reasons. A refusal would only
    // say the same thing again. A comment may already be on Reddit: the app
    // can give up waiting while the browser is still typing, and a retry
    // would then post it twice.
    const final = error instanceof Refusal || job.kind === "comment"
    const attempts = final ? JOB_MAX_ATTEMPTS : job.attempts
    await failJob(job.id, claimToken, message, attempts, db)
    return { did: "job", kind: job.kind, jobId: job.id, ok: false, error: message }
  }
}

async function runJob(job: QueuedJob, db: CustomShellDb): Promise<void> {
  // Open, close, check and the site check name a profile, because a
  // profile's browser is not any one network's. They come from the Browser
  // profiles dashboard.
  if (
    job.kind === "open" ||
    job.kind === "close" ||
    job.kind === "check" ||
    job.kind === "site_check"
  ) {
    const profileId = String(job.payload.profileId ?? "")
    if (!profileId) throw new Error(`That ${job.kind} job names no browser profile.`)
    if (job.kind === "close") {
      // Opening checks the owner inside `ensureSession`; closing has to here,
      // or a job naming somebody else's profile would close their browser.
      const [owned] = await db
        .select({ id: promoProfiles.id })
        .from(promoProfiles)
        .where(and(eq(promoProfiles.id, profileId), eq(promoProfiles.userId, job.userId)))
        .limit(1)
      if (!owned) throw new Refusal("That browser profile does not exist.")
      await stopSession(profileId, db)
      return
    }
    const session = await ensureSession(job.userId, profileId, db)
    await touchSession(session.id, db)
    if (job.kind === "site_check") {
      await runSiteCheck(job.userId, profileId, session.target, db)
      return
    }
    await readSignIns(job.userId, profileId, session.target, db, job.kind === "check")
    return
  }

  const account = await accountForJob(job, db)
  if (!account.profileId) throw new Refusal(NO_PROFILE_MESSAGE)

  const session = await ensureSession(job.userId, account.profileId, db)
  await touchSession(session.id, db)

  try {
    if (job.kind === "search") {
      const keywordId = String(job.payload.keywordId ?? "")
      if (!keywordId) throw new Error("That search job names no keyword.")
      await runKeywordSearch(job.userId, keywordId, session.target, db)
    } else if (job.kind === "thread") {
      const findId = String(job.payload.findId ?? "")
      if (!findId) throw new Error("That thread job names no post.")
      await loadFindThread(job.userId, findId, session.target, db)
    } else if (job.kind === "comment") {
      const findId = String(job.payload.findId ?? "")
      const text = String(job.payload.text ?? "")
      if (!findId || !text) throw new Error("That comment job is missing its post or its words.")
      await postComment(
        {
          userId: job.userId,
          findId,
          accountId: account.id,
          text,
          draftId: job.payload.draftId ? String(job.payload.draftId) : null,
        },
        session.target,
        db
      )
    } else {
      throw new Error(`There is no job kind called "${job.kind}".`)
    }
  } finally {
    // Whether the job worked or not, what the browser can see now is worth
    // writing down: a failed search is often a sign-out or a captcha, and
    // that is exactly what a dashboard needs to show.
    await touchSession(session.id, db)
    await readSignIns(job.userId, account.profileId, session.target, db)
  }
}

/**
 * The account a job works as.
 *
 * A comment names its account, because it was written for one. A search or a
 * thread is Reddit work for the person who asked, and promo has one Reddit
 * account per person today, so it is that one. Keywords do not name an
 * account yet; that comes with more than one browser at a time.
 */
async function accountForJob(job: QueuedJob, db: CustomShellDb): Promise<Account> {
  const named = job.payload.accountId ? String(job.payload.accountId) : ""
  const [account] = await db
    .select()
    .from(promoAccounts)
    .where(
      named
        ? and(eq(promoAccounts.id, named), eq(promoAccounts.userId, job.userId))
        : and(eq(promoAccounts.userId, job.userId), eq(promoAccounts.platform, "reddit"))
    )
    .limit(1)
  if (!account) {
    throw new Error("There is no Reddit account set up, so there is nothing to browse with.")
  }
  return account
}

/**
 * Writes down who each account inside the profile is signed in as.
 *
 * After an ordinary job it takes the quick look, which never moves the page.
 * For a `check` a person asked for, it takes the full look, which goes to the
 * site's front page to be sure; that is the only place the page is moved.
 *
 * Never fails an ordinary job. A look that cannot be taken leaves the last
 * saved answer where it is, rather than a dashboard reading "signed out"
 * because one read timed out. A check fails, because answering is its job.
 */
async function readSignIns(
  userId: string,
  profileId: string,
  target: CommandTarget,
  db: CustomShellDb,
  full = false
): Promise<void> {
  const accounts = await db
    .select({ id: promoAccounts.id, platform: promoAccounts.platform })
    .from(promoAccounts)
    .where(and(eq(promoAccounts.profileId, profileId), eq(promoAccounts.userId, userId)))

  for (const account of accounts) {
    if (account.platform !== "reddit") continue
    if (full) {
      await saveSignIn(account.id, { checked: true, ...(await redditState(target)) }, db)
      continue
    }
    try {
      await saveSignIn(account.id, await redditQuickState(target), db)
    } catch (error) {
      console.error(`Could not read who is signed in for account ${account.id}`, error)
    }
  }
}

async function saveSignIn(
  accountId: string,
  state: { checked: boolean; handle: string | null; blocked: boolean; reason: string },
  db: CustomShellDb
): Promise<void> {
  if (!state.checked) return
  await db
    .update(promoAccounts)
    .set({
      handle: state.handle ?? "",
      blocked: state.blocked,
      blockedReason: state.blocked ? state.reason : "",
      stateReadAt: new Date(),
    })
    .where(eq(promoAccounts.id, accountId))
}
