import * as React from "react"
import { Link, useNavigate } from "@tanstack/react-router"
import { FlaskConicalIcon, Loader2Icon, XIcon } from "lucide-react"

import { toneClass } from "@/components/backtest/backtest-kpi"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Meter } from "@/components/ui/meter"
import { ScrollArea } from "@/components/ui/scroll-area"
import { loadBacktests } from "@/lib/api/backtests"
import { loadFlowTrading, type FlowTrading } from "@/lib/api/flow-trading"
import type { AutomationCanvasPanelProps } from "@/lib/automations/canvas-panel"
import { formatRelativeTime } from "@/lib/format/format-time"
import { focusRing } from "@/lib/layout/focus-ring"
import { plural } from "@/lib/format/plural"
import { showErrorToast } from "@/lib/toast/error-toast"
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

/**
 * How often the panel re-asks what the flow is set up to do.
 *
 * Faster than the idle run check because this is watching for something
 * somebody just did on the same screen — naming a wallet, or taking it off
 * again — and fifteen seconds of showing the wrong mode on a card about real
 * money is fourteen too many.
 */
const FLOW_MODE_EVERY_MS = 3_000

type Run = Awaited<ReturnType<typeof loadBacktests>>["runs"][number]

export default function BacktestCanvasPanel({
  automationId,
  runId,
  onClose,
}: AutomationCanvasPanelProps) {
  const navigate = useNavigate()
  const [run, setRun] = React.useState<Run | null>(null)
  /**
   * What this flow is set up to do.
   *
   * Asked because the answer changes what this panel is FOR. A flow whose
   * Wallet step names a wallet does not backtest, so the newest backtest it
   * ever ran is a leftover — and a leftover sitting under the Run button,
   * titled "Backtest", reads as what just happened. It said "Finished 58
   * minutes ago" on a flow that had refused four times since.
   */
  const [flow, setFlow] = React.useState<FlowTrading | null>(null)
  // "We asked, and there really is nothing" — as opposed to "we have not
  // managed to ask yet". They used to share one flag with "the read failed",
  // so one dropped request mid-run said "this flow has not run a backtest yet"
  // over the top of a run that was plainly going, with "Started 2 minutes ago"
  // underneath it.
  const [noneYet, setNoneYet] = React.useState(false)
  /**
   * Pressed, and the run not yet visible in the list.
   *
   * **The panel changes on the click, not on the answer.** Starting a run is a
   * round trip to the server and then a wait for the next read, so the honest
   * state was already true a second or two before anything on screen said so —
   * and pressing a button that sits there looking unpressed is how somebody
   * presses it twice.
   */
  const [starting, setStarting] = React.useState(false)
  /** Bumped to read the list again now, instead of waiting out the timer. */
  const [readNow, setReadNow] = React.useState(0)
  /**
   * Whether the first read of what this flow is has come back, either way.
   *
   * **Nothing is drawn before it has.** This panel decides whether it should
   * exist at all from that answer, and it was drawing itself first and
   * withdrawing about half a second later — a card that opens and shuts itself
   * on every visit. Waiting is invisible; flashing is not.
   */
  const [flowSettled, setFlowSettled] = React.useState(false)

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
        const newest = list.runs[0] ?? null
        setRun(newest)
        setNoneYet(list.runs.length === 0)
        // The list has caught up with the click, so stop believing it on faith.
        if (newest !== null && newest.finishedAt === null) setStarting(false)
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
    // The read is never skipped for a flow that trades. It was, once, to save
    // a query every fifteen seconds — and that turned the backtest card into
    // "Reading the run…" forever the moment a flow was switched on, because
    // the two now sit on the panel together. A saved round trip is not worth a
    // card that never loads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [automationId, runId, readNow])

  /**
   * What the flow is set up to do, kept up to date while the panel is open.
   *
   * **Polled, because there is nothing to listen to.** The Wallet step is
   * changed on the other side of the canvas and saves itself; this panel is
   * never told. Reading it only when Run is pressed meant switching a flow to
   * a wallet — or back to pretend money — left this card showing the old
   * answer until somebody pressed a button, which is exactly the stale card
   * this panel was rewritten to stop being.
   *
   * A few seconds is the right pace: it is one small read of one row, and the
   * change it is watching for is something a person just did and is looking
   * straight at.
   */
  React.useEffect(() => {
    let stopped = false
    let timer = 0

    const tick = async () => {
      try {
        const answer = await loadFlowTrading(automationId)
        if (!stopped) setFlow(answer)
      } catch {
        // A read that failed is not an answer. The panel keeps what it has
        // rather than claiming a mode it could not confirm.
      } finally {
        // Settled either way, including on a failure: a panel that never drew
        // itself because one read did not land would be worse than one that
        // drew itself on incomplete information.
        if (!stopped) setFlowSettled(true)
      }
      if (stopped) return
      timer = window.setTimeout(() => void tick(), FLOW_MODE_EVERY_MS)
    }

    void tick()
    return () => {
      stopped = true
      window.clearTimeout(timer)
    }
  }, [automationId, runId])

  const summary = run?.summary ?? null
  // Believed from the click until the list catches up with it. `starting` is
  // cleared the moment a running row actually appears, below.
  const running = starting || (run !== null && run.finishedAt === null)
  const trades = flow?.mode === "trades" ? flow : null

  // A flow is the header's business, not this panel's.
  //
  // Switching one on lives on the button in the header, where the two-press
  // confirm is a proper window; saying one is running lives on the chip beside
  // it. This panel is for what a run produced, so a canvas that is a flow
  // rather than a backtest has nothing for it to show. It carried both for a
  // build and ended up meaning three things at once, with a second way to
  // start a flow that asked its question worse.
  // Nothing until the answer that decides this has landed. Drawing first and
  // withdrawing after is the flash somebody sees on every visit.
  if (!flowSettled) return null
  if (trades && !trades.drawnIsBacktest) return null

  return (
    // The whole card opens the run.
    //
    // A click rather than a link stretched over the card: the panel scrolls,
    // and an invisible cover over a scrolling area swallows the wheel. The
    // heading is still a real link, so a keyboard reaches the run too, and the
    // two things inside that do their own job stop the click before it gets
    // here.
    //
    // The lift is written out rather than set with a class. `theme.css` drives
    // every card's `box-shadow` from the Styling settings, so a Tailwind
    // shadow on the card is overwritten — and on a wrapper the shadow
    // variables come back empty. A plain value cannot be argued with. The
    // wrapper is not a card, so nothing fights it.
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
        {/* `run` can be null here for the moment between the click and the
            list catching up — the panel believes it is running before there is
            a row to read a note from. */}
        {running && run ? (
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

            </>
          ) : (
            <p className="text-xs text-muted-foreground">
              That run finished without a result — it was stopped, or every coin
              was skipped.
            </p>
          )}

          {/* Starting a backtest belongs with the last backtest's result, not
              out in the header beside the buttons that trade real money. It is
              the same act as reading this panel — run it, read it, adjust,
              run it again — and out there it sat next to Stop. */}
          {/* Nothing to press while one is walking, so nothing is drawn — no
              button, and no spinner standing in for it. A disabled button with
              a spinner on it is still a button asking to be pressed, and the
              figures above already change as the run goes. */}
          <div className="mt-2 flex items-center justify-between gap-3">
            <p className="text-[11px] leading-4 text-muted-foreground">
              {run?.finishedAt
                ? `Finished ${formatRelativeTime(new Date(run.finishedAt))}.`
                : ""}
            </p>
            {running ? null : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={starting}
              onClick={(event) => {
                // The card itself opens the full run page when clicked, and a
                // button inside it must not do both.
                event.stopPropagation()
                setStarting(true)
                // Nothing is awaited before the panel changes. The request goes
                // out and the answer only matters if it is a refusal.
                // Imported at the click. The editor already imports this module
                // and renders this panel through a lazy import, so a top-level
                // import here is reached mid-initialisation and its server
                // functions come back undefined — which stopped every page in
                // the app rendering on the server once already.
                void import("@/lib/api/automations/automation-runs").then(
                  async (runs) => {
                    try {
                      await runs.runAutomationNow(automationId)
                      // Read again at once rather than waiting out the timer,
                      // so the real run replaces the believed one quickly.
                      setReadNow((n) => n + 1)
                    } catch (error) {
                      // A refusal is the one thing worth saying out loud, and
                      // the panel goes back to what it was.
                      setStarting(false)
                      showErrorToast(runs.getAutomationRunErrorMessage(error))
                    }
                  }
                )
              }}
            >
              {starting ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : (
                <FlaskConicalIcon className="size-4" />
              )}
              Backtest
            </Button>
            )}
          </div>
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
