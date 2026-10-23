import { and, desc, eq, gte, inArray, isNotNull, isNull, ne, sql } from "drizzle-orm"

import { uuid } from "@/server/auth/security"
import type { CommandTarget } from "@/server/browser/command"
import { Refusal } from "@/server/browser/refusal"
import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { CONNECT_NOTE_CHARS, linkedinSlug, matchedTitle, type LinkedinConnectStatus, type LinkedinInviteStatus } from "@/lib/social/linkedin/options"
import { holdsLink } from "@/lib/social/x/options"
import { linkedinMayHaveLanded, linkedinPostingRefusal } from "@/lib/social/linkedin/wording"

import { refuseLinkedinInteraction } from "../apart"
import { queueJob } from "../jobs"
import { ownedProject } from "../projects"
import { promoAccounts, promoJobs } from "../schema"
import { linkedinAccept, linkedinConnect, linkedinInvites, linkedinViewers } from "./calls"
import { readBuyerTitles } from "./keywords"
import { linkedinWritingAccount, readLinkedinPostingState } from "./posting"
import { promoLinkedinComments, promoLinkedinConnects, promoLinkedinFinds, promoLinkedinInvites, promoLinkedinViewers } from "./schema"
import { readLinkedinSettings } from "./searchers"

/**
 * The People tab (parts 39, 40 and 41): connection requests the accounts
 * send, the requests waiting on them, and who looked at their profiles.
 *
 * - **Requests out.** Tyler, 22 Oct 2026: "You set it, start at 20" a week,
 *   counted over the last seven days, each with a short note the AI writes
 *   and he can edit before Send. Sent only on a press, from a post the
 *   account commented on or from a profile viewer.
 * - **Requests in.** Read in the account's own browser or phone. Tyler, 22
 *   Oct 2026: he ticks and presses Accept, fitting ones listed first. Ticked
 *   ones go one at a time, a minute or two apart.
 * - **Viewers.** Read once a workday in the account's own browser, since only
 *   the account sees them. A free account sees only the last few.
 *
 * Every one of these is the account acting on LinkedIn, so it waits for its
 * workday hours (part 7) and is refused in its warm-up.
 */

const WEEK_MS = 7 * 86_400_000

/** How far apart ticked accepts go, at least, plus a random part of the same again. */
const ACCEPT_GAP_MS = 60_000

/** How many waiting requests and viewers one read takes in at most. */
const READ_MAX = 40

/** Connection requests an account sent or has waiting in the last seven days. */
export async function connectsThisWeek(userId: string, accountId: string, db: CustomShellDb = defaultDb, now: Date = new Date()): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(promoLinkedinConnects)
    .where(
      and(
        eq(promoLinkedinConnects.userId, userId),
        eq(promoLinkedinConnects.accountId, accountId),
        inArray(promoLinkedinConnects.status, ["waiting", "sent"]),
        gte(promoLinkedinConnects.createdAt, new Date(now.getTime() - WEEK_MS))
      )
    )
  return row?.n ?? 0
}

/** The connection request each sent comment led to, for the Comments tab. */
export async function connectsFor(userId: string, commentRowIds: string[], db: CustomShellDb = defaultDb): Promise<Map<string, LinkedinConnectStatus>> {
  if (!commentRowIds.length) return new Map()
  const rows = await db
    .select({ commentRowId: promoLinkedinConnects.commentRowId, status: promoLinkedinConnects.status })
    .from(promoLinkedinConnects)
    .where(and(eq(promoLinkedinConnects.userId, userId), inArray(promoLinkedinConnects.commentRowId, commentRowIds)))
  return new Map(rows.flatMap((row) => (row.commentRowId ? [[row.commentRowId, row.status] as const] : [])))
}

/** A note as it is sent: trimmed, at most 200 characters, never a link. */
function cleanNote(note: string): string {
  const words = note.trim().replace(/\s+/g, " ")
  if (words.length > CONNECT_NOTE_CHARS) throw new Refusal(`The note is ${words.length} characters. LinkedIn takes ${CONNECT_NOTE_CHARS} on most accounts.`)
  if (holdsLink(words)) throw new Refusal("A connection note never carries a link. Take the link out first.")
  return words
}

export type QueuedConnect = { connectId: string; runAfter: Date | null }

