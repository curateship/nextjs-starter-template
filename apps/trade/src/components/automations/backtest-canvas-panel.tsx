import * as React from "react"
import { Link, useNavigate } from "@tanstack/react-router"
import {
  ChevronDownIcon,
  FlaskConicalIcon,
  Loader2Icon,
  WalletIcon,
  XIcon,
} from "lucide-react"

import { toast } from "sonner"

import { toneClass } from "@/components/backtest/backtest-kpi"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Meter } from "@/components/ui/meter"
import { ScrollArea } from "@/components/ui/scroll-area"
import { loadBacktests } from "@/lib/api/backtests"
import {
  flowActionProblem,
  loadFlowTrading,
  startFlow,
  stopFlow,
  type FlowTrading,
} from "@/lib/api/flow-trading"
import { showErrorToast } from "@/lib/toast/error-toast"
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
  /** Bumped by Start and Stop, so the card redraws without waiting for a tick. */
  const [refreshKey, setRefreshKey] = React.useState(0)
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
    // The read is never skipped for a flow that trades. It was, once, to save
    // a query every fifteen seconds — and that turned the backtest card into
    // "Reading the run…" forever the moment a flow was switched on, because
    // the two now sit on the panel together. A saved round trip is not worth a
    // card that never loads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [automationId, runId, refreshKey])

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
      }
      if (stopped) return
      timer = window.setTimeout(() => void tick(), FLOW_MODE_EVERY_MS)
    }

    void tick()
    return () => {
      stopped = true
      window.clearTimeout(timer)
    }
  }, [automationId, runId, refreshKey])

  const summary = run?.summary ?? null
  const running = run !== null && run.finishedAt === null
  const trades = flow?.mode === "trades" ? flow : null

  // A switched-on flow and a backtest are not rivals for this slot.
  //
  // The flow is real money moving and must never be hidden — that was the whole
  // point of the last fix. But hiding the backtest behind it was the wrong half
  // of the trade: somebody who takes the wallet off the step to test an idea
  // could no longer see what their test found. So the live flow becomes a strip
  // above, and the rest of the panel goes on being whatever the canvas is.
  const strip = trades?.running ? (
    <RunningStrip
      flow={trades}
      automationId={automationId}
      onChanged={() => setRefreshKey((n) => n + 1)}
    />
  ) : null

  if (trades && !trades.drawnIsBacktest) {
    return (
      <div className="grid gap-2">
        {strip}
        {trades.running ? null : (
          <TradingCard
            flow={trades}
            automationId={automationId}
            onChanged={() => setRefreshKey((n) => n + 1)}
            onClose={onClose}
          />
        )}
      </div>
    )
  }

  return (
    <div className="grid gap-2">
    {strip}
    {/* The whole card opens the run.

        A click rather than a link stretched over the card: the panel scrolls,
        and an invisible cover over a scrolling area swallows the wheel. The
        heading is still a real link, so a keyboard reaches the run too, and
        the two things inside that do their own job stop the click before it
        gets here.

        The lift is written out rather than set with a class. `theme.css`
        drives every card's `box-shadow` from the Styling settings, so a
        Tailwind shadow on the card is overwritten — and on a wrapper the
        shadow variables come back empty. A plain value cannot be argued with.
        The wrapper is not a card, so nothing fights it. */}
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
    </div>
  )
}

/**
 * A switched-on flow, as a strip above whatever else the panel is showing.
 *
 * Deliberately small. It has one job — to make it impossible to forget that
 * money is moving — and it must not push a backtest result off the panel to do
 * it. Everything about the flow that is worth reading at length lives on the
 * Trade screen; this is the reminder and the Stop button.
 */
