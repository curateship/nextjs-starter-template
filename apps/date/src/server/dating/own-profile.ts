import { and, count, desc, eq, gte, inArray, isNull, lt, sql } from "drizzle-orm"

import { changeKey, samePhotos, sameWords, type ProfileSuggestion } from "@/lib/dating/own-profile"
import { uuid } from "@/server/auth/security"
import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { queueWalk } from "@/server/tinder/jobs"
import {
  dateMatches,
  dateOwnProfiles,
  datePhotoTests,
  dateProfiles,
  dateWalks,
  type OwnProfileChange,
  type OwnProfileReview,
  type ProfilePrompt,
} from "@/server/tinder/schema"
import { readOwnRow, type PhotoTestStep } from "@/server/tinder/store"
import { promptsOf } from "@/server/tinder/walks/parse"

import type { DatingAccount } from "./accounts"
import { TINDER_BIO_MAX } from "./prompts/review-profile"

/**
 * The member's own profile, changed by the phone (task
 * "features/03-your-profile", Tyler, 18 Oct 2026): each of the AI's
 * suggestions is applied one press at a time, Undo puts back what the last
 * Apply replaced, and the first-photo test puts each of the top 3 photos
 * first for a week and keeps the one that brought the most matches per 100
 * likes. Nothing changes on the phone without a press of the member's.
 */

/** The walks that change the member's own profile. Only one may wait or run at a time. */
const CHANGE_WALKS = ["reorder-photos", "set-bio", "set-prompt"] as const


/**
 * The AI's photo order as picture ids: the photos in the order it gave,
 * then any it left out, in the order they stand now. Null when the photos on
 * the profile are no longer the ones the AI looked at.
 */
export function suggestedPhotoOrder(review: OwnProfileReview, photoIds: string[]): string[] | null {
  if (!samePhotos(review.photoIds, photoIds)) return null
  const order: string[] = []
  for (const item of review.photoOrder) {
    const id = review.photoIds[item.photo - 1]
    if (id && !order.includes(id)) order.push(id)
  }
  return [...order, ...photoIds.filter((id) => !order.includes(id))]
}

function phoneOf(account: DatingAccount): string {
  if (!account.phoneId) throw new Error("No phone is paired for this profile yet. Pair one in the dashboard's Phone panel first.")
  return account.phoneId
}

/**
 * Refuses while the phone is still making an Apply or Undo, so two never
 * cross over what Undo puts back. A first-photo test's move does not count:
 * photo changes are refused for the whole test anyway.
 */
async function refuseWhileChanging(account: DatingAccount, db: CustomShellDb): Promise<void> {
  const [busy] = await db
    .select({ id: dateWalks.id })
    .from(dateWalks)
    .where(
      and(
        eq(dateWalks.accountId, account.id),
        inArray(dateWalks.kind, CHANGE_WALKS),
        inArray(dateWalks.status, ["waiting", "running"]),
        sql`NOT (${dateWalks.input} ? 'photoTest')`
      )
    )
    .limit(1)
  if (busy) throw new Error("The phone is still making the last change to your profile. Try again once it has finished.")
}

async function ownWithReview(account: DatingAccount, db: CustomShellDb) {
  const own = await readOwnRow(account.id, db)
  if (!own) throw new Error("Date has not read your profile yet. Press Read my profile first.")
  return own
}

