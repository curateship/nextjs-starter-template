import { and, eq, inArray, sql } from "drizzle-orm"

import { uuid } from "@/server/auth/security"
import type { CommandTarget } from "@/server/browser/command"
import { Refusal } from "@/server/browser/refusal"
import { db as defaultDb, type CustomShellDb } from "@/server/db"
import type { JobKind } from "@/lib/social/options"
import { NOTICE_HEADINGS } from "@/lib/social/notice-words"
import { handleWords } from "@/lib/social/networks"

import { queueJob, type QueuedJob } from "../jobs"
import { noticeRung, ringBell } from "../notices"
import { promoAccounts, promoJobs } from "../schema"
import { linkedinEnterCode, type LinkedinState } from "./calls"
import { recordLinkedinCheck, runLinkedinChange, runLinkedinComment } from "./comments"
import { readLinkedinGroup } from "./groups"
import { runLinkedinAccept, runLinkedinConnect, runLinkedinInvites, runLinkedinViewers } from "./people"
import { runLinkedinPublish } from "./posts"
import { recordLinkedinLookup, recordLinkedinSeen, runLinkedinNumbers } from "./reach"
import { promoLinkedinPages } from "./schema"
import { readLinkedinPost, runLinkedinFeed, runLinkedinSearch, type LinkedinReader } from "./search"
import { settleFailedLinkedinJob } from "./settle"
import { runLinkedinWarmUp } from "./warm-up"

/**
 * LinkedIn's jobs, handed out by the browser program's runner
 * (`../runner.ts`), which has already found the job's browser: a search
 * account's for the reads, the account's own browser or phone for everything
 * else. Kept beside LinkedIn's code so the runner only learns that LinkedIn
 * exists.
 */

/** LinkedIn's work as the account itself, in its own browser or on its phone. Only a LinkedIn account does these. */
export const LINKEDIN_ACCOUNT_KINDS: readonly JobKind[] = [
  "linkedin_code",
  "linkedin_comment",
  "linkedin_publish",
  "linkedin_edit",
  "linkedin_delete",
  "linkedin_connect",
  "linkedin_invites",
  "linkedin_accept",
  "linkedin_viewers",
  "linkedin_numbers",
  "linkedin_feed",
  "linkedin_warm_up",
]

/** The LinkedIn jobs the LinkedIn app on a phone does. The rest need a browser profile. */
export const LINKEDIN_PHONE_KINDS: readonly JobKind[] = [
  "linkedin_comment",
  "linkedin_publish",
  "linkedin_connect",
  "linkedin_invites",
  "linkedin_accept",
  "linkedin_warm_up",
]

/** Minutes an emailed code is kept on its job before it is refused as too old (part 4). */
const CODE_FRESH_MINUTES = 15

function text(value: unknown): string {
  return typeof value === "string" ? value : ""
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []
}

/** One read through a search account. */
export async function runLinkedinSearcherJob(job: QueuedJob, reader: LinkedinReader, db: CustomShellDb = defaultDb): Promise<void> {
  if (job.kind === "linkedin_search") {
    const keywordId = text(job.payload.keywordId)
    if (!keywordId) throw new Error("That LinkedIn search names no keyword.")
    await runLinkedinSearch(job.userId, keywordId, reader, db)
  } else if (job.kind === "linkedin_read") {
    const findId = text(job.payload.findId)
    if (!findId) throw new Error("That read names no LinkedIn post.")
    await readLinkedinPost(job.userId, findId, reader, db)
  } else if (job.kind === "linkedin_check") {
    await recordLinkedinCheck(job.userId, job.payload, reader, db)
  } else if (job.kind === "linkedin_lookup") {
    await recordLinkedinLookup(job.userId, job.id, { people: strings(job.payload.people), companies: strings(job.payload.companies) }, reader, db)
  } else if (job.kind === "linkedin_group") {
    await readLinkedinGroup(job.userId, text(job.payload.groupRowId), reader, db)
  } else if (job.kind === "linkedin_seen") {
    await recordLinkedinSeen(job.userId, text(job.payload.accountId), reader, db)
  } else {
    throw new Error(`There is no LinkedIn read called "${job.kind}".`)
  }
}

