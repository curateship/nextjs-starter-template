import * as React from "react"
import { Link } from "@tanstack/react-router"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { loadFollowingFeed } from "@/lib/api/pomodoro/following"
import { useProductAuth } from "@/lib/pomodoro/auth-state"

type FeedRow = Awaited<ReturnType<typeof loadFollowingFeed>>[number]

/**
 * What the people you follow have been earning, on the leaderboard screen.
 *
 * One read for the whole list, held for a few minutes on the server. Nothing
 * here runs per followed account, which is the mistake this part of the app
 * invites most.
 *
 * It shows only what each person's own profile already publishes: the server
 * reads their badges switch, so the feed can never show something their
 * profile hides. Following nobody draws nothing at all rather than an empty
 * box explaining itself twice over.
 */
export function FollowingFeedCard() {
  const { authenticated } = useProductAuth()
  const [rows, setRows] = React.useState<FeedRow[] | null>(null)

  React.useEffect(() => {
    if (!authenticated) return
    let cancelled = false
    void loadFollowingFeed()
      .then((result) => {
        if (!cancelled) setRows(result)
      })
      .catch(() => {
        if (!cancelled) setRows([])
      })
    return () => {
      cancelled = true
    }
  }, [authenticated])

  if (!authenticated || !rows?.length) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle>People you follow</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {rows.map((row, index) => (
          <div
            key={`${row.handle ?? row.name}-${row.label}-${index}`}
            className="flex items-baseline justify-between gap-3 border-b pb-2 text-sm last:border-b-0 last:pb-0"
          >
            <span className="min-w-0 truncate">
              {row.handle ? (
                <Link
                  to="/u/$handle"
                  params={{ handle: row.handle }}
                  className="font-semibold underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {row.name}
                </Link>
              ) : (
                <b>{row.name}</b>
              )}{" "}
              <span className="text-muted-foreground">earned</span>{" "}
              {row.label}
            </span>
            <time
              className="shrink-0 font-mono text-xs text-muted-foreground"
              dateTime={row.earnedOn}
            >
              {new Date(row.earnedOn).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              })}
            </time>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