/** Apply: the phone makes one of the AI's suggestions on Tinder, then reads the profile back to check it. */
export async function applySuggestion(account: DatingAccount, what: ProfileSuggestion, db: CustomShellDb = defaultDb, now: Date = new Date()): Promise<void> {
  const phoneId = phoneOf(account)
  const own = await ownWithReview(account, db)
  const review = own.review
  if (!review) throw new Error("The AI has not reviewed your profile yet.")
  await refuseWhileChanging(account, db)
  const walk = { userId: account.userId, accountId: account.id, phoneId, askedBy: "member" as const }

  if (what.kind === "photos") {
    await refuseDuringPhotoTest(account.id, db)
    const order = suggestedPhotoOrder(review, own.photoIds)
    if (!order) throw new Error("Your photos changed since the AI looked at them. Press Review again first.")
    if (order.join() === own.photoIds.join()) throw new Error("Your photos are already in this order.")
    await queueWalk({ ...walk, kind: "reorder-photos", input: { photoIds: order } }, db, now)
    return
  }
  if (what.kind === "bio") {
    const bio = review.bio.trim()
    if (bio.length > TINDER_BIO_MAX) throw new Error(`Tinder takes ${TINDER_BIO_MAX} characters at most in a bio, and this one is ${bio.length}. Press Review again for a shorter one.`)
    if (sameWords(own.bio, bio)) throw new Error("Your bio already says this.")
    await queueWalk({ ...walk, kind: "set-bio", input: { bio } }, db, now)
    return
  }
  const suggestion = review.prompts.find((prompt) => prompt.question === what.question)
  if (!suggestion || suggestion.keep) throw new Error("The AI suggests keeping this answer as it is.")
  const shown = promptsOf(own.sections).find((prompt) => prompt.question === what.question)
  if (!shown) throw new Error("That prompt is no longer on your profile. Read your profile again.")
  if (sameWords(shown.answer, suggestion.answer)) throw new Error("This prompt already has that answer.")
  await queueWalk({ ...walk, kind: "set-prompt", input: { question: suggestion.question, answer: suggestion.answer } }, db, now)
}

/** Undo: the phone puts back what the last Apply replaced, and reads the profile back to check it. */
export async function undoLastApply(account: DatingAccount, db: CustomShellDb = defaultDb, now: Date = new Date()): Promise<void> {
  const phoneId = phoneOf(account)
  const own = await ownWithReview(account, db)
  const before = own.before
  if (!before) throw new Error("There is nothing to undo.")
  await refuseWhileChanging(account, db)
  const walk = { userId: account.userId, accountId: account.id, phoneId, askedBy: "member" as const }

  if (before.kind === "photos") {
    await refuseDuringPhotoTest(account.id, db)
    if (!samePhotos(before.photoIds, own.photoIds)) {
      throw new Error("Your photos changed on Tinder since then, so Undo cannot put the old order back.")
    }
    await queueWalk({ ...walk, kind: "reorder-photos", input: { photoIds: before.photoIds, undo: true } }, db, now)
  } else if (before.kind === "bio") {
    await queueWalk({ ...walk, kind: "set-bio", input: { bio: before.bio, undo: true } }, db, now)
  } else {
    await queueWalk({ ...walk, kind: "set-prompt", input: { question: before.question, answer: before.answer, undo: true } }, db, now)
  }
}

// The first-photo test. ---------------------------------------------------

/** How long each photo is first. Tyler, 18 Oct 2026: "a week each". */
export const PHOTO_TEST_WEEK_MS = 7 * 86_400_000

/** A move the phone could not make is asked for again this long after. */
const MOVE_RETRY_MS = 60 * 60_000

/** A move that failed on the phone this many times ends the test where it is. */
const MOVE_TRIES = 3

/** How many of the top photos are tested. */
const PHOTOS_TESTED = 3

type TestRow = typeof datePhotoTests.$inferSelect

/** Where a test stands, and the one thing it waits for next. */
export type PhotoTestPhase =
  /** A week's photo is being put first. */
  | "moving"
  /** A week is running. */
  | "week"
  /** All three weeks are over and the winner is being put first. */
  | "putting-winner-first"
  /** Over, and the winner is first. */
  | "done"
  /** Stopped, or over with no likes at all, and the order from before is being put back. */
  | "restoring"
  /** Stopped, or over with no likes at all, and the order from before is back. */
  | "restored"

export type PhotoTestState = {
  phase: PhotoTestPhase
  rows: TestRow[]
  /** The row the phase is about: the week moving or running, or the winner. */
  row: TestRow | null
}

