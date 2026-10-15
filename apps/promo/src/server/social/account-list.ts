import { and, asc, desc, eq, inArray, isNotNull, isNull, max, sql } from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"

import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { promoProfileFolders, promoProfiles, promoProxies } from "@/server/browser/schema"
import { promoPhoneActions, promoPhones } from "@/server/phones/schema"
import type { PhoneConnection } from "@/lib/phones/options"
import type { AccountImportance } from "@/lib/social/importance"
import {
  accountStatus,
  ACCOUNT_STATUS_LABELS,
  type AccountStatus,
  type AccountStatusView,
} from "@/lib/social/account-status"
import type { ProxyTestResult } from "@/lib/social/options"

import { refuseMixedProject, refuseMixedVoice } from "./apart"
import { moveHeldBack } from "./move-to-phone"
import { readBehaviour, warmUpEndsAt } from "./behaviour"
import { queueHealthCheck } from "./health"
import { promoAccounts, promoComments, promoProjects, promoVoices } from "./schema"

/**
 * Every account as a list, on every platform: the Accounts dashboard, with
 * its Platform filter, and the status the Projects dashboard shows beside each
 * account. Tyler, 15 Oct 2026: "I think accounts should be on its own
 * dashboard with platform filtering". Only Reddit accounts exist so far.
 *
 * The browser profile and its proxy stay app-wide records. This reads them to
 * show what each account is plugged into, and never copies them onto the
 * account. Tyler, 5 Oct 2026: proxy and browser isolation is an app wide
 * feature, not just a Reddit feature.
 */

type AccountRow = typeof promoAccounts.$inferSelect

/** The phone an account is being moved to, beside the one it runs on. */
const movingPhone = alias(promoPhones, "moving_phone")

/**
 * Each account's status, worked out now. The warm-up is the same
 * `warmUpEndsAt` Post uses, and Working counts comments that reached Reddit.
 */
