import { and, asc, eq, isNull } from "drizzle-orm"

import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { postPhone, type PostPhone } from "@/server/phones/phones"
import { promoPhones } from "@/server/phones/schema"
import type { PhoneAppNetwork } from "@/lib/social/networks"

import { jobCounts, type JobCounts } from "../jobs"
import { pausedBy, type PausedBy } from "../pause"
import { ownedProject } from "../projects"
import { promoAccounts, promoVoices } from "../schema"
import { listInbox, type InboxRow } from "./inbox"
import { listAppPosts, type AppPostRow } from "./posts"

/**
 * What an Instagram or TikTok module shows on a project's dashboard: the
 * project's accounts on that network, the posts it made there with their
 * numbers, and the comments left under them. One read, so the module opens
 * with everything at once.
 */

export type AppAccount = {
  id: string
  /** Empty until the phone has read the app signed in. */
  handle: string
  phone: PostPhone | null
  voice: { id: string; name: string } | null
  followers: number | null
  following: number | null
  postCount: number | null
  /** Null when the Account status page was never read. */
  shadowbanned: boolean | null
  /** Stopped by a ban screen; nothing goes out until a person lets it run again. */
  banScreen: boolean
  paused: PausedBy
}

export type AppModuleView = {
  accounts: AppAccount[]
  /** This network's accounts in no project, for the accounts dropdown's Add. */
  freeAccounts: Array<{ id: string; handle: string; phoneName: string | null }>
  posts: AppPostRow[]
  comments: InboxRow[]
  jobs: JobCounts
}

export async function readAppModuleView(
  userId: string,
  projectId: string,
  network: PhoneAppNetwork,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<AppModuleView> {
  await ownedProject(userId, projectId, db)
  const rows = await db
    .select({ account: promoAccounts, voiceName: promoVoices.name, phoneName: promoPhones.name })
    .from(promoAccounts)
    .leftJoin(promoVoices, eq(promoVoices.id, promoAccounts.voiceId))
    .leftJoin(promoPhones, eq(promoPhones.id, promoAccounts.phoneId))
    .where(and(eq(promoAccounts.userId, userId), eq(promoAccounts.platform, network), isNull(promoAccounts.retiredAt)))
    .orderBy(asc(promoAccounts.createdAt), asc(promoAccounts.id))

  const accounts: AppAccount[] = []
  for (const { account, voiceName } of rows) {
    if (account.projectId !== projectId) continue
    accounts.push({
      id: account.id,
      handle: account.handle,
      phone: await postPhone(userId, account.phoneId, db, now),
      voice: account.voiceId && voiceName !== null ? { id: account.voiceId, name: voiceName } : null,
      followers: account.followers,
      following: account.following,
      postCount: account.postCount,
      shadowbanned: account.shadowbanned,
      banScreen: Boolean(account.banScreenAt),
      paused: await pausedBy(userId, account, db),
    })
  }

  return {
    accounts,
    freeAccounts: rows
      .filter((row) => row.account.projectId === null)
      .map((row) => ({ id: row.account.id, handle: row.account.handle, phoneName: row.phoneName })),
    posts: await listAppPosts(userId, projectId, network, db),
    comments: await listInbox(userId, { kind: "comment", projectId, platform: network }, db),
    jobs: await jobCounts(userId, db),
  }
}
