import { and, desc, eq, gt, gte, inArray, isNotNull, isNull, lte, ne, notInArray, sql } from "drizzle-orm"

import { DATING_APP_WORDS, LIKE_COMMENT_OVER, PROFILE_PAUSED_WORDS, WALK_WORDS } from "@/lib/dating/options"
import { inHourWindow, type DatingSettings } from "@/lib/dating/settings"
import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { cancelAbandonedActions } from "@/server/phone/actions"
import { tidyOldPictures } from "@/server/phone/pictures"
import { datePhones } from "@/server/phone/schema"
import { phoneClock, phoneHour, phoneMidnight, inQuietHours, walkRefusal } from "@/server/tinder/limits"
import { appHasWalk, phoneIsBusy, queueWalk, runWalkList, type RunOptions } from "@/server/tinder/jobs"
import { dateMatches, dateOwnProfiles, dateProfiles, dateWalks } from "@/server/tinder/schema"
import { createOutgoingMessage, settleMessage } from "@/server/tinder/store"

import type { DatingAccount } from "./accounts"

import {
  decideSwipe,
  draftReply,
  makeDateBrief,
  NO_LIKE_COMMENT,
  readChatNotes,
  reviewOwnProfile,
  scoreCard,
  SUPER_LIKE_SCORE,
  writeLikeComment,
  type AiDeps,
} from "./ai"
import { forgetPassedPhotos } from "./forget-photos"
import { photoTestStep } from "./own-profile"
import { newestMessages } from "./dashboard"
import { readDatingSettings } from "./settings"
import { dateAccounts } from "./schema"
import { accountOwner, aiSpendStopped } from "./spend"

/**
 * Date's one background job, run on every pass of the shell's 15-second loop
 * (`background.workers` in `src/app/server-options.ts`).
 *
 * Every pass it starts the next Tinder walk on each phone, and for each
 * profile with a paired phone that is not paused has the AI read new cards
 * and draft replies, sends drafts whose time has come when the automate
 * switch is on, and, while its phone is running, takes the swipe loop one
 * step: read the card in front, wait for the AI's score, like or pass, and
 * again. Each profile is run with its own settings and its own spend cap.
 * A first-photo test is moved on too: a week closed when its seven days are
 * up, and the next photo put first (`own-profile.ts`).
 *
 * Slow work, a walk or an AI call, is started and not waited for, so the pass
 * never holds up the shell's own jobs; each one claims its record so a second
 * pass cannot start it twice. A test waits for it through `work`.
 *
 * What ends the loop, in Tyler's words of 17 Oct 2026: Stop, a hit limit, a
 * stop screen, the spend cap, or the phone going away. Quiet hours pause it.
 * With a swiping schedule (18 Oct 2026), the schedule starts it at the
 * window's first hour and stops it at its end; see `scheduleStep`.
 *
 * The loop's state is each profile's own (part 2 of "facebook/01"), so a
 * Tinder and a Facebook profile share one phone, each in its own hours. The
 * phone still runs one walk at a time for either. On Facebook Dating the
 * loop reads Likes you before the suggested profiles (part 9), has the AI
 * write a comment for a like 10 or more over the line (part 10), waits a day
 * when Facebook has nobody left to suggest (part 5), and leaves a card the
 * member met on another profile to the member when it matched or chatted
 * there (part 15). A new app version on the phone is checked before the
 * profile swipes again (part 7).
 */

/** The walks the loop itself asks for. */
const LOOP_WALKS = ["read-card", "like", "super-like", "pass", "read-matches"] as const

/** On Facebook Dating, Likes you is looked at again this often once it was empty (part 9). */
const LIKES_YOU_EVERY_MS = 15 * 60_000

/** A check after an update that failed without stopping the profile is tried again after this long (part 7). */
const CHECK_AGAIN_MS = 10 * 60_000

/** A phone silent this long while running has gone away, and the loop stops. */
const AWAY_STOPS_LOOP_MS = 2 * 60_000

/** While running, the chat list is looked at this often, for new matches and new messages. */
const READ_MATCHES_EVERY_MS = 10 * 60_000

/** At most this many cards are read by the AI on one pass. */
const CARDS_PER_PASS = 10

