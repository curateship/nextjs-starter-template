import * as React from "react"

import { ErrorRow } from "@/components/ui/error-row"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { PanelCard } from "@/components/pomodoro/panel-card"
import { FocusGroupsCard } from "@/components/pomodoro/focus-groups-card"
import { FocusedWithCard } from "@/components/pomodoro/focused-with-card"
import { LeaderboardRows } from "@/components/pomodoro/leaderboard-rows"
import { loadLeaderboard } from "@/lib/api/pomodoro/leaderboard"
import { FollowingFeedCard } from "@/components/pomodoro/following-feed-card"
import { FOLLOWING_EMPTY_MESSAGE } from "@/lib/pomodoro/following"
import { useProductAuth } from "@/lib/pomodoro/auth-state"
import {
  LEADERBOARD_WINDOWS,
  LEADERBOARD_WINDOW_LABELS,
  LEADERBOARD_WINDOW_NOTES,
  type LeaderboardWindow,
} from "@/lib/pomodoro/leaderboard-windows"
import { browserTimezone } from "@/lib/pomodoro/timer"
import { dismissErrorToast } from "@/lib/toast/error-toast"
import { TextLink } from "@/components/pomodoro/text-link"
import { SignInButton } from "@/components/pomodoro/sign-in-button"
import { contentColumn } from "@/lib/pomodoro/content-column"
import { pillTabsList, pillTabsTrigger } from "@/lib/pomodoro/pill-tabs"

type Leaderboard = Awaited<ReturnType<typeof loadLeaderboard>>

/**
 * The leaderboard page: the opt-in global ranking and your private groups'
 * boards. Your own stat cards live on History.
 *
 * One window choice runs both boards. Picking This month moves the global
 * ranking and every group board with it, because two windows on one screen is
 * two questions to answer before a figure means anything.
 */
/** Everybody who opted in, or just the people you follow. */
export type LeaderboardScope = "global" | "following"

export function LeaderboardPage({
  scope,
  boardWindow,
  onScopeChange,
  onWindowChange,
}: {
  scope: LeaderboardScope
  boardWindow: LeaderboardWindow
  onScopeChange: (scope: LeaderboardScope) => void
  onWindowChange: (window: LeaderboardWindow) => void
}) {
  const { authenticated, known } = useProductAuth()
  const [board, setBoard] = React.useState<Leaderboard | null>(null)
  const [error, setError] = React.useState("")
  // Bumped by Try again, which runs the same load once more.
  const [attempt, setAttempt] = React.useState(0)
  // `scope` is which board is shown: everybody who opted in, or just the
  // people you follow. It is the same ranking query with a filter, so the two
  // can never disagree about a figure. Both choices live in the address.

  React.useEffect(() => {
    if (!known || !authenticated) return
    let cancelled = false
    void loadLeaderboard(browserTimezone(), boardWindow, scope === "following")
      .then((result) => {
        if (cancelled) return
        // A load that works takes down the warning a failed one left, so a
        // board that recovers on its own stops saying it failed.
        setError("")
        setBoard(result)
      })
      .catch(() => {
        if (!cancelled) setError("The leaderboard could not be loaded.")
      })
    return () => {
      cancelled = true
    }
  }, [known, authenticated, boardWindow, scope, attempt])

  return (
    <div className={`${contentColumn} flex flex-col gap-6 py-8`}>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="title-halo flex flex-col gap-2">
          <h2 className="text-4xl font-bold tracking-tight">Leaderboard</h2>
          <p className="text-muted-foreground">
            {scope === "following"
              ? "Focus time across the people you follow."
              : "Focus time across everyone on Pomoder."}
          </p>
        </div>
        {authenticated ? (
          <div className="flex flex-wrap gap-3">
            <Tabs
              value={scope}
              onValueChange={(value) =>
                onScopeChange(value as LeaderboardScope)
              }
            >
              <TabsList aria-label="Who is on the board" className={pillTabsList}>
                <TabsTrigger value="global" className={pillTabsTrigger}>
                  Everyone
                </TabsTrigger>
                <TabsTrigger value="following" className={pillTabsTrigger}>
                  Following
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <Tabs
              value={boardWindow}
              onValueChange={(value) =>
                onWindowChange(value as LeaderboardWindow)
              }
            >
              <TabsList aria-label="Leaderboard window" className={pillTabsList}>
                {LEADERBOARD_WINDOWS.map((option) => (
                  <TabsTrigger
                    key={option}
                    value={option}
                    className={pillTabsTrigger}
                  >
                    {LEADERBOARD_WINDOW_LABELS[option]}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>
        ) : null}
      </header>

      <PanelCard
        label={scope === "following" ? "People you follow" : "Global ranking"}
        note={LEADERBOARD_WINDOW_NOTES[boardWindow]}
      >
        {/* Missing yourself on a ranking reads as a bug, and the switch is
            off by default, so most new members would. Only on the global
            board: the Following board is the people you follow, never you.
            An empty board already explains the switch, so this stays off
            there rather than saying it twice. */}
        {authenticated &&
        scope === "global" &&
        board?.youAreHidden &&
        board.leaders.length > 0 ? (
          <p className="rounded-lg bg-muted/60 px-3 py-2 text-sm text-muted-foreground">
            {board.youAreHidden === "taken-off" ? (
              // An admin took them off; no setting of theirs brings it back.
              "You're not shown on the leaderboard."
            ) : (
              <>
                {board.youAreHidden === "switched-off"
              ? "You are not on this board. Switch it on in "
                  : "You are not on this board yet. Pick a display name in "}
                <TextLink to="/settings" search={{ tab: "profile" }}>
                  Settings
                </TextLink>{" "}
                to take your place.
              </>
            )}
          </p>
        ) : null}
        {!authenticated ? (
          <div className="flex flex-col items-start gap-2 py-2">
            <p className="text-sm text-muted-foreground">
              Sign in and opt in from{" "}
              <TextLink to="/settings" search={{ tab: "profile" }}>
                Settings
              </TextLink>{" "}
              to see the ranking and take your place on it. Only chosen
              display names ever show.
            </p>
            <SignInButton variant="default" />
          </div>
        ) : error ? (
          <ErrorRow
            message={error}
            onRetry={() => {
              dismissErrorToast()
              setError("")
              setAttempt((count) => count + 1)
            }}
          />
        ) : board && board.leaders.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">
            {scope === "following" ? (
              FOLLOWING_EMPTY_MESSAGE
            ) : authenticated && board.youAreHidden === "taken-off" ? (
              // Telling them to switch on a setting that is already on would
              // send them looking for a fault in Settings.
              "You're not shown on the leaderboard."
            ) : (
              <>
                Nobody has opted in yet. Turn on &quot;Show me on the
                leaderboard&quot; in{" "}
                <TextLink to="/settings" search={{ tab: "profile" }}>
                  Settings
                </TextLink>{" "}
                and pick a display name to be first.
              </>
            )}
          </p>
        ) : (
          <div className="flex flex-col">
            <LeaderboardRows leaders={board?.leaders ?? []} />
            {/* Below the first hundred, your own row still shows, apart
                from the list so the gap in places reads as a gap. */}
            {board?.you ? (
              <div className="mt-2 flex flex-col border-t pt-2">
                <LeaderboardRows
                  leaders={[board.you]}
                  firstPlace={board.you.place}
                />
              </div>
            ) : null}
          </div>
        )}
      </PanelCard>

      {authenticated ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <FocusedWithCard />
          <FocusGroupsCard boardWindow={boardWindow} />
        </div>
      ) : null}
      <FollowingFeedCard />
    </div>
  )
}
