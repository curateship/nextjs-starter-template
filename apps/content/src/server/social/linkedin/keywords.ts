import { and, asc, count, eq, inArray, sql } from "drizzle-orm"

import { Refusal } from "@/server/browser/refusal"
import { uuid } from "@/server/auth/security"
import { db as defaultDb, type CustomShellDb } from "@/server/db"
import {
  BUYER_TITLE_CHARS,
  LINKEDIN_KEYWORD_KIND_WORDS,
  LINKEDIN_KEYWORD_KINDS,
  LINKEDIN_KEYWORD_MARKS,
  MAX_BUYER_TITLES,
  MAX_LINKEDIN_KEYWORD_CHARS,
  isWatchKind,
  linkedinKeywordLabel,
  linkedinKeywordValue,
  type LinkedinKeywordKind,
  type LinkedinKeywordMark,
} from "@/lib/social/linkedin/options"

import { queueJob } from "../jobs"
import { ownedProject } from "../projects"
import { promoLinkedinFinds, promoLinkedinKeywords, promoLinkedinProjects } from "./schema"
import { waitingLinkedinJobs } from "./searchers"

/**
 * A project's LinkedIn keywords (parts 10, 12 and 15): search words, a
 * hashtag, or a person or company page watched for its new posts. Each
 * belongs to one project, so every LinkedIn account in the project sees the
 * same posts, as on the other networks. And the project's "who we sell to"
 * job titles (part 14), which lift a post in the list.
 *
 * Every query is scoped by the person's id, and that filter is the ownership
 * check: a foreign id finds nothing and changes nothing.
 */

export type LinkedinKeywordView = {
  id: string
  kind: LinkedinKeywordKind
  value: string
  /** How the chip reads: "words", #hashtag, in/person, company/page. */
  label: string
  mark: LinkedinKeywordMark
  enabled: boolean
  /** A watched person's or page's new posts ring the bell (part 12). */
  notify: boolean
  lastRunAt: Date | null
  lastError: string
  /** Posts under it nobody has commented on or skipped. */
  waiting: number
  /** A search is waiting or running for it now. */
  searching: boolean
}

export async function listLinkedinKeywords(
  userId: string,
  projectId: string,
  db: CustomShellDb = defaultDb
): Promise<LinkedinKeywordView[]> {
  const keywords = await db
    .select()
    .from(promoLinkedinKeywords)
    .where(and(eq(promoLinkedinKeywords.userId, userId), eq(promoLinkedinKeywords.projectId, projectId)))
    .orderBy(asc(promoLinkedinKeywords.createdAt), asc(promoLinkedinKeywords.id))
  if (!keywords.length) return []
  const waiting = await db
    .select({ keywordId: promoLinkedinFinds.keywordId, n: count() })
    .from(promoLinkedinFinds)
    .where(
      and(
        inArray(
          promoLinkedinFinds.keywordId,
          keywords.map((keyword) => keyword.id)
        ),
        inArray(promoLinkedinFinds.status, ["new", "shortlisted"]),
        eq(promoLinkedinFinds.canComment, true)
      )
    )
    .groupBy(promoLinkedinFinds.keywordId)
  const searching = await waitingLinkedinJobs(userId, "linkedin_search", "keywordId", db)
  return keywords.map((keyword) => ({
    id: keyword.id,
    kind: keyword.kind,
    value: keyword.value,
    label: linkedinKeywordLabel(keyword),
    mark: keyword.mark,
    enabled: keyword.enabled,
    notify: keyword.notify,
    lastRunAt: keyword.lastRunAt,
    lastError: keyword.lastError,
    waiting: waiting.find((row) => row.keywordId === keyword.id)?.n ?? 0,
    searching: searching.has(keyword.id),
  }))
}

const MARK_ONLY_ON_WORDS = "Only search words can be marked as naming you or a rival. A hashtag, a person or a page names nobody."

/**
 * Saves a new keyword and searches it at once, so its posts start coming in.
 * The keyword is kept even when its first search is refused, most often for
 * want of a search account, and `searchRefused` says why.
 */
export async function addLinkedinKeyword(
  userId: string,
  projectId: string,
  input: { kind: LinkedinKeywordKind; value: string; mark?: LinkedinKeywordMark },
  db: CustomShellDb = defaultDb
): Promise<{ id: string; searchRefused: string | null }> {
  await ownedProject(userId, projectId, db)
  if (!LINKEDIN_KEYWORD_KINDS.includes(input.kind)) throw new Error("LinkedIn has no keyword of that kind.")
  const mark = input.mark ?? ""
  if (!LINKEDIN_KEYWORD_MARKS.includes(mark)) throw new Error("That mark is not one Promo knows.")
  if (mark && input.kind !== "search") throw new Error(MARK_ONLY_ON_WORDS)
  const value = linkedinKeywordValue(input.kind, input.value)
  if (!value) {
    throw new Error(
      isWatchKind(input.kind)
        ? `That is not a LinkedIn ${input.kind === "person" ? "person's" : "company page's"} address. Paste the address of their page.`
        : `Type the ${LINKEDIN_KEYWORD_KIND_WORDS[input.kind].toLowerCase()} first.`
    )
  }
  if (value.length > MAX_LINKEDIN_KEYWORD_CHARS) throw new Error("That keyword is too long.")
  const label = linkedinKeywordLabel({ kind: input.kind, value })
  const id = uuid()
  // Two presses at once, or one already saved: the unique index lets one in, and the other is told so.
  const added = await db
    .insert(promoLinkedinKeywords)
    .values({ id, userId, projectId, kind: input.kind, value, mark })
    .onConflictDoNothing()
    .returning({ id: promoLinkedinKeywords.id })
  if (!added.length) throw new Error(`This project already has ${label}.`)
  try {
    await queueLinkedinSearch(userId, id, db)
    return { id, searchRefused: null }
  } catch (error) {
    if (error instanceof Refusal) return { id, searchRefused: error.message }
    throw error
  }
}