/** Tidying old pictures runs at most this often in one process. */
const TIDY_EVERY_MS = 60 * 60_000
let lastTidy = 0

/** Deleting old passes' photos runs once a day in one process. */
const FORGET_EVERY_MS = 24 * 60 * 60_000
let lastForget = 0

export type PassOptions = RunOptions & AiDeps

export async function runDatingPass(
  db: CustomShellDb = defaultDb,
  now: Date = new Date(),
  options: PassOptions = {}
): Promise<{ work: Promise<unknown>[] }> {
  const work: Promise<unknown>[] = []
  await cancelAbandonedActions(db, now)
  if (now.getTime() - lastTidy > TIDY_EVERY_MS) {
    lastTidy = now.getTime()
    work.push(tidyOldPictures(db, now).catch((error) => console.error("Old Date pictures could not be tidied", error)))
  }
  if (now.getTime() - lastForget > FORGET_EVERY_MS) {
    lastForget = now.getTime()
    work.push(forgetPassedPhotos(db, now).catch((error) => console.error("Old passes' photos could not be deleted", error)))
  }

  // A paused profile gets nothing: Pause already stopped its loop and called off its walks.
  const runners = await db
    .select({ account: dateAccounts, phone: datePhones })
    .from(dateAccounts)
    .innerJoin(datePhones, eq(datePhones.id, dateAccounts.phoneId))
    .where(and(isNotNull(datePhones.keyEncrypted), isNull(dateAccounts.pausedAt)))
  for (const { account, phone } of runners) {
    try {
      const settings = await readDatingSettings(account.id, db)
      work.push(...aiWork(account, db, now, options))
      await sendDueDrafts(account, phone, settings, db, now)
      await checkNewVersion(account, phone, db, now)
      await setDiscoveryIfOwed(account, phone, settings, db, now)
      await photoTestStep(account, db, now)
      const scheduled = await scheduleStep(account, phone, settings, db, now)
      if (scheduled.running) await loopStep(scheduled, phone, settings, db, now, work, options)
    } catch (error) {
      console.error(`The Date pass failed for profile ${account.id} on phone ${phone.id}`, error)
    }
  }

  // Last, so a walk queued above starts on this pass.
  work.push(...(await runWalkList(db, now, options)))
  return { work }
}

type Phone = typeof datePhones.$inferSelect

/** AI calls already going in this process, so a pass never starts one a pass before it started. */
const going = new Set<string>()

function detached(key: string, job: () => Promise<unknown>): Promise<unknown>[] {
  if (going.has(key)) return []
  going.add(key)
  return [
    job()
      .catch((error) => console.error(`Date AI job ${key} failed`, error))
      .finally(() => going.delete(key)),
  ]
}

/** A chat whose newest message is ours, unanswered this long, gets its one follow-up. Tyler's choice, 18 Oct 2026. */
export const NUDGE_AFTER_MS = 3 * 86_400_000

/**
 * The AI's part of a pass: new cards read; chats with something new read for
 * notes; replies drafted where their message is newest; a first message for a
 * new match whose card Date read; the one follow-up on a chat quiet for three
 * days; the brief for an agreed date; and the member's own profile reviewed
 * once it is read. Sample records are never sent to the AI, and a chat that is
 * over, moved to text or taken over by the member is left alone.
 */
