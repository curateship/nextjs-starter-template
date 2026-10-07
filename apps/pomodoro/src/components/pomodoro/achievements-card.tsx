import * as React from "react"
import { Loader2Icon } from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ErrorRow } from "@/components/ui/error-row"
import { Meter } from "@/components/ui/meter"
import { loadAchievements } from "@/lib/api/pomodoro/achievements"
import { formatLongDay, localDateIn } from "@/lib/format/calendar-day"
import {
  ACHIEVEMENTS,
  achievementProgress,
  type Achievement,
  type AchievementCounters,
} from "@/lib/pomodoro/achievements"
import { browserTimezone } from "@/lib/pomodoro/timer"
import { dismissErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

/**
 * The badges panel, above the focus report on /history.
 *
 * Earned badges carry the day they were earned; locked ones say what they
 * still take, which is the whole point of showing them. A locked badge is
 * never hidden, so the next one is always visible and the ladder reads as a
 * ladder.
 *
 * Badges are private. This asks for the signed-in account's own and there is
 * no address that reads anyone else's.
 */
export function AchievementsCard() {
  const [state, setState] = React.useState<{
    earned: Map<string, Date>
    counters: AchievementCounters
    timezone: string
  } | null>(null)
  const [error, setError] = React.useState("")
  const [loading, setLoading] = React.useState(true)
  // Bumped by Try again, which runs the same load once more.
  const [attempt, setAttempt] = React.useState(0)

  React.useEffect(() => {
    let live = true
    loadAchievements(browserTimezone())
      .then((result) => {
        if (!live) return
        setError("")
        setState({
          earned: new Map(
            result.earned.map((row) => [row.badgeId, new Date(row.earnedAt)])
          ),
          counters: result.counters,
          timezone: result.timezone,
        })
      })
      .catch(() => {
        if (live) setError("Your achievements could not be loaded.")
      })
      .finally(() => {
        if (live) setLoading(false)
      })
    return () => {
      live = false
    }
  }, [attempt])

  const earnedCount = state?.earned.size ?? 0

  return (
    <Card>
      <CardHeader className="flex-row items-baseline justify-between">
        <CardTitle>Achievements</CardTitle>
        {state ? (
          <span className="font-mono text-xs text-muted-foreground">
            {earnedCount} of {ACHIEVEMENTS.length} earned
          </span>
        ) : null}
      </CardHeader>
      <CardContent>
        {loading ? (
          <span
            role="status"
            className="flex items-center gap-1 text-sm text-muted-foreground"
          >
            <Loader2Icon className="size-3 animate-spin" aria-hidden="true" />
            Loading…
          </span>
        ) : null}
        {error ? (
          <ErrorRow
            message={error}
            onRetry={() => {
              dismissErrorToast()
              setError("")
              setLoading(true)
              setAttempt((count) => count + 1)
            }}
          />
        ) : null}
        {state ? (
          <ul className="grid gap-2 sm:grid-cols-2">
            {ACHIEVEMENTS.map((badge) => {
              const earnedAt = state.earned.get(badge.id)
              return (
                <li
                  key={badge.id}
                  className={cn(
                    "flex items-start gap-3 rounded-xl border p-3",
                    earnedAt && "bg-primary/8"
                  )}
                >
                  <BadgeMark earned={!!earnedAt} />
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span
                      className={cn(
                        "text-sm font-semibold",
                        !earnedAt && "text-muted-foreground"
                      )}
                    >
                      {badge.name}
                    </span>
                    <small className="text-xs text-muted-foreground">
                      {earnedAt
                        ? `Earned ${formatLongDay(localDateIn(state.timezone, earnedAt))}`
                        : badge.description}
                    </small>
                    {earnedAt ? null : (
                      <BadgeProgress badge={badge} counters={state.counters} />
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        ) : null}
      </CardContent>
    </Card>
  )
}

/**
 * How far a locked badge has got: the count against what it takes, and a bar
 * showing the same thing. Both come from `achievementProgress`, so the words and
 * the bar can never disagree with the rule.
 *
 * The bar is the shared `Meter`, so a screen reader hears its name and the
 * same words printed above it. The printed count stays, because progress must
 * never be carried by a drawing alone.
 */
function BadgeProgress({
  badge,
  counters,
}: {
  badge: Achievement
  counters: AchievementCounters
}) {
  const progress = achievementProgress(badge, counters)
  return (
    <>
      {/* The bar below says the same words to a screen reader, so the
          printed copy is hidden from it rather than read twice. */}
      <small
        aria-hidden="true"
        className="font-mono text-[10px] text-muted-foreground"
      >
        {progress.label}
      </small>
      <Meter
        label={`Progress towards ${badge.name}`}
        value={progress.value}
        max={progress.threshold}
        valueText={progress.label}
        size="sm"
        className="mt-0.5"
      />
    </>
  )
}

/**
 * Earned and locked differ by shape as well as colour, because state must
 * never be carried by colour alone: earned is a filled disc, locked an empty
 * ring.
 */
function BadgeMark({ earned }: { earned: boolean }) {
  return (
    <span
      className={cn(
        "mt-0.5 grid size-6 shrink-0 place-items-center rounded-full",
        earned
          ? "bg-[var(--p-accent)]"
          : "border-[1.5px] border-[rgba(var(--p-fg-rgb),0.25)]"
      )}
    >
      <span className="sr-only">{earned ? "Earned" : "Locked"}</span>
    </span>
  )
}
