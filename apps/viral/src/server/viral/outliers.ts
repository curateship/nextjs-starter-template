import { and, eq, gt, inArray, sql } from "drizzle-orm"

import { CHANNEL_USUAL_KEEP_MS, CHANNEL_USUAL_UPLOADS } from "@/lib/viral/outlier"
import { typical } from "@/lib/viral/viral"
import { now } from "@/server/auth/security"
import { db, type CustomShellDb } from "@/server/db"
import { viralChannelUsual, viralProjects } from "@/server/viral/schema"
import { listYoutubeChannelUploads } from "@/server/viral/youtube"
import { queuedKeywordUnits, recordYoutubeUnits, youtubeUnitsLeftToday } from "@/server/viral/youtube-units"

/**
 * Keeping each YouTube channel's recent views, for the Outlier sort
 * (`workspace/docs/sorts-and-score.md`). A channel is read once a week at
 * most: 2 of the day's 10,000 units for its 30 newest uploads. TikTok needs
 * none of this, because a followed creator's listed posts already hold
 * their views.
 */

/** Reading one channel: the uploads list, then one batch for the numbers. */
const UNITS_PER_CHANNEL = 2

/** At most this many channels a search run, so one search never costs more than 50 extra units. */
const CHANNELS_PER_RUN = 25

/** The most one keyword's search can spend here afterwards: 50 units. */
export const OUTLIER_UNITS_PER_SEARCH_MAX = CHANNELS_PER_RUN * UNITS_PER_CHANNEL

/**
 * Reads the channels among `channelIds` whose figure is missing or older than
 * a week, and keeps their recent views. Answers the units spent. A channel
 * YouTube won't answer for is skipped; the search it came from stands.
 */
export async function refreshChannelUsuals(
  ownerId: string,
  projectId: string,
  channelIds: string[],
  apiKey: string,
  options: { database?: CustomShellDb; fetchFn?: typeof fetch; at?: Date } = {}
): Promise<number> {
  const database = options.database ?? db
  const at = options.at ?? now()
  const wanted = [...new Set(channelIds.filter((id) => id.startsWith("UC")))]
  if (!wanted.length) return 0
  const fresh = await database
    .select({ channelId: viralChannelUsual.channelId })
    .from(viralChannelUsual)
    .where(
      and(
        eq(viralChannelUsual.ownerId, ownerId),
        eq(viralChannelUsual.platform, "youtube"),
        inArray(viralChannelUsual.channelId, wanted),
        gt(viralChannelUsual.workedOutAt, new Date(at.getTime() - CHANNEL_USUAL_KEEP_MS))
      )
    )
  const known = new Set(fresh.map((row) => row.channelId))
  const due = wanted.filter((id) => !known.has(id)).slice(0, CHANNELS_PER_RUN)

  // The searches still waiting were priced when they were queued, so these
  // reads only take what is left after them, and a project is never left
  // half searched for an Outlier figure.
  const promised = (await queuedKeywordUnits(database)).searchUnits
  let units = 0
  for (const channelId of due) {
    if ((await youtubeUnitsLeftToday(at, database)) - promised < UNITS_PER_CHANNEL) break
    let uploads: Awaited<ReturnType<typeof listYoutubeChannelUploads>>
    try {
      uploads = await listYoutubeChannelUploads(channelId, CHANNEL_USUAL_UPLOADS, apiKey, options.fetchFn)
    } catch (error) {
      console.error("A channel's usual views could not be read", channelId, error)
      continue
    } finally {
      // Asked is spent, answered or not.
      units += UNITS_PER_CHANNEL
      await recordYoutubeUnits(UNITS_PER_CHANNEL, "viral_outlier", database)
    }
    const recentViews: Record<string, number> = {}
    for (const upload of uploads) if (upload.views !== null) recentViews[upload.platformVideoId] = upload.views
    const values = Object.values(recentViews)
    const row = {
      typicalViews: typical(values),
      sampleSize: values.length,
      recentViews,
      workedOutAt: at,
    }
    await database
      .insert(viralChannelUsual)
      .values({ ownerId, platform: "youtube", channelId, ...row })
      .onConflictDoUpdate({
        target: [viralChannelUsual.ownerId, viralChannelUsual.platform, viralChannelUsual.channelId],
        set: row,
      })
  }
  if (units > 0) {
    await database
      .update(viralProjects)
      .set({ unitsSpent: sql`${viralProjects.unitsSpent} + ${units}` })
      .where(eq(viralProjects.id, projectId))
  }
  return units
}