function aiWork(account: DatingAccount, db: CustomShellDb, now: Date, deps: AiDeps): Promise<unknown>[] {
  return detached(`ai:${account.id}`, async () => {
    const settings = await readDatingSettings(account.id, db)
    if (await aiSpendStopped(accountOwner(account), settings.spendCapDollars, db, now)) return
    const cards = await db
      .select({ id: dateProfiles.id })
      .from(dateProfiles)
      .where(and(eq(dateProfiles.accountId, account.id), isNull(dateProfiles.aiReadAt), eq(dateProfiles.aiError, ""), eq(dateProfiles.sample, false)))
      .orderBy(desc(dateProfiles.readAt))
      .limit(CARDS_PER_PASS)
    for (const card of cards) await scoreCard(card.id, db, now, deps)

    const live = await db
      .select()
      .from(dateMatches)
      .where(and(eq(dateMatches.accountId, account.id), eq(dateMatches.sample, false), isNull(dateMatches.unmatchedAt)))
    const newest = new Map((await newestMessages(live.map((match) => match.id), db)).map((message) => [message.matchId, message]))

    // Notes first, so a draft written on this pass already knows the new facts.
    for (const match of live) {
      const last = newest.get(match.id)
      if (last && match.messagesFromThem > 0 && last.position > match.notesReadThrough) await readChatNotes(match.id, db, now, deps)
    }

    const writable = live.filter(
      (match) =>
        !match.flaggedReason &&
        !match.endedAt &&
        !match.movedToTextAt &&
        !match.aiOff &&
        match.draft === "" &&
        match.aiError === ""
    )
    for (const match of writable) {
      const last = newest.get(match.id)
      // The member dismissed the draft for this very message: no new one until the chat moves on.
      if (match.draftDismissedFor !== null && match.draftDismissedFor === (last?.id ?? "opener")) continue
      if (!last) {
        // A new match nobody has written to, whose card Date read: a first
        // message. Not while the chat list says there is something to read.
        if (match.profileId && !match.needsRead) await draftReply(match.id, db, now, deps, { mode: "opener" })
        continue
      }
      // Their move otherwise. `draftReply` makes the final call.
      if (last.direction === "in" || last.status !== "sent") {
        await draftReply(match.id, db, now, deps)
        continue
      }
      const sent = last.sentAt ?? last.createdAt
      if (!match.nudgedAt && now.getTime() - sent.getTime() >= NUDGE_AFTER_MS) await draftReply(match.id, db, now, deps, { mode: "nudge" })
    }

    // Read again: the notes above may have just noted a yes.
    const agreed = await db
      .select({ id: dateMatches.id })
      .from(dateMatches)
      .where(
        and(
          eq(dateMatches.accountId, account.id),
          eq(dateMatches.sample, false),
          isNull(dateMatches.unmatchedAt),
          isNotNull(dateMatches.dateAcceptedAt),
          isNull(dateMatches.briefMadeAt)
        )
      )
    for (const match of agreed) await makeDateBrief(match.id, db, now, deps)

    const [own] = await db
      .select({ accountId: dateOwnProfiles.accountId })
      .from(dateOwnProfiles)
      .where(and(eq(dateOwnProfiles.accountId, account.id), isNull(dateOwnProfiles.reviewMadeAt), eq(dateOwnProfiles.aiError, "")))
      .limit(1)
    if (own) await reviewOwnProfile(account.id, db, now, deps)
  })
}

/**
 * With the automate switch on, a draft whose time has come goes out: it is
 * written down as the AI's message and a send walk is put on the list. A draft
 * made while the switch was off is given its time now. Switching automate off
 * stops new sends; a send already on the list still goes.
 */
async function sendDueDrafts(account: DatingAccount, phone: Phone, settings: DatingSettings, db: CustomShellDb, now: Date): Promise<void> {
  if (!settings.automate || account.stoppedReason || !phone.inControl) return
  const drafts = await db
    .select()
    .from(dateMatches)
    .where(
      and(
        eq(dateMatches.accountId, account.id),
        eq(dateMatches.sample, false),
        isNull(dateMatches.unmatchedAt),
        isNull(dateMatches.flaggedReason),
        isNull(dateMatches.endedAt),
        isNull(dateMatches.movedToTextAt),
        eq(dateMatches.aiOff, false),
        ne(dateMatches.draft, "")
      )
    )
  for (const match of drafts) {
    if (!match.draftSendAt) {
      const delay = (settings.replyDelayMin + Math.random() * (settings.replyDelayMax - settings.replyDelayMin)) * 60_000
      await db
        .update(dateMatches)
        .set({ draftSendAt: new Date((match.draftMadeAt ?? now).getTime() + delay) })
        .where(eq(dateMatches.id, match.id))
      continue
    }
    if (match.draftSendAt > now) continue
    if (await walkRefusal(limitOwner(account, phone), "send-message", settings, db, now)) return
    // The first draft only: two more from "Show 3" are for the member to pick from.
    const messageId = await createOutgoingMessage(
      match.id,
      match.draft,
      "ai",
      { proposesDate: match.draftProposesDate, draftText: match.draft, openerStyle: match.draftKind === "opener" ? match.draftOpenerStyle : null },
      db,
      now
    )
    try {
      await queueWalk({ userId: phone.userId, accountId: account.id, phoneId: phone.id, kind: "send-message", input: { matchId: match.id, messageId }, askedBy: "ai" }, db, now)
    } catch (error) {
      await settleMessage(messageId, "failed", error instanceof Error ? error.message : "It could not be put on the phone's list.", db, now)
    }
  }
}

