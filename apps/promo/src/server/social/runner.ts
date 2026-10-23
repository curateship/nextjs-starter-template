import { and, eq, sql } from "drizzle-orm"

import {
  redditQuickState,
  redditState,
  type CommandTarget,
} from "@/server/browser/command"
import { Refusal } from "@/server/browser/refusal"
import { promoProfiles } from "@/server/browser/schema"
import { backupProfile, restoreProfile } from "@/server/browser/backups"
import { deleteProfileSignIn } from "@/server/browser/profiles"
import { runSiteCheck } from "@/server/browser/site-check"
import {
  ensureSession,
  stopSession,
  touchSession,
} from "@/server/browser/session"
import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { LINKEDIN_SEARCHER_JOB_KINDS, NO_PROFILE_MESSAGE, READER_JOB_KINDS, WRITE_JOB_KINDS, X_SEARCHER_JOB_KINDS, type JobKind } from "@/lib/social/options"
import { NOTICE_HEADINGS } from "@/lib/social/notice-words"
import { aNetwork, handleWords, isNetwork, isPhoneAppNetwork, NETWORK_NAMES } from "@/lib/social/networks"
import { nextWorkdayAt } from "@/lib/social/linkedin/workday"
import { nextWakeAt } from "@/lib/social/waking"
import { PHONE_LANE_PREFIX, phoneLane } from "@/lib/phones/options"
import { recordPhoneEvent } from "@/server/phones/history"
import { phoneForJob } from "@/server/phones/phones"
import { guardPhoneAddress } from "@/server/phones/setup"

import { accountTimeZone, readBehaviour, readerProfile } from "./behaviour"
import { ringForFailure } from "./failures"
import { pausedBy } from "./pause"
import { accountFigures, recordAccountHealth, recordStrangerCheck } from "./health"
import { deleteSentComment, editSentComment } from "./reddit/change-comment"
import { recordCommentCheck } from "./reddit/comment-check"
import { findCommentLink } from "./reddit/comment-link"
import { readHelpPosts } from "./reddit/help-posts"
import { submitOwnPost } from "./reddit/own-posts"
import { readPromoThreads } from "./reddit/promo-threads"
import { postComment } from "./reddit/post-comment"
import { postReply } from "./reddit/post-reply"
import { readSubredditRules } from "./reddit/rules"
import {
  JOB_MAX_ATTEMPTS,
  TryAgainLater,
  claimNextJob,
  failJob,
  finishJob,
  jobAccount,
  putJobBack,
  type JobPool,
  type QueuedJob,
} from "./jobs"
import { loadFindThread, runKeywordSearch } from "./reddit/search"
import { promoAccounts } from "./schema"
import { runWarmUp } from "./warm-up"
import { appQuickState } from "./phone-apps/calls"
import { recordAppHealth } from "./phone-apps/health"
import { runInboxRead, runInboxReply } from "./phone-apps/inbox"
import { runAppPost } from "./phone-apps/posts"
import { runProfileEdit } from "./phone-apps/profile"
import { mediumQuickState, mediumState } from "./medium/calls"
import {
  MEDIUM_ACCOUNT_KINDS,
  MEDIUM_READER_KINDS,
  runMediumAccountJob,
  runMediumReaderJob,
  queueMediumProfileRead,
  saveMediumSignIn,
} from "./medium/run"
import { settleFailedMediumJob } from "./medium/settle"
import { ringBell } from "./notices"
import { xQuickState, xState } from "./x/calls"
import { runXAccountJob, runXSearcherJob, saveXSignIn, X_ACCOUNT_KINDS, X_PHONE_KINDS } from "./x/run"
import { handlePosts, saveSearcherHandle, searcherForLane, stopSearcher, utcDay, type PickedSearcher } from "./x/searchers"
import { settleFailedXJob } from "./x/settle"
import { linkedinQuickState, linkedinState } from "./linkedin/calls"
import { LINKEDIN_ACCOUNT_KINDS, LINKEDIN_PHONE_KINDS, runLinkedinAccountJob, runLinkedinSearcherJob, saveLinkedinSignIn } from "./linkedin/run"
import {
  linkedinSearcherForLane,
  saveLinkedinSearcherSlug,
  slugComments,
  stopLinkedinSearcher,
  type PickedLinkedinSearcher,
} from "./linkedin/searchers"
import { settleFailedLinkedinJob } from "./linkedin/settle"

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
  | { did: "put back"; kind: string; jobId: string; why: string }

type Account = typeof promoAccounts.$inferSelect

/** How long a comment pressed before a pause waits before it looks again. */
const PAUSED_RECHECK_MS = 10 * 60_000

/** How long a job for a phone that was held after it was taken waits before it looks again. */
const HELD_RECHECK_MS = 60_000

