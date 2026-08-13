import * as React from "react"
import { toast } from "sonner"
import { FlaskConicalIcon, Loader2Icon, PlayIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { DisabledReason } from "@/components/ui/disabled-reason"
import {
  flowActionProblem,
  loadFlowTrading,
  startFlow,
  type FlowTrading,
} from "@/lib/api/flow-trading"
import type { AutomationRunControlProps } from "@/lib/automations/canvas-panel"
import { plural } from "@/lib/format/plural"
import { showErrorToast } from "@/lib/toast/error-toast"
import { formatUsd } from "@/lib/trade/format"

/**
 * The button in place of Run, because Run is three different things here.
 *
 * A flow with pretend money on it is a **backtest** — it walks price history
 * and spends nothing. A flow that names a wallet is **switched on** to trade
 * forward. And a flow already switched on has nothing to press at all: the
 * chip beside this button is where it is stopped.
 *
 * One button called Run for all three was the confusing part, and no wording
 * would have fixed it — the word has to change with what the flow is. The
 * shell keeps the judgement it is entitled to (paused, a step marked red, a run
 * already going) and hands it over; everything else is decided here.
 */

/** How often it re-asks what the flow is. Matches the chip beside it. */
const EVERY_MS = 3_000

export default function FlowRunControl({
  automationId,
  canRun,
  reason,
  running,
}: AutomationRunControlProps) {
  const [flow, setFlow] = React.useState<FlowTrading | null>(null)
  const [busy, setBusy] = React.useState(false)
  /** Whether Switch on has been pressed once. */
  const [confirming, setConfirming] = React.useState(false)

  React.useEffect(() => {
    let stopped = false
    let timer = 0

    const tick = async () => {
      try {
        const answer = await loadFlowTrading(automationId)
        if (!stopped) setFlow(answer)
      } catch {
        // A read that failed is not an answer. The button keeps what it had.
      }
      if (stopped) return
      timer = window.setTimeout(() => void tick(), EVERY_MS)
    }

    void tick()
    return () => {
      stopped = true
      window.clearTimeout(timer)
    }
  }, [automationId])

  // Nothing until the first answer lands.
  //
  // The word on this button IS the answer — Backtest, Switch on, or no button
  // at all — so guessing one and swapping it a moment later reads as the
  // button appearing and then disappearing. It did: a flow that names a wallet
  // said "Backtest" for up to three seconds before correcting itself. A blank
  // spot for one read is honest; the wrong word is not.
  if (!flow) return null

  const trades = flow.mode === "trades" ? flow : null

  // Already trading AND the canvas is still that flow: nothing to press. The
  // chip has Stop, and a second button offering to start what is already
  // started is how somebody ends up with two of everything.
  //
  // A canvas set back to pretend money is a different thing entirely — a
  // backtest being drawn beside a flow that happens to be on — and it keeps its
  // button. Hiding it was the same mistake twice: a running flow must never be
  // the reason somebody cannot test an idea.
  if (trades?.running && !trades.drawnIsBacktest) return null

  // Running, but the canvas is a backtest now: it is the backtest button, and
  // switching this flow on again is not on offer while it already is.
  const backtestOnly = trades?.running === true

  const busyNow = busy || running

  if (!trades || backtestOnly) {
    return (
      <DisabledReason disabled={!canRun && !running} reason={reason ?? ""}>
        <Button
          type="button"
          disabled={!canRun}
          onClick={() => {
            setBusy(true)
            // Imported at the click, not at the top of this file.
            //
            // The editor already imports this module, and this component is
            // rendered BY the editor through a lazy import — so a top-level
            // import here is reached while that module is still initialising,
            // and its server functions come back undefined. Every page in the
            // app failed to render on the server because of it. A click
            // happens in a browser long after everything has settled.
            void import("@/lib/api/automations/automation-runs")
              .then(async (runs) => {
                try {
                  await runs.runAutomationNow(automationId)
                  toast.success("Backtest started.")
                } catch (error) {
                  showErrorToast(runs.getAutomationRunErrorMessage(error))
                }
              })
              .finally(() => setBusy(false))
          }}
        >
          {busyNow ? (
            <Loader2Icon className="size-4 animate-spin" />
          ) : (
            <FlaskConicalIcon className="size-4" />
          )}
          Backtest
        </Button>
      </DisabledReason>
    )
  }

  // Named a wallet, not yet on.
  //
  // The question is asked in the shared confirm dialog, not inline in the
  // header. It was inline for one build and it was wrong twice over: a
  // sentence that long shoves the header about as it appears, and this app
  // already has one way to ask before something irreversible. A window also
  // gives the question room to name the wallet, the money and the coins
  // without being read sideways.
  return (
    <>
      <DisabledReason
        disabled={!canRun || trades.problem !== null}
        reason={trades.problem ?? reason ?? ""}
      >
        <Button
          type="button"
          disabled={!canRun || trades.problem !== null}
          onClick={() => setConfirming(true)}
        >
          {busyNow ? (
            <Loader2Icon className="size-4 animate-spin" />
          ) : (
            <PlayIcon className="size-4" />
          )}
          Switch on
        </Button>
      </DisabledReason>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        // Red for real money, and only for real money. A practice wallet is a
        // deliberate act worth confirming, not a dangerous one.
        destructive={trades.real}
        loading={busy}
        title={
          trades.real
            ? `Trade ${trades.walletLabel} with real money?`
            : `Switch this flow on?`
        }
        description={
          <>
            It will trade <strong>{trades.walletLabel}</strong> with{" "}
            {trades.real ? "real money" : "practice money"}, using up to{" "}
            <strong>
              {trades.capUsd === null
                ? "the cap you set"
                : formatUsd(trades.capUsd)}
            </strong>{" "}
            across {trades.coins} {plural(trades.coins, "coin", "coins")}. It
            places a ladder on each coin as that coin finds a base, and keeps
            going whether or not this page is open.
          </>
        }
        confirmLabel={trades.real ? "Yes, trade real money" : "Switch it on"}
        onConfirm={() => {
          setBusy(true)
          void startFlow(automationId)
            .then((answer) => {
              toast.success(answer.summary)
              setConfirming(false)
            })
            .catch((error: unknown) => {
              showErrorToast(flowActionProblem(error, trades.walletLabel))
            })
            .finally(() => setBusy(false))
        }}
      />
    </>
  )
}
