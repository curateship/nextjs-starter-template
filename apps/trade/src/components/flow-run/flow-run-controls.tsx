import * as React from "react"
import { useNavigate } from "@tanstack/react-router"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { FlowPauseButton } from "@/components/flow-run/flow-pause-button"
import type { FlowRunReport } from "@/lib/api/trade/flow-runs"
import {
  pauseFlow,
  stopFlow,
  flowActionProblem,
} from "@/lib/api/trade/flow-trading"
import { getRecipe, runRecipe } from "@/lib/api/trade/recipes"
import { showErrorToast } from "@/lib/toast/error-toast"
import { formatDateTime } from "@/lib/format/format-time"

export function FlowRunControls({
  head,
  onPaused,
  onRefresh,
  onWorking,
}: {
  head: FlowRunReport["head"]
  onPaused: (paused: boolean) => void
  onWorking?: (working: boolean) => void
  onRefresh: () => Promise<void>
}) {
  const navigate = useNavigate()
  const [busy, setBusy] = React.useState(false)
  const pending = React.useRef(false)
  const [confirm, setConfirm] = React.useState<"stop" | "restart" | null>(null)
  const [changedAt, setChangedAt] = React.useState<string | null>(null)
  const act = async (action: () => Promise<void>) => {
    if (pending.current) return
    pending.current = true
    onWorking?.(true)
    setBusy(true)
    try {
      await action()
    } catch (error) {
      showErrorToast(flowActionProblem(error, head.walletLabel))
    } finally {
      pending.current = false
      onWorking?.(false)
      setBusy(false)
    }
  }
  const pause = () =>
    void act(async () => {
      onPaused(!head.paused)
      try {
        const result = await pauseFlow(head.automationId, !head.paused)
        toast.success(result.summary)
      } catch (error) {
        onPaused(head.paused)
        throw error
      }
      await onRefresh()
    })
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {head.status === "running" ? (
          <>
            <FlowPauseButton paused={head.paused} busy={busy} onClick={pause} />
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setConfirm("stop")}
            >
              Stop
            </Button>
          </>
        ) : head.status === "stopping" ? (
          <span role="status">Stopping</span>
        ) : (
          <Button
            disabled={busy}
            onClick={() =>
              void act(async () => {
                const recipe = await getRecipe(head.automationId)
                setChangedAt(
                  head.stoppedAt !== null &&
                    Date.parse(recipe.updated_at) > head.stoppedAt
                    ? recipe.updated_at
                    : null
                )
                setConfirm("restart")
              })
            }
          >
            Run again
          </Button>
        )}
      </div>
      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => {
          if (!open) setConfirm(null)
        }}
        title={
          confirm === "restart" ? "Run this recipe again?" : "Stop this bot?"
        }
        description={
          confirm === "restart" ? (
            <>
              Starts the recipe as it is today, not as it was when this run
              began. Uses {head.walletLabel} with{" "}
              {head.real ? "real" : "practice"} money.
              {changedAt
                ? ` Recipe last changed ${formatDateTime(new Date(changedAt))}.`
                : ""}
            </>
          ) : (
            "The bot stops looking for coins and calls off the orders that have not bought anything. Coins already held keep their stops and targets. Use Pause to leave every order where it is."
          )
        }
        confirmLabel={confirm === "restart" ? "Run again" : "Stop it"}
        destructive={false}
        loading={busy}
        onConfirm={() =>
          void act(async () => {
            if (confirm === "restart") {
              const result = await runRecipe(
                head.automationId,
                crypto.randomUUID(),
                undefined,
                head.id
              )
              if (!result.started || !result.runId) {
                showErrorToast(result.summary)
                return
              }
              setConfirm(null)
              await navigate({
                to: "/flow-runs/$runId",
                params: { runId: result.runId },
              })
            } else {
              const result = await stopFlow(head.automationId)
              toast.success(result.summary)
              setConfirm(null)
              await onRefresh()
            }
          })
        }
      />
    </>
  )
}