/**
 * A job that did nothing and goes back on the queue untried: taken outside
 * its account's waking hours, so it waits for them, or filed under a lane
 * that is not the reader's, so it is filed again under the reader's.
 */
class PutBack extends Error {
  readonly change: { runAfter: Date } | { lane: string }

  constructor(change: { runAfter: Date } | { lane: string }) {
    super(
      "runAfter" in change
        ? `waits for the account's waking hours, until ${change.runAfter.toISOString()}`
        : `filed again under the reader's lane ${change.lane}`
    )
    this.change = change
  }
}

export async function runOneJob(
  claimToken: string,
  db: CustomShellDb = defaultDb,
  pool: JobPool = "browser"
): Promise<TurnResult> {
  const job = await claimNextJob(claimToken, db, pool)
  if (!job) return { did: "nothing" }

  try {
    await runJob(job, db)
    await finishJob(job.id, claimToken, db)
    return { did: "job", kind: job.kind, jobId: job.id, ok: true }
  } catch (error) {
    if (error instanceof PutBack) {
      await putJobBack(job.id, claimToken, error.change, db)
      return { did: "put back", kind: job.kind, jobId: job.id, why: error.message }
    }
    const message = error instanceof Error ? error.message : String(error)
    // Fails at once, never re-queued, for two reasons. A refusal would only
    // say the same thing again. A comment may already be on Reddit: the app
    // can give up waiting while the browser is still typing, and a retry
    // would then post it twice. An answer to a reply is a comment too.
    // A ban screen found during the job stopped its account; trying again
    // would only be refused.
    const final = error instanceof Refusal || WRITE_JOB_KINDS.includes(job.kind) || (await stoppedByBanScreen(job, db))
    const attempts = final ? JOB_MAX_ATTEMPTS : job.attempts
    const later = error instanceof TryAgainLater ? new Date(Date.now() + error.waitMs) : null
    await failJob(job.id, claimToken, message, attempts, db, later)
    // A Medium response, article or list add refused before its own code ran
    // still says so on its row.
    if (final) {
      await settleFailedMediumJob(job, message, db)
      await settleFailedXJob(job, message, db)
      await settleFailedLinkedinJob(job, message, db)
    }
    // A comment, an answer or a post that did not go out rings the bell.
    await ringForFailure(job, message, db)
    return { did: "job", kind: job.kind, jobId: job.id, ok: false, error: message }
  }
}

/** True when the job ran on a phone and a ban screen there has stopped its account. */
async function stoppedByBanScreen(job: QueuedJob, db: CustomShellDb): Promise<boolean> {
  if (!job.lane?.startsWith(PHONE_LANE_PREFIX)) return false
  const account = await jobAccount(job.userId, job.payload, db)
  return Boolean(account?.banScreenAt)
}