export async function runLinkedinAccountJob(
  job: QueuedJob,
  account: typeof promoAccounts.$inferSelect,
  target: CommandTarget,
  db: CustomShellDb = defaultDb
): Promise<void> {
  if (job.kind === "linkedin_code") {
    await enterLinkedinCode(job, account, target, db)
  } else if (job.kind === "linkedin_comment") {
    await runLinkedinComment(job.userId, text(job.payload.commentRowId), target, db)
  } else if (job.kind === "linkedin_publish") {
    await runLinkedinPublish(job.userId, text(job.payload.postRowId), target, db)
  } else if (job.kind === "linkedin_edit" || job.kind === "linkedin_delete") {
    await runLinkedinChange(job.userId, job.kind, job.payload, target, db)
  } else if (job.kind === "linkedin_connect") {
    await runLinkedinConnect(job.userId, text(job.payload.connectId), target, db)
  } else if (job.kind === "linkedin_invites") {
    await runLinkedinInvites(job.userId, account.id, target, db)
  } else if (job.kind === "linkedin_accept") {
    await runLinkedinAccept(job.userId, text(job.payload.inviteId), target, db)
  } else if (job.kind === "linkedin_viewers") {
    await runLinkedinViewers(job.userId, account, target, db)
  } else if (job.kind === "linkedin_numbers") {
    await runLinkedinNumbers(account, target, db)
  } else if (job.kind === "linkedin_feed") {
    await runLinkedinFeed(job.userId, account, target, db)
  } else if (job.kind === "linkedin_warm_up") {
    await runLinkedinWarmUp(job.userId, account, target, db)
  } else {
    throw new Error(`There is no LinkedIn job called "${job.kind}".`)
  }
}

/**
 * Queues the code LinkedIn emailed (part 4), pasted by a person, to be typed
 * into the account's browser. The code rides on its job and nowhere else,
 * and is wiped from the job the moment it has been typed or refused.
 */
export async function queueLinkedinCode(userId: string, accountId: string, code: string, db: CustomShellDb = defaultDb, now: Date = new Date()): Promise<string> {
  const digits = code.replace(/\s+/g, "")
  if (!/^\d{4,8}$/.test(digits)) throw new Refusal("Paste the code from LinkedIn's email: the digits only.")
  const [account] = await db
    .select()
    .from(promoAccounts)
    .where(and(eq(promoAccounts.id, accountId), eq(promoAccounts.userId, userId)))
    .limit(1)
  if (!account || account.platform !== "linkedin") throw new Refusal("Pick a LinkedIn account first.")
  if (!account.profileId) throw new Refusal("This LinkedIn account has no browser profile. On a phone, type the code into the app through the phone's screen window.")
  if (!account.linkedinCodeAskedAt) throw new Refusal("LinkedIn is not asking this account for a code, as far as its last look saw. Press Check now on the Accounts dashboard first.")
  const [waiting] = await db
    .select({ id: promoJobs.id })
    .from(promoJobs)
    .where(
      and(
        eq(promoJobs.userId, userId),
        eq(promoJobs.kind, "linkedin_code"),
        inArray(promoJobs.status, ["queued", "running"]),
        sql`${promoJobs.payload}->>'accountId' = ${account.id}`
      )
    )
    .limit(1)
  if (waiting) throw new Refusal("A code for this account is already on its way.")
  return queueJob(userId, "linkedin_code", { accountId: account.id, code: digits, pastedAt: now.toISOString() }, db, null, uuid())
}