function RunningStrip({
  flow,
  automationId,
  onChanged,
}: {
  flow: Extract<FlowTrading, { mode: "trades" }>
  automationId: string
  onChanged: () => void
}) {
  const [busy, setBusy] = React.useState(false)

  return (
    <div
      className="rounded-xl"
      style={{ boxShadow: "0 18px 40px -12px rgb(0 0 0 / 0.35)" }}
    >
      <Card className="gap-0 py-0">
        <div className="flex items-center gap-2 px-3 py-2">
          <WalletIcon className="size-4 shrink-0" />
          <span className="min-w-0 flex-1 truncate text-sm font-medium">
            Trading {flow.walletLabel}
          </span>
          {/* Words and colour, never colour alone. */}
          <span
            className={cn(
              "shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-medium",
              flow.real
                ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                : "bg-muted text-muted-foreground"
            )}
          >
            {flow.real ? "Real money" : "Practice"}
          </span>
        </div>
        <div className="grid gap-2 border-t p-3">
          <Line
            label="Coins working"
            value={`${flow.working} of ${flow.coins}`}
          />
          {/* Two different situations, and one message for each.
              Editing a live flow's coins or cap is worth a warning, because
              the edit is not trading. Setting the canvas back to pretend money
              is not that at all — it is a backtest being drawn beside a flow
              that is still on — and telling somebody to restart "to use the
              new ones" there means nothing. */}
          {flow.drawingChanged ? (
            <p className="text-xs text-destructive">
              You have changed this flow since switching it on, and those
              changes are not trading. It is still using the coins and settings
              it started with. Stop it and start it again to use the new ones.
            </p>
          ) : flow.drawnIsBacktest ? (
            <p className="text-xs text-muted-foreground">
              The canvas is set to pretend money now, which is for backtesting.
              That does not stop this — it is still trading. Press Stop when you
              want it to.
            </p>
          ) : null}
          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={busy}
            onClick={() => {
              setBusy(true)
              void stopFlow(automationId)
                .then((answer) => {
                  toast.success(answer.summary)
                  onChanged()
                })
                .catch((error: unknown) => {
                  showErrorToast(flowActionProblem(error, flow.walletLabel))
                })
                .finally(() => setBusy(false))
            }}
          >
            {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
            Stop this flow
          </Button>
        </div>
      </Card>
    </div>
  )
}

/**
 * The card for a flow set up to trade but not yet switched on.
 *
 * Deliberately not a backtest card with the words swapped. What it has to say
 * is different: which wallet is about to be spent, how much of it, and that
 * Run will switch it on rather than test it. Saying that here is the point,
 * because here is where somebody is looking when they press it.
 *
 * Once it IS switched on this card gives way to `RunningStrip`, which sits
 * above whatever the canvas has become — so a backtest drawn beside a live
 * flow can still be run and read.
 */
function TradingCard({
  flow,
  automationId,
  onChanged,
  onClose,
}: {
  flow: Extract<FlowTrading, { mode: "trades" }>
  automationId: string
  onChanged: () => void
  onClose: () => void
}) {
  /**
   * Whether Start has been pressed once.
   *
   * **Two presses, deliberately.** The first turns the button into the sentence
   * it is really asking — this wallet, this much, this many coins, real money
   * or not — and only the second does it. The same shape the quick order window
   * uses before a live trade, and for the same reason: the moment money starts
   * moving should be one you meant.
   */
  const [confirming, setConfirming] = React.useState(false)
  const [busy, setBusy] = React.useState(false)

  const act = async (go: () => Promise<{ summary: string }>) => {
    setBusy(true)
    try {
      const answer = await go()
      toast.success(answer.summary)
      setConfirming(false)
      onChanged()
    } catch (error) {
      showErrorToast(flowActionProblem(error, flow.walletLabel))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="rounded-xl"
      style={{ boxShadow: "0 18px 40px -12px rgb(0 0 0 / 0.35)" }}
    >
      <Card className="relative gap-0 py-0">
        <div className="flex items-center gap-2 px-3 py-2">
          <WalletIcon className="size-4 shrink-0" />
          <span className="min-w-0 flex-1 truncate text-sm font-medium">
            Trades {flow.walletLabel}
          </span>
          {/* Words as well as colour, and never colour alone: "real" is the
              one thing on this card that must not be missed. */}
          <span
            className={cn(
              "shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-medium",
              flow.real
                ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                : "bg-muted text-muted-foreground"
            )}
          >
            {flow.real ? "Real money" : "Practice"}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Close this panel"
            onClick={onClose}
          >
            <XIcon className="size-3.5" />
          </Button>
        </div>

        <div className="grid gap-3 border-t p-3">
          <div className="grid gap-1.5">
            <Line
              label="Money it may use"
              value={flow.capUsd === null ? "Not set" : formatUsd(flow.capUsd)}
            />
            <Line
              label="Coins"
              value={`${flow.coins} ${plural(flow.coins, "coin", "coins")}`}
            />
          </div>

          {flow.problem ? (
            <p className="border-t pt-3 text-xs text-destructive">
              {flow.problem}
            </p>
          ) : null}

          {(

            <div className="grid gap-2 border-t pt-3">
              {/* The honest answer to "why did nothing happen" when Run is
                  pressed: there is nothing to backtest once a wallet is named,
                  so Run switches the flow on instead. */}
              <p className="text-[11px] leading-4 text-muted-foreground">
                Run does not test this flow — there is nothing to backtest once
                a wallet is named. It switches the flow on instead. Set the
                Wallet step back to pretend money to test the strategy.
              </p>
              {confirming ? (
                <>
                  <p
                    className={cn(
                      "text-xs",
                      flow.real ? "text-destructive" : "text-muted-foreground"
                    )}
                  >
                    {`Trade ${flow.walletLabel} with ${flow.real ? "REAL MONEY" : "practice money"} — up to ${flow.capUsd === null ? "the cap you set" : formatUsd(flow.capUsd)} across ${flow.coins} ${plural(flow.coins, "coin", "coins")}?`}
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy}
                      onClick={() => setConfirming(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      disabled={busy}
                      onClick={() => void act(() => startFlow(automationId))}
                    >
                      {busy ? (
                        <Loader2Icon className="size-4 animate-spin" />
                      ) : null}
                      Yes, start it
                    </Button>
                  </div>
                </>
              ) : (
                <Button
                  type="button"
                  className="w-full"
                  disabled={flow.problem !== null}
                  onClick={() => setConfirming(true)}
                >
                  Switch this flow on
                </Button>
              )}
            </div>
          )}
        </div>
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
