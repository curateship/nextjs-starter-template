import { and, eq, inArray, isNotNull, isNull, lt, or } from "drizzle-orm"

import { uuid } from "@/server/auth/security"
import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { queueWalk } from "@/server/tinder/jobs"
import { dateMatches, type MatchFact } from "@/server/tinder/schema"
import { NO_DRAFT } from "@/server/tinder/store"

import { newestMessages } from "./dashboard"

/**
 * What the member does to one chat from the dashboard, outside sending:
 * the facts they keep, the note to the AI, taking the chat over, moving it to
 * text, "Not over", the date's time and place, and clearing dead matches.
 * Every function acts only on the member's own matches; the server functions
 * in `src/lib/api/dating/chats.ts` add the sign-in and the site.
 */

const SAMPLE_WORDS = "This is a sample, so nothing was sent to a phone."

/** A match is dead after this long with no message from either side. Tyler's choice, 18 Oct 2026. */
const DEAD_AFTER_MS = 30 * 86_400_000

export async function ownMatch(userId: string, matchId: string, db: CustomShellDb = defaultDb) {
  const [match] = await db.select().from(dateMatches).where(and(eq(dateMatches.id, matchId), eq(dateMatches.userId, userId))).limit(1)
  if (!match) throw new Error("That match is gone.")
  return match
}

