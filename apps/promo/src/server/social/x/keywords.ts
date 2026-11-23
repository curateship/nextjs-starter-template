import { and, asc, count, eq, inArray, sql } from "drizzle-orm"

import { Refusal } from "@/server/browser/refusal"
import { uuid } from "@/server/auth/security"
import { db as defaultDb, type CustomShellDb } from "@/server/db"
import {
  MAX_X_KEYWORD_CHARS,
  X_KEYWORD_KIND_WORDS,
  X_KEYWORD_KINDS,
  X_KEYWORD_MARKS,
  xKeywordLabel,
  xKeywordValue,
  type XKeywordKind,
  type XKeywordMark,
} from "@/lib/social/x/options"

import { queueJob } from "../jobs"
import { ownedProject } from "../projects"
import { promoXFinds, promoXKeywords } from "./schema"
import { waitingXReads } from "./searchers"

/**
 * A project's X keywords (parts 9, 11 and 13): search words, a hashtag, or an
 * account watched for its new posts. Each belongs to one project, so every X
 * account in the project sees the same posts, as on Reddit and Medium.
 *
 * Every query is scoped by the person's id, and that filter is the ownership
 * check: a foreign id finds nothing and changes nothing.
 */

export type XKeywordView = {
  id: string
  kind: XKeywordKind
  value: string
  /** How the chip reads: "words", #hashtag, @account. */
  label: string
  mark: XKeywordMark
  enabled: boolean
  /** A watched account's new posts ring the bell (part 12). */
  notify: boolean
  lastRunAt: Date | null
  lastError: string
  /** Posts under it nobody has replied to or skipped. */
  waiting: number
  /** A search is waiting or running for it now. */
  searching: boolean
}

export async function listXKeywords(
  userId: string,
  projectId: string,
  db: CustomShellDb = defaultDb
): Promise<XKeywordView[]> {
  const keywords = await db
    .select()
    .from(promoXKeywords)
    .where(and(eq(promoXKeywords.userId, userId), eq(promoXKeywords.projectId, projectId)))
    .orderBy(asc(promoXKeywords.createdAt), asc(promoXKeywords.id))
  if (!keywords.length) return []
  const ids = keywords.map((keyword) => keyword.id)
  const waiting = await db
    .select({ keywordId: promoXFinds.keywordId, n: count() })
    .from(promoXFinds)
    .where(
      and(
        inArray(promoXFinds.keywordId, ids),
        inArray(promoXFinds.status, ["new", "shortlisted"]),
        eq(promoXFinds.repliesOpen, true)
      )
    )
    .groupBy(promoXFinds.keywordId)
  const searching = await waitingXReads(userId, "x_search", "keywordId", db)
  return keywords.map((keyword) => ({
    id: keyword.id,
    kind: keyword.kind,
    value: keyword.value,
    label: xKeywordLabel(keyword),
    mark: keyword.mark,
    enabled: keyword.enabled,
    notify: keyword.notify,
    lastRunAt: keyword.lastRunAt,
    lastError: keyword.lastError,
    waiting: waiting.find((row) => row.keywordId === keyword.id)?.n ?? 0,
    searching: searching.has(keyword.id),
  }))
}

export type XKeywordInput = {
  kind: XKeywordKind
  value: string
  mark?: XKeywordMark
}

/**
 * Saves a new keyword and searches it at once, so its posts start coming in.
 * A mark only fits search words: a hashtag or an account names nobody. The
 * keyword is kept even when its first search is refused, most often for want
 * of a search account, and `searchRefused` says why.
 */