/** Where one test stands, from its three rows. */
export function photoTestState(rows: TestRow[]): PhotoTestState {
  const sorted = [...rows].sort((a, b) => a.place - b.place)
  if (sorted.some((row) => row.stoppedAt)) return { phase: sorted.every((row) => row.restoredAt) ? "restored" : "restoring", rows: sorted, row: null }
  const open = sorted.find((row) => !row.endedAt)
  if (open) return { phase: open.startedAt ? "week" : "moving", rows: sorted, row: open }
  const winner = sorted.find((row) => row.winner)
  if (!winner) return { phase: sorted.every((row) => row.restoredAt) ? "restored" : "restoring", rows: sorted, row: null }
  return { phase: winner.putFirstAt ? "done" : "putting-winner-first", rows: sorted, row: winner }
}

/** Whether a test still moves photos or counts: anything but over. */
export function photoTestRunning(state: PhotoTestState | null): boolean {
  return Boolean(state && state.phase !== "done" && state.phase !== "restored")
}

/** The profile's newest test, or null. */
export async function latestPhotoTest(accountId: string, db: CustomShellDb = defaultDb): Promise<PhotoTestState | null> {
  const [newest] = await db
    .select({ testId: datePhotoTests.testId })
    .from(datePhotoTests)
    .where(eq(datePhotoTests.accountId, accountId))
    .orderBy(desc(datePhotoTests.createdAt))
    .limit(1)
  if (!newest) return null
  return photoTestState(await db.select().from(datePhotoTests).where(eq(datePhotoTests.testId, newest.testId)))
}

async function refuseDuringPhotoTest(accountId: string, db: CustomShellDb): Promise<void> {
  if (photoTestRunning(await latestPhotoTest(accountId, db))) {
    throw new Error("The first-photo test is moving your photos. Stop it first, or wait until it ends.")
  }
}

/** The order that puts one photo first and leaves the rest as they were before the test. */
export function orderWithFirst(photoId: string, original: string[]): string[] {
  return [photoId, ...original.filter((id) => id !== photoId)]
}

/**
 * Likes and matches in one week: likes the member or the AI gave, and
 * matches made, between its start and its end. Sample records never count.
 */
export async function weekCounts(accountId: string, from: Date, to: Date, db: CustomShellDb = defaultDb): Promise<{ likes: number; matches: number }> {
  const [[likes], [matches]] = await Promise.all([
    db
      .select({ value: count() })
      .from(dateProfiles)
      .where(
        and(
          eq(dateProfiles.accountId, accountId),
          eq(dateProfiles.sample, false),
          inArray(dateProfiles.swipe, ["like", "super"]),
          gte(dateProfiles.swipedAt, from),
          lt(dateProfiles.swipedAt, to)
        )
      ),
    db
      .select({ value: count() })
      .from(dateMatches)
      .where(and(eq(dateMatches.accountId, accountId), eq(dateMatches.sample, false), gte(dateMatches.matchedAt, from), lt(dateMatches.matchedAt, to)))
  ])
  return { likes: likes?.value ?? 0, matches: matches?.value ?? 0 }
}

/** Matches per 100 likes, rounded, or null for a week with no likes. */
export function matchesPer100(likes: number, matches: number): number | null {
  return likes > 0 ? Math.round((matches / likes) * 100) : null
}

/**
 * The week with the most matches per 100 likes. A tie goes to the week with
 * more likes, then to the photo that was higher. A week with no likes cannot
 * win, and with no likes at all there is no winner.
 */
export function photoTestWinner(rows: Array<Pick<TestRow, "id" | "place" | "likes" | "matches">>): string | null {
  const ranked = rows
    .filter((row) => row.likes > 0)
    .sort((a, b) => b.matches * a.likes - a.matches * b.likes || b.likes - a.likes || a.place - b.place)
  return ranked[0]?.id ?? null
}