/**
 * Queues one connection request a person pressed Send for: to the writer of
 * a post the account commented on, or to somebody who viewed its profile.
 * Refused in the warm-up, past the week's number, to an account of the other
 * group, to the account itself, or to someone it asked before.
 */
export async function queueLinkedinConnect(
  userId: string,
  input: { accountId: string; note: string } & ({ commentRowId: string } | { viewerId: string }),
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<QueuedConnect> {
  const account = await linkedinWritingAccount(userId, input.accountId, db)
  let person: { slug: string; name: string; headline: string; source: "post" | "viewer"; commentRowId: string | null }
  if ("commentRowId" in input) {
    const [row] = await db
      .select()
      .from(promoLinkedinComments)
      .where(and(eq(promoLinkedinComments.id, input.commentRowId), eq(promoLinkedinComments.userId, userId)))
      .limit(1)
    if (!row || row.status !== "posted") throw new Refusal("Only a comment that landed leads to a connection request.")
    if (row.accountId !== account.id) throw new Refusal("The request goes from the account that commented.")
    const [find] = row.findId
      ? await db.select().from(promoLinkedinFinds).where(eq(promoLinkedinFinds.id, row.findId)).limit(1)
      : []
    const slug = row.kind === "comment" ? (find?.authorKind === "person" ? find.authorSlug : "") : row.targetSlug
    if (!slug) throw new Refusal("That post was written by a company page or nobody LinkedIn named, so there is nobody to connect with.")
    person = {
      slug,
      name: row.kind === "comment" ? (find?.authorName ?? row.targetName) : row.targetName,
      headline: row.kind === "comment" ? (find?.authorHeadline ?? "") : (row.replyTo?.headline ?? ""),
      source: "post",
      commentRowId: row.id,
    }
  } else {
    const [viewer] = await db
      .select()
      .from(promoLinkedinViewers)
      .where(and(eq(promoLinkedinViewers.id, input.viewerId), eq(promoLinkedinViewers.userId, userId), eq(promoLinkedinViewers.accountId, account.id)))
      .limit(1)
    if (!viewer) throw new Refusal("That viewer is not saved any more. Read the viewers again.")
    person = { slug: viewer.slug, name: viewer.name, headline: viewer.headline, source: "viewer", commentRowId: null }
  }
  if (!linkedinSlug(person.slug)) throw new Refusal("LinkedIn did not give this person's page, so the request can't be sent.")
  if (person.slug.toLowerCase() === account.handle.toLowerCase()) throw new Refusal("That is the account itself.")
  const note = cleanNote(input.note)
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`promo-linkedin-connect:${account.id}`}))`)
    // Locked on the person too, so an important and a throwaway account
    // pressing Send for the same person at once cannot both pass the check.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`promo-linkedin-person:${userId}:${person.slug.toLowerCase()}`}))`)
    await refuseLinkedinInteraction(userId, account, { connectTo: person.slug, words: [note] }, tx)
    const state = await readLinkedinPostingState(userId, account, tx, now)
    // The day's pace is about writing; only a pause and the warm-up hold a request.
    const refusal = state.paused || state.warmUp.ageUnknown || (state.warmUp.endsAt && state.warmUp.endsAt > now) ? linkedinPostingRefusal(state, now, state.timeZone) : null
    if (refusal) throw new Refusal(refusal)
    const { connectsPerWeek } = await readLinkedinSettings(userId, tx)
    if ((await connectsThisWeek(userId, account.id, tx, now)) >= connectsPerWeek) {
      throw new Refusal(
        `This account sent ${connectsPerWeek} connection requests in the last 7 days, the number in Settings → Behaviour. LinkedIn restricts accounts that send too many. Try again in a few days.`
      )
    }
    const connectId = uuid()
    const inserted = await tx
      .insert(promoLinkedinConnects)
      .values({
        id: connectId,
        userId,
        accountId: account.id,
        slug: person.slug.slice(0, 100),
        name: person.name.slice(0, 200),
        headline: person.headline.slice(0, 300),
        note,
        source: person.source,
        commentRowId: person.commentRowId,
        createdAt: now,
      })
      .onConflictDoNothing()
      .returning({ id: promoLinkedinConnects.id })
    let rowId: string = connectId
    if (!inserted.length) {
      // One request per person. One that failed before it went out may be sent
      // again; one that may already be on LinkedIn, or went, may not.
      const [earlier] = await tx
        .select()
        .from(promoLinkedinConnects)
        .where(and(eq(promoLinkedinConnects.accountId, account.id), sql`lower(${promoLinkedinConnects.slug}) = ${person.slug.toLowerCase()}`))
        .limit(1)
      if (!earlier || earlier.status !== "failed") throw new Refusal(`This account asked ${person.name || person.slug} before.`)
      if (linkedinMayHaveLanded(earlier.lastError)) {
        throw new Refusal(`The last request to ${person.name || person.slug} failed after Connect was pressed, so it may already be on LinkedIn. Look at their page first.`)
      }
      await tx
        .update(promoLinkedinConnects)
        .set({ status: "waiting", note, source: person.source, commentRowId: person.commentRowId, lastError: "", createdAt: now })
        .where(eq(promoLinkedinConnects.id, earlier.id))
      rowId = earlier.id
    }
    const jobId = await queueJob(userId, "linkedin_connect", { connectId: rowId, accountId: account.id }, tx, state.nextWorkAt)
    await tx.update(promoLinkedinConnects).set({ jobId }).where(eq(promoLinkedinConnects.id, rowId))
    return { connectId: rowId, runAfter: state.nextWorkAt }
  })
}