/** Whose limits a walk counts against: the profile, its app and its phone's clock. */
function limitOwner(account: DatingAccount, phone: Phone) {
  return { accountId: account.id, app: account.app, timeZone: phone.timeZone }
}

/**
 * Ends the profile's loop with the reason in words. A limit passes the moment
 * it allows again, so the schedule can start the loop once more inside its
 * window.
 */
async function stopLoop(account: DatingAccount, why: string, db: CustomShellDb, now: Date, resumeAt: Date | null = null): Promise<void> {
  await db
    .update(dateAccounts)
    .set({ running: false, stopWhy: why, stopWhyAt: now, resumeAt, updatedAt: now })
    .where(and(eq(dateAccounts.id, account.id), eq(dateAccounts.running, true)))
}

/** The profile's loop walks waiting on the phone are called off, with the reason. A send already on its way is not. */
async function cancelLoopWalks(accountId: string, why: string, db: CustomShellDb, now: Date): Promise<void> {
  await db
    .update(dateWalks)
    .set({ status: "cancelled", error: why, finishedAt: now })
    .where(and(eq(dateWalks.accountId, accountId), eq(dateWalks.status, "waiting"), eq(dateWalks.askedBy, "ai"), inArray(dateWalks.kind, LOOP_WALKS)))
}

/**
 * A new version of the profile's app on the phone (part 7 of "facebook/01"):
 * a read-only check of its buttons goes on the list before anything else of
 * the profile's, so the loop waits behind it. Missing buttons stop the
 * profile; all found marks the version checked. One that failed for another
 * reason, such as the phone being picked up, is tried again ten minutes
 * later.
 */
async function checkNewVersion(account: DatingAccount, phone: Phone, db: CustomShellDb, now: Date): Promise<void> {
  if (!appHasWalk(account.app, "check-labels") || account.stoppedReason || !phone.keyEncrypted || !phone.inControl) return
  const version = account.app === "facebook" ? phone.facebookVersion : phone.tinderVersion
  const checked = account.app === "facebook" ? phone.facebookVersionChecked : phone.tinderVersionChecked
  if (!version || version === checked) return
  if (!phone.lastSeenAt || now.getTime() - phone.lastSeenAt.getTime() > AWAY_STOPS_LOOP_MS) return
  const [recent] = await db
    .select({ id: dateWalks.id })
    .from(dateWalks)
    .where(and(eq(dateWalks.accountId, account.id), eq(dateWalks.kind, "check-labels"), gt(dateWalks.createdAt, new Date(now.getTime() - CHECK_AGAIN_MS))))
    .limit(1)
  if (recent) return
  try {
    await queueWalk({ userId: phone.userId, accountId: account.id, phoneId: phone.id, kind: "check-labels", input: { version }, askedBy: "ai" }, db, now)
  } catch (error) {
    console.error(`The check of ${DATING_APP_WORDS[account.app].name} ${version} could not be put on phone ${phone.id}'s list`, error)
  }
}

/**
 * The phone-clock day a swiping window opened, such as "2099-01-01", for a
 * moment inside it. A time zone the server does not know counts as UTC, the
 * same as `phoneHour`, so one odd phone never stops its own pass.
 */
function windowDay(start: number, timeZone: string, now: Date): string {
  const hoursIn = (phoneHour(timeZone, now) - start + 24) % 24
  const opened = new Date(now.getTime() - hoursIn * 3_600_000)
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: timeZone || "UTC", year: "numeric", month: "2-digit", day: "2-digit" }).format(opened)
  } catch {
    return opened.toISOString().slice(0, 10)
  }
}