/** Test my first photo: three weeks, one for each of the top 3 photos, starting with the photo that is first now. */
export async function startPhotoTest(account: DatingAccount, db: CustomShellDb = defaultDb, now: Date = new Date()): Promise<void> {
  phoneOf(account)
  const own = await ownWithReview(account, db)
  if (own.photoIds.length < PHOTOS_TESTED) {
    throw new Error(`The test needs at least ${PHOTOS_TESTED} photos on your profile, and Date read ${own.photoIds.length}.`)
  }
  if (photoTestRunning(await latestPhotoTest(account.id, db))) throw new Error("A first-photo test is already running.")
  await refuseWhileChanging(account, db)
  const testId = uuid()
  await db.transaction(async (tx) => {
    await tx.insert(datePhotoTests).values(
      own.photoIds.slice(0, PHOTOS_TESTED).map((photoId, index) => ({
        id: uuid(),
        testId,
        accountId: account.id,
        userId: account.userId,
        workspaceId: account.workspaceId,
        place: index + 1,
        photoId,
        originalOrder: own.photoIds,
        createdAt: now,
      }))
    )
    // The test moves the photos, so Undo of an earlier photo order would undo the test instead.
    await tx
      .update(dateOwnProfiles)
      .set({ before: null })
      .where(and(eq(dateOwnProfiles.accountId, account.id), sql`${dateOwnProfiles.before}->>'kind' = 'photos'`))
  })
}

/**
 * Stop: the test ends where it is and the order from before it goes back on
 * the phone. A move still waiting is called off. A test stopped before any
 * photo was moved has nothing to put back.
 */
export async function stopPhotoTest(account: DatingAccount, db: CustomShellDb = defaultDb, now: Date = new Date()): Promise<void> {
  const state = await latestPhotoTest(account.id, db)
  if (!state || !photoTestRunning(state)) throw new Error("No first-photo test is running.")
  if (state.phase === "restoring") throw new Error("The test is already stopped. The phone is putting your old order back.")
  const moved = state.rows.some((row) => row.startedAt)
  const testId = state.rows[0].testId
  await db
    .update(datePhotoTests)
    .set({ stoppedAt: now, askedAt: null, moveError: "", ...(moved ? {} : { restoredAt: now }) })
    .where(and(eq(datePhotoTests.testId, testId), isNull(datePhotoTests.stoppedAt)))
  await db
    .update(dateWalks)
    .set({ status: "cancelled", error: "The first-photo test was stopped.", finishedAt: now })
    .where(
      and(
        eq(dateWalks.accountId, account.id),
        eq(dateWalks.kind, "reorder-photos"),
        eq(dateWalks.status, "waiting"),
        inArray(
          sql`${dateWalks.input}->'photoTest'->>'rowId'`,
          state.rows.map((row) => row.id)
        )
      )
    )
}

/**
 * One step of the test on the worker's pass: a week whose seven days are up
 * is counted and closed, the third week's close picks the winner, and the
 * move the test waits for is put on the phone's list. A move that could not
 * be listed or failed on the phone is asked for again an hour later.
 */
