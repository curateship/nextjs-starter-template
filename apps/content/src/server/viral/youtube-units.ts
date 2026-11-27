import { eq, gte, inArray, sql } from "drizzle-orm"

import { UNITS_PER_SEARCH, YOUTUBE_DAILY_UNITS } from "@/lib/viral/viral"
import { now, uuid } from "@/server/auth/security"
import { db, type CustomShellDb } from "@/server/db"
import { viralProjectKeywords, viralProjects, viralYoutubeUnitSpend } from "@/server/viral/schema"

/**
 * The app's own count of YouTube's free daily allowance.
 *
 * YouTube never says how many units are left, only that they ran out. So
 * every call the app makes writes what it cost here, and a search is refused
 * before it starts when today's count would not cover it. The day restarts at
 * midnight Pacific time, which is when YouTube resets the allowance.
 *
 * The count can only be lower than YouTube's, never higher: the same key used
 * somewhere else is invisible to it. That is why YouTube's own refusal is
 * still caught and worded on the screen.
 */

export async function recordYoutubeUnits(
  units: number,
  reason: string,
  database: CustomShellDb = db
) {
  if (units <= 0) return
  await database
    .insert(viralYoutubeUnitSpend)
    .values({ id: uuid(), units, reason, spentAt: now() })
}

/** Units the app has spent since YouTube's day began. */
export async function youtubeUnitsUsedToday(
  at: Date = new Date(),
  database: CustomShellDb = db
): Promise<number> {
  const [row] = await database
    .select({
      used: sql<number>`coalesce(sum(${viralYoutubeUnitSpend.units}), 0)::int`,
    })
    .from(viralYoutubeUnitSpend)
    .where(gte(viralYoutubeUnitSpend.spentAt, pacificMidnight(at)))
  return row?.used ?? 0
}

export async function youtubeUnitsLeftToday(
  at: Date = new Date(),
  database: CustomShellDb = db
) {
  return Math.max(0, YOUTUBE_DAILY_UNITS - (await youtubeUnitsUsedToday(at, database)))
}

/**
 * The keywords waiting anywhere in the app, queued or being searched: the
 * units their searches will spend (102 each, twice for "both"), and how many
 * there are, for anything priced per keyword.
 */
export async function queuedKeywordUnits(
  database: CustomShellDb = db
): Promise<{ searchUnits: number; keywords: number }> {
  const [row] = await database
    .select({
      searches: sql<number>`coalesce(sum(case when ${viralProjects.videoLength} = 'both' then 2 else 1 end), 0)::int`,
      keywords: sql<number>`count(*)::int`,
    })
    .from(viralProjectKeywords)
    .innerJoin(viralProjects, eq(viralProjects.id, viralProjectKeywords.projectId))
    .where(inArray(viralProjectKeywords.status, ["queued", "searching"]))
  return { searchUnits: (row?.searches ?? 0) * UNITS_PER_SEARCH, keywords: row?.keywords ?? 0 }
}

/**
 * The start of today in California, as a moment. Worked out from the clock
 * California shows right now, so summer time is handled by the same rule the
 * browser uses.
 */
export function pacificMidnight(at: Date): Date {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hourCycle: "h23",
  }).formatToParts(at)
  const part = (type: string) =>
    Number(parts.find((one) => one.type === type)?.value ?? 0)
  const sinceMidnightMs =
    (part("hour") * 3600 + part("minute") * 60 + part("second")) * 1000 +
    at.getMilliseconds()
  return new Date(at.getTime() - sinceMidnightMs)
}