/** Sends one connection request from the account's browser or phone, and writes down what happened. */
export async function runLinkedinConnect(userId: string, connectId: string, target: CommandTarget, db: CustomShellDb = defaultDb, now: Date = new Date()): Promise<void> {
  const [row] = await db
    .select()
    .from(promoLinkedinConnects)
    .where(and(eq(promoLinkedinConnects.id, connectId), eq(promoLinkedinConnects.userId, userId)))
    .limit(1)
  if (!row) throw new Refusal("That connection request is not saved any more.")
  if (row.status !== "waiting") return
  try {
    const answer = await linkedinConnect(target, { slug: row.slug, note: row.note })
    if (!answer.done && !answer.already) throw new Error(`Connect was pressed, but LinkedIn does not show ${row.name || row.slug} as asked. It may already be on LinkedIn; look at their page before asking again.`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await db.update(promoLinkedinConnects).set({ status: "failed", lastError: message.slice(0, 2_000) }).where(eq(promoLinkedinConnects.id, row.id))
    throw error
  }
  await db.update(promoLinkedinConnects).set({ status: "sent", sentAt: now, lastError: "" }).where(eq(promoLinkedinConnects.id, row.id))
}

export type LinkedinPersonView = {
  id: string
  account: { id: string; handle: string }
  slug: string
  name: string
  headline: string
  /** The project's buyer title the headline matched, or "". */
  fits: string
}

export type LinkedinInviteView = LinkedinPersonView & { note: string; status: LinkedinInviteStatus; lastError: string; firstSeenAt: Date }
export type LinkedinViewerView = LinkedinPersonView & { viewedAt: Date | null; connect: LinkedinConnectStatus | null }
export type LinkedinConnectView = LinkedinPersonView & { note: string; source: "post" | "viewer"; status: LinkedinConnectStatus; lastError: string; createdAt: Date; sentAt: Date | null }

export type LinkedinPeople = {
  invites: LinkedinInviteView[]
  viewers: LinkedinViewerView[]
  connects: LinkedinConnectView[]
  /** Each of the project's accounts: requests sent this week, and whether a read of its requests or viewers is waiting. */
  accounts: Array<{ id: string; handle: string; connectsThisWeek: number; reading: boolean; premium: boolean; onPhone: boolean }>
  connectsPerWeek: number
}

/**
 * The People tab for one project: its accounts' waiting requests and
 * viewers, people the project sells to first (part 14's titles), then
 * newest; and the requests its accounts sent, newest first.
 */
export async function readLinkedinPeople(userId: string, projectId: string, db: CustomShellDb = defaultDb, now: Date = new Date()): Promise<LinkedinPeople> {
  await ownedProject(userId, projectId, db)
  const titles = await readBuyerTitles(userId, projectId, db)
  const accounts = await db
    .select({ id: promoAccounts.id, handle: promoAccounts.handle, premium: promoAccounts.linkedinPremium, phoneId: promoAccounts.phoneId })
    .from(promoAccounts)
    .where(and(eq(promoAccounts.userId, userId), eq(promoAccounts.platform, "linkedin"), eq(promoAccounts.projectId, projectId), isNull(promoAccounts.retiredAt)))
  const ids = accounts.map((account) => account.id)
  const handle = new Map(accounts.map((account) => [account.id, account.handle]))
  const fitsFirst = <T extends { fits: string }>(rows: T[]) => rows.sort((a, b) => Number(Boolean(b.fits)) - Number(Boolean(a.fits)))
  const invites = ids.length
    ? await db
        .select()
        .from(promoLinkedinInvites)
        .where(and(eq(promoLinkedinInvites.userId, userId), inArray(promoLinkedinInvites.accountId, ids), ne(promoLinkedinInvites.status, "accepted")))
        .orderBy(desc(promoLinkedinInvites.firstSeenAt))
        .limit(200)
    : []
  const viewers = ids.length
    ? await db
        .select()
        .from(promoLinkedinViewers)
        .where(and(eq(promoLinkedinViewers.userId, userId), inArray(promoLinkedinViewers.accountId, ids)))
        .orderBy(desc(promoLinkedinViewers.lastSeenAt))
        .limit(200)
    : []
  const connects = ids.length
    ? await db
        .select()
        .from(promoLinkedinConnects)
        .where(and(eq(promoLinkedinConnects.userId, userId), inArray(promoLinkedinConnects.accountId, ids)))
        .orderBy(desc(promoLinkedinConnects.createdAt))
        .limit(200)
    : []
  const asked = new Map(connects.map((row) => [`${row.accountId}:${row.slug.toLowerCase()}`, row.status]))
  const reading = await db
    .select({ accountId: sql<string>`${promoJobs.payload}->>'accountId'` })
    .from(promoJobs)
    .where(and(eq(promoJobs.userId, userId), inArray(promoJobs.kind, ["linkedin_invites", "linkedin_viewers"]), inArray(promoJobs.status, ["queued", "running"])))
  const busy = new Set(reading.map((row) => row.accountId))
  const { connectsPerWeek } = await readLinkedinSettings(userId, db)
  return {
    invites: fitsFirst(
      invites.map((row) => ({
        id: row.id,
        account: { id: row.accountId, handle: handle.get(row.accountId) ?? "" },
        slug: row.slug,
        name: row.name,
        headline: row.headline,
        fits: matchedTitle(row.headline, titles),
        note: row.note,
        status: row.status,
        lastError: row.lastError,
        firstSeenAt: row.firstSeenAt,
      }))
    ),
    viewers: fitsFirst(
      viewers.map((row) => ({
        id: row.id,
        account: { id: row.accountId, handle: handle.get(row.accountId) ?? "" },
        slug: row.slug,
        name: row.name,
        headline: row.headline,
        fits: matchedTitle(row.headline, titles),
        viewedAt: row.viewedAt,
        connect: asked.get(`${row.accountId}:${row.slug.toLowerCase()}`) ?? null,
      }))
    ),
    connects: connects.map((row) => ({
      id: row.id,
      account: { id: row.accountId, handle: handle.get(row.accountId) ?? "" },
      slug: row.slug,
      name: row.name,
      headline: row.headline,
      fits: matchedTitle(row.headline, titles),
      note: row.note,
      source: row.source,
      status: row.status,
      lastError: row.lastError,
      createdAt: row.createdAt,
      sentAt: row.sentAt,
    })),
    accounts: await Promise.all(
      accounts.map(async (account) => ({
        id: account.id,
        handle: account.handle,
        connectsThisWeek: await connectsThisWeek(userId, account.id, db, now),
        reading: busy.has(account.id),
        premium: account.premium,
        onPhone: Boolean(account.phoneId),
      }))
    ),
    connectsPerWeek,
  }
}

/**
 * Asks an account's own browser or phone to read its waiting requests and
 * who viewed its profile. A read already waiting is not asked for twice.
 * The phone's app reads requests only; viewers need a browser.
 */
export async function queueLinkedinPeopleRead(userId: string, accountId: string, db: CustomShellDb = defaultDb, now: Date = new Date()): Promise<number> {
  const account = await linkedinWritingAccount(userId, accountId, db)
  const waiting = await db
    .select({ kind: promoJobs.kind })
    .from(promoJobs)
    .where(
      and(
        eq(promoJobs.userId, userId),
        inArray(promoJobs.kind, ["linkedin_invites", "linkedin_viewers"]),
        inArray(promoJobs.status, ["queued", "running"]),
        sql`${promoJobs.payload}->>'accountId' = ${account.id}`
      )
    )
  const busy = new Set(waiting.map((row) => row.kind))
  const state = await readLinkedinPostingState(userId, account, db, now)
  let queued = 0
  if (!busy.has("linkedin_invites")) {
    await queueJob(userId, "linkedin_invites", { accountId: account.id }, db, state.nextWorkAt)
    queued += 1
  }
  if (!account.phoneId && !busy.has("linkedin_viewers")) {
    await queueJob(userId, "linkedin_viewers", { accountId: account.id }, db, state.nextWorkAt)
    queued += 1
  }
  return queued
}

/** Reads the requests waiting on an account and keeps them. A request gone from the page since was answered on LinkedIn, and leaves the list. */
export async function runLinkedinInvites(userId: string, accountId: string, target: CommandTarget, db: CustomShellDb = defaultDb, now: Date = new Date()): Promise<void> {
  const { invites } = await linkedinInvites(target, { max: READ_MAX })
  const seen: string[] = []
  for (const invite of invites) {
    const slug = linkedinSlug(invite.slug).toLowerCase()
    if (!slug) continue
    seen.push(slug)
    const values = { name: invite.name.slice(0, 200), headline: invite.headline.slice(0, 300), note: invite.note.slice(0, 2_000), lastSeenAt: now }
    await db
      .insert(promoLinkedinInvites)
      .values({ id: uuid(), userId, accountId, slug, ...values, firstSeenAt: now })
      .onConflictDoUpdate({
        target: [promoLinkedinInvites.accountId, promoLinkedinInvites.slug],
        set: { ...values, status: sql`CASE WHEN ${promoLinkedinInvites.status} = 'failed' THEN 'waiting' ELSE ${promoLinkedinInvites.status} END` },
      })
  }
  // Waiting ones the page no longer shows were accepted or turned down on
  // LinkedIn itself. Only a read that came back short of its limit saw the
  // whole list; a full one may have stopped before the rest.
  if (invites.length >= READ_MAX) return
  await db
    .delete(promoLinkedinInvites)
    .where(
      and(
        eq(promoLinkedinInvites.userId, userId),
        eq(promoLinkedinInvites.accountId, accountId),
        eq(promoLinkedinInvites.status, "waiting"),
        seen.length ? sql`${promoLinkedinInvites.slug} NOT IN (${sql.join(seen.map((slug) => sql`${slug}`), sql`, `)})` : undefined
      )
    )
}

/**
 * Accepts the ticked requests, one job each, a minute or two apart inside
 * the account's workday. Tyler, 22 Oct 2026: nothing is accepted without his
 * press. Answers which went and which were refused, with why.
 */
export async function acceptLinkedinInvites(
  userId: string,
  inviteIds: string[],
  db: CustomShellDb = defaultDb,
  now: Date = new Date(),
  random: () => number = Math.random
): Promise<{ completed: string[]; skipped: Array<{ id: string; reason: string }> }> {
  const ids = [...new Set(inviteIds)]
  const rows = ids.length
    ? await db.select().from(promoLinkedinInvites).where(and(eq(promoLinkedinInvites.userId, userId), inArray(promoLinkedinInvites.id, ids)))
    : []
  const completed: string[] = []
  const skipped: Array<{ id: string; reason: string }> = []
  const nextAt = new Map<string, number>()
  for (const id of ids) {
    const row = rows.find((item) => item.id === id)
    if (!row) {
      skipped.push({ id, reason: "That request is not saved any more." })
      continue
    }
    if (row.status !== "waiting") {
      skipped.push({ id, reason: row.status === "accepted" ? "Accepted already." : "Already on its way." })
      continue
    }
    try {
      const account = await linkedinWritingAccount(userId, row.accountId, db)
      await refuseLinkedinInteraction(userId, account, { connectTo: row.slug, words: [] }, db)
      const state = await readLinkedinPostingState(userId, account, db, now)
      // The day's pace is about writing; a pause and the warm-up hold an accept.
      if (state.paused || state.warmUp.ageUnknown || (state.warmUp.endsAt && state.warmUp.endsAt > now)) {
        throw new Refusal(linkedinPostingRefusal(state, now, state.timeZone) ?? "This account may not accept yet.")
      }
      const start = Math.max(nextAt.get(account.id) ?? 0, (state.nextWorkAt ?? now).getTime())
      const runAfter = new Date(start)
      nextAt.set(account.id, start + ACCEPT_GAP_MS + Math.round(random() * ACCEPT_GAP_MS))
      // Moved and queued together, so a request is never left accepting with no job.
      await db.transaction(async (tx) => {
        const moved = await tx
          .update(promoLinkedinInvites)
          .set({ status: "accepting", lastError: "" })
          .where(and(eq(promoLinkedinInvites.id, row.id), eq(promoLinkedinInvites.status, "waiting")))
          .returning({ id: promoLinkedinInvites.id })
        if (!moved.length) throw new Refusal("Already on its way.")
        const jobId = await queueJob(userId, "linkedin_accept", { inviteId: row.id, accountId: account.id }, tx, runAfter.getTime() > now.getTime() ? runAfter : null)
        await tx.update(promoLinkedinInvites).set({ jobId }).where(eq(promoLinkedinInvites.id, row.id))
      })
      completed.push(id)
    } catch (error) {
      if (!(error instanceof Refusal)) throw error
      skipped.push({ id, reason: error.message })
    }
  }
  return { completed, skipped }
}

/** Accepts one request from the account's browser or phone, and writes down that it did. */
export async function runLinkedinAccept(userId: string, inviteId: string, target: CommandTarget, db: CustomShellDb = defaultDb, now: Date = new Date()): Promise<void> {
  const [row] = await db
    .select()
    .from(promoLinkedinInvites)
    .where(and(eq(promoLinkedinInvites.id, inviteId), eq(promoLinkedinInvites.userId, userId)))
    .limit(1)
  if (!row) throw new Refusal("That request is not saved any more.")
  if (row.status !== "accepting") return
  try {
    const { done } = await linkedinAccept(target, { slug: row.slug })
    if (!done) throw new Error(`Accept was pressed, but LinkedIn does not show ${row.name || row.slug} as connected. It may already be on LinkedIn; look at the invitations before accepting again.`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await db.update(promoLinkedinInvites).set({ status: "failed", lastError: message.slice(0, 2_000) }).where(eq(promoLinkedinInvites.id, row.id))
    throw error
  }
  await db.update(promoLinkedinInvites).set({ status: "accepted", acceptedAt: now, lastError: "" }).where(eq(promoLinkedinInvites.id, row.id))
}

/** Reads who viewed the account's profile and keeps them. A viewer LinkedIn shows with no page (a "someone at" line) is left out. */
export async function runLinkedinViewers(
  userId: string,
  account: Pick<typeof promoAccounts.$inferSelect, "id" | "linkedinPremium">,
  target: CommandTarget,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<void> {
  const read = await linkedinViewers(target, { max: READ_MAX })
  for (const viewer of read.viewers) {
    const slug = linkedinSlug(viewer.slug).toLowerCase()
    if (!slug) continue
    const values = {
      name: viewer.name.slice(0, 200),
      headline: viewer.headline.slice(0, 300),
      viewedAt: viewer.viewedSeconds ? new Date(viewer.viewedSeconds * 1000) : null,
      lastSeenAt: now,
    }
    await db
      .insert(promoLinkedinViewers)
      .values({ id: uuid(), userId, accountId: account.id, slug, ...values, firstSeenAt: now })
      .onConflictDoUpdate({ target: [promoLinkedinViewers.accountId, promoLinkedinViewers.slug], set: values })
  }
  // LinkedIn hiding viewers behind Premium says the account is not Premium.
  if (read.premiumNeeded && account.linkedinPremium) {
    await db.update(promoAccounts).set({ linkedinPremium: false }).where(eq(promoAccounts.id, account.id))
  }
}

/** The accounts whose requests and viewers are read once a workday by the ticker. */
export async function linkedinAccountsInUse(db: CustomShellDb = defaultDb) {
  return db
    .select()
    .from(promoAccounts)
    .where(
      and(
        eq(promoAccounts.platform, "linkedin"),
        isNull(promoAccounts.retiredAt),
        isNull(promoAccounts.banScreenAt),
        ne(promoAccounts.handle, ""),
        isNotNull(promoAccounts.projectId)
      )
    )
}