export async function photoTestStep(account: DatingAccount, db: CustomShellDb = defaultDb, now: Date = new Date()): Promise<void> {
  const state = await latestPhotoTest(account.id, db)
  if (!state || !photoTestRunning(state) || !account.phoneId) return

  if (state.phase === "week" && state.row?.startedAt && now.getTime() - state.row.startedAt.getTime() >= PHOTO_TEST_WEEK_MS) {
    const week = state.row
    const counted = await weekCounts(account.id, week.startedAt as Date, now, db)
    // Only the pass that closes the week, and only while the test is not stopped, picks the winner.
    const closed = await db
      .update(datePhotoTests)
      .set({ endedAt: now, ...counted })
      .where(and(eq(datePhotoTests.id, week.id), isNull(datePhotoTests.endedAt), isNull(datePhotoTests.stoppedAt)))
      .returning({ id: datePhotoTests.id })
    if (closed.length && week.place === Math.max(...state.rows.map((row) => row.place))) {
      const rows = state.rows.map((row) => (row.id === week.id ? { ...row, ...counted } : row))
      const winner = photoTestWinner(rows)
      if (winner) await db.update(datePhotoTests).set({ winner: true }).where(and(eq(datePhotoTests.id, winner), isNull(datePhotoTests.stoppedAt)))
    }
    return
  }

  const move = nextMove(state)
  if (!move) return
  if (move.row.askedAt && now.getTime() - move.row.askedAt.getTime() < MOVE_RETRY_MS) return
  const failed = await failedMoves(account.id, move.row.id, move.step, db)
  if (failed.count >= MOVE_TRIES) {
    // Such as photos added or deleted on Tinder during the test: no move can work, so the test ends and the photos stay as they are.
    await db
      .update(datePhotoTests)
      .set({ stoppedAt: now, restoredAt: now, moveError: `Ended after ${MOVE_TRIES} tries: ${failed.last}`.slice(0, 600) })
      .where(eq(datePhotoTests.testId, move.row.testId))
    return
  }
  // Asked for before it is listed, so a refusal is not asked for again on every pass.
  await db.update(datePhotoTests).set({ askedAt: now }).where(eq(datePhotoTests.id, move.row.id))
  try {
    await queueWalk(
      {
        userId: account.userId,
        accountId: account.id,
        phoneId: account.phoneId,
        kind: "reorder-photos",
        input: { photoIds: move.photoIds, photoTest: { rowId: move.row.id, step: move.step } },
        askedBy: "ai",
      },
      db,
      now
    )
    await db.update(datePhotoTests).set({ moveError: "" }).where(eq(datePhotoTests.id, move.row.id))
  } catch (error) {
    const words = error instanceof Error ? error.message : "It could not be put on the phone's list."
    await db.update(datePhotoTests).set({ moveError: words.slice(0, 600) }).where(eq(datePhotoTests.id, move.row.id))
  }
}

/** How many times this move of a test failed on the phone, and the last reason. */
async function failedMoves(accountId: string, rowId: string, step: PhotoTestStep, db: CustomShellDb): Promise<{ count: number; last: string }> {
  const rows = await db
    .select({ error: dateWalks.error })
    .from(dateWalks)
    .where(
      and(
        eq(dateWalks.accountId, accountId),
        eq(dateWalks.kind, "reorder-photos"),
        eq(dateWalks.status, "failed"),
        sql`${dateWalks.input}->'photoTest'->>'rowId' = ${rowId}`,
        sql`${dateWalks.input}->'photoTest'->>'step' = ${step}`
      )
    )
    .orderBy(desc(dateWalks.createdAt))
  return { count: rows.length, last: rows[0]?.error ?? "" }
}

/** The move a test waits for: a week's photo first, the winner first, or the old order back. */
function nextMove(state: PhotoTestState): { row: TestRow; step: PhotoTestStep; photoIds: string[] } | null {
  const original = state.rows[0].originalOrder
  if (state.phase === "moving" && state.row) return { row: state.row, step: "week", photoIds: orderWithFirst(state.row.photoId, original) }
  if (state.phase === "putting-winner-first" && state.row) return { row: state.row, step: "winner", photoIds: orderWithFirst(state.row.photoId, original) }
  if (state.phase === "restoring") return { row: state.rows[0], step: "restore", photoIds: original }
  return null
}

/** The test as the My profile panel shows it: each week's photo and numbers, the one running counted so far. */
export type PhotoTestView = {
  phase: PhotoTestPhase
  stopped: boolean
  weeks: Array<{
    place: number
    photoId: string
    startedAt: Date | null
    endedAt: Date | null
    likes: number
    matches: number
    per100: number | null
    winner: boolean
    /** The week running now. */
    current: boolean
  }>
  /** When the week running now ends. */
  weekEndsAt: Date | null
  /** Why the phone could not make the move the test waits for, in words, or empty. */
  moveError: string
}

