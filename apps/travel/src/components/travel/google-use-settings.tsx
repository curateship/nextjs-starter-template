import * as React from "react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { LoadingRow } from "@/components/ui/loading-row"
import { getGoogleUse, type GoogleUse } from "@/lib/api/travel/google-use"
import { getTravelErrorMessage } from "@/lib/travel/errors"

type Loaded = GoogleUse & { googleOn: boolean }

// Held for the page's life, so moving between Settings tabs never shows a load (UI standard, "Settings").
let heldUse: Loaded | null = null

/**
 * Settings → App settings → Google use (Travel features 4, part 4; Tyler,
 * 6 Nov 2026: "100 a day", then "Travel's App settings tab"). Read only: how
 * many Google lookups everyone used today and this month, and the five people
 * who used the most this month. Each opening reads the numbers again, showing
 * the last ones meanwhile.
 */
export default function GoogleUseSettings() {
  const [use, setUseState] = React.useState<Loaded | null>(heldUse)
  const [failed, setFailed] = React.useState<string | null>(null)

  React.useEffect(() => {
    let alive = true
    getGoogleUse()
      .then((loaded) => {
        heldUse = loaded
        if (alive) setUseState(loaded)
      })
      .catch((error: unknown) => {
        if (alive) setFailed(getTravelErrorMessage(error))
      })
    return () => {
      alive = false
    }
  }, [])

  return (
    <Card>
      <CardHeader>
        <CardTitle>Google use</CardTitle>
        <CardDescription>
          Each person gets 100 Google lookups a day, counted from midnight UTC. Picking a place, filling a card from a
          Maps link, a place in a drafted plan, a place's photo and a new travel time each count as one.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {use ? (
          <>
            {use.googleOn ? null : (
              <p className="text-sm text-muted-foreground">
                Google Maps isn't set up on this server, so nothing is looked up or counted yet.
              </p>
            )}
            <dl className="grid grid-cols-2 gap-4 sm:max-w-sm">
              <div className="grid gap-1">
                <dt className="text-sm text-muted-foreground">Today</dt>
                <dd className="text-2xl font-semibold tabular-nums">{use.today.toLocaleString()}</dd>
              </div>
              <div className="grid gap-1">
                <dt className="text-sm text-muted-foreground">This month</dt>
                <dd className="text-2xl font-semibold tabular-nums">{use.month.toLocaleString()}</dd>
              </div>
            </dl>
            <div className="grid gap-2">
              <h3 className="text-sm font-medium">Most this month</h3>
              {use.top.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nobody has used a Google lookup this month.</p>
              ) : (
                <ol className="grid gap-1">
                  {use.top.map((person) => (
                    <li key={person.email} className="flex items-baseline justify-between gap-4 text-sm">
                      <span className="min-w-0 truncate">
                        {person.name} <span className="text-muted-foreground">{person.email}</span>
                      </span>
                      <span className="shrink-0 tabular-nums">{person.lookups.toLocaleString()}</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </>
        ) : failed ? (
          <p className="text-sm text-muted-foreground">{failed} Open this tab again to retry.</p>
        ) : (
          <LoadingRow label="Loading Google use" />
        )}
      </CardContent>
    </Card>
  )
}
