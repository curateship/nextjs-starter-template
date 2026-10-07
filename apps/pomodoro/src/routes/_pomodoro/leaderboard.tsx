import { createFileRoute } from "@tanstack/react-router"

import {
  LeaderboardPage,
  type LeaderboardScope,
} from "@/components/pomodoro/leaderboard-page"
import {
  DEFAULT_LEADERBOARD_WINDOW,
  LEADERBOARD_WINDOWS,
  type LeaderboardWindow,
} from "@/lib/pomodoro/leaderboard-windows"

type LeaderboardSearch = { show?: "following"; window?: LeaderboardWindow }

/** The opt-in ranking, the Following board and your groups. */
export const Route = createFileRoute("/_pomodoro/leaderboard")({
  // Who is on the board and over which window live in the address, so a
  // reload or Back keeps them. Defaults are left off; anything unknown falls
  // back to Everyone and This week.
  validateSearch: (search: Record<string, unknown>): LeaderboardSearch => {
    const window = LEADERBOARD_WINDOWS.find((option) => option === search.window)
    // Undefined rather than left out, or the router keeps the raw address
    // value and `?show=nope` reaches the page.
    return {
      show: search.show === "following" ? "following" : undefined,
      window: window && window !== DEFAULT_LEADERBOARD_WINDOW ? window : undefined,
    }
  },
  component: LeaderboardRoute,
})

function LeaderboardRoute() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const scope: LeaderboardScope = search.show ?? "global"
  const boardWindow = search.window ?? DEFAULT_LEADERBOARD_WINDOW
  // Replaced rather than added, so Back leaves the page instead of stepping
  // through every tab that was clicked.
  const go = (next: { scope: LeaderboardScope; boardWindow: LeaderboardWindow }) =>
    void navigate({
      search: {
        ...(next.scope === "following" ? { show: "following" as const } : {}),
        ...(next.boardWindow !== DEFAULT_LEADERBOARD_WINDOW
          ? { window: next.boardWindow }
          : {}),
      },
      replace: true,
    })
  return (
    <LeaderboardPage
      scope={scope}
      boardWindow={boardWindow}
      onScopeChange={(next) => go({ scope: next, boardWindow })}
      onWindowChange={(next) => go({ scope, boardWindow: next })}
    />
  )
}