export async function photoTestView(accountId: string, db: CustomShellDb = defaultDb, now: Date = new Date()): Promise<PhotoTestView | null> {
  const state = await latestPhotoTest(accountId, db)
  if (!state) return null
  const running = state.phase === "week" ? state.row : null
  const live = running?.startedAt ? await weekCounts(accountId, running.startedAt, now, db) : null
  const waiting = photoTestRunning(state) ? (nextMove(state)?.row ?? null) : null
  // A test that ended itself says why on every row.
  let moveError = waiting?.moveError ?? (state.phase === "restored" ? state.rows[0].moveError : "")
  if (waiting && !moveError) {
    const [failed] = await db
      .select({ status: dateWalks.status, error: dateWalks.error })
      .from(dateWalks)
      .where(and(eq(dateWalks.accountId, accountId), eq(dateWalks.kind, "reorder-photos"), sql`${dateWalks.input}->'photoTest'->>'rowId' = ${waiting.id}`))
      .orderBy(desc(dateWalks.createdAt))
      .limit(1)
    if (failed?.status === "failed") moveError = failed.error
  }
  return {
    phase: state.phase,
    stopped: state.rows.some((row) => row.stoppedAt),
    weeks: state.rows.map((row) => {
      const counts = row.id === running?.id && live ? live : { likes: row.likes, matches: row.matches }
      return {
        place: row.place,
        photoId: row.photoId,
        startedAt: row.startedAt,
        endedAt: row.endedAt,
        ...counts,
        per100: matchesPer100(counts.likes, counts.matches),
        winner: row.winner,
        current: row.id === running?.id,
      }
    }),
    weekEndsAt: running?.startedAt ? new Date(running.startedAt.getTime() + PHOTO_TEST_WEEK_MS) : null,
    moveError,
  }
}

/** The member's own profile as the My profile panel shows it. */
export type OwnProfileView = {
  name: string
  photoIds: string[]
  bio: string
  prompts: ProfilePrompt[]
  readAt: Date
  review: OwnProfileReview | null
  reviewMadeAt: Date | null
  aiError: string
  /** The AI's photo order as picture ids, or null when the photos changed since it looked. */
  photoAfter: string[] | null
  /** What the last Apply replaced, which Undo puts back. */
  before: OwnProfileChange | null
  /** When each change was last applied, by `changeKey`. */
  appliedAt: Record<string, string>
  /** The change the phone is making or about to make, by `changeKey`. */
  changing: { key: string; undo: boolean } | null
  /** The last change, when it failed on the phone, with Tinder's or the walk's words. */
  failed: { key: string; error: string } | null
  photoTest: PhotoTestView | null
}

/** The change a walk makes, by `changeKey`, or null for a first-photo test's move. */
function walkChangeKey(kind: string, input: Record<string, unknown>): string | null {
  if (kind === "reorder-photos") return input.photoTest ? null : "photos"
  if (kind === "set-bio") return "bio"
  return typeof input.question === "string" ? changeKey({ kind: "prompt", question: input.question }) : null
}

export async function ownProfileView(own: typeof dateOwnProfiles.$inferSelect, db: CustomShellDb = defaultDb, now: Date = new Date()): Promise<OwnProfileView> {
  const [[last], photoTest] = await Promise.all([
    db
      .select({ kind: dateWalks.kind, input: dateWalks.input, status: dateWalks.status, error: dateWalks.error, finishedAt: dateWalks.finishedAt })
      .from(dateWalks)
      .where(and(eq(dateWalks.accountId, own.accountId), inArray(dateWalks.kind, CHANGE_WALKS), sql`NOT (${dateWalks.input} ? 'photoTest')`))
      .orderBy(desc(dateWalks.createdAt))
      .limit(1),
    photoTestView(own.accountId, db, now),
  ])
  const key = last ? walkChangeKey(last.kind, last.input) : null
  return {
    name: own.name,
    photoIds: own.photoIds,
    bio: own.bio,
    prompts: promptsOf(own.sections),
    readAt: own.readAt,
    review: own.review,
    reviewMadeAt: own.reviewMadeAt,
    aiError: own.aiError,
    photoAfter: own.review ? suggestedPhotoOrder(own.review, own.photoIds) : null,
    before: own.before,
    appliedAt: own.appliedAt,
    changing: key && (last.status === "waiting" || last.status === "running") ? { key, undo: last.input.undo === true } : null,
    // Until a newer read of the profile, which a failed change's own read-back is not.
    failed: key && last.status === "failed" && last.finishedAt && last.finishedAt >= own.readAt ? { key, error: last.error } : null,
    photoTest,
  }
}