async function runJob(job: QueuedJob, db: CustomShellDb): Promise<void> {
  // A backup and a restore name a profile and need its browser closed, so
  // they never open one.
  if (job.kind === "backup" || job.kind === "restore") {
    const profileId = String(job.payload.profileId ?? "")
    if (!profileId) throw new Error(`That ${job.kind} job names no browser profile.`)
    if (job.kind === "backup") {
      await backupProfile(job.userId, profileId, db)
    } else {
      await restoreProfile(
        job.userId,
        profileId,
        { backupId: String(job.payload.backupId ?? ""), replace: job.payload.replace === true },
        db
      )
    }
    return
  }

  // After an account moved to a phone, its old profile's browser is closed
  // and its saved sign-in deleted (part 31 of the phone farm). The profile
  // itself stays.
  if (job.kind === "forget") {
    const profileId = String(job.payload.profileId ?? "")
    if (!profileId) throw new Refusal("That job names no browser profile.")
    const [owned] = await db
      .select({ id: promoProfiles.id })
      .from(promoProfiles)
      .where(and(eq(promoProfiles.id, profileId), eq(promoProfiles.userId, job.userId)))
      .limit(1)
    if (!owned) throw new Refusal("That browser profile does not exist.")
    await stopSession(profileId, db)
    await deleteProfileSignIn(job.userId, profileId, db)
    return
  }

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
    await readSignIns(job.userId, { profileId }, session.target, db, job.kind === "check")
    return
  }

  if (READER_JOB_KINDS.includes(job.kind)) {
    await runReaderJob(job, db)
    return
  }

  if (X_SEARCHER_JOB_KINDS.includes(job.kind)) {
    await runXRead(job, db)
    return
  }

  if (LINKEDIN_SEARCHER_JOB_KINDS.includes(job.kind)) {
    await runLinkedinRead(job, db)
    return
  }

  const account = await accountForJob(job, db)
  refuseWrongNetwork(job.kind, account)
  if (!account.profileId && !account.phoneId) throw new Refusal(NO_PROFILE_MESSAGE)
  // The account moved to a phone or a profile after the job was filed, or
  // the job is from before lanes. It is filed again where it now runs, so it
  // takes that lane's turn, in that lane's pool, and never runs beside
  // another job on the same phone or browser.
  const lane = account.phoneId ? phoneLane(account.phoneId) : account.profileId
  if (lane && job.lane !== lane) throw new PutBack({ lane })
  // A phone found the app showing a suspended, locked or "confirm it's you"
  // screen. Nothing more goes out as this account until a person has looked.
  if (account.banScreenAt) {
    throw new Refusal(
      `This account hit a ban screen and was stopped: "${account.blockedReason}". Let it run again from its settings on the Accounts dashboard once it is sorted.`
    )
  }
  // Retired after the job was queued. A retired account never posts and
  // never warms up; a health reading is only a read and still runs.
  const writes =
    WRITE_JOB_KINDS.includes(job.kind) ||
    job.kind === "warm_up" ||
    job.kind === "medium_warm_up" ||
    job.kind === "x_warm_up" ||
    job.kind === "linkedin_warm_up"
  if (account.retiredAt && writes) {
    throw new Refusal(
      "This account is retired, so it no longer posts or warms up. Bring it back on the Accounts dashboard first."
    )
  }

  // A paused account, or one in a paused project, does not post, warm up or
  // take a health reading. A comment or an answer pressed before the pause
  // waits, and can still be cancelled; a warm-up or a reading is refused.
  const paused = await pausedBy(job.userId, account, db)
  if (paused && WRITE_JOB_KINDS.includes(job.kind)) {
    throw new PutBack({ runAfter: new Date(Date.now() + PAUSED_RECHECK_MS) })
  }
  if (paused) {
    throw new Refusal(
      paused === "account"
        ? "This account is paused, so it does not warm up or take health readings. Resume it on the Accounts dashboard."
        : paused === "network"
          ? "This account's network is paused on its project, so it does not warm up or take readings. Resume it in the project's left column."
          : "This account's project is paused, so it does not warm up or take health readings. Resume the project on its dashboard."
    )
  }

  // An account acts only while it is awake, in its own time zone. In a
  // browser a health reading is only a read, so it may run at any hour; a
  // comment, an answer to a reply and a warm-up wait for morning, before a
  // browser is even opened. On a phone every job waits, because any of them
  // lights the phone's screen, and a phone's screen stays off while its
  // account sleeps.
  // A LinkedIn account works weekdays, 8:00 to 18:00 on its own clock, for
  // every job of its own, reads included (LinkedIn task, part 7). A code a
  // person pasted is typed at once: LinkedIn is waiting on it.
  if (account.platform === "linkedin") {
    const opens = job.kind === "linkedin_code" ? null : nextWorkdayAt(new Date(), await accountTimeZone(account, db))
    if (opens) throw new PutBack({ runAfter: opens })
  } else if (writes || account.phoneId) {
    const behaviour = await readBehaviour(job.userId, db)
    const wakes = nextWakeAt(
      new Date(),
      await accountTimeZone(account, db),
      behaviour.wakeFromMinute,
      behaviour.wakeUntilMinute
    )
    if (wakes) throw new PutBack({ runAfter: wakes })
  }

  if (account.phoneId) {
    const phone = await phoneForJob(job.userId, account.phoneId, db)
    if (!phone.ready) throw new PutBack({ runAfter: new Date(Date.now() + HELD_RECHECK_MS) })
    // A Wi-Fi phone shows its proxy's address or nothing goes out (part 28).
    await guardPhoneAddress(job.userId, account.phoneId, phone.target, db)
    await runAccountJob(job, account, phone.target, db)
    return
  }

  if (!account.profileId) throw new Refusal(NO_PROFILE_MESSAGE)
  const session = await ensureSession(job.userId, account.profileId, db)
  await touchSession(session.id, db)
  try {
    await runAccountJob(job, account, session.target, db)
  } finally {
    await touchSession(session.id, db)
  }
}

/** Jobs only a Reddit account does, in its browser or the Reddit app. */
const REDDIT_ONLY_KINDS: readonly JobKind[] = ["comment", "reply", "submit", "delete_comment", "edit_comment", "warm_up"]

/** The Medium jobs the Medium app on a phone does. The rest need a browser profile. */
const MEDIUM_PHONE_KINDS: readonly JobKind[] = ["medium_respond", "medium_warm_up"]

/** Jobs only an Instagram or TikTok account does, in its app. */
const PHONE_APP_ONLY_KINDS: readonly JobKind[] = ["app_post", "app_profile"]

/**
 * Refuses a job its account's network has no such thing for, before
 * anything opens: a Reddit comment from an Instagram account, a post of
 * photos from a Reddit one, a Medium response from anything but a Medium
 * account. Instagram and TikTok run on a phone only.
 */