/**
 * The swiping schedule, Tyler's choice of 18 Oct 2026: one window every day,
 * such as 19:00 to 22:00 on the phone's clock.
 *
 * - Inside the window the schedule starts the loop once, when the phone is
 *   here, paired, in control and not stopped on a Tinder screen, and the
 *   spend cap has room. It never resumes a stop screen: that needs Resume.
 * - A limit that ended the loop inside the window (an hour's swipes) lets the
 *   schedule start it again once the limit allows, and a phone that went away
 *   for a while gets it started again once it is back. Anything else that
 *   ended it (Stop, a failed walk, nobody new) holds until the next day's
 *   window. Stop pressed inside the window holds it the same way.
 * - At the window's end the schedule stops a loop that started inside the
 *   window, by the schedule or by hand. A loop the member started by hand
 *   outside the window is theirs to stop.
 *
 * Returns the profile as it now stands.
 */
async function scheduleStep(account: DatingAccount, phone: Phone, settings: DatingSettings, db: CustomShellDb, now: Date): Promise<DatingAccount> {
  const { scheduleStart: start, scheduleEnd: end } = settings
  if (start === null || end === null) return account
  const inWindow = inHourWindow(start, end, phoneHour(phone.timeZone, now))

  if (!inWindow) {
    const startedInWindow =
      account.runningSince !== null &&
      now.getTime() - account.runningSince.getTime() < 24 * 3_600_000 &&
      inHourWindow(start, end, phoneHour(phone.timeZone, account.runningSince))
    if (!account.running || (account.startedBy !== "schedule" && !startedInWindow)) return account
    const why = `Schedule: swiping ends at ${end}:00 on the phone's clock, and starts again at ${start}:00.`
    await stopLoop(account, why, db, now)
    await cancelLoopWalks(account.id, why, db, now)
    return { ...account, running: false }
  }

  if (account.running) return account
  const day = windowDay(start, phone.timeZone, now)
  const limitPassed = account.resumeAt !== null && account.resumeAt <= now
  if (account.scheduleDay === day && !limitPassed) return account
  if (!phone.keyEncrypted || !phone.inControl || account.stoppedReason) return account
  if (!phone.lastSeenAt || now.getTime() - phone.lastSeenAt.getTime() > AWAY_STOPS_LOOP_MS) return account
  if (await aiSpendStopped(accountOwner(account), settings.spendCapDollars, db, now)) return account
  // The phone runs one app at a time: while another profile on it swipes, such as one started by hand
  // outside its own window, this one waits and the schedule tries again on the next pass.
  const [started] = await db
    .update(dateAccounts)
    .set({ running: true, runningSince: now, startedBy: "schedule", scheduleDay: day, resumeAt: null, stopWhy: "", stopWhyAt: null, updatedAt: now })
    .where(
      and(
        eq(dateAccounts.id, account.id),
        eq(dateAccounts.running, false),
        sql`not exists (select 1 from "date_accounts" "other" where "other"."phone_id" = ${phone.id} and "other"."id" <> ${account.id} and "other"."running")`
      )
    )
    .returning()
  return started ?? account
}

/**
 * The app's own distance and ages are set to Date's when a setting changed
 * or Resume was pressed: one `set-discovery` walk, put on the list when the
 * phone is here and free. On Facebook Dating it sets Dating's own settings
 * (part 13 of "facebook/01"). A walk that fails is not tried again by
 * itself; changing a setting or Resume tries again.
 */
async function setDiscoveryIfOwed(account: DatingAccount, phone: Phone, settings: DatingSettings, db: CustomShellDb, now: Date): Promise<void> {
  if (!account.discoveryOwed || !appHasWalk(account.app, "set-discovery") || !phone.keyEncrypted || !phone.inControl || account.stoppedReason) return
  // A phone asleep in a pocket would leave the walk waiting until it is called off; it goes once the phone is checking in.
  if (!phone.lastSeenAt || now.getTime() - phone.lastSeenAt.getTime() > AWAY_STOPS_LOOP_MS) return
  if (inQuietHours(settings, phoneHour(phone.timeZone, now)) || (await phoneIsBusy(phone.id, db))) return
  // Marked done before it is queued, so a refusal can never hold up the rest of the pass on every pass.
  await db.update(dateAccounts).set({ discoveryOwed: false }).where(eq(dateAccounts.id, account.id))
  try {
    await queueWalk(
      {
        userId: phone.userId,
        accountId: account.id,
        phoneId: phone.id,
        kind: "set-discovery",
        input: { distanceKm: settings.maxDistanceKm, ageMin: settings.ageMin, ageMax: settings.ageMax },
        askedBy: "ai",
      },
      db,
      now
    )
  } catch (error) {
    console.error(`${DATING_APP_WORDS[account.app].name}'s distance and ages could not be put on phone ${phone.id}'s list`, error)
  }
}

