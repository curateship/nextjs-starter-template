import { and, asc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm"

import {
  isKeywordWorking,
  unitsPerKeyword,
  YOUTUBE_QUOTA_MESSAGE,
  viralSays,
  type ViralKeywordStatus,
  type ViralVideoLength,
} from "@/lib/viral/viral"
import { now, uuid } from "@/server/auth/security"
import { db } from "@/server/db"
import {
  viralProjectKeywords,
  viralProjectResults,
  viralProjects,
} from "@/server/viral/schema"
import { getYoutubeApiKey } from "@/server/viral/settings"
import { refreshChannelUsuals } from "@/server/viral/outliers"
import { ringRecheckBell } from "@/server/viral/daily-checks"
import { matchTopics } from "@/server/viral/topic-match"
import { requireOwnedViralProject } from "@/server/viral/projects"
import { scoreVideos } from "@/server/viral/project-view"
import {
  searchYoutubeVideos,
  type YoutubeVideo,
} from "@/server/viral/youtube"
import {
  queuedKeywordUnits,
  recordYoutubeUnits,
  youtubeUnitsLeftToday,
} from "@/server/viral/youtube-units"

/**
 * Searching a project's keywords in the background.
 *
 * Pressing Search only marks keywords `queued`; the worker below takes them
 * one at a time, so the page never waits on YouTube and one keyword failing
 * never loses the others. Each keyword's search replaces that keyword's
 * results and nobody else's.
 *
 * Before anything is queued the whole run is priced against what is left of
 * today's free allowance, counting keywords already waiting anywhere in the
 * app. A run that does not fit starts nothing, so no project is left half
 * searched.
 */


/**
 * How long one claim lasts. A search is three calls of at most 15 seconds
 * each, twice for "both", so two minutes is plenty and a dead worker's
 * keyword is back in the queue soon after.
 */
const SEARCH_LEASE_MS = 2 * 60 * 1000

/** How many keywords one tick of the worker searches. */
const KEYWORDS_PER_TICK = 5

/**
 * Queues the project's keywords, or just the ones named, after checking the
 * allowance covers all of them. Keywords already waiting are left alone.
 */
export async function queueViralSearch(
  ownerId: string,
  projectId: string,
  keywordIds?: string[]
): Promise<{ queued: number; units: number }> {
  const project = await requireOwnedViralProject(ownerId, projectId)
  if (project.isSample) {
    throw viralSays(
      "This is a sample, so there is nothing real to search. Make your own project to search YouTube."
    )
  }
  if (!(await getYoutubeApiKey())) {
    throw viralSays(
      "Searching needs the YouTube key. Paste one in Settings → YouTube first."
    )
  }

  const keywords = await db
    .select()
    .from(viralProjectKeywords)
    .where(
      keywordIds
        ? and(
            eq(viralProjectKeywords.projectId, projectId),
            inArray(viralProjectKeywords.id, keywordIds)
          )
        : eq(viralProjectKeywords.projectId, projectId)
    )
  if (!keywords.length) throw viralSays("Add a keyword first.")
  const waiting = keywords.filter(
    (keyword) => !isKeywordWorking(keyword.status as ViralKeywordStatus)
  )
  if (!waiting.length) {
    throw viralSays("Those keywords are already being searched.")
  }

  const perKeyword = unitsPerKeyword(project.videoLength as ViralVideoLength)
  const cost = waiting.length * perKeyword
  const left = (await youtubeUnitsLeftToday()) - (await queuedKeywordUnits()).searchUnits
  if (cost > left) {
    const fit = Math.max(0, Math.floor(left / perKeyword))
    throw viralSays(
      fit === 0
        ? YOUTUBE_QUOTA_MESSAGE
        : `Today's free YouTube allowance has room for ${fit} of these ${waiting.length} keywords (${(fit * perKeyword).toLocaleString()} of the ${cost.toLocaleString()} units), so nothing was started. Refresh single keywords instead, or wait for midnight Pacific time.`
    )
  }

  const at = now()
  await db
    .update(viralProjectKeywords)
    .set({ status: "queued", error: null, queuedAt: at })
    .where(
      inArray(
        viralProjectKeywords.id,
        waiting.map((keyword) => keyword.id)
      )
    )
  return { queued: waiting.length, units: cost }
}

// ---------------------------------------------------------------------------
// The worker.

type ClaimedKeyword = typeof viralProjectKeywords.$inferSelect & {
  leaseToken: string
}

export async function viralSearchTick(): Promise<void> {
  await releaseAbandoned()
  for (let turn = 0; turn < KEYWORDS_PER_TICK; turn += 1) {
    const claimed = await claimQueued()
    if (!claimed) return
    await runSearch(claimed)
  }
}

/** A keyword left `searching` by a restart goes back in the queue. */
async function releaseAbandoned() {
  const at = now()
  await db
    .update(viralProjectKeywords)
    .set({ status: "queued", leaseToken: null, leaseExpiresAt: null })
    .where(
      and(
        eq(viralProjectKeywords.status, "searching"),
        or(
          isNull(viralProjectKeywords.leaseExpiresAt),
          lt(viralProjectKeywords.leaseExpiresAt, at)
        )
      )
    )
}

async function claimQueued(): Promise<ClaimedKeyword | null> {
  const [waiting] = await db
    .select({ id: viralProjectKeywords.id })
    .from(viralProjectKeywords)
    .where(eq(viralProjectKeywords.status, "queued"))
    .orderBy(asc(viralProjectKeywords.queuedAt))
    .limit(1)
  if (!waiting) return null
  const leaseToken = uuid()
  const [claimed] = await db
    .update(viralProjectKeywords)
    .set({
      status: "searching",
      leaseToken,
      leaseExpiresAt: new Date(Date.now() + SEARCH_LEASE_MS),
    })
    .where(
      and(
        eq(viralProjectKeywords.id, waiting.id),
        // Only one worker can win this, so a keyword is never searched twice.
        eq(viralProjectKeywords.status, "queued")
      )
    )
    .returning()
  return claimed ? { ...claimed, leaseToken } : null
}

/** Searches one keyword and writes what it found. */
async function runSearch(job: ClaimedKeyword): Promise<void> {
  const [project] = await db
    .select()
    .from(viralProjects)
    .where(eq(viralProjects.id, job.projectId))
  if (!project) return

  const lengths: ("shorts" | "long")[] =
    project.videoLength === "both"
      ? ["shorts", "long"]
      : [project.videoLength === "long" ? "long" : "shorts"]

  let units = 0
  const found = new Map<string, YoutubeVideo>()
  try {
    const apiKey = await getYoutubeApiKey()
    if (!apiKey) {
      throw viralSays(
        "The YouTube key was removed. Paste one in Settings → YouTube, then refresh this keyword."
      )
    }
    for (const length of lengths) {
      const answer = await searchYoutubeVideos(
        { keyword: job.keyword, days: project.days, length },
        apiKey
      )
      units += answer.units
      await recordYoutubeUnits(answer.units, "viral_search")
      for (const video of answer.videos) found.set(video.id, video)
    }
  } catch (error) {
    await finish(job, {
      status: "failed",
      error: describeSearchError(error),
      units,
    })
    await afterRun(project.id)
    return
  }

  const at = now()
  await db.transaction(async (tx) => {
    // A video counts as new when the project did not have it before this
    // search: not from another keyword, and not from this keyword last time.
    // A project that had found nothing before this run was started has
    // nothing to be new against, so its first successful run marks nothing,
    // however many keywords finish before this one.
    const before = await tx
      .select({
        platformVideoId: viralProjectResults.platformVideoId,
        topicMatch: viralProjectResults.topicMatch,
        foundAt: viralProjectResults.foundAt,
      })
      .from(viralProjectResults)
      .where(eq(viralProjectResults.projectId, project.id))
    const runStarted = job.queuedAt ?? at
    const foundBefore = before.some((row) => row.foundAt < runStarted)
    const known = new Set(before.map((row) => row.platformVideoId))
    // A title the AI already matched keeps its number, so searching again
    // never pays to ask about it twice.
    const matched = new Map(
      before.flatMap((row) =>
        row.topicMatch === null ? [] : [[row.platformVideoId, row.topicMatch] as const]
      )
    )

    const [still] = await tx
      .update(viralProjectKeywords)
      .set({
        status: "done",
        error: null,
        ranAt: at,
        unitsSpent: units,
        leaseToken: null,
        leaseExpiresAt: null,
      })
      .where(
        and(
          eq(viralProjectKeywords.id, job.id),
          eq(viralProjectKeywords.leaseToken, job.leaseToken)
        )
      )
      .returning({ id: viralProjectKeywords.id })
    // The keyword was removed, or its claim ran out and another worker took
    // it. Either way these results are not this worker's to write.
    if (!still) return

    await tx
      .delete(viralProjectResults)
      .where(eq(viralProjectResults.keywordId, job.id))
    const videos = [...found.values()]
    if (videos.length) {
      await tx.insert(viralProjectResults).values(
        videos.map((video) => ({
          id: uuid(),
          keywordId: job.id,
          projectId: project.id,
          platform: "youtube",
          platformVideoId: video.id,
          url: video.url,
          title: video.title,
          channelId: video.channelId,
          channelName: video.channelTitle,
          subscribers: video.subscribers,
          views: video.views,
          likes: video.likes,
          comments: video.comments,
          postedAt: asDate(video.publishedAt),
          durationSeconds: video.durationSeconds,
          thumbnailUrl: video.thumbnailUrl,
          isNew: foundBefore && !known.has(video.id),
          topicMatch: matched.get(video.id) ?? null,
          foundAt: at,
        }))
      )
    }
    await tx
      .update(viralProjects)
      .set({
        unitsSpent: sql`${viralProjects.unitsSpent} + ${units}`,
        updatedAt: at,
      })
      .where(eq(viralProjects.id, project.id))
  })
  // Each channel's typical views, for the Outlier sort. A figure kept from
  // the last week is reused, so searching the same keyword again costs
  // nothing more here.
  const apiKey = await getYoutubeApiKey().catch(() => null)
  if (apiKey && found.size) {
    await refreshChannelUsuals(
      project.ownerId,
      project.id,
      [...found.values()].map((video) => video.channelId),
      apiKey
    ).catch((error) => console.error("The Outlier figures were not refreshed", error))
  }
  // Also when the keyword was removed mid-search: the run may now be over,
  // and the cover and topic match are still owed.
  await afterRun(project.id)
}

async function finish(
  job: ClaimedKeyword,
  outcome: { status: "failed"; error: string; units: number }
) {
  await db
    .update(viralProjectKeywords)
    .set({
      status: outcome.status,
      error: outcome.error,
      ranAt: now(),
      unitsSpent: outcome.units,
      leaseToken: null,
      leaseExpiresAt: null,
    })
    .where(
      and(
        eq(viralProjectKeywords.id, job.id),
        eq(viralProjectKeywords.leaseToken, job.leaseToken)
      )
    )
  if (outcome.units > 0) {
    await db
      .update(viralProjects)
      .set({ unitsSpent: sql`${viralProjects.unitsSpent} + ${outcome.units}` })
      .where(eq(viralProjects.id, job.projectId))
  }
}

/**
 * Once the project's last waiting keyword is done: the cover becomes the
 * best-scoring video, and the AI is asked once how well the new titles fit
 * the description.
 */
async function afterRun(projectId: string) {
  const [stillWaiting] = await db
    .select({ id: viralProjectKeywords.id })
    .from(viralProjectKeywords)
    .where(
      and(
        eq(viralProjectKeywords.projectId, projectId),
        inArray(viralProjectKeywords.status, ["queued", "searching"])
      )
    )
    .limit(1)
  if (stillWaiting) return

  const [project] = await db
    .select()
    .from(viralProjects)
    .where(eq(viralProjects.id, projectId))
  if (!project) return
  await updateCover(project.ownerId, projectId)
  await ringRecheckBell(projectId).catch((error) => console.error("The daily re-check's bell did not ring", error))
  await matchTopics(project).catch((error) => {
    // The topic match is a nicety. A missing AI key or a refused call leaves
    // the matches blank and the search itself stands.
    console.error("The topic match did not run", error)
  })
}

async function updateCover(ownerId: string, projectId: string) {
  const rows = await db
    .select()
    .from(viralProjectResults)
    .where(eq(viralProjectResults.projectId, projectId))
  const scored = await scoreVideos(
    ownerId,
    rows.map((row) => ({
      platform: "youtube" as const,
      platformVideoId: row.platformVideoId,
      url: row.url,
      title: row.title,
      channelId: row.channelId,
      channelName: row.channelName,
      subscribers: row.subscribers,
      views: row.views,
      likes: row.likes,
      comments: row.comments,
      postedAt: row.postedAt?.toISOString() ?? null,
      durationSeconds: row.durationSeconds,
      thumbnailUrl: row.thumbnailUrl,
      keywords: [],
      isNew: false,
      topicMatch: null,
      source: "search" as const,
      sample: false,
    }))
  )
  const best = scored
    .filter((video) => video.thumbnailUrl)
    .sort((left, right) => right.score.score - left.score.score)[0]
  await db
    .update(viralProjects)
    .set({ coverUrl: best?.thumbnailUrl ?? null })
    // A cover picked in the project's ⋮ stays.
    .where(and(eq(viralProjects.id, projectId), eq(viralProjects.coverChosen, false)))
}

/** A search's failure as the sentence the keyword chip shows. */
function describeSearchError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  if (message.includes("YOUTUBE_QUOTA")) return YOUTUBE_QUOTA_MESSAGE
  if (message.includes("YOUTUBE_UNREACHABLE")) {
    return "YouTube could not be reached. Refresh this keyword to try again."
  }
  const said = message.indexOf("YouTube said:")
  if (said >= 0) return message.slice(said)
  const marker = message.indexOf("VIRAL_SAYS: ")
  if (marker >= 0) return message.slice(marker + "VIRAL_SAYS: ".length)
  return "The search failed. Refresh this keyword to try again."
}

function asDate(value: string): Date | null {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}