function refuseWrongNetwork(kind: JobKind, account: Account): void {
  const network = account.platform
  const sharedInbox = kind === "inbox_read" || kind === "inbox_reply"
  if (LINKEDIN_ACCOUNT_KINDS.includes(kind) !== (network === "linkedin") && !(network === "linkedin" && sharedInbox)) {
    throw new Refusal(
      network === "linkedin"
        ? "That is not something a LinkedIn account does. Nothing was sent."
        : `That is LinkedIn's, and this is ${isNetwork(network) ? aNetwork(network) : "another network's"} account. Nothing was sent.`
    )
  }
  if (network === "linkedin") {
    // Checked when the job was queued too, but an account can move to a
    // phone while a job waits for its workday.
    if (account.phoneId && LINKEDIN_ACCOUNT_KINDS.includes(kind) && !LINKEDIN_PHONE_KINDS.includes(kind)) {
      throw new Refusal("This LinkedIn account runs on a phone now, and the LinkedIn app there comments, posts, connects and accepts requests only. Nothing was sent.")
    }
    return
  }
  // X's direct messages use the Messages dashboard's own read and answer jobs.
  const xInbox = network === "x" && (kind === "inbox_read" || kind === "inbox_reply")
  if (!xInbox && X_ACCOUNT_KINDS.includes(kind) !== (network === "x")) {
    throw new Refusal(
      network === "x"
        ? "That is not something an X account does. Nothing was sent."
        : `That is X's, and this is ${isNetwork(network) ? aNetwork(network) : "another network's"} account. Nothing was sent.`
    )
  }
  if (network === "x") {
    // Checked when the job was queued too, but an account can move to a
    // phone while a job waits for its morning.
    if (account.phoneId && X_ACCOUNT_KINDS.includes(kind) && !X_PHONE_KINDS.includes(kind)) {
      throw new Refusal("This X account runs on a phone now, and the X app there replies, quotes, posts and follows only. Nothing was sent.")
    }
    return
  }
  if (MEDIUM_ACCOUNT_KINDS.includes(kind) !== (network === "medium")) {
    throw new Refusal(
      network === "medium"
        ? "That is not something a Medium account does. Nothing was sent."
        : `That is Medium's, and this is ${isNetwork(network) ? aNetwork(network) : "another network's"} account. Nothing was sent.`
    )
  }
  if (network === "medium") {
    // Checked when the job was queued too, but an account can move to a
    // phone while a job waits for its morning.
    if (account.phoneId && !MEDIUM_PHONE_KINDS.includes(kind)) {
      throw new Refusal("This Medium account runs on a phone now, and the Medium app there sends responses and answers only. Nothing was sent.")
    }
    return
  }
  if (!isPhoneAppNetwork(network)) {
    if (PHONE_APP_ONLY_KINDS.includes(kind)) {
      throw new Refusal("Only an Instagram or TikTok account does that. Nothing was sent.")
    }
    return
  }
  if (REDDIT_ONLY_KINDS.includes(kind)) {
    throw new Refusal(`That is Reddit's, and this is ${aNetwork(network)} account. Nothing was sent.`)
  }
  if (!account.phoneId) {
    throw new Refusal(
      `${aNetwork(network, true)} account runs on a phone only. Pick its phone on the Accounts dashboard. Nothing was sent.`
    )
  }
}

/** "Sam via Project" from a guest's job, so the row it writes says who sent it. Nothing for the owner's. */
function sentByOf(payload: Record<string, unknown>): { sentBy?: string } {
  return typeof payload.sentBy === "string" && payload.sentBy ? { sentBy: payload.sentBy } : {}
}

/**
 * The account's own work, the same steps whether `target` is its browser or
 * its phone. Afterwards, whether it worked or not, what the
 * browser or phone can see is written down: a failed search is often a
 * sign-out or a captcha, and that is exactly what a dashboard needs to show.
 */
