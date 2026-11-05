import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm"

import type { PromoReadStatus } from "@/lib/viral/promo-link"
import {
  cleanWatchValue,
  isTextSocial,
  readSocials,
  SOCIAL_NAMES,
  WATCH_KIND_WORDS,
  WATCH_READ_EVERY_MS,
  watchKinds,
  watchLabel,
  type SocialWatch,
  type TextSocial,
  type TextSocialsScreen,
  type WatchKind,
} from "@/lib/viral/socials"
import { viralSays } from "@/lib/viral/viral"
import { now, uuid } from "@/server/auth/security"
import { db } from "@/server/db"
import { creatorWatchEnabled } from "@/server/viral/creators/watch"
import { requireOwnedViralProject } from "@/server/viral/projects"
import { listSocialPosts, requestPromoRead } from "@/server/viral/promo-reads"
import {
  viralProjects,
  viralPromoReads,
  viralSocialPosts,
  viralSocialWatches,
  type ViralSocialWatchRow,
} from "@/server/viral/schema"
import { getPromoKeyStatus, getPromoUrl } from "@/server/viral/settings"
import { isUniqueViolation } from "@/server/viral/unique-violation"

/**
 * What a project keeps reading on X, Reddit and LinkedIn
 * (`workspace/docs/projects-and-socials.md`, task parts 12 to 14). Tyler,
 * 4 Nov 2026: "Ask Promo to read them". A watch is a search, hashtag,
 * account, person, company or subreddit; each time it is read, Promo's
 * answer lands in `viral_social_posts` through `promo-reads.ts`. A watch has
 * no state of its own: its newest read with the same network, kind and value
 * says how it stands.
 */

/** A read still waiting after this long lost its answer, so the watch is due again. */
const WAITING_GIVES_UP_MS = 2 * 60 * 60 * 1000

/** How many reads one tick of the watch asks Promo for. Promo's browsers are slow, so a few at a time. */
const READS_PER_TICK = 5

type NewestRead = {
  id: string
  projectId: string
  network: string
  kind: string
  value: string
  status: PromoReadStatus
  error: string
  found: number
  createdAt: Date
}

const watchKey = (one: { projectId: string; network: string; kind: string; value: string }) =>
  `${one.projectId}|${one.network}|${one.kind}|${one.value.toLowerCase()}`

/** The newest read of each of these projects' watched values, keyed by `watchKey`. */
async function newestReads(projectIds: string[]): Promise<Map<string, NewestRead>> {
  if (!projectIds.length) return new Map()
  const rows = await db
    .selectDistinctOn([viralPromoReads.projectId, viralPromoReads.network, viralPromoReads.kind, viralPromoReads.value], {
      id: viralPromoReads.id,
      projectId: viralPromoReads.projectId,
      network: viralPromoReads.network,
      kind: viralPromoReads.kind,
      value: viralPromoReads.value,
      status: viralPromoReads.status,
      error: viralPromoReads.error,
      found: viralPromoReads.found,
      createdAt: viralPromoReads.createdAt,
    })
    .from(viralPromoReads)
    .where(inArray(viralPromoReads.projectId, projectIds))
    .orderBy(viralPromoReads.projectId, viralPromoReads.network, viralPromoReads.kind, viralPromoReads.value, desc(viralPromoReads.createdAt))
  const newest = new Map<string, NewestRead>()
  for (const row of rows) {
    const key = watchKey(row)
    const was = newest.get(key)
    // Two spellings of one value ("Fitness", "fitness") are one watch; the newer read wins.
    if (!was || was.createdAt < row.createdAt) newest.set(key, row)
  }
  return newest
}

function toWatch(row: ViralSocialWatchRow, read: NewestRead | undefined): SocialWatch {
  return {
    id: row.id,
    network: row.network,
    kind: row.kind,
    value: row.value,
    status: read ? read.status : "never",
    error: read?.status === "failed" ? read.error : "",
    found: read?.found ?? 0,
    readId: read?.id ?? null,
    readAt: read?.createdAt.toISOString() ?? null,
  }
}