/**
 * A like is a Super Like when the card scored 95 or more and no Super Like
 * was tried for this profile since midnight on its phone's clock. A try that
 * met Tinder's offer to buy more ended as a plain like, and still counts as
 * today's, so the offer is met once a day at most. Facebook Dating has no
 * Super Like.
 */
async function superLikeDue(account: DatingAccount, phone: Phone, score: number | null, db: CustomShellDb, now: Date): Promise<boolean> {
  if (score === null || score < SUPER_LIKE_SCORE || !appHasWalk(account.app, "super-like")) return false
  const [tried] = await db
    .select({ id: dateWalks.id })
    .from(dateWalks)
    .where(
      and(
        eq(dateWalks.accountId, account.id),
        eq(dateWalks.kind, "super-like"),
        inArray(dateWalks.status, ["waiting", "running", "done", "failed"]),
        gte(dateWalks.createdAt, phoneMidnight(phone.timeZone, now))
      )
    )
    .limit(1)
  return !tried
}

/**
 * One step of the profile's swipe loop. The phone must be here, in control
 * and free, and the profile not stopped. The card read last is liked or
 * passed once the AI has scored it; with no card waiting, the next one is
 * read. Every ten minutes the chat list is read too.
 *
 * On Facebook Dating the next card comes from Likes you while anyone is on
 * it, and the suggested profiles after that; Likes you is looked at again
 * fifteen minutes after it was last empty (part 9).
 */
