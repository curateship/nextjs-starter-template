import { and, desc, eq, gt, inArray, isNotNull, isNull, lte, ne } from "drizzle-orm"

import { WALK_WORDS } from "@/lib/dating/options"
import type { DatingSettings } from "@/lib/dating/settings"
import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { cancelAbandonedActions } from "@/server/phone/actions"
import { tidyOldPictures } from "@/server/phone/pictures"
import { datePhones } from "@/server/phone/schema"
import { phoneClock, phoneHour, inQuietHours, walkRefusal } from "@/server/tinder/limits"
import { phoneIsBusy, queueWalk, runWalkList, type RunOptions } from "@/server/tinder/jobs"
import { dateMatches, dateOwnProfiles, dateProfiles, dateWalks } from "@/server/tinder/schema"
import { createOutgoingMessage, settleMessage } from "@/server/tinder/store"

import { decideSwipe, draftReply, makeDateBrief, readChatNotes, reviewOwnProfile, scoreCard, type AiDeps } from "./ai"
import { newestMessages } from "./dashboard"
import { readDatingSettings } from "./settings"
import { spendCapReached } from "./spend"

/**
 * Date's one background job, run on every pass of the shell's 15-second loop
 * (`background.workers` in `src/app/server-options.ts`).
 *
 * Every pass it starts the next Tinder walk on each phone, has the AI read new
 * cards and draft replies, sends drafts whose time has come when the automate
 * switch is on, and, while a phone is running, takes the swipe loop one step:
 * read the card in front, wait for the AI's score, like or pass, and again.
 *
 * Slow work, a walk or an AI call, is started and not waited for, so the pass
 * never holds up the shell's own jobs; each one claims its record so a second
 * pass cannot start it twice. A test waits for it through `work`.
 *
 * What ends the loop, in Tyler's words of 17 Oct 2026: Stop, a hit limit, a
 * stop screen, the spend cap, or the phone going away. Quiet hours pause it.
 */

/** The walks the loop itself asks for. */
const LOOP_WALKS = ["read-card", "like", "pass", "read-matches"] as const

/** A phone silent this long while running has gone away, and the loop stops. */
const AWAY_STOPS_LOOP_MS = 2 * 60_000

/** While running, the chat list is looked at this often, for new matches and new messages. */
const READ_MATCHES_EVERY_MS = 10 * 60_000

/** At most this many cards are read by the AI on one pass. */
const CARDS_PER_PASS = 10

/** Tidying old pictures runs at most this often in one process. */
const TIDY_EVERY_MS = 60 * 60_000
let lastTidy = 0

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

  const phones = await db.select().from(datePhones).where(isNotNull(datePhones.keyEncrypted))
  for (const phone of phones) {
    try {
      const settings = await readDatingSettings(phone.userId, phone.workspaceId, db)
      work.push(...aiWork(phone, db, now, options))
      await sendDueDrafts(phone, settings, db, now)
      if (phone.running) await loopStep(phone, settings, db, now, work, options)
    } catch (error) {
      console.error(`The Date pass failed for phone ${phone.id}`, error)
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
function aiWork(phone: Phone, db: CustomShellDb, now: Date, deps: AiDeps): Promise<unknown>[] {
  return detached(`ai:${phone.id}`, async () => {
    const settings = await readDatingSettings(phone.userId, phone.workspaceId, db)
    if (await spendCapReached(phone.userId, settings.spendCapDollars, db, now)) return
    const cards = await db
      .select({ id: dateProfiles.id })
      .from(dateProfiles)
      .where(and(eq(dateProfiles.phoneId, phone.id), isNull(dateProfiles.aiReadAt), eq(dateProfiles.aiError, ""), eq(dateProfiles.sample, false)))
      .orderBy(desc(dateProfiles.readAt))
      .limit(CARDS_PER_PASS)
    for (const card of cards) await scoreCard(card.id, db, now, deps)

    const live = await db
      .select()
      .from(dateMatches)
      .where(and(eq(dateMatches.phoneId, phone.id), eq(dateMatches.sample, false), isNull(dateMatches.unmatchedAt)))
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
          eq(dateMatches.phoneId, phone.id),
          eq(dateMatches.sample, false),
          isNull(dateMatches.unmatchedAt),
          isNotNull(dateMatches.dateAcceptedAt),
          isNull(dateMatches.briefMadeAt)
        )
      )
    for (const match of agreed) await makeDateBrief(match.id, db, now, deps)

    const [own] = await db
      .select({ phoneId: dateOwnProfiles.phoneId })
      .from(dateOwnProfiles)
      .where(and(eq(dateOwnProfiles.phoneId, phone.id), isNull(dateOwnProfiles.reviewMadeAt), eq(dateOwnProfiles.aiError, "")))
      .limit(1)
    if (own) await reviewOwnProfile(phone.id, db, now, deps)
  })
}

