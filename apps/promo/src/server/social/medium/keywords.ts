import { and, asc, count, eq, inArray, sql } from "drizzle-orm"

import { Refusal } from "@/server/browser/refusal"
import { uuid } from "@/server/auth/security"
import { db as defaultDb, type CustomShellDb } from "@/server/db"
import {
  MAX_MEDIUM_KEYWORD_CHARS,
  MEDIUM_KEYWORD_KIND_WORDS,
  MEDIUM_KEYWORD_KINDS,
  MEDIUM_KEYWORD_MARKS,
  mediumKeywordLabel,
  mediumKeywordValue,
  type MediumKeywordKind,
  type MediumKeywordMark,
} from "@/lib/social/medium/options"

import { queueJob } from "../jobs"
import { ownedProject } from "../projects"
import { promoJobs } from "../schema"
import { promoMediumFinds, promoMediumKeywords } from "./schema"

/**
 * A project's Medium keywords (part 6). Tyler, 21 Oct 2026: "Tags and search
 * words". A keyword is one of four kinds: a tag, search words, a publication
 * watched, or a writer watched (part 9). Each belongs to one project, so
 * every Medium account in the project sees the same stories, as on Reddit.
 *
 * Every query is scoped by the person's id, and that filter is the ownership
 * check: a foreign id finds nothing and changes nothing.
 */

export type MediumKeywordView = {
  id: string
  kind: MediumKeywordKind
  value: string
  /** How the chip reads: #tag, "words", publication, @writer. */
  label: string
  mark: MediumKeywordMark
  enabled: boolean
  lastRunAt: Date | null
  lastError: string
  /** Stories under it nobody has replied to or skipped. */
  waiting: number
  /** A search is waiting or running for it now. */
  searching: boolean
}

export async function listMediumKeywords(
  userId: string,
  projectId: string,
  db: CustomShellDb = defaultDb
): Promise<MediumKeywordView[]> {
  const keywords = await db
    .select()
    .from(promoMediumKeywords)
    .where(and(eq(promoMediumKeywords.userId, userId), eq(promoMediumKeywords.projectId, projectId)))
    .orderBy(asc(promoMediumKeywords.createdAt), asc(promoMediumKeywords.id))
  if (!keywords.length) return []
  const ids = keywords.map((keyword) => keyword.id)
  const waiting = await db
    .select({ keywordId: promoMediumFinds.keywordId, n: count() })
    .from(promoMediumFinds)
    .where(and(inArray(promoMediumFinds.keywordId, ids), inArray(promoMediumFinds.status, ["new", "shortlisted"])))
    .groupBy(promoMediumFinds.keywordId)
  const searching = await searchingKeywordIds(userId, db)
  return keywords.map((keyword) => ({
    id: keyword.id,
    kind: keyword.kind,
    value: keyword.value,
    label: mediumKeywordLabel(keyword),
    mark: keyword.mark,
    enabled: keyword.enabled,
    lastRunAt: keyword.lastRunAt,
    lastError: keyword.lastError,
    waiting: waiting.find((row) => row.keywordId === keyword.id)?.n ?? 0,
    searching: searching.has(keyword.id),
  }))
}

/** The keywords with a Medium search waiting or running. */
async function searchingKeywordIds(userId: string, db: CustomShellDb): Promise<Set<string>> {
  const rows = await db
    .select({ payload: promoJobs.payload })
    .from(promoJobs)
    .where(
      and(
        eq(promoJobs.userId, userId),
        eq(promoJobs.kind, "medium_search"),
        inArray(promoJobs.status, ["queued", "running"])
      )
    )
  return new Set(rows.map((row) => String(row.payload?.keywordId ?? "")).filter(Boolean))
}

export type MediumKeywordInput = {
  kind: MediumKeywordKind
  value: string
  mark?: MediumKeywordMark
}

/**
 * Saves a new keyword and searches it at once, so its stories start coming
 * in. A mark only fits search words: a tag or a publication cannot "name"
 * anything. The keyword is kept even when its first search is refused, most
 * often for want of a reader browser, and `searchRefused` says why.
 */
