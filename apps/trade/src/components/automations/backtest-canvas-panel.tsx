import * as React from "react"
import { Link, useNavigate } from "@tanstack/react-router"
import { ChevronDownIcon, FlaskConicalIcon, XIcon } from "lucide-react"

import { toneClass } from "@/components/backtest/backtest-kpi"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Meter } from "@/components/ui/meter"
import { ScrollArea } from "@/components/ui/scroll-area"
import { loadBacktests } from "@/lib/api/backtests"
import type { AutomationCanvasPanelProps } from "@/lib/automations/canvas-panel"
import { formatRelativeTime } from "@/lib/format/format-time"
import { focusRing } from "@/lib/layout/focus-ring"
import { plural } from "@/lib/format/plural"
import { formatSignedUsd, formatUsd } from "@/lib/trade/format"
import { cn } from "@/lib/utils"

/**
 * The backtest this canvas is running, on the canvas.
 *
 * **Why it is here and not in the run history.** A run's own row can say what
 * happened in a sentence and a status, and that is all the shell should ever
 * have to know about anybody's steps. A backtest's answer is a dozen figures
 * and a list of warnings — so it belongs in a panel this app owns outright,
 * beside the button that started it, rather than squeezed into a row every
 * other app shares.
 *
 * It reads Trade's own data. Nothing about the run is carried through the
 * automation engine: the flow's id is enough to find its newest backtest.
 *
 * It stays put once opened, including after the run finishes, because the
 * result is the reason it was opened. Closing it leaves a button behind.
 */

/** While a run is walking. Fast enough to feel live, slow enough to be cheap. */
const WHILE_RUNNING_MS = 3_000

/** Once it has finished nothing changes, so it only checks for a newer run. */
const WHEN_IDLE_MS = 15_000

type Run = Awaited<ReturnType<typeof loadBacktests>>["runs"][number]

