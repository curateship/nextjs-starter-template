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
import { cn } from "@/lib/utils"
import { InitialsAvatar } from "@/components/pomodoro/initials-avatar"
import { loadProductivity } from "@/lib/api/pomodoro/productivity"
import { loadLeaderboard } from "@/lib/api/pomodoro/leaderboard"
import { useProductAuth } from "@/lib/pomodoro/auth-state"
import { formatFocusDuration } from "@/lib/pomodoro/focus-history"
import { browserTimezone } from "@/lib/pomodoro/timer"
import { usePomodoro } from "@/lib/pomodoro/use-pomodoro"

type Leaderboard = Awaited<ReturnType<typeof loadLeaderboard>>
type Productivity = Awaited<ReturnType<typeof loadProductivity>>

const chartConfig = {
  sessions: { label: "Sessions", color: "var(--p-accent)" },
} satisfies ChartConfig

/**
 * The leaderboard page: your own stat cards and 7-day sessions chart, and
 * the opt-in global ranking of the last 7 days.
 */
export function LeaderboardPage() {
  const { authenticated, known } = useProductAuth()
  const pomodoro = usePomodoro()
  const [board, setBoard] = React.useState<Leaderboard | null>(null)
  const [stats, setStats] = React.useState<Productivity | null>(null)
  const [error, setError] = React.useState("")

  React.useEffect(() => {
    if (!known || !authenticated) return
    let cancelled = false
    void loadLeaderboard(browserTimezone())
      .then((result) => {
        if (!cancelled) setBoard(result)
      })
      .catch(() => {
        if (!cancelled)
          setError("The leaderboard could not be loaded. Reload to try again.")
      })
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

      <Card>
        <CardHeader className="flex-row items-baseline justify-between">
          <CardTitle>Global ranking</CardTitle>
          <span className="text-xs text-muted-foreground">last 7 days</span>
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
              Nobody has opted in yet. Turn on "Show me on the leaderboard" in
              Settings and pick a display name to be first.
            </p>
          ) : (
            (board?.leaders ?? []).map((leader, index) => (
              <article
                key={`${index}-${leader.name}`}
                className={cn(
                  "flex min-h-11 items-center gap-3 rounded-lg border px-3",
                  leader.isYou &&
                    "border-[rgba(255,90,60,0.4)] bg-[rgba(255,90,60,0.08)]"
                )}
              >
                <strong className="w-5 text-center font-mono text-xs text-muted-foreground">
                  {index + 1}
                </strong>
                <InitialsAvatar name={leader.name ?? "?"} />
                <b className="flex-1 truncate text-sm">{leader.name}</b>
                <span className="font-mono text-xs">
                  {formatFocusDuration(leader.focusSeconds)}{" "}
                  <small className="text-muted-foreground">
                    {leader.focusSessions} sessions
                  </small>
                </span>
              </article>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )
}
