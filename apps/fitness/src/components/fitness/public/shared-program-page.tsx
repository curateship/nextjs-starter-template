import * as React from "react"
import { Link, useNavigate } from "@tanstack/react-router"
import { CopyIcon, Loader2Icon } from "lucide-react"

import { PublicPageFrame } from "@/components/shell/public-page-frame"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { copyShared, type SharedProgram } from "@/lib/api/fitness/sharing"
import { WEEK_MONDAY_FIRST, WEEKDAY_NAMES } from "@/lib/fitness/dates"
import { reportFitnessError } from "@/lib/fitness/report-error"

/** "90 sec", "2 min", "2 min 30 sec". */
function restLabel(seconds: number) {
  if (seconds <= 0) return "no rest"
  if (seconds < 60) return `rest ${seconds} sec`
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  return `rest ${minutes} min${rest ? ` ${rest} sec` : ""}`
}

/**
 * The public page for a shared program: its week, Monday to Sunday, each day a
 * workout with its lifts, sets, reps and rest, or a rest day. A button copies
 * it into the visitor's own account. Signed out, the button goes to sign in
 * and comes back here.
 */
export function SharedProgramPage({ program, signedIn }: { program: SharedProgram; signedIn: boolean }) {
  const navigate = useNavigate()
  const [copying, setCopying] = React.useState(false)

  async function copy() {
    setCopying(true)
    try {
      const { id } = await copyShared(program.code)
      await navigate({ to: "/programs/$programId", params: { programId: id } })
    } catch (error) {
      reportFitnessError(error)
      setCopying(false)
    }
  }

  return (
    <PublicPageFrame layout="marketing">
      <div className="flex w-full flex-col gap-2 md:gap-3">
        <header className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">A shared program · {program.routineLabel}</p>
          <h1 className="text-2xl font-semibold">{program.name}</h1>
          <p className="text-sm text-muted-foreground">
            {program.days.length} workout {program.days.length === 1 ? "day" : "days"} a week. Weights start empty
            when you copy it, so you set your own.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {signedIn ? (
              <Button type="button" disabled={copying} onClick={() => void copy()}>
                {copying ? <Loader2Icon className="size-4 animate-spin" /> : <CopyIcon className="size-4" />}
                Copy to my account
              </Button>
            ) : (
              <>
                <Button asChild>
                  <Link to="/login" search={{ redirect: `/r/${program.code}` }}>
                    <CopyIcon className="size-4" />
                    Sign in to copy it
                  </Link>
                </Button>
                <Button asChild variant="outline">
                  <Link to="/register">Make an account</Link>
                </Button>
              </>
            )}
          </div>
        </header>

        <div className="grid gap-2 md:grid-cols-2 md:gap-3">
          {WEEK_MONDAY_FIRST.map((weekday) => {
            const day = program.days.find((entry) => entry.weekday === weekday)
            return (
              <Card key={weekday} size="sm">
                <CardHeader>
                  <CardTitle>
                    {WEEKDAY_NAMES[weekday]}
                    <span className="font-normal text-muted-foreground"> · {day ? day.name : "Rest"}</span>
                  </CardTitle>
                </CardHeader>
                {day ? (
                  <CardContent>
                    {day.exercises.length === 0 ? (
                      <p className="text-muted-foreground">No lifts on this day yet.</p>
                    ) : (
                      <ol className="divide-y">
                        {day.exercises.map((exercise, position) => (
                          <li key={`${exercise.name}-${position}`} className="flex items-start justify-between gap-3 py-2">
                            <span className="min-w-0">
                              <span className="block font-medium">{exercise.name}</span>
                              <span className="block text-xs text-muted-foreground">
                                {exercise.sets} x {exercise.reps}, {restLabel(exercise.restSeconds)}
                              </span>
                            </span>
                            {exercise.superset ? <Badge variant="outline">Superset</Badge> : null}
                          </li>
                        ))}
                      </ol>
                    )}
                  </CardContent>
                ) : null}
              </Card>
            )
          })}
        </div>
      </div>
    </PublicPageFrame>
  )
}