export default function BacktestCanvasPanel({
  automationId,
  runId,
  onClose,
}: AutomationCanvasPanelProps) {
  const navigate = useNavigate()
  const [run, setRun] = React.useState<Run | null>(null)
  // "We asked, and there really is nothing" — as opposed to "we have not
  // managed to ask yet". They used to share one flag with "the read failed",
  // so one dropped request mid-run said "this flow has not run a backtest yet"
  // over the top of a run that was plainly going, with "Started 2 minutes ago"
  // underneath it.
  const [noneYet, setNoneYet] = React.useState(false)
  // Folded away by default. The warnings matter, but they are the same three
  // sentences on most runs and they push the figures off a small panel.
  const [warningsOpen, setWarningsOpen] = React.useState(false)

  React.useEffect(() => {
    let stopped = false
    let timer = 0

    const read = async () => {
      try {
        // Newest first, so the run this canvas just started is the first row —
        // and after a reload it is still the right one to be looking at.
        // The list row already carries the summary and how far it has got, so
        // this is one call rather than two — and it avoids asking for the run's
        // heavy half (the equity curve and every coin) every three seconds to
        // draw eight numbers.
        const list = await loadBacktests({ automationId })
        if (stopped) return
        setRun(list.runs[0] ?? null)
        setNoneYet(list.runs.length === 0)
      } catch {
        // A read that failed is not "there is no backtest". Whatever was on
        // screen stays there and the next pass, seconds away, tries again —
        // the Backtests page is the record either way.
      }
    }

    const tick = async () => {
      await read()
      if (stopped) return
      timer = window.setTimeout(
        () => void tick(),
        run?.finishedAt === null ? WHILE_RUNNING_MS : WHEN_IDLE_MS
      )
    }

    void tick()
    return () => {
      stopped = true
      window.clearTimeout(timer)
    }
    // `runId` is in here so pressing Run reads again at once. Without it the
    // panel sat on the last result until its own timer came round, which on a
    // finished run is fifteen seconds of showing the wrong answer.
    //
    // `run` is deliberately out: the pace is read from the value the last pass
    // set, and adding it here would tear down and rebuild the timer on every
    // single refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [automationId, runId])

  const summary = run?.summary ?? null
  const running = run !== null && run.finishedAt === null

  return (
    // The whole card opens the run.
    //
    // A click rather than a link stretched over the card: the panel scrolls,
    // and an invisible cover over a scrolling area swallows the wheel. The
    // heading is still a real link, so a keyboard reaches the run too, and the
    // two things inside that do their own job stop the click before it gets
    // here.
    // The lift is written out rather than set with a class. `theme.css` drives
    // every card's `box-shadow` from the Styling settings, so a Tailwind shadow
    // on the card is overwritten — and on a wrapper the shadow variables come
    // back empty. A plain value cannot be argued with. The card kept
    // its hairline and nothing else. The wrapper is not a card, so nothing
    // fights it.
    <div
      className="rounded-xl"
      style={{ boxShadow: "0 18px 40px -12px rgb(0 0 0 / 0.35)" }}
    >
    <Card
      // Not while it is still running. The run page reads a finished result,
      // so opening it mid-run shows a half-filled report that rearranges
      // itself underneath you — and the progress you actually wanted to watch
      // is on this card. It becomes clickable the moment the run lands.
      className={cn("relative gap-0 py-0", !running && "cursor-pointer")}
      onClick={() => {
        if (!run || running) return
        void navigate({
          to: "/backtests/$groupId",
          params: { groupId: run.id },
        })
      }}
    >
      <div className="flex items-center gap-2 px-3 py-2">
        <FlaskConicalIcon className="size-4 shrink-0" />
        {run && !running ? (
          <Link
            to="/backtests/$groupId"
            params={{ groupId: run.id }}
            className={cn(
              "min-w-0 flex-1 truncate text-sm font-medium",
              focusRing
            )}
          >
            {run.name ?? "Backtest"}
            <span className="sr-only"> — open the chart and every trade</span>
          </Link>
        ) : run ? (
          // Plain text while it runs, for the same reason the card is not
          // clickable. A link left here would be the one way a keyboard could
          // still reach the half-finished run page.
          <span className="min-w-0 truncate text-sm font-medium">
            {run.name ?? "Backtest"}
          </span>
        ) : (
          <span className="min-w-0 flex-1 truncate text-sm font-medium">
            Backtest
          </span>
        )}
        {running ? (
          <span
            className="min-w-0 truncate text-[11px] font-medium text-emerald-600 dark:text-emerald-400"
            aria-live="polite"
          >
            {run.progressNote}
          </span>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="ml-auto"
          aria-label="Close the backtest panel"
          onClick={(event) => {
            event.stopPropagation()
            onClose()
          }}
        >
          <XIcon className="size-3.5" />
        </Button>
      </div>

      <ScrollArea className="max-h-[60vh]">
        <div className="grid gap-3 p-3">
          {!run ? (
            <p className="text-xs text-muted-foreground">
              {noneYet
                ? "This flow has not run a backtest yet. Press Run above."
                : "Reading the run…"}
            </p>
          ) : running ? (
            <div className="grid gap-2">
              <Line
                label="Progress"
                value={`${Math.round(run.progress * 100)}% through`}
              />
              <Meter
                value={Math.round(run.progress * 100)}
                label="How far through the backtest is"
                valueText={`${Math.round(run.progress * 100)}% through`}
                size="sm"
              />
            </div>
          ) : summary ? (
            <>
              <div className="grid gap-1.5">
                <Line
                  label="Made or lost"
                  value={formatSignedUsd(summary.madeOrLost)}
                  tone={toneClass(summary.madeOrLost)}
                />
                <Line
                  label="Ended with"
                  value={formatUsd(summary.endingUsd)}
                />
                <Line
                  label="Worst dip"
                  value={formatUsd(summary.worstDipUsd)}
                />
                <Line
                  label="Buy and hold"
                  value={formatSignedUsd(summary.buyAndHold)}
                  tone={toneClass(summary.buyAndHold)}
                />
              </div>

              <div className="grid gap-1.5 border-t pt-3">
                <Line label="Coins tested" value={String(summary.coinsTested)} />
                <Line label="Trades" value={String(summary.trades)} />
                <Line
                  label="Won"
                  value={`${summary.tradesWon} of ${summary.tradesClosed}`}
                />
                <Line
                  label="Still holding"
                  value={`${summary.coinsOpenAtEnd} ${plural(summary.coinsOpenAtEnd, "coin", "coins")}, ${formatUsd(summary.openAtEndUsd)}`}
                />
              </div>

              {/* The warnings are the whole reason this is worth reading on the
                  canvas: a result nobody should believe looks exactly like one
                  they should, until it says why. */}
              {summary.warnings.length > 0 ? (
                <div className="grid gap-1 border-t pt-3">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation()
                      setWarningsOpen((open) => !open)
                    }}
                    aria-expanded={warningsOpen}
                    className={cn(
                      "flex items-center gap-1 rounded-sm text-left text-xs font-medium",
                      focusRing
                    )}
                  >
                    <ChevronDownIcon
                      className={cn(
                        "size-3 transition-transform",
                        !warningsOpen && "-rotate-90"
                      )}
                    />
                    Read this before you believe it
                    <span className="text-muted-foreground">
                      ({summary.warnings.length})
                    </span>
                  </button>
                  {warningsOpen ? (
                    <ul className="grid list-disc gap-1 pl-5 text-[11px] leading-4 text-muted-foreground">
                      {summary.warnings.map((warning) => (
                        <li key={warning}>{warning}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}
            </>
          ) : (
            <p className="text-xs text-muted-foreground">
              That run finished without a result — it was stopped, or every coin
              was skipped.
            </p>
          )}

          {run?.finishedAt ? (
            <p className="border-t pt-3 text-[11px] text-muted-foreground">
              Finished {formatRelativeTime(new Date(run.finishedAt))}.
            </p>
          ) : null}
        </div>
      </ScrollArea>
    </Card>
    </div>
  )
}

function Line({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: string
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("font-medium tabular-nums", tone)}>{value}</span>
    </div>
  )
}