async function runAccountJob(
  job: QueuedJob,
  account: Account,
  target: CommandTarget,
  db: CustomShellDb
): Promise<void> {
  try {
    if (MEDIUM_ACCOUNT_KINDS.includes(job.kind)) {
      await runMediumAccountJob(job, account, target, db)
    } else if (X_ACCOUNT_KINDS.includes(job.kind)) {
      await runXAccountJob(job, account, target, db)
    } else if (LINKEDIN_ACCOUNT_KINDS.includes(job.kind)) {
      await runLinkedinAccountJob(job, account, target, db)
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
          ...sentByOf(job.payload),
        },
        target,
        db
      )
    } else if (job.kind === "reply") {
      const commentId = String(job.payload.commentId ?? "")
      const replyId = String(job.payload.replyId ?? "")
      const text = String(job.payload.text ?? "")
      if (!commentId || !replyId || !text) {
        throw new Error("That reply job is missing its comment, the reply it answers, or its words.")
      }
      await postReply(
        {
          userId: job.userId,
          commentId,
          replyId,
          text,
          draftId: job.payload.draftId ? String(job.payload.draftId) : null,
          ...sentByOf(job.payload),
        },
        target,
        db
      )
    } else if (job.kind === "submit") {
      await submitOwnPost(job.userId, account.id, job.payload, target, db)
    } else if (job.kind === "delete_comment" || job.kind === "edit_comment") {
      const commentId = String(job.payload.commentId ?? "")
      if (!commentId) throw new Error(`That ${job.kind} job names no comment.`)
      if (job.kind === "delete_comment") {
        await deleteSentComment(job.userId, commentId, target, db)
      } else {
        await editSentComment(job.userId, commentId, String(job.payload.text ?? ""), target, db)
      }
    } else if (job.kind === "health") {
      if (isPhoneAppNetwork(account.platform)) {
        await recordAppHealth(job.userId, account, account.platform, target, db)
      } else {
        await recordAccountHealth(job.userId, account.id, target, db)
      }
    } else if (job.kind === "app_post") {
      await runAppPost(job.userId, account, target, job.payload, job.id, db)
    } else if (job.kind === "app_profile") {
      await runProfileEdit(job.userId, account, target, job.payload, job.id, db)
    } else if (job.kind === "inbox_read") {
      await runInboxRead(job.userId, account, target, job.payload, db)
    } else if (job.kind === "inbox_reply") {
      await runInboxReply(job.userId, account, target, job.payload, job.id, db)
    } else if (job.kind === "warm_up") {
      await runWarmUp(job.userId, account, target, db)
    } else {
      throw new Error(`There is no job kind called "${job.kind}".`)
    }
  } finally {
    // On a phone, only the app the job worked in is looked at: opening every
    // app on the phone after each job is not what a person does. An
    // Instagram or TikTok health reading has just read who is signed in.
    const justRead = job.kind === "health" && isPhoneAppNetwork(account.platform)
    if (!justRead) {
      await readSignIns(
        job.userId,
        account.phoneId ? { phoneId: account.phoneId, accountId: account.id } : { profileId: account.profileId ?? "" },
        target,
        db
      )
    }
  }
}

/**
 * A job for the reader browser, signed in to nobody: a search, a post's
 * replies, a subreddit's rules, a sent comment read again, or the stranger's
 * look at an account's profile. The account Reddit sees commenting never does
 * any of these, so its history shows no searches.
 *
 * A reader found signed in to Reddit is refused, before and after, because
 * whatever it read would then be read as somebody.
 *
 * A job filed under another lane goes back under the reader's before it
 * opens anything. Jobs queued before readers existed were filed under the
 * account's profile, and a reader changed in Settings leaves jobs under the
 * old one; either way two jobs would open one reader at once, and the second
 * loses with "already has a browser open" (seen 12 Oct 2026).
 */
async function runReaderJob(job: QueuedJob, db: CustomShellDb): Promise<void> {
  const reader = await readerProfile(job.userId, db)
  if (job.lane !== reader.id) throw new PutBack({ lane: reader.id })
  const session = await ensureSession(job.userId, reader.id, db)
  await touchSession(session.id, db)
  const network = MEDIUM_READER_KINDS.includes(job.kind) ? "medium" : "reddit"
  await refuseSignedInReader(reader.name, session.target, network)

  try {
    if (network === "medium") {
      await runMediumReaderJob(job, session.target, db)
    } else if (job.kind === "search") {
      const keywordId = String(job.payload.keywordId ?? "")
      if (!keywordId) throw new Error("That search job names no keyword.")
      await runKeywordSearch(job.userId, keywordId, session.target, db)
    } else if (job.kind === "thread") {
      const findId = String(job.payload.findId ?? "")
      if (!findId) throw new Error("That thread job names no post.")
      await loadFindThread(job.userId, findId, session.target, db)
    } else if (job.kind === "rules") {
      const subreddits = Array.isArray(job.payload.subreddits)
        ? job.payload.subreddits.filter((name): name is string => typeof name === "string" && name !== "")
        : []
      if (!subreddits.length) throw new Error("That rules job names no subreddit.")
      await readSubredditRules(job.userId, subreddits, session.target, db)
    } else if (job.kind === "comment_check") {
      const commentId = String(job.payload.commentId ?? "")
      if (!commentId) throw new Error("That check names no comment.")
      await recordCommentCheck(job.userId, commentId, session.target, db)
    } else if (job.kind === "profile_check") {
      await recordStrangerCheck(job.userId, job.payload, session.target, db)
    } else if (job.kind === "help_read") {
      await readHelpPosts(job.userId, job.payload, session.target, db)
    } else if (job.kind === "promo_threads") {
      await readPromoThreads(job.userId, job.payload, session.target, db)
    } else if (job.kind === "comment_link") {
      await findCommentLink(job.userId, job.payload, session.target, db)
    } else {
      throw new Error(`There is no job kind called "${job.kind}".`)
    }
  } finally {
    await touchSession(session.id, db)
  }

  await refuseSignedInReader(reader.name, session.target, network)
}

