import { createServerFn } from "@tanstack/react-start"
import { and, desc, eq, gte, isNotNull, sql } from "drizzle-orm"
import { z } from "zod"

import { db } from "@/server/db"
import { userGet } from "@/server/guards"
import { dailyFocusStats, pomodoroProfiles } from "@/server/pomodoro/schema"
import { loadOrCreateProfile } from "@/server/pomodoro/profile"
import { localDateFor } from "@/server/pomodoro/productivity"
import { shiftLocalDate } from "@/lib/pomodoro/focus-history"

/**
 * The opt-in global ranking. Only accounts that opted in AND chose a public
 * display name appear — real names and emails never do — and the window
 * really is the last 7 days (the old app said "this week" but summed all
 * time; that bug stops here). Each account's days are its own local dates,
 * and the week's start comes from the viewer's timezone.
 */
const loadLeaderboardFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(z.object({ timezone: z.string().min(1).max(60) }))
  .handler(async ({ data, context }) => {
    const profile = await loadOrCreateProfile(context.user.id, data.timezone)
    const today = localDateFor(profile.timezone)
    const weekStart = shiftLocalDate(today, -6)
    const rows = await db
      .select({
        userId: pomodoroProfiles.userId,
        name: pomodoroProfiles.publicDisplayName,
        focusSessions: sql<number>`coalesce(sum(${dailyFocusStats.focusSessions}), 0)::int`,
        focusSeconds: sql<number>`coalesce(sum(${dailyFocusStats.focusSeconds}), 0)::int`,
      })
      .from(pomodoroProfiles)
      .leftJoin(
        dailyFocusStats,
        and(
          eq(dailyFocusStats.userId, pomodoroProfiles.userId),
          gte(dailyFocusStats.localDate, weekStart)
        )
      )
      .where(
        and(
          eq(pomodoroProfiles.leaderboardOptIn, true),
          isNotNull(pomodoroProfiles.publicDisplayName)
        )
      )
      .groupBy(pomodoroProfiles.userId, pomodoroProfiles.publicDisplayName)
      .orderBy(desc(sql`coalesce(sum(${dailyFocusStats.focusSeconds}), 0)`))
      .limit(100)
    // User ids never leave the server — the viewer's own row is marked
    // here instead, the same privacy rule the room snapshots follow.
    return {
      weekStart,
      today,
      leaders: rows.map(({ userId, ...leader }) => ({
        ...leader,
        isYou: userId === context.user.id,
      })),
    }
  })

export const loadLeaderboard = (timezone: string) =>
  loadLeaderboardFn({ data: { timezone } })
