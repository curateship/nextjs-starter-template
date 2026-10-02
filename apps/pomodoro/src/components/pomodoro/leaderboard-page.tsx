import * as React from "react"
import { Link } from "@tanstack/react-router"
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { FocusGroupsCard } from "@/components/pomodoro/focus-groups-card"
import { LeaderboardRows } from "@/components/pomodoro/leaderboard-rows"
import { loadProductivity } from "@/lib/api/pomodoro/productivity"
import { loadLeaderboard } from "@/lib/api/pomodoro/leaderboard"
import { FollowingFeedCard } from "@/components/pomodoro/following-feed-card"
import { FOLLOWING_EMPTY_MESSAGE } from "@/lib/pomodoro/following"
import { useProductAuth } from "@/lib/pomodoro/auth-state"
import { formatFocusDuration } from "@/lib/pomodoro/focus-history"
import {
  DEFAULT_LEADERBOARD_WINDOW,
  LEADERBOARD_WINDOWS,
  LEADERBOARD_WINDOW_LABELS,
  LEADERBOARD_WINDOW_NOTES,
  type LeaderboardWindow,
} from "@/lib/pomodoro/leaderboard-windows"
import { browserTimezone } from "@/lib/pomodoro/timer"
import { usePomodoro } from "@/lib/pomodoro/use-pomodoro"

type Leaderboard = Awaited<ReturnType<typeof loadLeaderboard>>
type Productivity = Awaited<ReturnType<typeof loadProductivity>>

const chartConfig = {
  sessions: { label: "Sessions", color: "var(--p-accent)" },
} satisfies ChartConfig

/**
 * The leaderboard page: your own stat cards and 7-day sessions chart, the opt-in
 * global ranking, and your private groups' boards.
 *
 * One window choice runs both boards. Picking This month moves the global
 * ranking and every group board with it, because two windows on one screen is
 * two questions to answer before a figure means anything.
 */