/** Types the pasted code into the account's browser, then wipes it from the job either way. */
async function enterLinkedinCode(job: QueuedJob, account: typeof promoAccounts.$inferSelect, target: CommandTarget, db: CustomShellDb): Promise<void> {
  const code = text(job.payload.code)
  const pastedAt = new Date(text(job.payload.pastedAt))
  await db.update(promoJobs).set({ payload: sql`${promoJobs.payload} - 'code'` }).where(eq(promoJobs.id, job.id))
  if (!code) throw new Refusal("That code was already typed or wiped. Paste a new one.")
  if (!Number.isFinite(pastedAt.getTime()) || Date.now() - pastedAt.getTime() > CODE_FRESH_MINUTES * 60_000) {
    throw new Refusal(`That code was pasted more than ${CODE_FRESH_MINUTES} minutes ago, so LinkedIn will have let it lapse. Ask LinkedIn for a new one and paste that.`)
  }
  const state = await linkedinEnterCode(target, { code })
  await saveLinkedinSignIn(account, state, db)
  if (state.slug && !state.codeAsked) return
  throw new Refusal(
    state.codeAsked
      ? "The code was typed, but LinkedIn is still asking for one. It may be wrong or old: ask LinkedIn for a new one and paste that."
      : state.blocked
        ? `The code was typed, but LinkedIn is still in the way: ${state.reason}. Take control of the browser on the Browser profiles dashboard.`
        : "The code was typed, but the browser is not signed in to LinkedIn. Sign in again in the browser window."
  )
}

/**
 * Writes who a LinkedIn account is signed in as, whether it has Premium,
 * how many follow it and the company pages it runs, from one look. A look
 * that was not taken on a LinkedIn page changes nothing. A restriction or
 * identity-check screen stops the account at once (part 5), and the stop
 * stays until a person lets the account run again, whatever a later look
 * says. LinkedIn asking for its emailed code is not a stop: it rings the
 * bell once, and the code box shows on the account's row (part 4).
 *
 * A stop found for the first time drops the account's other waiting jobs and
 * rings the bell, the way a phone's ban screen does (`stopForBanScreen` in
 * `src/server/phones/health.ts`).
 */
