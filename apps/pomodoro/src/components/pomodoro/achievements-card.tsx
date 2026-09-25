import * as React from "react"
import { Loader2Icon } from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { loadAchievements } from "@/lib/api/pomodoro/achievements"
import {
  ACHIEVEMENTS,
  remainingLabel,
  type AchievementCounters,
} from "@/lib/pomodoro/achievements"
import { browserTimezone } from "@/lib/pomodoro/timer"
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
  } | null>(null)
  const [error, setError] = React.useState("")
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    let live = true
    loadAchievements(browserTimezone())
      .then((result) => {
        if (!live) return
        setState({
          earned: new Map(
            result.earned.map((row) => [row.badgeId, new Date(row.earnedAt)])
          ),
          counters: result.counters,
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
  }, [])

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
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
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
                    earnedAt && "bg-[rgba(255,90,60,0.08)]"
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
                        ? `Earned ${earnedDate(earnedAt)}`
                        : badge.description}
                    </small>
                    {earnedAt ? null : (
                      <small className="font-mono text-[10px] text-muted-foreground">
                        {remainingLabel(badge, state.counters)}
                      </small>
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

function earnedDate(value: Date) {
  return value.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}
