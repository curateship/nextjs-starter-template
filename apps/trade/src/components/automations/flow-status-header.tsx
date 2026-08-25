import * as React from "react"
import { Link } from "@tanstack/react-router"
import { toast } from "sonner"
import {
  ActivityIcon,
  Loader2Icon,
  PauseIcon,
  PlayIcon,
  RotateCwIcon,
  SquareIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { DisabledReason } from "@/components/ui/disabled-reason"
import {
  flowActionProblem,
  getFlowTradingErrorMessage,
  loadFlowTrading,
  pauseFlow,
  retryFlowNow,
  startFlow,
  stopFlow,
  type FlowTrading,
} from "@/lib/api/flow-trading"
import type { AutomationCanvasStatusProps } from "@/lib/automations/canvas-panel"
import { formatRelativeTime } from "@/lib/format/format-time"
import { focusRing } from "@/lib/layout/focus-ring"
import { plural } from "@/lib/format/plural"
import { dismissErrorToast, showErrorToast } from "@/lib/toast/error-toast"
import { formatUsd } from "@/lib/trade/format"
import { cn } from "@/lib/utils"
import { useTradeSounds } from "@/components/trade/trade-sounds"

/**
 * Everything this app puts in the canvas header: what the flow is, and every
 * button that acts on it.
 *
 * **Why they are all in one place.** This header used to be split — the shell's
 * Run replaced by a button of ours, a status chip in the middle, a Stop buried
 * in that chip's dropdown, and a workspace-wide Pause beside them meaning
 * something else entirely. Four controls, three owners, and no line saying
 * which was which. An app gets one strip here and puts everything in it.
 *
 * **What is where.** The strip holds one thing: **Switch on**, for a flow that
 * names a wallet and is not trading yet. Running a backtest lives in the
 * Backtest panel beside its last result, because that is the same act — run it,
 * read it, adjust, run it again — and out here it sat next to Stop.
 *
 * Everything you can do to a flow that is ALREADY trading lives in the chip:
 * **Try again**, **Pause** and **Stop**. They belong beside the sentence that
 * explains why you would want them, and out in the strip they were buttons
 * whose words changed with the flow's state, one of them appearing and
 * vanishing on its own, sitting next to a Backtest that means something else
 * entirely.
 *
 * The button keeps its place while the first answer is on the way, but it does
 * not guess at that answer. It says "Reading trading status" until the server
 * can say whether this flow is trading, paused, stopping or ready to switch on.
 */

/** How often it re-asks. Fast enough that switching on shows up at once. */
const EVERY_MS = 3_000

/**
 * How many coins the reason list names before it counts the rest.
 *
 * A flow may watch four hundred, and a dropdown four hundred rows long is not
 * read by anybody. Problems sort to the top, so the ones worth seeing are the
 * ones that survive the cut.
 */
const SHOW_AT_MOST = 6

export default function FlowStatusHeader({
  automationId,
}: AutomationCanvasStatusProps) {
  useTradeSounds()
  const [flow, setFlow] = React.useState<FlowTrading | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [open, setOpen] = React.useState(false)
  const readFailed = React.useRef(false)
  const readErrorToastId = React.useRef<string | number | null>(null)
  /** Which irreversible thing is being confirmed, if any. */
  const [asking, setAsking] = React.useState<"start" | "stop" | null>(null)
  /** Bumped by an action so the strip changes at once, not at the next tick. */
  const [refreshKey, setRefreshKey] = React.useState(0)

  React.useEffect(() => {
    let stopped = false
    let timer = 0

    const tick = async () => {
      try {
        const answer = await loadFlowTrading(automationId)
        if (!stopped) {
          if (readFailed.current) {
            readFailed.current = false
            if (readErrorToastId.current !== null) {
              dismissErrorToast(readErrorToastId.current)
              readErrorToastId.current = null
            }
          }
          setFlow(answer)
        }
      } catch (error) {
        // A read that failed is not "nothing is trading". Whatever the chip
        // last said stays, the failure is shown once, and the next pass is
        // three seconds away.
        if (!stopped && !readFailed.current) {
          readFailed.current = true
          readErrorToastId.current = showErrorToast(
            getFlowTradingErrorMessage(error)
          )
        }
      }
      if (stopped) return
      timer = window.setTimeout(() => void tick(), EVERY_MS)
    }

    void tick()
    return () => {
      stopped = true
      window.clearTimeout(timer)
    }
  }, [automationId, refreshKey])

  // The slot never disappears while the first read is on its way. A spinner
  // says what is missing without inventing whether this flow is trading.
  if (!flow) {
    return (
      <Button
        type="button"
        variant="outline"
        disabled
        aria-label="Reading trading status"
      >
        <Loader2Icon className="size-4 animate-spin" />
        Reading trading status
      </Button>
    )
  }

  // Nothing at all on a flow this app has no opinion about.
  if (flow.mode !== "trades") return null
  const trades = flow
  const live = trades.running || trades.stopping ? trades : null

  /** Every action is the same shape: do it, say so, redraw at once. */
  const act = (what: () => Promise<{ summary: string }>, then?: () => void) => {
    setBusy(true)
    void what()
      .then((answer) => {
        toast.success(answer.summary)
        setOpen(false)
        setAsking(null)
        then?.()
        setRefreshKey((n) => n + 1)
      })
      .catch((error: unknown) => {
        showErrorToast(flowActionProblem(error, trades.walletLabel))
      })
      .finally(() => setBusy(false))
  }

  /** Stop gets out of the way before the server starts calling orders off. */
  const stopNow = () => {
    const before = trades
    setAsking(null)
    setOpen(false)
    setBusy(true)
    setFlow({
      ...trades,
      running: false,
      stopping: true,
      paused: false,
      headline: `${trades.working} ${plural(trades.working, "ladder", "ladders")} left to call off.`,
    })
    void stopFlow(automationId)
      .then((answer) => {
        toast.success(answer.summary)
        setRefreshKey((n) => n + 1)
      })
      .catch((error: unknown) => {
        setFlow(before)
        showErrorToast(flowActionProblem(error, trades.walletLabel))
      })
      .finally(() => setBusy(false))
  }

  const buttons = (
    <>
      {live === null ? (
        <DisabledReason
          disabled={trades.problem !== null}
          reason={trades.problem ?? ""}
        >
          <Button
            type="button"
            disabled={busy || trades.problem !== null}
            onClick={() => setAsking("start")}
          >
            <PlayIcon className="size-4" />
            Switch on
          </Button>
        </DisabledReason>
      ) : null}
    </>
  )

  const confirms = (
    <>
      <ConfirmDialog
        open={asking === "start"}
        onOpenChange={(next) => setAsking(next ? "start" : null)}
        // Red for real money, and only for real money. A practice wallet is a
        // deliberate act worth confirming, not a dangerous one.
        destructive={trades.real}
        loading={busy}
        title={
          trades.real
            ? `Trade ${trades.walletLabel} with real money?`
            : "Switch this flow on?"
        }
        description={
          <>
            It will trade <strong>{trades.walletLabel}</strong> with{" "}
            {trades.real ? "real money" : "practice money"} across{" "}
            {trades.coins} {plural(trades.coins, "coin", "coins")} — spending at
            most{" "}
            <strong>
              {trades.capUsd === null
                ? "the cap you set"
                : formatUsd(trades.capUsd)}
            </strong>
            , and never more than the wallet actually holds. It places a ladder
            on each coin as that coin finds a base, and keeps going whether or
            not this page is open.
          </>
        }
        confirmLabel={trades.real ? "Yes, trade real money" : "Switch it on"}
        onConfirm={() => act(() => startFlow(automationId))}
      />

      <ConfirmDialog
        open={asking === "stop"}
        onOpenChange={(next) => setAsking(next ? "stop" : null)}
        loading={busy}
        title="Stop this flow?"
        description={
          <>
            It stops looking for coins and calls off the{" "}
            {plural(live?.working ?? 0, "ladder", "ladders")} it placed that
            have not bought anything. A coin already held keeps its position,
            its stop and its target. To leave everything exactly as it is, use{" "}
            <strong>Pause</strong> instead.
          </>
        }
        confirmLabel="Stop it"
        onConfirm={stopNow}
      />
    </>
  )

  // Not trading: the buttons and nothing else. A chip saying what a flow would
  // do if you pressed something is the button's own job.
  if (!live) {
    return (
      <div className="flex items-center gap-2">
        {buttons}
        {confirms}
      </div>
    )
  }

  const dashboardSummary = <RunDashboardSummary live={live} />

  return (
    <div className="flex items-center gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            // Colour AND words. Amber alone would say nothing to somebody who
            // cannot tell it from the button beside it.
            className={cn(
              live.real &&
                "border-amber-500/40 text-amber-700 dark:text-amber-400"
            )}
          >
            {/* The same dot the account panel puts on the wallet in use, and the
              same size — one idea, drawn one way. It is an addition and never
              the signal on its own: the word beside it says what it means, so
              nothing is lost to somebody who cannot pick the colour out. */}
            <span
              className={cn(
                "size-1.5 shrink-0 rounded-full",
                // Amber the moment a coin needs a person. The flow is still on,
                // so it is not red — but "nothing is happening" now has two
                // meanings and the dot is the first place somebody looks.
                live.stopping || live.paused
                  ? "bg-muted-foreground"
                  : live.needsAttention
                    ? "bg-amber-500"
                    : "bg-emerald-500"
              )}
              aria-hidden
            />
            {/* The wallet, then the exchange it is on. Real money is carried by
              the amber and by the dropdown, which says it in words. */}
            {live.stopping ? "Stopping" : live.paused ? "Paused" : "Trading"} —{" "}
            {live.walletLabel}
            <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              {live.venue}
            </span>
            <span className="text-muted-foreground tabular-nums">
              {live.stopping
                ? `${live.working} left`
                : `${live.working}/${live.coins}`}
            </span>
          </Button>
        </PopoverTrigger>

        <PopoverContent align="end" className="w-80">
          {live.runId === null ? (
            dashboardSummary
          ) : (
            <Link
              to="/flow-runs/$runId"
              params={{ runId: live.runId }}
              aria-label={`Open ${live.walletLabel} run dashboard`}
              className={cn(
                "-m-1 grid gap-1.5 rounded-md p-1 transition-colors hover:bg-muted/60",
                focusRing
              )}
            >
              {dashboardSummary}
            </Link>
          )}

          {/* Why nothing is happening, which is the question this whole panel
            exists to answer. A flow refusing every coin for want of money and
            a flow waiting for the right price both show zero ladders, and
            without this there is no way to tell them apart. */}
          {/* It has stopped asking. Said first and said plainly, because a flow
            that has stopped looks exactly like one with nothing to do, and it
            will stay that way until somebody changes something. */}
          {/* The one line worth reading, and the button that answers it.
            This used to be three blocks saying the same thing. */}
          {/* In a card of its own, because it is the one line worth reading and
            it was getting lost between the figures above it and the coin list
            below. Grey, not amber, unless something actually needs a person —
            an exchange asking us to slow down is not a warning. */}
          {live.headline === null ? null : (
            <p
              className={cn(
                "rounded-md bg-muted px-2.5 py-2 text-xs leading-4",
                live.needsAttention
                  ? "text-amber-700 dark:text-amber-400"
                  : "text-muted-foreground"
              )}
            >
              {live.headline}
            </p>
          )}

          {live.waiting.length === 0 ? null : (
            <div className="grid gap-1">
              <div className="grid gap-1">
                {live.waiting.slice(0, SHOW_AT_MOST).map((one) => (
                  <div
                    key={one.marketKey}
                    className="flex items-baseline justify-between gap-3 text-[11px]"
                  >
                    <span className="font-medium">{one.coin}</span>
                    <span
                      className={cn(
                        "text-right",
                        one.problem
                          ? "text-amber-700 dark:text-amber-400"
                          : "text-muted-foreground"
                      )}
                    >
                      {one.words}
                    </span>
                  </div>
                ))}
                {live.waiting.length > SHOW_AT_MOST ? (
                  <p className="text-[11px] text-muted-foreground">
                    and {live.waiting.length - SHOW_AT_MOST} more.
                  </p>
                ) : null}
              </div>
            </div>
          )}

          {/* An edit to a live flow is worth a warning, because the edit is not
            trading. A canvas set back to pretend money is not worth one — it is
            a backtest being drawn beside a flow that happens to still be on,
            and the Backtest button beside this says that already. */}
          {live.drawingChanged ? (
            <p className="text-xs text-destructive">
              You have changed this flow since switching it on, and those
              changes are not trading. It is still using the coins and settings
              it started with. Stop it and start it again to use the new ones.
            </p>
          ) : null}

          {/* The way through to everything this run has actually done: its
            trades, what it is holding, and what its money has done since it
            was switched on. The chip answers "is it working"; that page
            answers "is it working WELL", and there is no room for the second
            question in a popover. */}
          {live.runId === null ? null : (
            <Button asChild type="button" variant="outline" className="w-full">
              <Link to="/flow-runs/$runId" params={{ runId: live.runId }}>
                <ActivityIcon className="size-4" />
                Open the dashboard
              </Link>
            </Button>
          )}

          {/* The three things you can do to a running flow, together, at the
            bottom of the thing that says what it is doing.

            Out in the header they were three buttons whose words changed with
            the flow's state — one of them appearing and vanishing on its own —
            beside a Backtest button that means something else entirely. In here
            they read as what they are: the actions belonging to this flow. */}
          {live.stopping ? null : (
            <div className="flex gap-2">
              {live.holding ? (
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  disabled={busy}
                  onClick={() => act(() => retryFlowNow(automationId))}
                >
                  {busy ? (
                    <Loader2Icon className="size-4 animate-spin" />
                  ) : (
                    <RotateCwIcon className="size-4" />
                  )}
                  Try again
                </Button>
              ) : null}
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                disabled={busy}
                onClick={() => act(() => pauseFlow(automationId, !live.paused))}
              >
                {live.paused ? (
                  <PlayIcon className="size-4" />
                ) : (
                  <PauseIcon className="size-4" />
                )}
                {live.paused ? "Resume" : "Pause"}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                disabled={busy}
                onClick={() => setAsking("stop")}
              >
                <SquareIcon className="size-4" />
                Stop
              </Button>
            </div>
          )}
        </PopoverContent>
      </Popover>
      {buttons}
      {confirms}
    </div>
  )
}

function RunDashboardSummary({
  live,
}: {
  live: Extract<FlowTrading, { mode: "trades" }>
}) {
  return (
    <>
      <PopoverHeader>
        <PopoverTitle>{live.walletLabel}</PopoverTitle>
      </PopoverHeader>
      <div className="grid gap-1.5 text-xs">
        <Row
          label="Money"
          value={live.real ? "Real money" : "Practice money"}
        />
        <Row
          label="Spending cap"
          value={live.capUsd === null ? "Not set" : formatUsd(live.capUsd)}
        />
        <Row label="Coins working" value={`${live.working} of ${live.coins}`} />
        {live.startedAt === null ? null : (
          <Row
            label="Switched on"
            value={formatRelativeTime(new Date(live.startedAt))}
          />
        )}
      </div>
    </>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  )
}
