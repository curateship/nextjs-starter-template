import { and, eq, sql } from "drizzle-orm"

import type { CommandTarget } from "@/server/browser/command"
import { Refusal } from "@/server/browser/refusal"
import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { decryptSecret } from "@/server/auth/encryption"
import type { JobKind } from "@/lib/social/options"

import type { QueuedJob } from "../jobs"
import { NOTICE_HEADINGS } from "@/lib/social/notice-words"

import { ringBell } from "../notices"
import { promoAccounts, promoJobs } from "../schema"
import { totpCode } from "../two-factor"
import { xEnterCode, type XState } from "./calls"
import { settleFailedXJob } from "./settle"
import { readXCommunity } from "./communities"
import { runXFollow } from "./follows"
import { runXListAdd } from "./lists"
import { runXPublish } from "./posts"
import { recordXLookup, recordXReach } from "./reach"
import { recordXCheck, recordXMentions, runXChange, runXReply } from "./replies"
import { readXPost, readXTrends, runXSearch, type XReader } from "./search"
import { runXWarmUp } from "./warm-up"

/**
 * X's jobs, handed out by the browser program's runner (`../runner.ts`),
 * which has already found the job's browser: a search account's for the
 * reads, the account's own browser or phone for everything else. Kept beside
 * X's code so the runner only learns that X exists.
 */

/** X's work as the account itself, in its own browser or on its phone. Only an X account does these. */
export const X_ACCOUNT_KINDS: readonly JobKind[] = [
  "x_code",
  "x_reply",
  "x_publish",
  "x_edit",
  "x_delete",
  "x_follow",
  "x_warm_up",
  "x_list_add",
]

/** The X jobs the X app on a phone does. The rest need a browser profile. */
export const X_PHONE_KINDS: readonly JobKind[] = ["x_reply", "x_publish", "x_follow", "x_warm_up"]

function text(value: unknown): string {
  return typeof value === "string" ? value : ""
}

/** One read through a search account. */
export async function runXSearcherJob(job: QueuedJob, reader: XReader, db: CustomShellDb = defaultDb): Promise<void> {
  if (job.kind === "x_search") {
    const keywordId = text(job.payload.keywordId)
    if (!keywordId) throw new Error("That X search names no keyword.")
    await runXSearch(job.userId, keywordId, reader, db)
  } else if (job.kind === "x_read") {
    const findId = text(job.payload.findId)
    if (!findId) throw new Error("That read names no X post.")
    await readXPost(job.userId, findId, reader, db)
  } else if (job.kind === "x_check") {
    await recordXCheck(job.userId, job.payload, reader, db)
  } else if (job.kind === "x_mentions") {
    await recordXMentions(job.userId, text(job.payload.accountId), reader, db)
  } else if (job.kind === "x_trends") {
    await readXTrends(job.userId, reader, db)
  } else if (job.kind === "x_lookup") {
    const handles = Array.isArray(job.payload.handles) ? job.payload.handles.filter((handle): handle is string => typeof handle === "string") : []
    await recordXLookup(job.userId, job.id, handles, reader, db)
  } else if (job.kind === "x_community") {
    await readXCommunity(job.userId, text(job.payload.communityRowId), reader, db)
  } else if (job.kind === "x_reach") {
    await recordXReach(job.userId, text(job.payload.accountId), reader, db)
  } else {
    throw new Error(`There is no X read called "${job.kind}".`)
  }
}

export async function runXAccountJob(
  job: QueuedJob,
  account: typeof promoAccounts.$inferSelect,
  target: CommandTarget,
  db: CustomShellDb = defaultDb
): Promise<void> {
  if (job.kind === "x_code") {
    await enterXCode(account, target)
  } else if (job.kind === "x_reply") {
    await runXReply(job.userId, text(job.payload.replyId), target, db)
  } else if (job.kind === "x_publish") {
    await runXPublish(job.userId, text(job.payload.postRowId), target, db, new Date(), job.id)
  } else if (job.kind === "x_edit" || job.kind === "x_delete") {
    await runXChange(job.userId, job.kind, job.payload, target, db)
  } else if (job.kind === "x_follow") {
    await runXFollow(job.userId, text(job.payload.followId), target, db)
  } else if (job.kind === "x_warm_up") {
    await runXWarmUp(job.userId, account, target, db)
  } else if (job.kind === "x_list_add") {
    await runXListAdd(job.userId, text(job.payload.listItemId), target, db)
  } else {
    throw new Error(`There is no X job called "${job.kind}".`)
  }
}

