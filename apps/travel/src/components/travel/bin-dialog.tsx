import * as React from "react"
import { Loader2Icon, RotateCcwIcon, Trash2Icon } from "lucide-react"

import { dayLabel } from "@/components/travel/new-activity"
import { typeOf, useTrip } from "@/components/travel/trip-context"
import { ActivityTypeIcon } from "@/components/travel/type-icon"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { LoadingRow } from "@/components/ui/loading-row"
import { loadBin, purgeActivity, restoreActivity, type BinEntry } from "@/lib/api/travel/trip-admin"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { getTravelErrorMessage } from "@/lib/travel/errors"
import { showErrorToast } from "@/lib/toast/error-toast"

/** "today", "yesterday", "4 days ago". */
function ago(iso: string) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / (24 * 60 * 60 * 1000))
  return days <= 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`
}

/**
 * The trip's bin (task part 38), copied from Project's: deleted activities
 * stay 30 days. Put back returns one to the end of its old day, or to Ideas
 * when that day is gone. Delete for good empties it now.
 */
export function BinDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { page, typesById, refresh, openActivity } = useTrip()
  const [entries, setEntries] = React.useState<BinEntry[] | null>(null)
  const [run, busy] = useAsyncAction(getTravelErrorMessage)
  const [working, setWorking] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open) return
    let alive = true
    loadBin(page.trip.id)
      .then((loaded) => {
        if (alive) setEntries(loaded)
      })
      .catch((error: unknown) => showErrorToast(getTravelErrorMessage(error)))
    return () => {
      alive = false
    }
  }, [open, page.trip.id])

  async function act(entry: BinEntry, kind: "restore" | "purge") {
    setWorking(entry.id)
    const ok = await run(
      async () => {
        await (kind === "restore" ? restoreActivity(entry.id) : purgeActivity(entry.id))
        await refresh()
      },
      kind === "restore" ? `${entry.title} is back.` : `${entry.title} deleted for good.`
    )
    setWorking(null)
    if (!ok) return
    setEntries((was) => (was ?? []).filter((item) => item.id !== entry.id))
    if (kind === "restore") openActivity(entry.id)
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent variant="admin" className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Bin</DialogTitle>
          <DialogDescription>Deleted activities stay here for 30 days, then go for good.</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <Card size="sm">
            <CardContent>
              {entries === null ? (
                <LoadingRow label="Loading the bin" />
              ) : entries.length === 0 ? (
                <p className="py-2 text-sm text-muted-foreground">The bin is empty.</p>
              ) : (
                <ul className="grid grid-cols-[minmax(0,1fr)] divide-y">
                  {entries.map((entry) => (
                    <li key={entry.id} className="flex min-w-0 items-center gap-3 py-2">
                      <ActivityTypeIcon type={typeOf(entry, typesById)} />
                      <span className="grid min-w-0 flex-1">
                        <span className="truncate text-sm font-medium">{entry.title}</span>
                        <span className="truncate text-xs text-muted-foreground">
                          {entry.day === null || entry.day > page.trip.days ? "Ideas" : dayLabel(entry.day, page.trip.startDate)} ·
                          deleted {ago(entry.deletedAt)}
                        </span>
                      </span>
                      <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void act(entry, "restore")}>
                        {working === entry.id ? <Loader2Icon className="size-4 animate-spin" /> : <RotateCcwIcon className="size-4" />}
                        Put back
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Delete ${entry.title} for good`}
                        disabled={busy}
                        onClick={() => void act(entry, "purge")}
                      >
                        <Trash2Icon className="size-4" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </DialogBody>
        <DialogFooter>
          <Button type="button" onClick={onClose}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
