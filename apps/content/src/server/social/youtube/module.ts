import { and, asc, eq, isNull } from "drizzle-orm"

import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { promoProfiles } from "@/server/browser/schema"
import { postPhone, type PostPhone } from "@/server/phones/phones"
import { promoPhones } from "@/server/phones/schema"

import { jobCounts, type JobCounts } from "../jobs"
import { pausedBy, type PausedBy } from "../pause"
import { ownedProject } from "../projects"
import { listInbox, type InboxRow } from "../phone-apps/inbox"
import { promoAccounts, promoVoices } from "../schema"
import { listYoutubeTemplates, type YoutubeTemplateRow } from "./templates"
import { listYoutubePosts, type YoutubePostRow } from "./uploads"
import { readYoutubeSettings } from "./settings"

/**
 * What YouTube's module shows on a project's dashboard: the project's
 * channels, the videos and Shorts it uploaded with their numbers, the
 * comments under them, and the project's description templates. One read, so
 * the module opens with everything at once.
 */

export type YoutubeChannel = {
  id: string
  /** Empty until the browser or phone has read YouTube signed in. */
  handle: string
  /** Where it runs: a browser profile's name, or its phone. */
  profileName: string | null
  phone: PostPhone | null
  voice: { id: string; name: string } | null
  subscribers: number | null
  videos: number | null
  readAt: Date | null
  banScreen: boolean
  /** YouTube's own words when a check screen is in the way. */
  blockedReason: string
  paused: PausedBy
}

export type YoutubeModuleView = {
  channels: YoutubeChannel[]
  /** YouTube channels in no project, for the channels dropdown's Add. */
  freeAccounts: Array<{ id: string; handle: string; where: string | null }>
  posts: YoutubePostRow[]
  comments: InboxRow[]
  templates: YoutubeTemplateRow[]
  uploadsPerDay: number
  jobs: JobCounts
}

export async function readYoutubeModuleView(
  userId: string,
  projectId: string,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<YoutubeModuleView> {
  await ownedProject(userId, projectId, db)
  const rows = await db
    .select({ account: promoAccounts, voiceName: promoVoices.name, phoneName: promoPhones.name, profileName: promoProfiles.name })
    .from(promoAccounts)
    .leftJoin(promoVoices, eq(promoVoices.id, promoAccounts.voiceId))
    .leftJoin(promoPhones, eq(promoPhones.id, promoAccounts.phoneId))
    .leftJoin(promoProfiles, eq(promoProfiles.id, promoAccounts.profileId))
    .where(and(eq(promoAccounts.userId, userId), eq(promoAccounts.platform, "youtube"), isNull(promoAccounts.retiredAt)))
    .orderBy(asc(promoAccounts.createdAt), asc(promoAccounts.id))

  const channels: YoutubeChannel[] = []
  for (const { account, voiceName, profileName } of rows) {
    if (account.projectId !== projectId) continue
    channels.push({
      id: account.id,
      handle: account.handle,
      profileName: account.profileId ? profileName : null,
      phone: await postPhone(userId, account.phoneId, db, now),
      voice: account.voiceId && voiceName !== null ? { id: account.voiceId, name: voiceName } : null,
      subscribers: account.followers,
      videos: account.postCount,
      readAt: account.appHealthReadAt,
      banScreen: Boolean(account.banScreenAt),
      blockedReason: account.blocked ? account.blockedReason : "",
      paused: await pausedBy(userId, account, db),
    })
  }

  return {
    channels,
    freeAccounts: rows
      .filter((row) => row.account.projectId === null)
      .map((row) => ({ id: row.account.id, handle: row.account.handle, where: row.phoneName ?? row.profileName ?? null })),
    posts: await listYoutubePosts(userId, projectId, db),
    comments: await listInbox(userId, { kind: "comment", projectId, platform: "youtube" }, db),
    templates: await listYoutubeTemplates(userId, projectId, db),
    uploadsPerDay: (await readYoutubeSettings(userId, db)).uploadsPerDay,
    jobs: await jobCounts(userId, db),
  }
}
