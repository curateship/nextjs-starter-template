import * as React from "react"
import { ArrowRightIcon, CheckIcon, Loader2Icon } from "lucide-react"

import { ErrorRow } from "@/components/ui/error-row"
import { PanelCard } from "@/components/pomodoro/panel-card"
import { TextLink } from "@/components/pomodoro/text-link"
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
import { BADGES_CARD_ID } from "@/lib/pomodoro/achievement-toast"

/**
 * The badges panel, at the foot of /history: every badge as a tile, the
 * earned ones first in the accent tint, then the locked ones with their
 * progress. Show on profile opens the switch that publishes them.
 *
 * Every badge says what it is for. Earned ones add the day they were earned;
 * locked ones show how far along they are, which is the whole point of
 * showing them. A locked badge is
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
  // Earned first, each group in the ladder's own order.
  const ordered = state
    ? [
        ...ACHIEVEMENTS.filter((badge) => state.earned.has(badge.id)),
        ...ACHIEVEMENTS.filter((badge) => !state.earned.has(badge.id)),
      ]
    : []

  return (
    // The badge toast's See it scrolls here.
    <PanelCard
      id={BADGES_CARD_ID}
      className="scroll-mt-20"
      label={
        state
          ? `Achievements · ${earnedCount} of ${ACHIEVEMENTS.length}`
          : "Achievements"
      }
      aside={
        <TextLink
          to="/settings"
          search={{ tab: "public" }}
          className="flex items-center gap-1 text-sm text-[var(--p-accent)]"
        >
          Show on profile
          <ArrowRightIcon className="size-3.5" aria-hidden="true" />
        </TextLink>
      }
    >
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
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {ordered.map((badge) => {
              const earnedAt = state.earned.get(badge.id)
              return (
                <li
                  key={badge.id}
                  className={cn(
                    "flex items-start gap-3 rounded-[18px] border p-4",
                    earnedAt
                      ? "border-[color:var(--p-accent)]/45 bg-[color:var(--p-accent)]/12"
                      : "bg-[rgba(var(--p-canvas-rgb),0.35)]"
                  )}
                >
                  <BadgeMark earned={!!earnedAt} />
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="font-semibold">
                      {badge.name}
                    </span>
                    {/* What it took stays once it is yours: it is the part
                        people forget, and the date alone did not say it. */}
                    <small className="text-sm text-muted-foreground">
                      {badge.description}
                    </small>
                    {earnedAt ? (
                      <small className="mt-1 font-mono text-xs text-muted-foreground">
                        Earned{" "}
                        {formatLongDay(localDateIn(state.timezone, earnedAt))}
                      </small>
                    ) : (
                      <BadgeProgress badge={badge} counters={state.counters} />
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        ) : null}
    </PanelCard>
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
        className="mt-1 font-mono text-xs text-muted-foreground"
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
 * never be carried by colour alone: earned is a filled disc with a tick,
 * locked an empty ring.
 */
function BadgeMark({ earned }: { earned: boolean }) {
  return (
    <span
      className={cn(
        "mt-0.5 grid size-6 shrink-0 place-items-center rounded-full",
        earned
          ? "bg-[var(--p-accent)] text-white"
          : "border-[1.5px] border-[rgba(var(--p-fg-rgb),0.25)]"
      )}
    >
      {earned ? <CheckIcon className="size-3.5" aria-hidden="true" /> : null}
      <span className="sr-only">{earned ? "Earned" : "Locked"}</span>
    </span>
  )
}