async function promoConnected(): Promise<boolean> {
  const [url, key] = await Promise.all([getPromoUrl(), getPromoKeyStatus()])
  return Boolean(url) && key.configured
}

/** A project's X, Reddit and LinkedIn side: Promo's setup, its watches with how each stands, and the posts found. */
export async function loadTextSocials(ownerId: string, projectId: string): Promise<TextSocialsScreen> {
  await requireOwnedViralProject(ownerId, projectId)
  const [connected, rows, reads, posts] = await Promise.all([
    promoConnected(),
    db
      .select()
      .from(viralSocialWatches)
      .where(and(eq(viralSocialWatches.ownerId, ownerId), eq(viralSocialWatches.projectId, projectId)))
      .orderBy(asc(viralSocialWatches.createdAt), asc(viralSocialWatches.id)),
    newestReads([projectId]),
    listSocialPosts(ownerId, projectId),
  ])
  return { connected, watches: rows.map((row) => toWatch(row, reads.get(watchKey(row)))), posts }
}

/**
 * Reads one watch now through Promo. A refusal Promo gives, such as having no
 * X search account, is kept as the watch's failed read and said.
 */
async function readWatch(ownerId: string, watch: ViralSocialWatchRow) {
  await requestPromoRead(ownerId, { projectId: watch.projectId, network: watch.network, kind: watch.kind, value: watch.value })
}

async function ownedWatch(ownerId: string, watchId: string): Promise<ViralSocialWatchRow> {
  const [row] = await db
    .select()
    .from(viralSocialWatches)
    .where(and(eq(viralSocialWatches.id, watchId), eq(viralSocialWatches.ownerId, ownerId)))
    .limit(1)
  if (!row) throw viralSays("That one was already removed.")
  return row
}

export type AddWatchInput = { projectId: string; network: TextSocial; kind: WatchKind; value: string }

/**
 * Adds a search, account, person, company or subreddit to a project and
 * reads it at once when Promo is set up. Refused on the sample, on a social
 * the project doesn't use, for a kind that social can't read, and for one
 * already there. With Promo not set up the watch is still kept, and read
 * once it is.
 */
export async function addSocialWatch(ownerId: string, input: AddWatchInput): Promise<{ watch: SocialWatch; readError: string | null }> {
  if (!isTextSocial(input.network)) throw viralSays("Promo can't read that social.")
  const name = SOCIAL_NAMES[input.network]
  if (!watchKinds(input.network).includes(input.kind)) {
    throw viralSays(`${name} can't read ${WATCH_KIND_WORDS[input.kind]?.title.toLowerCase() ?? "that"}.`)
  }
  const value = cleanWatchValue(input.kind, input.value)
  if (!value) throw viralSays(`Type the ${WATCH_KIND_WORDS[input.kind].one} first.`)
  const project = await requireOwnedViralProject(ownerId, input.projectId)
  if (project.isSample) throw viralSays("The sample project never reads anything. Make a project of your own to read it.")
  if (!readSocials(project.socials).includes(input.network)) throw viralSays(`Add ${name} to this project first.`)

  const id = uuid()
  try {
    await db
      .insert(viralSocialWatches)
      .values({ id, ownerId, projectId: input.projectId, network: input.network, kind: input.kind, value, createdAt: now() })
  } catch (error) {
    if (isUniqueViolation(error)) throw viralSays(`${watchLabel(input.kind, value)} is already on ${name} here.`)
    throw error
  }
  const row = await ownedWatch(ownerId, id)
  let readError: string | null = null
  if (await promoConnected()) {
    try {
      await readWatch(ownerId, row)
    } catch (error) {
      readError = error instanceof Error ? error.message.replace(/^VIRAL_SAYS: /, "") : "Promo didn't answer."
    }
  }
  const reads = await newestReads([row.projectId])
  return { watch: toWatch(row, reads.get(watchKey(row))), readError }
}

