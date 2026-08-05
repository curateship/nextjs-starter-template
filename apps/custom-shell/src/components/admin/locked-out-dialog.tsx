import * as React from "react"
import { LockOpenIcon, RefreshCwIcon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ErrorBanner } from "@/components/ui/error-banner"
import { LoadingRow } from "@/components/ui/loading-row"
import {
  getAdminLocksErrorMessage,
  loadLockedOut,
  unblockRateLimits,
  type LockedOutBlock,
} from "@/lib/api/admin-locks"
import { useAsyncAction } from "@/lib/use-async-action"
import { formatDateTime } from "@/lib/format-time"
import { plural } from "@/lib/plural"

/**
 * Who the sign-in throttle (and its siblings) is currently holding at the
 * door, opened from the Users toolbar, with a one-click way to let a real
 * person back in. Rescuing someone used to take a raw database command.
 */
export function LockedOutDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [blocks, setBlocks] = React.useState<LockedOutBlock[]>([])
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [reloadCount, setReloadCount] = React.useState(0)
  const [confirmKeys, setConfirmKeys] = React.useState<string[] | null>(null)
  const [run, unblocking] = useAsyncAction(getAdminLocksErrorMessage)

  // "Time left" is measured against this clock, refreshed with the list and
  // once a minute while the window sits open — so a block that runs out on its
  // own flips to "Expired" instead of lying.
  const [now, setNow] = React.useState(() => Date.now())
  React.useEffect(() => {
    if (!open) return
    const timer = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(timer)
  }, [open])

  // Reset during render when the window opens, so the first frame already
  // shows the spinner; the effect below only does the fetching. Re-checks
  // ("Check again", the banner's retry) reset in their click handler instead.
  const [wasOpen, setWasOpen] = React.useState(false)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setLoading(true)
      setError(null)
    }
  }

  React.useEffect(() => {
    if (!open) return
    let active = true

    loadLockedOut()
      .then((data) => {
        if (!active) return
        setBlocks(data.blocks)
        setNow(Date.now())
      })
      .catch((loadError) => {
        if (active) setError(getAdminLocksErrorMessage(loadError))
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [open, reloadCount])

  function checkAgain() {
    setLoading(true)
    setError(null)
    setReloadCount((count) => count + 1)
  }

  async function handleUnblock() {
    if (!confirmKeys?.length) return

    await run(async () => {
      const { unblockedCount } = await unblockRateLimits(confirmKeys)
      toast.success(
        unblockedCount === 1
          ? "Unblocked. They can try again right away."
          : `Removed ${unblockedCount} blocks. Everyone can try again right away.`
      )
      const cleared = new Set(confirmKeys)
      setBlocks((current) => current.filter((block) => !cleared.has(block.key)))
      setConfirmKeys(null)
    })
  }

  const confirmBlocks = confirmKeys
    ? blocks.filter((block) => confirmKeys.includes(block.key))
    : []

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent variant="admin" className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Locked out</DialogTitle>
            <DialogDescription>
              Who the too-many-attempts guard is blocking right now. Unblocking
              lets the person try again immediately.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            {error ? (
              <ErrorBanner message={error} onRetry={checkAgain} />
            ) : (
              <Card size="sm">
                <CardHeader>
                  <CardTitle>
                    {loading || blocks.length === 0
                      ? "Active blocks"
                      : `${blocks.length} active ${plural(blocks.length, "block")}`}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <LoadingRow label="Checking for active blocks…" />
                  ) : blocks.length === 0 ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">
                      Nobody is locked out. When someone fails sign-in (or
                      another guarded action) too many times in a row, they
                      show up here.
                    </p>
                  ) : (
                    <ul className="flex flex-col divide-y">
                      {blocks.map((block) => (
                        <li
                          key={block.key}
                          className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
                        >
                          <div className="min-w-0 flex-1">
                            <p
                              className="truncate text-sm font-medium"
                              title={block.who}
                            >
                              {block.who}
                            </p>
                            <p
                              className="truncate text-xs text-muted-foreground"
                              title={`${block.attempts} attempts since ${formatDateTime(block.blockedSince)}, blocked until ${formatDateTime(block.blockedUntil)}`}
                            >
                              {[
                                block.whoDetail,
                                block.what,
                                `${block.attempts} ${plural(block.attempts, "attempt")}`,
                                timeLeftText(block.blockedUntil, now),
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                            </p>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => setConfirmKeys([block.key])}
                            title="Unblock"
                            aria-label={`Unblock ${block.who}`}
                          >
                            <LockOpenIcon className="size-4" />
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            )}
          </DialogBody>
          {/* Unblocks apply themselves row by row, so there is nothing to
              save — a single Done closes the window. */}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="mr-auto"
              disabled={loading}
              onClick={checkAgain}
            >
              <RefreshCwIcon className="size-4" />
              Check again
            </Button>
            {blocks.length > 1 && !loading && !error ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => setConfirmKeys(blocks.map((block) => block.key))}
              >
                <LockOpenIcon className="size-4" />
                Unblock all
              </Button>
            ) : null}
            <Button type="button" onClick={() => onOpenChange(false)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(confirmKeys)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen && !unblocking) setConfirmKeys(null)
        }}
        title={
          confirmBlocks.length === 1
            ? `Unblock ${confirmBlocks[0].who}?`
            : `Unblock all ${confirmBlocks.length} ${plural(confirmBlocks.length, "row")}?`
        }
        description={
          confirmBlocks.length === 1
            ? `The block on ${confirmBlocks[0].what.toLowerCase()} is lifted immediately and the failed-attempt count starts over from zero.`
            : "Every block is lifted immediately, and each failed-attempt count starts over from zero."
        }
        confirmLabel={unblocking ? "Unblocking…" : "Unblock"}
        destructive={false}
        loading={unblocking}
        onConfirm={() => void handleUnblock()}
      />
    </>
  )
}

/** "8 minutes left", "1 hour 12 minutes left" — how much longer the door stays shut. */
function timeLeftText(until: string, now: number) {
  const msLeft = new Date(until).getTime() - now
  if (msLeft <= 0) return "Expired"

  const minutes = Math.ceil(msLeft / 60_000)
  if (minutes < 60) return `${minutes} ${plural(minutes, "minute")} left`

  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  const hoursText = `${hours} ${plural(hours, "hour")}`
  return rest
    ? `${hoursText} ${rest} ${plural(rest, "minute")} left`
    : `${hoursText} left`
}