/**
 * Refuses when the reader is signed in to the network it is reading. A look
 * that cannot be taken is let go: the page may not be on that network yet,
 * and the next look will tell.
 */
async function refuseSignedInReader(name: string, target: CommandTarget, network: "reddit" | "medium"): Promise<void> {
  let handle: string | null = null
  try {
    const state = network === "medium" ? await mediumQuickState(target) : await redditQuickState(target)
    handle = state.checked ? state.handle : null
  } catch (error) {
    console.error(`Could not read who the reader ${name} is signed in as`, error)
  }
  if (handle) {
    throw new Refusal(
      `The reader browser ${name} is signed in to ${network === "medium" ? "Medium" : "Reddit"} as ${handleWords(network, handle)}. A reader has to be signed in to nobody: sign it out on the Browser profiles dashboard.`
    )
  }
}

/**
 * A read of X, in a search account's browser (parts 3 to 5): a browser
 * signed in to a throwaway X account that only ever reads. A read filed under
 * a search account that has used its views, or that X stopped, moves to the
 * one with the most left before it opens anything.
 *
 * The search account is looked at before and after. Signed out, signed in as
 * an account that posts, locked or rate-limited, it is stopped for the rest of
 * the day with the reason, the bell rings once, and the read is refused.
 */
async function runXRead(job: QueuedJob, db: CustomShellDb): Promise<void> {
  const picked = await searcherForLane(job.userId, job.lane, db)
  if ("moveTo" in picked) throw new PutBack({ lane: picked.moveTo })
  const { searcher } = picked
  const session = await ensureSession(job.userId, searcher.profileId, db)
  await touchSession(session.id, db)
  // Found unfit before reading, the read moves to another search account
  // untried, or is refused when none can read.
  const before = await lookAtSearcher(job.userId, searcher, session.target, db)
  if (before) {
    const next = await searcherForLane(job.userId, job.lane, db)
    if ("moveTo" in next) throw new PutBack({ lane: next.moveTo })
    throw new Refusal(`The X search account in ${searcher.profileName} was stopped for today. ${before}`)
  }
  try {
    await runXSearcherJob(job, { target: session.target, searcher }, db)
  } finally {
    await touchSession(session.id, db)
  }
  const after = await lookAtSearcher(job.userId, searcher, session.target, db)
  if (after) throw new Refusal(`The X search account in ${searcher.profileName} was stopped for today after this read. ${after}`)
}

/**
 * Stops a search account X would not let read for the rest of the day, rings
 * the bell once, and returns why, or "" when it may read. A look that cannot
 * be taken is let go: the page may not be on X yet, and the next look will
 * tell.
 */
async function lookAtSearcher(userId: string, searcher: PickedSearcher, target: CommandTarget, db: CustomShellDb): Promise<string> {
  let state: Awaited<ReturnType<typeof xQuickState>> | null = null
  try {
    state = await xQuickState(target)
  } catch (error) {
    console.error(`Could not read who the X search account in ${searcher.profileName} is`, error)
  }
  if (!state?.checked) return ""
  if (state.handle) await saveSearcherHandle(searcher.id, state.handle, db)
  const reason = state.banScreen
    ? `X locked it: "${state.banScreen}". Sort it out in its browser window on the Browser profiles dashboard.`
    : state.blocked
      ? `X is in the way: ${state.reason}.`
      : !state.handle
        ? "It is signed out of X. Sign it in again in its browser window on the Browser profiles dashboard."
        : (await handlePosts(userId, state.handle, db))
          ? `It is signed in as @${state.handle}, one of your accounts that posts. A search account only ever reads, so sign it in to a throwaway.`
          : ""
  if (!reason) return ""
  await stopSearcher(searcher.id, reason, db)
  await ringBell(userId, {
    kind: "x_searcher",
    targetId: `${searcher.id}:${utcDay()}`,
    message: `${NOTICE_HEADINGS.x_searcher} ${searcher.profileName}`,
    detail: `${reason} It reads nothing more today; the other search accounts carry on.`,
    href: "/admin/settings/behaviour",
  }, db)
  return reason
}

/**
 * A read of LinkedIn, in a search account's browser (LinkedIn task, part 3):
 * a browser signed in to a spare LinkedIn account that only ever reads, the
 * same way X's reads run. A read filed under a search account that has used
 * its views, or that LinkedIn stopped, moves to the one with the most left
 * before it opens anything.
 *
 * The search account is looked at before and after. Signed out, signed in as
 * an account that comments, restricted or asking for a code, it is stopped
 * for the rest of the day with the reason, the bell rings once, and the read
 * is refused.
 */