/** Adds a fact, or changes one. Either way it is the member's now, and the AI never overwrites it. */
export async function saveFact(
  userId: string,
  matchId: string,
  factId: string | null,
  text: string,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<void> {
  const words = text.trim().replace(/\s+/g, " ")
  if (!words) throw new Error("Write the fact first, or delete it.")
  if (words.length > 200) throw new Error("Keep a fact under 200 characters.")
  const match = await ownMatch(userId, matchId, db)
  let facts: MatchFact[]
  if (factId) {
    if (!match.facts.some((fact) => fact.id === factId && !fact.deleted)) throw new Error("That fact is gone.")
    facts = match.facts.map((fact) => (fact.id === factId ? { ...fact, text: words, edited: true } : fact))
  } else {
    if (match.facts.filter((fact) => !fact.deleted).length >= 40) throw new Error("A chat keeps 40 facts at most. Delete one first.")
    facts = [...match.facts, { id: uuid(), text: words, edited: true }]
  }
  await db.update(dateMatches).set({ facts, updatedAt: now }).where(eq(dateMatches.id, match.id))
}

/** Deletes a fact. It is kept hidden, so the AI does not read it back off the chat. */
export async function deleteFact(userId: string, matchId: string, factId: string, db: CustomShellDb = defaultDb, now: Date = new Date()): Promise<void> {
  const match = await ownMatch(userId, matchId, db)
  if (!match.facts.some((fact) => fact.id === factId)) throw new Error("That fact is gone.")
  const facts = match.facts.map((fact) => (fact.id === factId ? { ...fact, deleted: true } : fact))
  await db.update(dateMatches).set({ facts, updatedAt: now }).where(eq(dateMatches.id, match.id))
}

/** The member's note to the AI about this chat only. Empty clears it. */
export async function saveNote(userId: string, matchId: string, note: string, db: CustomShellDb = defaultDb, now: Date = new Date()): Promise<void> {
  const words = note.trim()
  if (words.length > 1_000) throw new Error("Keep the note under 1,000 characters.")
  const match = await ownMatch(userId, matchId, db)
  await db.update(dateMatches).set({ memberNote: words, updatedAt: now }).where(eq(dateMatches.id, match.id))
}

/**
 * "AI drafts here", on by default. Off, the AI writes nothing in this chat and
 * a waiting draft is cleared, with its send time, so automate cannot send it.
 */
export async function setAiDrafts(userId: string, matchId: string, on: boolean, db: CustomShellDb = defaultDb, now: Date = new Date()): Promise<void> {
  const match = await ownMatch(userId, matchId, db)
  await db
    .update(dateMatches)
    .set({ aiOff: !on, ...(on ? {} : NO_DRAFT), updatedAt: now })
    .where(eq(dateMatches.id, match.id))
}

/** Moved to text: the AI stops here and the chat sinks below the live ones. Undo puts it back. */
export async function setMovedToText(userId: string, matchId: string, moved: boolean, db: CustomShellDb = defaultDb, now: Date = new Date()): Promise<void> {
  const match = await ownMatch(userId, matchId, db)
  await db
    .update(dateMatches)
    .set({ movedToTextAt: moved ? (match.movedToTextAt ?? now) : null, ...(moved ? NO_DRAFT : {}), updatedAt: now })
    .where(eq(dateMatches.id, match.id))
}

/**
 * Dismiss on the AI's draft: the draft and its two choices go, so automate
 * cannot send them, and the background pass writes no new one for the same
 * message. Draft on the dashboard still writes one at once, and a newer
 * message from them moves the chat on.
 */
export async function dismissDraft(userId: string, matchId: string, db: CustomShellDb = defaultDb, now: Date = new Date()): Promise<void> {
  const match = await ownMatch(userId, matchId, db)
  const [newest] = await newestMessages([match.id], db)
  await db
    .update(dateMatches)
    .set({ ...NO_DRAFT, draftDismissedFor: newest?.id ?? "opener", updatedAt: now })
    .where(eq(dateMatches.id, match.id))
}

/**
 * Moved to text for several chats at once, from mass select on the dashboard.
 * A chat already moved or unmatched is skipped and counted; the rest move in
 * one write.
 */
export async function setManyMovedToText(
  userId: string,
  matchIds: string[],
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<{ moved: string[]; skipped: string[] }> {
  if (!matchIds.length) return { moved: [], skipped: [] }
  const rows = await db
    .select({ id: dateMatches.id, movedToTextAt: dateMatches.movedToTextAt, unmatchedAt: dateMatches.unmatchedAt })
    .from(dateMatches)
    .where(and(eq(dateMatches.userId, userId), inArray(dateMatches.id, matchIds)))
  const moving = new Set(rows.filter((row) => !row.movedToTextAt && !row.unmatchedAt).map((row) => row.id))
  if (moving.size) {
    await db
      .update(dateMatches)
      .set({ movedToTextAt: now, ...NO_DRAFT, updatedAt: now })
      .where(and(eq(dateMatches.userId, userId), inArray(dateMatches.id, [...moving])))
  }
  return { moved: matchIds.filter((id) => moving.has(id)), skipped: matchIds.filter((id) => !moving.has(id)) }
}

/** "Not over": the AI read the chat as over and the member disagrees. It drafts here again from the next pass. */
export async function setNotOver(userId: string, matchId: string, db: CustomShellDb = defaultDb, now: Date = new Date()): Promise<void> {
  const match = await ownMatch(userId, matchId, db)
  await db.update(dateMatches).set({ endedAt: null, endedLine: "", aiError: "", updatedAt: now }).where(eq(dateMatches.id, match.id))
}

/**
 * The date's time and place, typed by the member. The AI never sets these.
 * Only a chat where they said yes can hold one. A cleared time takes the
 * place with it.
 */
export async function setDatePlan(
  userId: string,
  matchId: string,
  plan: { dateAt: Date | null; place: string },
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<void> {
  const match = await ownMatch(userId, matchId, db)
  if (!match.dateAcceptedAt) throw new Error(`${match.theirName} has not said yes to a date yet, so there is nothing to put in the calendar.`)
  const place = plan.place.trim()
  if (place.length > 300) throw new Error("Keep the place under 300 characters.")
  if (plan.dateAt && Number.isNaN(plan.dateAt.getTime())) throw new Error("That time is not a real date.")
  await db
    .update(dateMatches)
    .set({ dateAt: plan.dateAt, datePlace: plan.dateAt ? place : "", updatedAt: now })
    .where(eq(dateMatches.id, match.id))
}

export type DeadMatch = { id: string; theirName: string; photoId: string | null; lastAt: Date }

/**
 * Matches with no message from either side in 30 days, oldest first: still
 * matched, not marked over, not moved to text, not a sample. A match nobody
 * ever wrote to counts from when it matched.
 */
export async function deadMatches(userId: string, workspaceId: string, db: CustomShellDb = defaultDb, now: Date = new Date()): Promise<DeadMatch[]> {
  const before = new Date(now.getTime() - DEAD_AFTER_MS)
  const rows = await db
    .select()
    .from(dateMatches)
    .where(
      and(
        eq(dateMatches.userId, userId),
        eq(dateMatches.workspaceId, workspaceId),
        eq(dateMatches.sample, false),
        isNull(dateMatches.unmatchedAt),
        isNull(dateMatches.endedAt),
        isNull(dateMatches.movedToTextAt),
        isNotNull(dateMatches.phoneId),
        or(lt(dateMatches.lastMessageAt, before), and(isNull(dateMatches.lastMessageAt), lt(dateMatches.matchedAt, before)))
      )
    )
  return rows
    .map((row) => ({ id: row.id, theirName: row.theirName, photoId: row.photoId, lastAt: row.lastMessageAt ?? row.matchedAt }))
    .sort((a, b) => a.lastAt.getTime() - b.lastAt.getTime())
}

/**
 * Clear dead matches: one unmatch on the phone for each one still dead, after
 * the dashboard's confirm listed them by name. The phone runs them one at a
 * time. A match that came back to life, or was already being unmatched, is
 * skipped and counted.
 */
export async function clearDeadMatches(
  userId: string,
  workspaceId: string,
  matchIds: string[],
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<{ queued: string[]; skipped: string[] }> {
  if (!matchIds.length) return { queued: [], skipped: [] }
  const dead = new Map((await deadMatches(userId, workspaceId, db, now)).map((match) => [match.id, match]))
  const rows = await db
    .select()
    .from(dateMatches)
    .where(and(eq(dateMatches.userId, userId), inArray(dateMatches.id, matchIds)))
  if (rows.some((match) => match.sample)) throw new Error(SAMPLE_WORDS)
  const queued: string[] = []
  const skipped: string[] = []
  for (const id of matchIds) {
    const row = rows.find((match) => match.id === id)
    if (!row || !dead.has(id) || !row.phoneId) {
      skipped.push(id)
      continue
    }
    await queueWalk({ userId, phoneId: row.phoneId, kind: "unmatch", input: { matchId: row.id }, askedBy: "member" }, db, now)
    queued.push(id)
  }
  return { queued, skipped }
}
