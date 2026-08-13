import * as React from "react"
import { toast } from "sonner"
import { Loader2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  flowActionProblem,
  loadFlowTrading,
  stopFlow,
  type FlowTrading,
} from "@/lib/api/flow-trading"
import type { AutomationCanvasStatusProps } from "@/lib/automations/canvas-panel"
import { formatRelativeTime } from "@/lib/format/format-time"
import { plural } from "@/lib/format/plural"
import { showErrorToast } from "@/lib/toast/error-toast"
import { formatUsd } from "@/lib/trade/format"
import { cn } from "@/lib/utils"

/**
 * Whether this flow is trading, in the canvas header.
 *
 * **Why the header rather than the panel under Run.** That panel is about what
 * a run produced, and it was being asked to mean three things at once — a
 * backtest result, a flow waiting to be switched on, and a flow that is
 * trading right now. The last of those is not a result and does not belong in
 * the same place: it is a fact about the flow that must be true on screen
 * whether or not anybody has a panel open, which is what a header is for.
 *
 * Nothing at all when no flow is running. The header belongs to the shell and
 * an empty one is the shell's, not a gap where something failed to load.
 */

/** How often it re-asks. Fast enough that switching on shows up at once. */
const EVERY_MS = 3_000

export default function FlowStatusHeader({
  automationId,
}: AutomationCanvasStatusProps) {
  const [flow, setFlow] = React.useState<FlowTrading | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [open, setOpen] = React.useState(false)
  /** Bumped by Stop so the chip goes at once rather than at the next tick. */
  const [refreshKey, setRefreshKey] = React.useState(0)

  React.useEffect(() => {
    let stopped = false
    let timer = 0

    const tick = async () => {
      try {
        const answer = await loadFlowTrading(automationId)
        if (!stopped) setFlow(answer)
      } catch {
        // A read that failed is not "nothing is trading". Whatever the chip
        // last said stays, and the next pass is three seconds away.
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

  const live = flow?.mode === "trades" && flow.running ? flow : null
  if (!live) return null

  const stop = () => {
    setBusy(true)
    void stopFlow(automationId)
      .then((answer) => {
        toast.success(answer.summary)
        setOpen(false)
        setRefreshKey((n) => n + 1)
      })
      .catch((error: unknown) => {
        showErrorToast(flowActionProblem(error, live.walletLabel))
      })
      .finally(() => setBusy(false))
  }

  return (
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
            className="size-1.5 shrink-0 rounded-full bg-emerald-500"
            aria-hidden
          />
          {/* The wallet, then the exchange it is on. Real money is carried by
              the amber and by the dropdown, which says it in words. */}
          Trading — {live.walletLabel}
          <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            {live.venue}
          </span>
          <span className="text-muted-foreground tabular-nums">
            {live.working}/{live.coins}
          </span>
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-80">
        <PopoverHeader>
          <PopoverTitle>{live.walletLabel}</PopoverTitle>
        </PopoverHeader>

        <div className="grid gap-1.5 text-xs">
          <Row
            label="Money"
            value={live.real ? "Real money" : "Practice money"}
          />
          <Row
            label="It may use"
            value={live.capUsd === null ? "Not set" : formatUsd(live.capUsd)}
          />
          <Row
            label="Coins working"
            value={`${live.working} of ${live.coins}`}
          />
          {live.startedAt === null ? null : (
            <Row
              label="Switched on"
              value={formatRelativeTime(new Date(live.startedAt))}
            />
          )}
        </div>

        <p className="text-[11px] leading-4 text-muted-foreground">
          It places a ladder on each coin as that coin finds a base, and keeps
          going with nothing open. Stopping calls off the{" "}
          {plural(live.working, "ladder", "ladders")} it placed that have not
          bought anything; a coin already held keeps its position, its stop and
          its target.
        </p>

        {/* Two situations, two sentences. An edit to a live flow is worth a
            warning because the edit is not trading. A canvas set back to
            pretend money is not that at all — it is a backtest being drawn
            beside a flow that happens to still be on. */}
        {live.drawingChanged ? (
          <p className="text-xs text-destructive">
            You have changed this flow since switching it on, and those changes
            are not trading. It is still using the coins and settings it started
            with. Stop it and start it again to use the new ones.
          </p>
        ) : live.drawnIsBacktest ? (
          <p className="text-xs text-muted-foreground">
            The canvas is set to pretend money now, which is for backtesting.
            That does not stop this — it is still trading.
          </p>
        ) : null}

        <Button
          type="button"
          variant="outline"
          className="w-full"
          disabled={busy}
          onClick={stop}
        >
          {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
          Stop this flow
        </Button>
      </PopoverContent>
    </Popover>
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