async function loopStep(
  account: DatingAccount,
  phone: Phone,
  settings: DatingSettings,
  db: CustomShellDb,
  now: Date,
  work: Promise<unknown>[],
  deps: AiDeps
): Promise<void> {
  const appName = DATING_APP_WORDS[account.app].name
  if (account.stoppedReason || !phone.inControl) {
    await stopLoop(account, account.stoppedReason ? `A ${appName} screen stopped this profile.` : "Date was switched off in the dashboard's Phone panel.", db, now)
    return
  }
  if (!phone.lastSeenAt || now.getTime() - phone.lastSeenAt.getTime() > AWAY_STOPS_LOOP_MS) {
    const since = phone.lastSeenAt ? ` since ${phoneClock(phone.timeZone, phone.lastSeenAt)}` : ""
    // Allowed again at once: the schedule starts the loop again when the phone is back inside its window.
    await stopLoop(account, `The phone went away${since}: it stopped checking in.`, db, now, now)
    return
  }
  const cap = await aiSpendStopped(accountOwner(account), settings.spendCapDollars, db, now)
  if (cap) {
    await stopLoop(account, cap, db, now)
    return
  }
  if (inQuietHours(settings, phoneHour(phone.timeZone, now))) return
  // The phone runs one walk at a time, for this profile or another on it.
  if (await phoneIsBusy(phone.id, db)) return

  // The loop's own last walk since Start: one that failed ends the loop
  // rather than being tried again and again, and the app saying nobody new
  // is around ends it too. On Facebook that waits for the next day.
  const runningSince = account.runningSince ?? now
  const [lastWalk] = await db
    .select()
    .from(dateWalks)
    .where(and(eq(dateWalks.accountId, account.id), eq(dateWalks.askedBy, "ai"), inArray(dateWalks.kind, LOOP_WALKS), gt(dateWalks.createdAt, new Date(runningSince.getTime() - 1))))
    .orderBy(desc(dateWalks.createdAt))
    .limit(1)
  if (lastWalk?.status === "failed") {
    await stopLoop(account, `${WALK_WORDS[lastWalk.kind]} failed: ${lastWalk.error}`, db, now)
    return
  }
  if (lastWalk?.kind === "read-card" && lastWalk.status === "done" && lastWalk.result?.empty === true && lastWalk.input.likesYou !== true) {
    if (lastWalk.result.outOfSuggestions === true) {
      const tomorrow = new Date(phoneMidnight(phone.timeZone, now).getTime() + 24 * 3_600_000)
      await stopLoop(account, `Facebook Dating has nobody more to suggest today. Swiping can start again after midnight, at ${phoneClock(phone.timeZone, tomorrow)}.`, db, now, tomorrow)
      return
    }
    await stopLoop(account, `${appName} has nobody new to show nearby right now.`, db, now)
    return
  }

  const [lastLook] = await db
    .select({ createdAt: dateWalks.createdAt })
    .from(dateWalks)
    .where(and(eq(dateWalks.accountId, account.id), eq(dateWalks.kind, "read-matches")))
    .orderBy(desc(dateWalks.createdAt))
    .limit(1)
  if (!lastLook || now.getTime() - lastLook.createdAt.getTime() > READ_MATCHES_EVERY_MS) {
    await queueWalk({ userId: phone.userId, accountId: account.id, phoneId: phone.id, kind: "read-matches", askedBy: "ai" }, db, now)
    return
  }

  // The card read since Start that nobody has swiped yet. A weekly match is
  // already a match, and is never swiped.
  const [waiting] = await db
    .select()
    .from(dateProfiles)
    .where(
      and(
        eq(dateProfiles.accountId, account.id),
        eq(dateProfiles.swipe, "none"),
        eq(dateProfiles.sample, false),
        ne(dateProfiles.source, "weekly"),
        gt(dateProfiles.readAt, new Date(runningSince.getTime() - 1)),
        lte(dateProfiles.readAt, now)
      )
    )
    .orderBy(desc(dateProfiles.readAt))
    .limit(1)
  if (!waiting) {
    const likesYou = account.app === "facebook" && (await likesYouDue(account, db, now))
    await queueWalk({ userId: phone.userId, accountId: account.id, phoneId: phone.id, kind: "read-card", ...(likesYou ? { input: { likesYou: true } } : {}), askedBy: "ai" }, db, now)
    return
  }
  // Met on another profile and matched or chatted there: the member decides (part 15). The loop waits on them.
  if (waiting.seenOnOutcome === "matched" || waiting.seenOnOutcome === "chatted") return
  if (waiting.aiError) {
    await stopLoop(account, `The AI could not read ${waiting.name}'s card: ${waiting.aiError}`, db, now)
    return
  }
  const decision = decideSwipe(waiting, settings)
  if (!decision) {
    // Not scored yet: the AI's part of the pass is on it.
    work.push(...aiWork(account, db, now, deps))
    return
  }
  // A Facebook like 10 or more over the line carries a comment the AI writes first (part 10).
  if (
    account.app === "facebook" &&
    decision === "like" &&
    (waiting.aiScore ?? 0) >= settings.likeAbove + LIKE_COMMENT_OVER &&
    !waiting.likeComment &&
    waiting.likeCommentOn !== NO_LIKE_COMMENT
  ) {
    work.push(...detached(`comment:${waiting.id}`, () => writeLikeComment(waiting.id, db, now, deps)))
    return
  }
  const kind = decision === "like" && (await superLikeDue(account, phone, waiting.aiScore, db, now)) ? "super-like" : decision
  const refusal = await walkRefusal(limitOwner(account, phone), kind, settings, db, now)
  if (refusal?.limit === "gap") return
  if (refusal) {
    await stopLoop(account, refusal.words, db, now, refusal.until)
    return
  }
  await queueWalk({ userId: phone.userId, accountId: account.id, phoneId: phone.id, kind, input: { profileId: waiting.id }, askedBy: "ai" }, db, now)
}

/**
 * Whether Likes you is read next, on Facebook Dating: when it has never been
 * read, when the last read found someone, or fifteen minutes after it was
 * last empty.
 */