/**
 * With the automate switch on, a draft whose time has come goes out: it is
 * written down as the AI's message and a send walk is put on the list. A draft
 * made while the switch was off is given its time now. Switching automate off
 * stops new sends; a send already on the list still goes.
 */
async function sendDueDrafts(phone: Phone, settings: DatingSettings, db: CustomShellDb, now: Date): Promise<void> {
  if (!settings.automate || phone.stoppedReason || !phone.inControl) return
  const drafts = await db
    .select()
    .from(dateMatches)
    .where(
      and(
        eq(dateMatches.phoneId, phone.id),
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
    if (await walkRefusal(phone, "send-message", settings, db, now)) return
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
      await queueWalk({ userId: phone.userId, phoneId: phone.id, kind: "send-message", input: { matchId: match.id, messageId }, askedBy: "ai" }, db, now)
    } catch (error) {
      await settleMessage(messageId, "failed", error instanceof Error ? error.message : "It could not be put on the phone's list.", db, now)
    }
  }
}

/** Ends the loop with the reason in words. */
async function stopLoop(phone: Phone, why: string, db: CustomShellDb, now: Date): Promise<void> {
  await db
    .update(datePhones)
    .set({ running: false, stopWhy: why, stopWhyAt: now, updatedAt: now })
    .where(and(eq(datePhones.id, phone.id), eq(datePhones.running, true)))
}

/**
 * One step of the swipe loop. The phone must be here, in control and not
 * stopped. The card read last is liked or passed once the AI has scored it;
 * with no card waiting, the next one is read. Every ten minutes the chat list
 * is read too.
 */
async function loopStep(phone: Phone, settings: DatingSettings, db: CustomShellDb, now: Date, work: Promise<unknown>[], deps: AiDeps): Promise<void> {
  if (phone.stoppedReason || !phone.inControl) {
    await stopLoop(phone, phone.stoppedReason ? "A Tinder screen stopped the phone." : "Date was switched off on the Phone screen.", db, now)
    return
  }
  if (!phone.lastSeenAt || now.getTime() - phone.lastSeenAt.getTime() > AWAY_STOPS_LOOP_MS) {
    const since = phone.lastSeenAt ? ` since ${phoneClock(phone.timeZone, phone.lastSeenAt)}` : ""
    await stopLoop(phone, `The phone went away${since}: it stopped checking in.`, db, now)
    return
  }
  const cap = await spendCapReached(phone.userId, settings.spendCapDollars, db, now)
  if (cap) {
    await stopLoop(phone, cap, db, now)
    return
  }
  if (inQuietHours(settings, phoneHour(phone.timeZone, now))) return
  if (await phoneIsBusy(phone.id, db)) return

  // The loop's own last walk since Start: one that failed ends the loop
  // rather than being tried again and again, and Tinder saying nobody new is
  // around ends it too.
  const [lastWalk] = await db
    .select()
    .from(dateWalks)
    .where(
      and(
        eq(dateWalks.phoneId, phone.id),
        eq(dateWalks.askedBy, "ai"),
        inArray(dateWalks.kind, LOOP_WALKS),
        gt(dateWalks.createdAt, new Date((phone.runningSince ?? now).getTime() - 1))
      )
    )
    .orderBy(desc(dateWalks.createdAt))
    .limit(1)
  if (lastWalk?.status === "failed") {
    await stopLoop(phone, `${WALK_WORDS[lastWalk.kind]} failed: ${lastWalk.error}`, db, now)
    return
  }
  if (lastWalk?.kind === "read-card" && lastWalk.status === "done" && lastWalk.result?.empty === true) {
    await stopLoop(phone, "Tinder has nobody new to show nearby right now.", db, now)
    return
  }

  const [lastLook] = await db
    .select({ createdAt: dateWalks.createdAt })
    .from(dateWalks)
    .where(and(eq(dateWalks.phoneId, phone.id), eq(dateWalks.kind, "read-matches")))
    .orderBy(desc(dateWalks.createdAt))
    .limit(1)
  if (!lastLook || now.getTime() - lastLook.createdAt.getTime() > READ_MATCHES_EVERY_MS) {
    await queueWalk({ userId: phone.userId, phoneId: phone.id, kind: "read-matches", askedBy: "ai" }, db, now)
    return
  }

  // The card read since Start that nobody has swiped yet.
  const [waiting] = await db
    .select()
    .from(dateProfiles)
    .where(
      and(
        eq(dateProfiles.phoneId, phone.id),
        eq(dateProfiles.swipe, "none"),
        eq(dateProfiles.sample, false),
        gt(dateProfiles.readAt, new Date((phone.runningSince ?? now).getTime() - 1)),
        lte(dateProfiles.readAt, now)
      )
    )
    .orderBy(desc(dateProfiles.readAt))
    .limit(1)
  if (!waiting) {
    await queueWalk({ userId: phone.userId, phoneId: phone.id, kind: "read-card", askedBy: "ai" }, db, now)
    return
  }
  if (waiting.aiError) {
    await stopLoop(phone, `The AI could not read ${waiting.name}'s card: ${waiting.aiError}`, db, now)
    return
  }
  const decision = decideSwipe(waiting, settings)
  if (!decision) {
    // Not scored yet: the AI's part of the pass is on it.
    work.push(...aiWork(phone, db, now, deps))
    return
  }
  const refusal = await walkRefusal(phone, decision, settings, db, now)
  if (refusal?.limit === "gap") return
  if (refusal) {
    await stopLoop(phone, refusal.words, db, now)
    return
  }
  await queueWalk({ userId: phone.userId, phoneId: phone.id, kind: decision, input: { profileId: waiting.id }, askedBy: "ai" }, db, now)
}