/**
 * Types X's six-digit sign-in code into the account's browser (part 6), from
 * the authenticator secret saved on the account. The code is worked out at
 * the moment it is typed and never stored.
 */
async function enterXCode(account: typeof promoAccounts.$inferSelect, target: CommandTarget): Promise<void> {
  if (!account.totpSecretEncrypted) {
    throw new Refusal("This X account has no authenticator secret saved. Add it in the account's settings on the Accounts dashboard.")
  }
  const code = totpCode(decryptSecret(account.totpSecretEncrypted))
  const state = await xEnterCode(target, { code })
  if (state.handle) return
  throw new Refusal(
    state.blocked
      ? `The code was typed, but X is still in the way: ${state.reason}. Take control of the browser on the Browser profiles dashboard.`
      : "The code was typed, but the browser is not signed in to X. Sign in again in the browser window, then send the code once X asks for it."
  )
}

/**
 * Writes who an X account is signed in as, when X says it joined, and how
 * many follow it, from one look. A look that was not taken on an X page
 * changes nothing. A lock or suspension screen stops the account at once
 * (part 7), and the stop stays until a person lets the account run again,
 * whatever a later look says.
 *
 * A lock screen found for the first time drops the account's other waiting
 * jobs in its browser and rings the bell, the way a phone's ban screen does
 * (`stopForBanScreen` in `src/server/phones/health.ts`).
 */
export async function saveXSignIn(
  account: { id: string; userId: string; handle: string; profileId: string | null; banScreenAt: Date | null },
  state: XState,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<void> {
  if (!state.checked) return
  const accountId = account.id
  const banned = state.banScreen?.trim().slice(0, 500) ?? ""
  await db
    .update(promoAccounts)
    .set({
      handle: state.handle ?? "",
      blocked: sql`CASE WHEN ${promoAccounts.banScreenAt} IS NULL THEN ${state.blocked || Boolean(banned)} ELSE true END`,
      blockedReason: sql`CASE WHEN ${promoAccounts.banScreenAt} IS NULL THEN ${banned || (state.blocked ? state.reason : "")} ELSE ${promoAccounts.blockedReason} END`,
      ...(banned ? { banScreenAt: sql`coalesce(${promoAccounts.banScreenAt}, ${now.toISOString()}::timestamptz)` } : {}),
      stateReadAt: now,
      ...(state.handle && state.joinedSeconds ? { xJoinedAt: new Date(state.joinedSeconds * 1000) } : {}),
      ...(state.handle && state.followers !== null ? { followers: state.followers } : {}),
      signedInAt: state.handle ? sql`coalesce(${promoAccounts.signedInAt}, ${now.toISOString()}::timestamptz)` : null,
    })
    .where(eq(promoAccounts.id, accountId))
  if (!banned || account.banScreenAt) return
  const dropped = account.profileId
    ? await db
        .delete(promoJobs)
        .where(
          and(
            eq(promoJobs.userId, account.userId),
            eq(promoJobs.status, "queued"),
            eq(promoJobs.lane, account.profileId),
            sql`${promoJobs.payload}->>'accountId' = ${accountId}`
          )
        )
        .returning({ id: promoJobs.id, kind: promoJobs.kind })
    : []
  // Their rows say why, or a reply would stay "on its way" for good.
  for (const job of dropped) await settleFailedXJob(job, `Not sent: the account hit a lock screen first ("${banned}").`, db)
  await ringBell(
    account.userId,
    {
      kind: "ban_screen",
      targetId: accountId,
      message: `${NOTICE_HEADINGS.ban_screen} @${account.handle || state.handle || "an X account"} in its browser`,
      detail: [
        `X showed: "${banned}".`,
        `Promo stopped the account${dropped.length ? ` and dropped its ${dropped.length} waiting ${dropped.length === 1 ? "job" : "jobs"}` : ""}.`,
        "Sort it out in the browser window on the Browser profiles dashboard, then let it run again from the Accounts dashboard.",
      ].join(" "),
      href: "/admin/accounts?platform=x",
    },
    db,
    now
  )
}