async function runLinkedinRead(job: QueuedJob, db: CustomShellDb): Promise<void> {
  const picked = await linkedinSearcherForLane(job.userId, job.lane, db)
  if ("moveTo" in picked) throw new PutBack({ lane: picked.moveTo })
  const { searcher } = picked
  const session = await ensureSession(job.userId, searcher.profileId, db)
  await touchSession(session.id, db)
  const before = await lookAtLinkedinSearcher(job.userId, searcher, session.target, db)
  if (before) {
    const next = await linkedinSearcherForLane(job.userId, job.lane, db)
    if ("moveTo" in next) throw new PutBack({ lane: next.moveTo })
    throw new Refusal(`The LinkedIn search account in ${searcher.profileName} was stopped for today. ${before}`)
  }
  try {
    await runLinkedinSearcherJob(job, { target: session.target, searcher }, db)
  } finally {
    await touchSession(session.id, db)
  }
  const after = await lookAtLinkedinSearcher(job.userId, searcher, session.target, db)
  if (after) throw new Refusal(`The LinkedIn search account in ${searcher.profileName} was stopped for today after this read. ${after}`)
}

/**
 * Stops a search account LinkedIn would not let read for the rest of the
 * day, rings the bell once, and returns why, or "" when it may read. A look
 * that cannot be taken is let go: the page may not be on LinkedIn yet, and
 * the next look will tell.
 */
async function lookAtLinkedinSearcher(userId: string, searcher: PickedLinkedinSearcher, target: CommandTarget, db: CustomShellDb): Promise<string> {
  let state: Awaited<ReturnType<typeof linkedinQuickState>> | null = null
  try {
    state = await linkedinQuickState(target)
  } catch (error) {
    console.error(`Could not read who the LinkedIn search account in ${searcher.profileName} is`, error)
  }
  if (!state?.checked) return ""
  if (state.slug) await saveLinkedinSearcherSlug(searcher.id, state.slug, db)
  const reason = state.banScreen
    ? `LinkedIn stopped it: "${state.banScreen}". Sort it out in its browser window on the Browser profiles dashboard.`
    : state.codeAsked
      ? "LinkedIn is asking it for the code it emailed. Type it in its browser window on the Browser profiles dashboard."
      : state.blocked
        ? `LinkedIn is in the way: ${state.reason}.`
        : !state.slug
          ? "It is signed out of LinkedIn. Sign it in again in its browser window on the Browser profiles dashboard."
          : (await slugComments(userId, state.slug, db))
            ? `It is signed in as in/${state.slug}, one of your accounts that comments. A search account only ever reads, so sign it in to a spare account.`
            : ""
  if (!reason) return ""
  await stopLinkedinSearcher(searcher.id, reason, db)
  await ringBell(
    userId,
    {
      kind: "linkedin_searcher",
      targetId: `${searcher.id}:${utcDay()}`,
      message: `${NOTICE_HEADINGS.linkedin_searcher} ${searcher.profileName}`,
      detail: `${reason} It reads nothing more today; the other search accounts carry on.`,
      href: "/admin/settings/behaviour",
    },
    db
  )
  return reason
}

/** The account a job works as, by the rule its lane was filed by (`jobAccount`). */
async function accountForJob(job: QueuedJob, db: CustomShellDb): Promise<Account> {
  const account = await jobAccount(job.userId, job.payload, db)
  if (!account) {
    throw new Error("The account this job is for is not set up any more, so there is nothing to browse with.")
  }
  return account
}

