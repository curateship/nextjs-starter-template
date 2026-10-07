import * as React from "react"

import { Link } from "@tanstack/react-router"

import { Button } from "@/components/ui/button"
import { ErrorRow } from "@/components/ui/error-row"
import { LoadingRow } from "@/components/ui/loading-row"
import { PanelCard } from "@/components/pomodoro/panel-card"
import { InitialsAvatar } from "@/components/pomodoro/initials-avatar"
import { loadFocusedWith } from "@/lib/api/pomodoro/leaderboard"
import { formatFocusDuration } from "@/lib/pomodoro/focus-history"
import { dismissErrorToast } from "@/lib/toast/error-toast"
import { TextLink } from "@/components/pomodoro/text-link"

type FocusedWith = Awaited<ReturnType<typeof loadFocusedWith>>

/**
 * Who you focus with: the five people you have shared the most room time
 * with over the last year, and how much. Both of you have to be on the
 * leaderboard for either to be named, so somebody who is not sees why the
 * card is empty instead of a list.
 */
export function FocusedWithCard() {
  const [result, setResult] = React.useState<FocusedWith | null>(null)
  const [failed, setFailed] = React.useState(false)
  // Bumped by Try again, which runs the same load once more.
  const [attempt, setAttempt] = React.useState(0)

  React.useEffect(() => {
    let cancelled = false
    void loadFocusedWith()
      .then((answer) => {
        if (cancelled) return
        setFailed(false)
        setResult(answer)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [attempt])

  return (
    <PanelCard label="Who you focus with" note="last 12 months">
      {failed ? (
        <ErrorRow
          message="The people you focus with could not be loaded."
          onRetry={() => {
            dismissErrorToast()
            setFailed(false)
            setAttempt((count) => count + 1)
          }}
        />
      ) : !result ? (
        <LoadingRow label="Loading the people you focus with…" />
      ) : !result.optedIn ? (
        <p className="py-2 text-sm text-muted-foreground">
          Turn on &quot;Show me on the leaderboard&quot; in{" "}
          <TextLink to="/settings" search={{ tab: "profile" }}>
            Settings
          </TextLink>{" "}
          and pick a display name to see who you share rooms with. Only people who did
          the same are named, and they see you the same way.
        </p>
      ) : result.people.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 py-2 text-center">
          {/* Three empty seats, overlapping, for the people not met yet. */}
          <span aria-hidden="true" className="flex">
            {[0, 1, 2].map((seat) => (
              <span
                key={seat}
                className="-ml-2 size-10 rounded-full border border-dashed border-muted-foreground/50 first:ml-0"
              />
            ))}
          </span>
          <p className="max-w-sm text-muted-foreground">
            Nobody yet. Share a room with someone who is also on the
            leaderboard and they show up here.
          </p>
          <Button asChild variant="outline" className="rounded-full">
            <Link to="/rooms">Browse focus rooms</Link>
          </Button>
        </div>
      ) : (
        <ol className="flex flex-col gap-2">
          {result.people.map((person, index) => (
            <li
              key={`${person.name}-${index}`}
              className="flex items-center gap-3 text-sm"
            >
              <InitialsAvatar name={person.name} className="size-7" />
              <span className="mr-auto truncate">{person.name}</span>
              <span className="font-mono text-xs tabular-nums text-muted-foreground">
                {formatFocusDuration(person.seconds)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </PanelCard>
  )
}