export async function accountStatuses(
  userId: string,
  accounts: ReadonlyArray<Pick<AccountRow, "id" | "statusOverride" | "profileCheck" | "redditCreatedAt">>,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<Map<string, AccountStatusView>> {
  const out = new Map<string, AccountStatusView>()
  if (!accounts.length) return out
  const behaviour = await readBehaviour(userId, db)
  const last = await db
    .select({ accountId: promoComments.accountId, at: max(promoComments.postedAt) })
    .from(promoComments)
    .where(
      and(
        eq(promoComments.userId, userId),
        eq(promoComments.status, "posted"),
        inArray(promoComments.accountId, accounts.map((account) => account.id))
      )
    )
    .groupBy(promoComments.accountId)
  const lastAt = new Map(last.map((row) => [row.accountId, row.at]))

  for (const account of accounts) {
    out.set(
      account.id,
      accountStatus({
        statusOverride: account.statusOverride,
        profileCheck: account.profileCheck,
        warmUpEndsAt: warmUpEndsAt(account.redditCreatedAt, behaviour.warmUpDays, now),
        lastPromoCommentAt: lastAt.get(account.id) ?? null,
        now,
      })
    )
  }
  return out
}

export type RedditAccountRow = {
  id: string
  /** The network it is an account on, "reddit" for every account so far. */
  platform: string
  /** Without the u/ prefix. Empty when no name has been read. */
  handle: string
  status: AccountStatusView
  project: { id: string; name: string } | null
  /** Null when no profile was picked, or the one picked was deleted. */
  profile: {
    id: string
    name: string
    folder: { id: string; name: string } | null
    tags: string[]
  } | null
  /**
   * The phone it runs on instead of a profile, or null. Its folder and tags
   * are the same folders and tags profiles use.
   */
  phone: {
    id: string
    name: string
    folder: { id: string; name: string } | null
    tags: string[]
    connection: PhoneConnection
    simCarrier: string
  } | null
  /** The profile's proxy, or the phone's on Wi-Fi. Null when there is none. */
  proxy: { label: string; country: string; lastTestResult: ProxyTestResult | null } | null
  voice: { id: string; name: string } | null
  redditCreatedAt: Date | null
  karma: number | null
  lastPostedAt: Date | null
  /** When it was retired, or null while in use. */
  retiredAt: Date | null
  /** Paused by itself, or through a paused project, or null when it runs. */
  paused: "account" | "project" | null
  /** True when an authenticator secret is saved. The secret itself never leaves the server. */
  twoFactor: boolean
  /** When a phone found a ban screen and stopped it, with the screen's words, or null. */
  banScreen: { at: Date; words: string } | null
  /** Important or throwaway (part 22 of the phone farm). */
  importance: AccountImportance
  /**
   * A move from its browser profile to a phone that has not finished
   * (part 31), with the phone's last answer to "who is signed in", or null.
   */
  move: {
    phone: { id: string; name: string }
    lastRead: { at: Date; status: string; handle: string | null; error: string } | null
    /** Why the move cannot finish now, even once the phone reads the account, or empty. */
    heldBack: string
  } | null
}

/** The accounts in use on every platform, or with `retired` the retired ones too, oldest first. */
export async function listRedditAccounts(
  userId: string,
  options: { retired: boolean },
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<RedditAccountRow[]> {
  const rows = await db
    .select({
      account: promoAccounts,
      projectName: promoProjects.name,
      projectPausedAt: promoProjects.pausedAt,
      profileName: promoProfiles.name,
      profileTags: promoProfiles.tags,
      phoneName: promoPhones.name,
      phoneTags: promoPhones.tags,
      phoneConnection: promoPhones.connection,
      phoneCarrier: promoPhones.simCarrier,
      movingPhoneName: movingPhone.name,
      folderId: promoProfileFolders.id,
      folderName: promoProfileFolders.name,
      proxyId: promoProxies.id,
      proxyLabel: promoProxies.label,
      proxyCountry: promoProxies.country,
      proxyTest: promoProxies.lastTestResult,
      voiceName: promoVoices.name,
    })
    .from(promoAccounts)
    .leftJoin(promoProjects, eq(promoProjects.id, promoAccounts.projectId))
    .leftJoin(promoProfiles, eq(promoProfiles.id, promoAccounts.profileId))
    .leftJoin(promoPhones, eq(promoPhones.id, promoAccounts.phoneId))
    .leftJoin(movingPhone, eq(movingPhone.id, promoAccounts.movingToPhoneId))
    // An account is on a profile or a phone, never both, so whichever is set
    // gives the folder and the proxy.
    .leftJoin(
      promoProfileFolders,
      eq(promoProfileFolders.id, sql`coalesce(${promoProfiles.folderId}, ${promoPhones.folderId})`)
    )
    .leftJoin(promoProxies, eq(promoProxies.id, sql`coalesce(${promoProfiles.proxyId}, ${promoPhones.proxyId})`))
    .leftJoin(promoVoices, eq(promoVoices.id, promoAccounts.voiceId))
    .where(
      and(
        eq(promoAccounts.userId, userId),
        ...(options.retired ? [] : [isNull(promoAccounts.retiredAt)])
      )
    )
    .orderBy(asc(promoAccounts.createdAt), asc(promoAccounts.id))

  const statuses = await accountStatuses(userId, rows.map((row) => row.account), db, now)
  const reads = await lastSignInReads(
    userId,
    rows.flatMap((row) => (row.account.movingToPhoneId ? [row.account.movingToPhoneId] : [])),
    db
  )

  const heldBack = new Map<string, string>()
  for (const { account } of rows) {
    if (account.movingToPhoneId && !account.retiredAt) {
      heldBack.set(account.id, (await moveHeldBack(userId, account, account.movingToPhoneId, db)) ?? "")
    }
  }

  return rows.map((row) => {
    const { account } = row
    return {
      id: account.id,
      platform: account.platform,
      handle: account.handle,
      status: statuses.get(account.id) ?? { status: null, byHand: false, warning: null },
      project:
        account.projectId && row.projectName !== null
          ? { id: account.projectId, name: row.projectName }
          : null,
      profile:
        account.profileId && row.profileName !== null
          ? {
              id: account.profileId,
              name: row.profileName,
              folder: row.folderId && row.folderName !== null ? { id: row.folderId, name: row.folderName } : null,
              tags: row.profileTags ?? [],
            }
          : null,
      phone:
        account.phoneId && row.phoneName !== null
          ? {
              id: account.phoneId,
              name: row.phoneName,
              folder: row.folderId && row.folderName !== null ? { id: row.folderId, name: row.folderName } : null,
              tags: row.phoneTags ?? [],
              connection: row.phoneConnection ?? "sim",
              simCarrier: row.phoneCarrier ?? "",
            }
          : null,
      proxy:
        row.proxyId !== null
          ? { label: row.proxyLabel ?? "", country: row.proxyCountry ?? "", lastTestResult: row.proxyTest }
          : null,
      voice: account.voiceId && row.voiceName !== null ? { id: account.voiceId, name: row.voiceName } : null,
      redditCreatedAt: account.redditCreatedAt,
      karma: account.karma,
      lastPostedAt: account.lastPostedAt,
      retiredAt: account.retiredAt,
      paused: account.pausedAt ? "account" : row.projectPausedAt ? "project" : null,
      twoFactor: Boolean(account.totpSecretEncrypted),
      banScreen: account.banScreenAt ? { at: account.banScreenAt, words: account.blockedReason } : null,
      importance: account.importance,
      move:
        account.movingToPhoneId && row.movingPhoneName !== null
          ? {
              phone: { id: account.movingToPhoneId, name: row.movingPhoneName },
              lastRead: reads.get(account.movingToPhoneId) ?? null,
              heldBack: heldBack.get(account.id) ?? "",
            }
          : null,
    }
  })
}

/** The newest "who is signed in" each phone was asked, for a move that is waiting on it. */
async function lastSignInReads(
  userId: string,
  phoneIds: string[],
  db: CustomShellDb
): Promise<Map<string, { at: Date; status: string; handle: string | null; error: string }>> {
  const out = new Map<string, { at: Date; status: string; handle: string | null; error: string }>()
  if (!phoneIds.length) return out
  const rows = await db
    .selectDistinctOn([promoPhoneActions.phoneId], {
      phoneId: promoPhoneActions.phoneId,
      at: promoPhoneActions.createdAt,
      status: promoPhoneActions.status,
      result: promoPhoneActions.result,
      error: promoPhoneActions.error,
    })
    .from(promoPhoneActions)
    .where(
      and(
        eq(promoPhoneActions.userId, userId),
        eq(promoPhoneActions.action, "reddit/state"),
        inArray(promoPhoneActions.phoneId, phoneIds)
      )
    )
    .orderBy(promoPhoneActions.phoneId, desc(promoPhoneActions.createdAt))
  for (const row of rows) {
    const handle = typeof row.result?.handle === "string" && row.result.handle ? row.result.handle : null
    out.set(row.phoneId, { at: row.at, status: row.status, handle, error: row.error })
  }
  return out
}

export type BulkAnswer = { completed: string[]; skipped: string[] }

/** The person's own accounts among these ids. */
async function ownIds(userId: string, ids: string[], db: CustomShellDb): Promise<string[]> {
  if (!ids.length) return []
  const rows = await db
    .select({ id: promoAccounts.id })
    .from(promoAccounts)
    .where(and(eq(promoAccounts.userId, userId), inArray(promoAccounts.id, ids)))
  return rows.map((row) => row.id)
}

/**
 * Sets a status by hand on each account, or with null lets the app decide
 * again. One request for any number. The status is a label: it never changes
 * what Post or the warm-up allow.
 */
export async function setAccountsStatus(
  userId: string,
  ids: string[],
  status: AccountStatus | null,
  db: CustomShellDb = defaultDb
): Promise<BulkAnswer> {
  if (status !== null && !(status in ACCOUNT_STATUS_LABELS)) throw new Error("Unknown status.")
  const owned = await ownIds(userId, ids, db)
  if (owned.length) {
    await db
      .update(promoAccounts)
      .set({ statusOverride: status, updatedAt: new Date() })
      .where(and(eq(promoAccounts.userId, userId), inArray(promoAccounts.id, owned)))
  }
  return { completed: owned, skipped: ids.filter((id) => !owned.includes(id)) }
}

/**
 * Retires accounts, or with `retire` false brings them back. A retired account
 * leaves every list and picker, never posts and never warms up. Its comments
 * stay, on the Comments dashboard and counted against it.
 */
export async function retireAccounts(
  userId: string,
  ids: string[],
  retire: boolean,
  db: CustomShellDb = defaultDb
): Promise<BulkAnswer> {
  if (!ids.length) return { completed: [], skipped: [] }
  if (!retire) {
    // Coming back must not mix the groups: the project or voice may have
    // taken an account of the other group while this one was retired.
    const returning = await db
      .select()
      .from(promoAccounts)
      .where(and(eq(promoAccounts.userId, userId), inArray(promoAccounts.id, ids), isNotNull(promoAccounts.retiredAt)))
    for (const account of returning) {
      await refuseMixedProject(userId, account, account.projectId, db)
      await refuseMixedVoice(userId, account, account.voiceId, db)
    }
  }
  const changed = await db
    .update(promoAccounts)
    // A retired account's waiting move to a phone ends, so the phone is free again.
    .set({ retiredAt: retire ? new Date() : null, ...(retire ? { movingToPhoneId: null } : {}), updatedAt: new Date() })
    .where(
      and(
        eq(promoAccounts.userId, userId),
        inArray(promoAccounts.id, ids),
        retire ? isNull(promoAccounts.retiredAt) : isNotNull(promoAccounts.retiredAt)
      )
    )
    .returning({ id: promoAccounts.id })
  const completed = changed.map((row) => row.id)
  return { completed, skipped: ids.filter((id) => !completed.includes(id)) }
}

/**
 * Queues a health reading for each account, the same one Check now asks for
 * on Settings → Reddit account. An account already being read, or retired,
 * is skipped.
 */
export async function checkAccountsNow(
  userId: string,
  ids: string[],
  db: CustomShellDb = defaultDb
): Promise<BulkAnswer> {
  if (!ids.length) return { completed: [], skipped: [] }
  const rows = await db
    .select({ id: promoAccounts.id })
    .from(promoAccounts)
    .where(
      and(
        eq(promoAccounts.userId, userId),
        inArray(promoAccounts.id, ids),
        isNull(promoAccounts.retiredAt)
      )
    )
  const completed: string[] = []
  for (const row of rows) {
    if (await queueHealthCheck(userId, row.id, db)) completed.push(row.id)
  }
  return { completed, skipped: ids.filter((id) => !completed.includes(id)) }
}

/** Swaps the voice an account drafts with, or with null leaves it drafting plainly. */
export async function setAccountVoice(
  userId: string,
  accountId: string,
  voiceId: string | null,
  db: CustomShellDb = defaultDb
): Promise<void> {
  if (voiceId) {
    const [voice] = await db
      .select({ id: promoVoices.id })
      .from(promoVoices)
      .where(and(eq(promoVoices.id, voiceId), eq(promoVoices.userId, userId)))
      .limit(1)
    if (!voice) throw new Error("That voice does not exist.")
    const [account] = await db
      .select({
        id: promoAccounts.id,
        handle: promoAccounts.handle,
        importance: promoAccounts.importance,
        movingToPhoneId: promoAccounts.movingToPhoneId,
      })
      .from(promoAccounts)
      .where(and(eq(promoAccounts.id, accountId), eq(promoAccounts.userId, userId)))
      .limit(1)
    if (!account) throw new Error("That account is not there any more.")
    await refuseMixedVoice(userId, account, voiceId, db)
  }
  const updated = await db
    .update(promoAccounts)
    .set({ voiceId, updatedAt: new Date() })
    .where(and(eq(promoAccounts.id, accountId), eq(promoAccounts.userId, userId)))
    .returning({ id: promoAccounts.id })
  if (!updated.length) throw new Error("That account is not there any more.")
}
