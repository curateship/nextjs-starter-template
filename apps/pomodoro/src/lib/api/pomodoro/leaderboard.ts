import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { userGet } from "@/server/guards"
import { readLeaderboardRows } from "@/server/pomodoro/leaderboard"
import { readFocusedWith } from "@/server/pomodoro/rooms"
import { loadOrCreateProfile } from "@/server/pomodoro/profile"
import { localDateFor } from "@/server/pomodoro/productivity"
import {
  DEFAULT_LEADERBOARD_WINDOW,
  LEADERBOARD_WINDOWS,
  leaderboardStartDate,
  type LeaderboardWindow,
} from "@/lib/pomodoro/leaderboard-windows"

/**
 * The opt-in global ranking. Only accounts that opted in AND chose a public
 * display name appear — real names and emails never do.
 *
 * The window is one of three words, not a date: This week is the last 7 days,
 * This month is the calendar month, All time is everything since the app's
 * floor date. The browser sends the word and the server works the date out
 * (`leaderboardStartDate`), so no caller can ask for a wider scan than the
 * three tabs offer. Each account's days are its own local dates, and the
 * window's start comes from the viewer's timezone.
 *
 * The query itself lives in `src/server/pomodoro/leaderboard.ts`, shared with
 * the private group boards so a figure cannot differ between the two.
 */
const loadLeaderboardFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(
    z.object({
      timezone: z.string().min(1).max(60),
      window: z.enum(LEADERBOARD_WINDOWS).default(DEFAULT_LEADERBOARD_WINDOW),
      /**
       * The Following tab. It filters the same ranking query rather than
       * running one of its own, so the two boards can never disagree about a
       * figure.
       */
      following: z.boolean().default(false),
    })
  )
  .handler(async ({ data, context }) => {
    const profile = await loadOrCreateProfile(context.user.id, data.timezone)
    const today = localDateFor(profile.timezone)
    const start = leaderboardStartDate(data.window, today)
    return {
      window: data.window,
      start,
      today,
      following: data.following,
      leaders: await readLeaderboardRows({
        start,
        viewerUserId: context.user.id,
        followedBy: data.following ? context.user.id : undefined,
      }),
    }
  })

export const loadLeaderboard = (
  timezone: string,
  window: LeaderboardWindow = DEFAULT_LEADERBOARD_WINDOW,
  following = false
) => loadLeaderboardFn({ data: { timezone, window, following } })

/**
 * The five people you have shared the most room time with in the last year.
 * Both of you must be on the leaderboard to be named; somebody who is not
 * gets an empty list, and the card says why. Names and seconds only.
 */
const loadFocusedWithFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async ({ context }) => readFocusedWith(context.user.id))

export const loadFocusedWith = () => loadFocusedWithFn()