/** Start on the dashboard: the loop runs from the next pass until Stop or a limit. */
export async function startLoop(userId: string, phoneId: string, db: CustomShellDb = defaultDb, now: Date = new Date()): Promise<void> {
  const [phone] = await db
    .select()
    .from(datePhones)
    .where(and(eq(datePhones.id, phoneId), eq(datePhones.userId, userId)))
    .limit(1)
  if (!phone) throw new Error("That phone does not exist.")
  if (!phone.keyEncrypted) throw new Error(`${phone.name} is not paired. Pair it on the Phone screen first.`)
  if (!phone.inControl) throw new Error(`Date is switched off for ${phone.name}. Switch it on on the Phone screen first.`)
  if (phone.stoppedReason) throw new Error("A Tinder screen stopped the phone. Press Resume on the Phone screen once it is sorted.")
  const settings = await readDatingSettings(userId, phone.workspaceId, db)
  const cap = await spendCapReached(userId, settings.spendCapDollars, db, now)
  if (cap) throw new Error(cap)
  await db
    .update(datePhones)
    .set({ running: true, runningSince: now, stopWhy: "", stopWhyAt: null, updatedAt: now })
    .where(eq(datePhones.id, phone.id))
}

/** Stop on the dashboard. The walk already on the phone finishes; nothing new starts. */
export async function stopLoopByHand(userId: string, phoneId: string, db: CustomShellDb = defaultDb, now: Date = new Date()): Promise<void> {
  const [phone] = await db
    .select()
    .from(datePhones)
    .where(and(eq(datePhones.id, phoneId), eq(datePhones.userId, userId)))
    .limit(1)
  if (!phone) throw new Error("That phone does not exist.")
  await stopLoop(phone, "Stopped by you.", db, now)
  // What the loop queued and the phone has not started is called off with
  // it. An automated reply already on its way is not: Stop is the swiping.
  await db
    .update(dateWalks)
    .set({ status: "cancelled", error: "Stopped by you.", finishedAt: now })
    .where(and(eq(dateWalks.phoneId, phone.id), eq(dateWalks.status, "waiting"), eq(dateWalks.askedBy, "ai"), inArray(dateWalks.kind, LOOP_WALKS)))
}