async function likesYouDue(account: DatingAccount, db: CustomShellDb, now: Date): Promise<boolean> {
  const [last] = await db
    .select({ status: dateWalks.status, result: dateWalks.result, createdAt: dateWalks.createdAt })
    .from(dateWalks)
    .where(and(eq(dateWalks.accountId, account.id), eq(dateWalks.kind, "read-card"), sql`${dateWalks.input} ->> 'likesYou' = 'true'`, notInArray(dateWalks.status, ["waiting", "running"])))
    .orderBy(desc(dateWalks.createdAt))
    .limit(1)
  if (!last) return true
  if (last.status === "done" && last.result?.empty !== true) return true
  return now.getTime() - last.createdAt.getTime() > LIKES_YOU_EVERY_MS
}

/** The profile's paired phone, or a refusal saying how to get one. */
async function accountPhone(account: DatingAccount, db: CustomShellDb): Promise<Phone> {
  const [phone] = account.phoneId
    ? await db
        .select()
        .from(datePhones)
        .where(and(eq(datePhones.id, account.phoneId), eq(datePhones.userId, account.userId)))
        .limit(1)
    : []
  if (!phone) throw new Error("No phone is paired for this profile yet. Pair one in the dashboard's Phone panel first.")
  return phone
}

/** Start on the dashboard: the profile's loop runs from the next pass until Stop or a limit. */
export async function startLoop(account: DatingAccount, db: CustomShellDb = defaultDb, now: Date = new Date()): Promise<void> {
  if (account.pausedAt) throw new Error(PROFILE_PAUSED_WORDS)
  const phone = await accountPhone(account, db)
  if (!phone.keyEncrypted) throw new Error(`${phone.name} is not paired. Pair it in the dashboard's Phone panel first.`)
  if (!phone.inControl) throw new Error(`Date is switched off for ${phone.name}. Switch it on in the dashboard's Phone panel first.`)
  if (account.stoppedReason) throw new Error(`A ${DATING_APP_WORDS[account.app].name} screen stopped this profile. Press Resume in the dashboard's Phone panel once it is sorted.`)
  const settings = await readDatingSettings(account.id, db)
  const cap = await aiSpendStopped(accountOwner(account), settings.spendCapDollars, db, now)
  if (cap) throw new Error(cap)
  // Two profiles on one phone take turns: another one swiping now has the phone.
  const [other] = await db
    .select({ name: dateAccounts.name, app: dateAccounts.app })
    .from(dateAccounts)
    .where(and(eq(dateAccounts.phoneId, phone.id), ne(dateAccounts.id, account.id), eq(dateAccounts.running, true)))
    .limit(1)
  if (other) throw new Error(`${DATING_APP_WORDS[other.app].name} (${other.name}) is swiping on ${phone.name} now. Stop it first; the phone runs one app at a time.`)
  // Started by hand inside the swiping window counts as that window's start, so the schedule does not start it a second time.
  const { scheduleStart: start, scheduleEnd: end } = settings
  const inWindow = start !== null && end !== null && inHourWindow(start, end, phoneHour(phone.timeZone, now))
  await db
    .update(dateAccounts)
    .set({
      running: true,
      runningSince: now,
      startedBy: "member",
      resumeAt: null,
      stopWhy: "",
      stopWhyAt: null,
      updatedAt: now,
      ...(inWindow ? { scheduleDay: windowDay(start, phone.timeZone, now) } : {}),
    })
    .where(eq(dateAccounts.id, account.id))
}

/** Stop on the dashboard. The walk already on the phone finishes; nothing new starts for this profile. */
export async function stopLoopByHand(account: DatingAccount, db: CustomShellDb = defaultDb, now: Date = new Date()): Promise<void> {
  const phone = await accountPhone(account, db)
  await stopLoop(account, "Stopped by you.", db, now)
  // Inside the swiping window, Stop holds until the next day's window.
  const settings = await readDatingSettings(account.id, db)
  const { scheduleStart: start, scheduleEnd: end } = settings
  if (start !== null && end !== null && inHourWindow(start, end, phoneHour(phone.timeZone, now))) {
    await db
      .update(dateAccounts)
      .set({ scheduleDay: windowDay(start, phone.timeZone, now), resumeAt: null })
      .where(eq(dateAccounts.id, account.id))
  }
  // What the loop queued and the phone has not started is called off with
  // it. An automated reply already on its way is not: Stop is the swiping.
  await cancelLoopWalks(account.id, "Stopped by you.", db, now)
}
