import * as React from "react"
import { Loader2Icon, SparklesIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { loadPnlScoreFor } from "@/lib/api/trade/pnl-score"
import { formatTimeAgo } from "@/lib/format/format-time"
import type { PnlPeriod } from "@/lib/trade/pnl/periods"
import type { PnlScore } from "@/lib/trade/pnl/score"

/**
 * The AI score out of 100 for the period, with three reasons.
 *
 * Asked for after the page is on screen rather than in the route's loader,
 * because a model call can take seconds and the Journal must not wait for
 * it. The server remembers the answer per period until a trade closes, so
 * opening the page again shows the same score without another call. The
 * card always names the model the words came from.
 */
export function PnlScoreCard({ period }: { period: PnlPeriod }) {
  const [answers, setAnswers] = React.useState<
    Partial<Record<PnlPeriod, PnlScore>>
  >({})
  const [attempt, setAttempt] = React.useState(0)
  const answer = answers[period]

  React.useEffect(() => {
    // A period already answered is shown from memory, not asked for again on
    // every switch back; the answer landing is what ends the effect's work.
    if (answer) return
    let current = true
    loadPnlScoreFor(period)
      .then((score) => {
        if (current) setAnswers((known) => ({ ...known, [period]: score }))
      })
      .catch(() => {
        if (current) {
          setAnswers((known) => ({
            ...known,
            [period]: {
              state: "failed",
              message: "The score could not be asked for. Try again.",
            },
          }))
        }
      })
    return () => {
      current = false
    }
  }, [period, attempt, answer])

  return (
    <Card size="sm">
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2 text-sm">
          <SparklesIcon className="size-4" />
          AI score
          {answer?.state === "scored" ? (
            <span className="ml-auto text-base font-semibold tabular-nums">
              {answer.score}
              <span className="text-xs font-normal text-muted-foreground">
                {" "}
                / 100
              </span>
            </span>
          ) : null}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-2 text-xs">
        {!answer ? (
          <span className="flex items-center gap-2 text-muted-foreground">
            <Loader2Icon className="size-4 animate-spin" />
            Asking for a score
          </span>
        ) : answer.state === "scored" ? (
          <>
            <ol className="grid list-decimal gap-1 pl-4">
              {answer.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ol>
            <p className="text-muted-foreground">
              {answer.provider} {answer.model}, from {answer.trades}{" "}
              {answer.trades === 1 ? "trade" : "trades"},{" "}
              {formatTimeAgo(new Date(answer.at))}.
            </p>
          </>
        ) : answer.state === "no-key" ? (
          <p className="text-muted-foreground">
            No AI key is saved, so there is no score. An admin adds one under
            Settings → AI.
          </p>
        ) : answer.state === "no-trades" ? (
          <p className="text-muted-foreground">
            No real-money trade closed in this period, so there is nothing to
            score.
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground">{answer.message}</span>
            <Button
              type="button"
              size="xs"
              variant="outline"
              onClick={() => {
                setAnswers((known) => {
                  const next = { ...known }
                  delete next[period]
                  return next
                })
                setAttempt((count) => count + 1)
              }}
            >
              Try again
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