/**
 * Writes down who each account inside the profile, or on the phone, is
 * signed in as.
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
  where: { profileId: string } | { phoneId: string; accountId: string },
  target: CommandTarget,
  db: CustomShellDb,
  full = false
): Promise<void> {
  const accounts = await db
    .select({
      id: promoAccounts.id,
      userId: promoAccounts.userId,
      platform: promoAccounts.platform,
      handle: promoAccounts.handle,
      profileId: promoAccounts.profileId,
      banScreenAt: promoAccounts.banScreenAt,
      linkedinCodeAskedAt: promoAccounts.linkedinCodeAskedAt,
    })
    .from(promoAccounts)
    .where(
      and(
        "phoneId" in where
          ? and(eq(promoAccounts.phoneId, where.phoneId), eq(promoAccounts.id, where.accountId))
          : eq(promoAccounts.profileId, where.profileId),
        eq(promoAccounts.userId, userId)
      )
    )

  for (const account of accounts) {
    if (isPhoneAppNetwork(account.platform)) {
      if (!("phoneId" in where)) continue
      try {
        const state = await appQuickState(target, account.platform)
        const signedIn = await saveAppSignIn(account, state, db)
        if (signedIn) {
          await recordPhoneEvent(
            userId,
            where.phoneId,
            "account_signed_in",
            `${handleWords(account.platform, signedIn)} is signed in to ${NETWORK_NAMES[account.platform]}.`,
            db
          )
        }
      } catch (error) {
        console.error(`Could not read who is signed in for account ${account.id}`, error)
      }
      continue
    }
    if (account.platform === "medium") {
      try {
        await saveMediumSignIn(account.id, full ? { ...(await mediumState(target)), checked: true } : await mediumQuickState(target), db)
        // The Medium app shows no joined date, so the reader reads it.
        if ("phoneId" in where) await queueMediumProfileRead(userId, account.id, db)
      } catch (error) {
        // A check a person asked for fails with its reason; after any other
        // job the last saved answer stays.
        if (full) throw error
        console.error(`Could not read who is signed in to Medium for account ${account.id}`, error)
      }
      continue
    }
    if (account.platform === "x") {
      try {
        const state = full ? await xState(target) : await xQuickState(target)
        // A check a person asked for that could not see X says so, rather
        // than writing the account down as signed out.
        if (full && !state.checked) throw new Refusal(state.reason || "The browser could not load X, so who is signed in was not read. Try Check now again.")
        await saveXSignIn(account, state, db)
      } catch (error) {
        // A check a person asked for fails with its reason; after any other
        // job the last saved answer stays.
        if (full) throw error
        console.error(`Could not read who is signed in to X for account ${account.id}`, error)
      }
      continue
    }
    if (account.platform === "linkedin") {
      try {
        const state = full ? await linkedinState(target) : await linkedinQuickState(target)
        // A check a person asked for that could not see LinkedIn says so,
        // rather than writing the account down as signed out.
        if (full && !state.checked) {
          throw new Refusal(state.reason || "The browser could not load LinkedIn, so who is signed in was not read. Try Check now again.")
        }
        await saveLinkedinSignIn(account, state, db)
      } catch (error) {
        // A check a person asked for fails with its reason; after any other
        // job the last saved answer stays.
        if (full) throw error
        console.error(`Could not read who is signed in to LinkedIn for account ${account.id}`, error)
      }
      continue
    }
    if (account.platform !== "reddit") continue
    let signedIn: string | null = null
    if (full) {
      signedIn = await saveSignIn(account, { checked: true, ...(await redditState(target)) }, db)
    } else {
      try {
        signedIn = await saveSignIn(account, await redditQuickState(target), db)
      } catch (error) {
        console.error(`Could not read who is signed in for account ${account.id}`, error)
      }
    }
    // A phone's history shows when its account signs in.
    if (signedIn && "phoneId" in where) {
      await recordPhoneEvent(userId, where.phoneId, "account_signed_in", `u/${signedIn} is signed in to Reddit.`, db)
    }
  }
}

/**
 * Writes who is signed in, and the karma and age that came in the same
 * answer. Signed out, the last karma reading is kept with its own date.
 * An account a ban screen stopped stays blocked with the screen's words
 * until a person lets it run again, whatever a later look says.
 *
 * Returns the handle when the account was signed out and now is signed in.
 */
async function saveSignIn(
  account: { id: string; handle: string },
  state: {
    checked: boolean
    handle: string | null
    karma: number | null
    createdSeconds: number | null
    blocked: boolean
    reason: string
  },
  db: CustomShellDb
): Promise<string | null> {
  if (!state.checked) return null
  const now = new Date()
  await db
    .update(promoAccounts)
    .set({
      handle: state.handle ?? "",
      blocked: sql`CASE WHEN ${promoAccounts.banScreenAt} IS NULL THEN ${state.blocked} ELSE true END`,
      blockedReason: sql`CASE WHEN ${promoAccounts.banScreenAt} IS NULL THEN ${state.blocked ? state.reason : ""} ELSE ${promoAccounts.blockedReason} END`,
      stateReadAt: now,
      ...accountFigures(state, now),
    })
    .where(eq(promoAccounts.id, account.id))
  return !account.handle && state.handle ? state.handle : null
}

/**
 * Writes who an Instagram or TikTok app is signed in as. The first read
 * signed in after a read signed out starts the account's first day, which
 * holds back a profile change (`PROFILE_EDIT_WAIT_HOURS`); a read signed out
 * ends it. An answer that was not checked changes nothing.
 *
 * Returns the handle when the account was signed out and now is signed in.
 */
async function saveAppSignIn(
  account: { id: string; handle: string },
  state: { checked: boolean; handle: string | null },
  db: CustomShellDb,
  now: Date = new Date()
): Promise<string | null> {
  if (!state.checked) return null
  await db
    .update(promoAccounts)
    .set({
      handle: state.handle ?? "",
      stateReadAt: now,
      signedInAt: state.handle ? sql`coalesce(${promoAccounts.signedInAt}, ${now.toISOString()}::timestamptz)` : null,
    })
    .where(eq(promoAccounts.id, account.id))
  return !account.handle && state.handle ? state.handle : null
}