export async function addMediumKeyword(
  userId: string,
  projectId: string,
  input: MediumKeywordInput,
  db: CustomShellDb = defaultDb
): Promise<{ id: string; searchRefused: string | null }> {
  await ownedProject(userId, projectId, db)
  if (!MEDIUM_KEYWORD_KINDS.includes(input.kind)) throw new Error("Medium has no keyword of that kind.")
  const mark = input.mark ?? ""
  if (!MEDIUM_KEYWORD_MARKS.includes(mark)) throw new Error("That mark is not one Promo knows.")
  if (mark && input.kind !== "search") {
    throw new Error("Only search words can be marked as naming you or a rival. A tag or a publication names nobody.")
  }
  const value = mediumKeywordValue(input.kind, input.value)
  if (!value) {
    throw new Error(`Type the ${MEDIUM_KEYWORD_KIND_WORDS[input.kind].toLowerCase()} first.`)
  }
  if (value.length > MAX_MEDIUM_KEYWORD_CHARS) throw new Error("That keyword is too long.")

  const [taken] = await db
    .select({ id: promoMediumKeywords.id })
    .from(promoMediumKeywords)
    .where(
      and(
        eq(promoMediumKeywords.projectId, projectId),
        eq(promoMediumKeywords.kind, input.kind),
        sql`lower(${promoMediumKeywords.value}) = lower(${value})`
      )
    )
    .limit(1)
  if (taken) throw new Error(`This project already has ${mediumKeywordLabel({ kind: input.kind, value })}.`)

  const id = uuid()
  await db.insert(promoMediumKeywords).values({ id, userId, projectId, kind: input.kind, value, mark })
  try {
    await queueMediumSearch(userId, id, db)
    return { id, searchRefused: null }
  } catch (error) {
    if (error instanceof Refusal) return { id, searchRefused: error.message }
    throw error
  }
}

export async function setMediumKeywordEnabled(
  userId: string,
  keywordId: string,
  enabled: boolean,
  db: CustomShellDb = defaultDb
): Promise<void> {
  const updated = await db
    .update(promoMediumKeywords)
    .set({ enabled, updatedAt: new Date() })
    .where(and(eq(promoMediumKeywords.id, keywordId), eq(promoMediumKeywords.userId, userId)))
    .returning({ id: promoMediumKeywords.id })
  if (!updated.length) throw new Error("That keyword is no longer saved.")
}

/** Marks search words as naming the product or a rival, or takes the mark off (part 13). */
export async function setMediumKeywordMark(
  userId: string,
  keywordId: string,
  mark: MediumKeywordMark,
  db: CustomShellDb = defaultDb
): Promise<void> {
  if (!MEDIUM_KEYWORD_MARKS.includes(mark)) throw new Error("That mark is not one Promo knows.")
  const [keyword] = await db
    .select({ kind: promoMediumKeywords.kind })
    .from(promoMediumKeywords)
    .where(and(eq(promoMediumKeywords.id, keywordId), eq(promoMediumKeywords.userId, userId)))
    .limit(1)
  if (!keyword) throw new Error("That keyword is no longer saved.")
  if (mark && keyword.kind !== "search") {
    throw new Error("Only search words can be marked as naming you or a rival. A tag or a publication names nobody.")
  }
  await db
    .update(promoMediumKeywords)
    .set({ mark, updatedAt: new Date() })
    .where(and(eq(promoMediumKeywords.id, keywordId), eq(promoMediumKeywords.userId, userId)))
}

/**
 * Removes a keyword and the stories only it found. A response already sent
 * keeps its record and its story's title and address, because the response
 * row holds those itself; only its link back to the find is let go.
 */
export async function deleteMediumKeyword(
  userId: string,
  keywordId: string,
  db: CustomShellDb = defaultDb
): Promise<void> {
  const removed = await db
    .delete(promoMediumKeywords)
    .where(and(eq(promoMediumKeywords.id, keywordId), eq(promoMediumKeywords.userId, userId)))
    .returning({ id: promoMediumKeywords.id })
  if (!removed.length) throw new Error("That keyword is no longer saved.")
}

/**
 * Queues a search for one keyword in the reader browser. A keyword with one
 * already waiting or running is refused, so two presses never search twice.
 */
export async function queueMediumSearch(
  userId: string,
  keywordId: string,
  db: CustomShellDb = defaultDb,
  runAfter: Date | null = null
): Promise<string> {
  const [keyword] = await db
    .select({ id: promoMediumKeywords.id })
    .from(promoMediumKeywords)
    .where(and(eq(promoMediumKeywords.id, keywordId), eq(promoMediumKeywords.userId, userId)))
    .limit(1)
  if (!keyword) throw new Error("That keyword is no longer saved.")
  if ((await searchingKeywordIds(userId, db)).has(keywordId)) {
    throw new Refusal("That keyword is already being searched. Its stories show here when it finishes.")
  }
  return queueJob(userId, "medium_search", { keywordId }, db, runAfter)
}

/** Queues a search for every switched-on keyword of a project that is not already searching. */
export async function queueProjectMediumSearches(
  userId: string,
  projectId: string,
  db: CustomShellDb = defaultDb
): Promise<number> {
  const keywords = await listMediumKeywords(userId, projectId, db)
  let queued = 0
  for (const keyword of keywords) {
    if (!keyword.enabled || keyword.searching) continue
    await queueJob(userId, "medium_search", { keywordId: keyword.id }, db)
    queued += 1
  }
  return queued
}
