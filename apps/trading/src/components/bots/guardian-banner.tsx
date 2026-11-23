import * as React from "react"
import { Loader2Icon, ShieldAlertIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  getGuardianErrorMessage,
  rearmGuardian,
  type GuardianStatus,
} from "@/lib/api/guardian"

const timeFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
})

/**
 * The bots-page trip banner: loud, with the re-arm button. Re-arming only
 * restarts the watching — paused bots stay paused. The quiet "armed" state
 * renders as the Bots table's toolbar chip via `guardianTableStatus`.
 */
export function GuardianBanner({
  guardian,
  onChanged,
}: {
  guardian: GuardianStatus
  onChanged: () => Promise<unknown> | void
}) {
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  if (!guardian.trippedAt) return null

  async function rearm() {
    setBusy(true)
    setError(null)
    try {
      await rearmGuardian()
      await onChanged()
    } catch (rearmError) {
      setError(getGuardianErrorMessage(rearmError))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      <div className="flex flex-wrap items-center gap-2">
        <ShieldAlertIcon className="size-4 shrink-0" />
        <span className="min-w-0 flex-1">
          Guardian tripped {timeFormatter.format(new Date(guardian.trippedAt))}
          {guardian.trippedReason ? ` — ${guardian.trippedReason}` : ""}. Bots
          stay paused until you resume them yourself; re-arming only turns
          the watching back on.
        </span>
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => void rearm()}
        >
          {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
          Re-arm guardian
        </Button>
      </div>
      {error ? <p className="mt-1">{error}</p> : null}
    </div>
  )
}