export function LeaderboardPage() {
  const { authenticated, known } = useProductAuth()
  const pomodoro = usePomodoro()
  const [board, setBoard] = React.useState<Leaderboard | null>(null)
  const [stats, setStats] = React.useState<Productivity | null>(null)
  const [error, setError] = React.useState("")
  // Which board is shown: everybody who opted in, or just the people you
  // follow. It is the same ranking query with a filter, so the two can never
  // disagree about a figure.
  const [scope, setScope] = React.useState<"global" | "following">("global")
  const [boardWindow, setBoardWindow] = React.useState<LeaderboardWindow>(
    DEFAULT_LEADERBOARD_WINDOW
  )

  React.useEffect(() => {
    if (!known || !authenticated) return
    let cancelled = false
    void loadLeaderboard(browserTimezone(), boardWindow, scope === "following")
      .then((result) => {
        if (!cancelled) setBoard(result)
      })
      .catch(() => {
        if (!cancelled)
          setError("The leaderboard could not be loaded. Reload to try again.")
      })
    return () => {
      cancelled = true
    }
  }, [known, authenticated, boardWindow, scope])

  // Your own cards and chart are always the last 7 days, so they load once and
  // a window change does not fetch them again.
  React.useEffect(() => {
    if (!known || !authenticated) return
    let cancelled = false
    void loadProductivity(browserTimezone())
      .then((result) => {
        if (!cancelled) setStats(result)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [known, authenticated])

  const week = [...(stats?.recentStats ?? [])].slice(0, 7).reverse()
  const focusSeconds = week.reduce((total, day) => total + day.focusSeconds, 0)
  const weekSessions = week.reduce((total, day) => total + day.focusSessions, 0)
  const completed = week.reduce((total, day) => total + day.tasksCompleted, 0)
  const todayRow = stats?.recentStats.find((day) => day.localDate === stats.today)

  const statCards: Array<[string, string, string]> = authenticated
    ? stats
      ? [
          [
            "Focus today",
            formatFocusDuration(todayRow?.focusSeconds ?? 0),
            `${todayRow?.focusSessions ?? 0} sessions`,
          ],
          ["This week", formatFocusDuration(focusSeconds), `${weekSessions} sessions`],
          [
            "Current streak",
            `${stats.summary.currentStreak} ${stats.summary.currentStreak === 1 ? "day" : "days"}`,
            `Best: ${stats.summary.bestStreak} ${stats.summary.bestStreak === 1 ? "day" : "days"}`,
          ],
          ["Tasks done", String(completed), "this week"],
        ]
      : [["Focus today", "…", ""], ["This week", "…", ""], ["Current streak", "…", ""], ["Tasks done", "…", ""]]
    : [
        [
          "Focus today",
          `${pomodoro.todayFocusSessions} ${pomodoro.todayFocusSessions === 1 ? "session" : "sessions"}`,
          `${pomodoro.todayFocusSessions} of ${pomodoro.dailyGoalSessions} goal`,
        ],
        ["This week", "Not synced", "Sign in for history"],
        ["Current streak", "Not synced", "Sign in for history"],
        [
          "Tasks done",
          String(pomodoro.tasks.filter((task) => task.completed).length),
          "today",
        ],
      ]

  const chartData = week.length
    ? week.map((day) => ({
        label: new Date(`${day.localDate}T12:00:00`).toLocaleDateString(
          undefined,
          { weekday: "short" }
        ),
        sessions: day.focusSessions,
      }))
    : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((label) => ({
        label,
        sessions: 0,
      }))

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 py-8">
      <header>
        <h2 className="text-2xl font-bold tracking-tight">Leaderboard</h2>
        <p className="text-sm text-muted-foreground">
          Your focus this week, and how you stack up.
        </p>
      </header>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        Your stats
      </span>
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {statCards.map(([label, value, sub]) => (
          <Card key={label}>
            <CardContent className="flex flex-col gap-0.5 py-4">
              <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                {label}
              </span>
              <strong className="text-xl">{value}</strong>
              <small className="text-xs text-muted-foreground">{sub}</small>
            </CardContent>
          </Card>
        ))}
      </section>

      <Card>
        <CardHeader className="flex-row items-baseline justify-between">
          <CardTitle>Sessions this week</CardTitle>
          <span className="text-xs text-muted-foreground">
            {chartData.reduce((sum, day) => sum + day.sessions, 0)} total
          </span>
        </CardHeader>
        <CardContent>
          <div className="h-40">
            <ChartContainer config={chartConfig} className="h-full w-full">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="0" vertical={false} />
                <XAxis
                  dataKey="label"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10 }}
                  dy={6}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10, dx: -5 }}
                  width={28}
                  allowDecimals={false}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar
                  dataKey="sessions"
                  fill="var(--color-sessions)"
                  radius={[3, 3, 0, 0]}
                  maxBarSize={28}
                />
              </BarChart>
            </ChartContainer>
          </div>
        </CardContent>
      </Card>

      {authenticated ? (
        <div className="flex flex-wrap gap-2">
          <Tabs
            value={scope}
            onValueChange={(value) =>
              setScope(value as "global" | "following")
            }
          >
            <TabsList aria-label="Who is on the board">
              <TabsTrigger value="global">Everyone</TabsTrigger>
              <TabsTrigger value="following">Following</TabsTrigger>
            </TabsList>
          </Tabs>
          <Tabs
            value={boardWindow}
            onValueChange={(value) =>
              setBoardWindow(value as LeaderboardWindow)
            }
          >
            <TabsList aria-label="Leaderboard window">
              {LEADERBOARD_WINDOWS.map((option) => (
                <TabsTrigger key={option} value={option}>
                  {LEADERBOARD_WINDOW_LABELS[option]}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
      ) : null}

      <Card>
        <CardHeader className="flex-row items-baseline justify-between">
          <CardTitle>
            {scope === "following" ? "People you follow" : "Global ranking"}
          </CardTitle>
          <span className="text-xs text-muted-foreground">
            {LEADERBOARD_WINDOW_NOTES[boardWindow]}
          </span>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {!authenticated ? (
            <div className="flex flex-col items-start gap-2 py-2">
              <p className="text-sm text-muted-foreground">
                Sign in and opt in from Settings to see the ranking and take
                your place on it. Only chosen display names ever show.
              </p>
              <Button asChild size="sm" className="rounded-full font-bold">
                <Link to="/login">Sign in</Link>
              </Button>
            </div>
          ) : board && board.leaders.length === 0 ? (
            <p className="py-2 text-sm text-muted-foreground">
              {scope === "following"
                ? FOLLOWING_EMPTY_MESSAGE
                : `Nobody has opted in yet. Turn on "Show me on the leaderboard" in Settings and pick a display name to be first.`}
            </p>
          ) : (
            <LeaderboardRows leaders={board?.leaders ?? []} />
          )}
        </CardContent>
      </Card>

      <FollowingFeedCard />
      {authenticated ? <FocusGroupsCard boardWindow={boardWindow} /> : null}
    </div>
  )
}