export async function saveLinkedinSignIn(
  account: { id: string; userId: string; handle: string; profileId: string | null; banScreenAt: Date | null; linkedinCodeAskedAt: Date | null },
  state: LinkedinState,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<void> {
  if (!state.checked) return
  const banned = state.banScreen?.trim().slice(0, 500) ?? ""
  // The code page is LinkedIn waiting on a person, not a block of its own.
  const blocked = (state.blocked && !state.codeAsked) || Boolean(banned)
  // LinkedIn shows nobody when an account joined, so when Promo first saw it
  // signed in is its only age, and the warm-up counts from it. A look that
  // sees nobody (the code page, a restriction screen, a brief sign-out) keeps
  // both the name and that date; only a different member signing in starts again.
  const otherMember = Boolean(state.slug) && state.slug?.toLowerCase() !== account.handle.toLowerCase()
  await db
    .update(promoAccounts)
    .set({
      ...(state.slug ? { handle: state.slug } : {}),
      blocked: sql`CASE WHEN ${promoAccounts.banScreenAt} IS NULL THEN ${blocked} ELSE true END`,
      blockedReason: sql`CASE WHEN ${promoAccounts.banScreenAt} IS NULL THEN ${banned || (blocked ? state.reason : "")} ELSE ${promoAccounts.blockedReason} END`,
      ...(banned ? { banScreenAt: sql`coalesce(${promoAccounts.banScreenAt}, ${now.toISOString()}::timestamptz)` } : {}),
      stateReadAt: now,
      linkedinCodeAskedAt: state.codeAsked ? sql`coalesce(${promoAccounts.linkedinCodeAskedAt}, ${now.toISOString()}::timestamptz)` : null,
      ...(state.slug && state.premium !== null ? { linkedinPremium: state.premium } : {}),
      ...(state.slug && state.followers !== null ? { followers: state.followers } : {}),
      ...(otherMember && account.handle ? { signedInAt: now } : {}),
      ...(state.slug && !(otherMember && account.handle) ? { signedInAt: sql`coalesce(${promoAccounts.signedInAt}, ${now.toISOString()}::timestamptz)` } : {}),
    })
    .where(eq(promoAccounts.id, account.id))
  if (state.slug && state.pages) await savePages(account, state.pages, db, now)
  if (state.codeAsked && !account.linkedinCodeAskedAt) await ringForCode({ ...account, onPhone: !account.profileId }, db, now)
  if (!banned || account.banScreenAt) return
  // Failed rather than deleted, so a comment they carried keeps its job and
  // can be dismissed or tried again from the Failed list once it is sorted.
  const why = `Not sent: LinkedIn stopped the account first ("${banned}").`
  const dropped = await db
    .update(promoJobs)
    .set({ status: "failed", lastError: why, finishedAt: now })
    .where(and(eq(promoJobs.userId, account.userId), eq(promoJobs.status, "queued"), sql`${promoJobs.payload}->>'accountId' = ${account.id}`))
    .returning({ id: promoJobs.id, kind: promoJobs.kind })
  // Their rows say why, or a comment would stay "on its way" for good.
  for (const job of dropped) await settleFailedLinkedinJob(job, why, db)
  await ringBell(
    account.userId,
    {
      kind: "ban_screen",
      targetId: account.id,
      message: `${NOTICE_HEADINGS.ban_screen} ${handleWords("linkedin", account.handle || state.slug || "") || "a LinkedIn account"} ${account.profileId ? "in its browser" : "on its phone"}`,
      detail: [
        `LinkedIn showed: "${banned}".`,
        `Promo stopped the account${dropped.length ? ` and dropped its ${dropped.length} waiting ${dropped.length === 1 ? "job" : "jobs"}` : ""}.`,
        account.profileId
          ? "Sort it out in the browser window on the Browser profiles dashboard, then let it run again from the Accounts dashboard."
          : "Sort it out through the phone's screen window on the Phones dashboard, then let it run again from the Accounts dashboard.",
      ].join(" "),
      href: "/admin/accounts?platform=linkedin",
    },
    db,
    now
  )
}

/** The company pages an account runs, as its last look listed them. Pages it no longer runs are let go. */
async function savePages(account: { id: string; userId: string }, pages: NonNullable<LinkedinState["pages"]>, db: CustomShellDb, now: Date): Promise<void> {
  const kept: string[] = []
  for (const page of pages) {
    const pageId = /^\d{1,30}$/.test(page.pageId) ? page.pageId : ""
    if (!pageId) continue
    kept.push(pageId)
    const values = { slug: page.slug.slice(0, 100), name: page.name.slice(0, 200), seenAt: now }
    await db
      .insert(promoLinkedinPages)
      .values({ id: uuid(), userId: account.userId, accountId: account.id, pageId, ...values })
      .onConflictDoUpdate({ target: [promoLinkedinPages.accountId, promoLinkedinPages.pageId], set: values })
  }
  await db
    .delete(promoLinkedinPages)
    .where(
      and(
        eq(promoLinkedinPages.accountId, account.id),
        kept.length ? sql`${promoLinkedinPages.pageId} NOT IN (${sql.join(kept.map((id) => sql`${id}`), sql`, `)})` : undefined
      )
    )
}

/** One bell when LinkedIn starts asking an account for its emailed code. */
async function ringForCode(account: { id: string; userId: string; handle: string; onPhone: boolean }, db: CustomShellDb, now: Date): Promise<void> {
  const target = `${account.id}:${now.toISOString().slice(0, 13)}`
  if (await noticeRung("linkedin_code", target, db)) return
  await ringBell(
    account.userId,
    {
      kind: "linkedin_code",
      targetId: target,
      message: `${NOTICE_HEADINGS.linkedin_code} ${handleWords("linkedin", account.handle) || "a LinkedIn account"}`,
      detail: account.onPhone
        ? "LinkedIn emailed a code to the account's address. Type it into the LinkedIn app through the phone's screen window on the Phones dashboard."
        : "LinkedIn emailed a code to the account's address. Paste it into the box in the account's settings on the Accounts dashboard within 15 minutes.",
      href: "/admin/accounts?platform=linkedin",
    },
    db,
    now
  )
}
