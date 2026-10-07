import * as React from "react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ErrorRow } from "@/components/ui/error-row"
import { LoadingRow } from "@/components/ui/loading-row"
import { InitialsAvatar } from "@/components/pomodoro/initials-avatar"
import { loadFocusedWith } from "@/lib/api/pomodoro/leaderboard"
import { formatFocusDuration } from "@/lib/pomodoro/focus-history"
import { dismissErrorToast } from "@/lib/toast/error-toast"

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
    <Card>
      <CardHeader className="flex-row items-baseline justify-between">
        <CardTitle>Who you focus with</CardTitle>
        <span className="text-xs text-muted-foreground">
          time in rooms together · last 12 months
        </span>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
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
            Turn on &quot;Show me on the leaderboard&quot; in Settings and pick
            a display name to see who you share rooms with. Only people who did
            the same are named, and they see you the same way.
          </p>
        ) : result.people.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">
            Nobody yet. Share a room with someone who is also on the
            leaderboard and they show up here.
          </p>
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
      </CardContent>
    </Card>
  )
}