export async function addXKeyword(
  userId: string,
  projectId: string,
  input: XKeywordInput,
  db: CustomShellDb = defaultDb
): Promise<{ id: string; searchRefused: string | null }> {
  await ownedProject(userId, projectId, db)
  if (!X_KEYWORD_KINDS.includes(input.kind)) throw new Error("X has no keyword of that kind.")
  const mark = input.mark ?? ""
  if (!X_KEYWORD_MARKS.includes(mark)) throw new Error("That mark is not one Promo knows.")
  if (mark && input.kind !== "search") {
    throw new Error("Only search words can be marked as naming you or a rival. A hashtag or an account names nobody.")
  }
  const value = xKeywordValue(input.kind, input.value)
  if (!value) {
    throw new Error(
      input.kind === "account"
        ? "That is not an X handle. Type it as @name or paste the account's address."
        : `Type the ${X_KEYWORD_KIND_WORDS[input.kind].toLowerCase()} first.`
    )
  }
  if (value.length > MAX_X_KEYWORD_CHARS) throw new Error("That keyword is too long.")

  const [taken] = await db
    .select({ id: promoXKeywords.id })
    .from(promoXKeywords)
    .where(
      and(
        eq(promoXKeywords.projectId, projectId),
        eq(promoXKeywords.kind, input.kind),
        sql`lower(${promoXKeywords.value}) = lower(${value})`
      )
    )
    .limit(1)
  if (taken) throw new Error(`This project already has ${xKeywordLabel({ kind: input.kind, value })}.`)

  const id = uuid()
  // Two presses at once: the unique index lets one in, and the other is told so.
  const added = await db
    .insert(promoXKeywords)
    .values({ id, userId, projectId, kind: input.kind, value, mark })
    .onConflictDoNothing()
    .returning({ id: promoXKeywords.id })
  if (!added.length) throw new Error(`This project already has ${xKeywordLabel({ kind: input.kind, value })}.`)
  try {
    await queueXSearch(userId, id, db)
    return { id, searchRefused: null }
  } catch (error) {
    if (error instanceof Refusal) return { id, searchRefused: error.message }
    throw error
  }
}

/** Switches a keyword on or off, or a watched account's bell (part 12). */
export async function setXKeyword(
  userId: string,
  keywordId: string,
  change: { enabled?: boolean; notify?: boolean; mark?: XKeywordMark },
  db: CustomShellDb = defaultDb
): Promise<void> {
  const [keyword] = await db
    .select({ kind: promoXKeywords.kind })
    .from(promoXKeywords)
    .where(and(eq(promoXKeywords.id, keywordId), eq(promoXKeywords.userId, userId)))
    .limit(1)
  if (!keyword) throw new Error("That keyword is no longer saved.")
  if (change.mark !== undefined) {
    if (!X_KEYWORD_MARKS.includes(change.mark)) throw new Error("That mark is not one Promo knows.")
    if (change.mark && keyword.kind !== "search") {
      throw new Error("Only search words can be marked as naming you or a rival. A hashtag or an account names nobody.")
    }
  }
  await db
    .update(promoXKeywords)
    .set({
      ...(change.enabled === undefined ? {} : { enabled: change.enabled }),
      ...(change.notify === undefined ? {} : { notify: change.notify }),
      ...(change.mark === undefined ? {} : { mark: change.mark }),
      updatedAt: new Date(),
    })
    .where(and(eq(promoXKeywords.id, keywordId), eq(promoXKeywords.userId, userId)))
}

/**
 * Removes a keyword and the posts only it found. A reply already sent keeps
 * its record, with the post's words and address, because the reply row holds
 * those itself; only its link back to the find is let go.
 */
export async function deleteXKeyword(userId: string, keywordId: string, db: CustomShellDb = defaultDb): Promise<void> {
  const removed = await db
    .delete(promoXKeywords)
    .where(and(eq(promoXKeywords.id, keywordId), eq(promoXKeywords.userId, userId)))
    .returning({ id: promoXKeywords.id })
  if (!removed.length) throw new Error("That keyword is no longer saved.")
}

/**
 * Queues a search for one keyword through a search account. A keyword with
 * one already waiting or running is refused, so two presses never search
 * twice and never spend the account's views twice.
 */
export async function queueXSearch(
  userId: string,
  keywordId: string,
  db: CustomShellDb = defaultDb,
  runAfter: Date | null = null
): Promise<string> {
  const [keyword] = await db
    .select({ id: promoXKeywords.id })
    .from(promoXKeywords)
    .where(and(eq(promoXKeywords.id, keywordId), eq(promoXKeywords.userId, userId)))
    .limit(1)
  if (!keyword) throw new Error("That keyword is no longer saved.")
  if ((await waitingXReads(userId, "x_search", "keywordId", db)).has(keywordId)) {
    throw new Refusal("That keyword is already being searched. Its posts show here when it finishes.")
  }
  return queueJob(userId, "x_search", { keywordId }, db, runAfter)
}

/** Queues a search for every switched-on keyword of a project that is not already searching. */
export async function queueProjectXSearches(
  userId: string,
  projectId: string,
  db: CustomShellDb = defaultDb
): Promise<number> {
  const keywords = await listXKeywords(userId, projectId, db)
  let queued = 0
  for (const keyword of keywords) {
    if (!keyword.enabled || keyword.searching) continue
    await queueJob(userId, "x_search", { keywordId: keyword.id }, db)
    queued += 1
  }
  return queued
}