/** Reads one watch again now. Refused while its last read still waits, and on the sample. */
export async function readSocialWatchNow(ownerId: string, watchId: string): Promise<SocialWatch> {
  const row = await ownedWatch(ownerId, watchId)
  const project = await requireOwnedViralProject(ownerId, row.projectId)
  if (project.isSample) throw viralSays("The sample project never reads anything. Make a project of your own to read it.")
  const before = (await newestReads([row.projectId])).get(watchKey(row))
  if (before?.status === "waiting" && now().getTime() - before.createdAt.getTime() < WAITING_GIVES_UP_MS) {
    throw viralSays("Promo is still reading it. Its posts arrive here when it finishes.")
  }
  await readWatch(ownerId, row)
  return toWatch(row, (await newestReads([row.projectId])).get(watchKey(row)))
}

/**
 * Takes a watch off the project. The posts its reads brought leave the list
 * with it, unless a read of something still watched brought them since.
 */
export async function removeSocialWatch(ownerId: string, watchId: string): Promise<void> {
  const row = await ownedWatch(ownerId, watchId)
  await db.transaction(async (tx) => {
    const reads = await tx
      .select({ id: viralPromoReads.id })
      .from(viralPromoReads)
      .where(
        and(
          eq(viralPromoReads.projectId, row.projectId),
          eq(viralPromoReads.network, row.network),
          eq(viralPromoReads.kind, row.kind),
          eq(viralPromoReads.value, row.value)
        )
      )
    if (reads.length) {
      await tx
        .delete(viralSocialPosts)
        .where(and(eq(viralSocialPosts.projectId, row.projectId), inArray(viralSocialPosts.readId, reads.map((read) => read.id))))
    }
    await tx.delete(viralSocialWatches).where(eq(viralSocialWatches.id, row.id))
  })
}

/** Whether a watch with this newest read is due another read at this moment. */
export function watchIsDue(kind: WatchKind, read: { status: PromoReadStatus; createdAt: Date } | undefined, at: Date): boolean {
  if (!read) return true
  const age = at.getTime() - read.createdAt.getTime()
  if (read.status === "waiting") return age >= WAITING_GIVES_UP_MS
  return age >= WATCH_READ_EVERY_MS[kind]
}

/**
 * The X, Reddit and LinkedIn watch: asks Promo to read again every watch that
 * is due, searches once a day and people every 6 hours. Skips samples,
 * archived projects and paused socials, and does nothing while Promo isn't
 * set up. Off unless `VIRAL_WATCH_ENABLED=1`, the same switch as the daily
 * re-check and the creator watch. Answers how many reads it asked for.
 */
export async function socialWatchTick(at: Date = now()): Promise<number> {
  if (!creatorWatchEnabled()) return 0
  if (!(await promoConnected())) return 0

  const rows = await db
    .select({ watch: viralSocialWatches, socials: viralProjects.socials, paused: viralProjects.pausedSocials })
    .from(viralSocialWatches)
    .innerJoin(viralProjects, eq(viralProjects.id, viralSocialWatches.projectId))
    .where(and(eq(viralProjects.isSample, false), isNull(viralProjects.archivedAt)))
  const live = rows.filter(
    (row) => readSocials(row.socials).includes(row.watch.network) && !readSocials(row.paused).includes(row.watch.network)
  )
  const reads = await newestReads([...new Set(live.map((row) => row.watch.projectId))])
  const due = live
    .map((row) => ({ watch: row.watch, read: reads.get(watchKey(row.watch)) }))
    .filter((one) => watchIsDue(one.watch.kind, one.read, at))
    // The one that has waited longest goes first; one never read before that.
    .sort((a, b) => (a.read?.createdAt.getTime() ?? 0) - (b.read?.createdAt.getTime() ?? 0))
    .slice(0, READS_PER_TICK)

  let asked = 0
  for (const { watch } of due) {
    try {
      await readWatch(watch.ownerId, watch)
      asked += 1
    } catch (error) {
      // Kept as the watch's failed read, with Promo's words; the next due time tries again.
      console.error("Viral's social watch: Promo refused a read", error)
    }
  }
  return asked
}