/** Switches a keyword on or off, a watched person's bell (part 12), or its mark (part 15). */
export async function setLinkedinKeyword(
  userId: string,
  keywordId: string,
  change: { enabled?: boolean; notify?: boolean; mark?: LinkedinKeywordMark },
  db: CustomShellDb = defaultDb
): Promise<void> {
  const [keyword] = await db
    .select({ kind: promoLinkedinKeywords.kind })
    .from(promoLinkedinKeywords)
    .where(and(eq(promoLinkedinKeywords.id, keywordId), eq(promoLinkedinKeywords.userId, userId)))
    .limit(1)
  if (!keyword) throw new Error("That keyword is no longer saved.")
  if (change.mark !== undefined) {
    if (!LINKEDIN_KEYWORD_MARKS.includes(change.mark)) throw new Error("That mark is not one Promo knows.")
    if (change.mark && keyword.kind !== "search") throw new Error(MARK_ONLY_ON_WORDS)
  }
  await db
    .update(promoLinkedinKeywords)
    .set({
      ...(change.enabled === undefined ? {} : { enabled: change.enabled }),
      ...(change.notify === undefined ? {} : { notify: change.notify }),
      ...(change.mark === undefined ? {} : { mark: change.mark }),
      updatedAt: new Date(),
    })
    .where(and(eq(promoLinkedinKeywords.id, keywordId), eq(promoLinkedinKeywords.userId, userId)))
}

/**
 * Removes a keyword and the posts only it found. A comment already sent
 * keeps its record, with the post's words and address, because the comment
 * row holds those itself; only its link back to the find is let go.
 */
export async function deleteLinkedinKeyword(userId: string, keywordId: string, db: CustomShellDb = defaultDb): Promise<void> {
  const removed = await db
    .delete(promoLinkedinKeywords)
    .where(and(eq(promoLinkedinKeywords.id, keywordId), eq(promoLinkedinKeywords.userId, userId)))
    .returning({ id: promoLinkedinKeywords.id })
  if (!removed.length) throw new Error("That keyword is no longer saved.")
}

/**
 * Queues a search for one keyword through a search account. A keyword with
 * one already waiting or running is refused, so two presses never search
 * twice and never spend the account's views twice.
 */
export async function queueLinkedinSearch(
  userId: string,
  keywordId: string,
  db: CustomShellDb = defaultDb,
  runAfter: Date | null = null
): Promise<string> {
  const [keyword] = await db
    .select({ id: promoLinkedinKeywords.id })
    .from(promoLinkedinKeywords)
    .where(and(eq(promoLinkedinKeywords.id, keywordId), eq(promoLinkedinKeywords.userId, userId)))
    .limit(1)
  if (!keyword) throw new Error("That keyword is no longer saved.")
  if ((await waitingLinkedinJobs(userId, "linkedin_search", "keywordId", db)).has(keywordId)) {
    throw new Refusal("That keyword is already being searched. Its posts show here when it finishes.")
  }
  return queueJob(userId, "linkedin_search", { keywordId }, db, runAfter)
}

/** Queues a search for every switched-on keyword of a project that is not already searching. */
export async function queueProjectLinkedinSearches(userId: string, projectId: string, db: CustomShellDb = defaultDb): Promise<number> {
  let queued = 0
  for (const keyword of await listLinkedinKeywords(userId, projectId, db)) {
    if (!keyword.enabled || keyword.searching) continue
    await queueJob(userId, "linkedin_search", { keywordId: keyword.id }, db)
    queued += 1
  }
  return queued
}

/** The job titles a project sells to (part 14), in the order they were typed. */
export async function readBuyerTitles(userId: string, projectId: string, db: CustomShellDb = defaultDb): Promise<string[]> {
  const [row] = await db
    .select({ titles: promoLinkedinProjects.buyerTitles })
    .from(promoLinkedinProjects)
    .where(and(eq(promoLinkedinProjects.projectId, projectId), eq(promoLinkedinProjects.userId, userId)))
    .limit(1)
  return row?.titles ?? []
}

/**
 * Saves the job titles a project sells to (part 14): each trimmed, at most
 * 60 characters and 20 titles, with repeats taken out. The posts already
 * found keep their rank until they are searched again.
 */
export async function saveBuyerTitles(userId: string, projectId: string, titles: string[], db: CustomShellDb = defaultDb): Promise<string[]> {
  await ownedProject(userId, projectId, db)
  const clean: string[] = []
  for (const title of titles) {
    const words = title.trim().replace(/\s+/g, " ")
    if (!words) continue
    if (words.length > BUYER_TITLE_CHARS) throw new Error(`"${words.slice(0, 30)}…" is longer than ${BUYER_TITLE_CHARS} characters.`)
    if (!clean.some((have) => have.toLowerCase() === words.toLowerCase())) clean.push(words)
  }
  if (clean.length > MAX_BUYER_TITLES) throw new Error(`A project holds at most ${MAX_BUYER_TITLES} job titles.`)
  await db
    .insert(promoLinkedinProjects)
    .values({ projectId, userId, buyerTitles: clean })
    .onConflictDoUpdate({ target: promoLinkedinProjects.projectId, set: { buyerTitles: clean, updatedAt: sql`now()` } })
  return clean
}
