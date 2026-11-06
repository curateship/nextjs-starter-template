import * as React from "react"
import { Loader2Icon, NotebookPenIcon, RotateCcwIcon, Trash2Icon } from "lucide-react"

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
import { loadBin, purgeActivity, restoreActivity, type BinEntry, type BinNote } from "@/lib/api/travel/trip-admin"
import { purgeNote, restoreNote } from "@/lib/api/travel/trip-notes"
import { noteFirstLine } from "@/lib/travel/notes"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { getTravelErrorMessage } from "@/lib/travel/errors"
import { showErrorToast } from "@/lib/toast/error-toast"

/** "today", "yesterday", "4 days ago". */
function ago(iso: string) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / (24 * 60 * 60 * 1000))
  return days <= 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`
}

/** One row of the bin: a deleted card, or a deleted trip note (Travel features 4, part 6). */
type BinItem = { kind: "activity"; entry: BinEntry } | { kind: "note"; entry: BinNote }

const itemName = (item: BinItem) => (item.kind === "activity" ? item.entry.title : noteFirstLine(item.entry.body))

/**
 * The trip's bin (task part 38), copied from Project's: deleted activities
 * and deleted trip notes (Travel features 4, part 6; Tyler, 6 Nov 2026: "Same
 * Bin as cards") stay 30 days, newest first. Put back returns a card to the
 * end of its old day, or to Ideas when that day is gone, and a note to the
 * notes list. Delete for good asks first on the row itself, since it can't be
 * undone and a window over this one would be a window inside a window.
 */
export function BinDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { page, typesById, refresh, openActivity } = useTrip()
  const [entries, setEntries] = React.useState<BinItem[] | null>(null)
  const [run, busy] = useAsyncAction(getTravelErrorMessage)
  const [working, setWorking] = React.useState<string | null>(null)
  const [purging, setPurging] = React.useState<BinItem | null>(null)

  React.useEffect(() => {
    if (!open) return
    let alive = true
    loadBin(page.trip.id)
      .then((loaded) => {
        if (!alive) return
        const items: BinItem[] = [
          ...loaded.activities.map((entry): BinItem => ({ kind: "activity", entry })),
          ...loaded.notes.map((entry): BinItem => ({ kind: "note", entry })),
        ]
        setEntries(items.sort((a, b) => b.entry.deletedAt.localeCompare(a.entry.deletedAt)))
      })
      .catch((error: unknown) => showErrorToast(getTravelErrorMessage(error)))
    return () => {
      alive = false
    }
  }, [open, page.trip.id])

  async function act(item: BinItem, kind: "restore" | "purge") {
    const { id } = item.entry
    const name = itemName(item)
    setWorking(id)
    const ok = await run(
      async () => {
        if (item.kind === "activity") await (kind === "restore" ? restoreActivity(id) : purgeActivity(id))
        else await (kind === "restore" ? restoreNote(id) : purgeNote(id))
        await refresh()
      },
      kind === "restore" ? `${name} is back.` : `${name} deleted for good.`
    )
    setWorking(null)
    if (!ok) return
    setEntries((was) => (was ?? []).filter((each) => each.entry.id !== id))
    if (kind === "restore" && item.kind === "activity") openActivity(id)
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent variant="admin" className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Bin</DialogTitle>
          <DialogDescription>Deleted activities and notes stay here for 30 days, then go for good.</DialogDescription>
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
                  {entries.map((item) => (
                    <li key={item.entry.id} className="flex min-w-0 items-center gap-3 py-2">
                      {item.kind === "activity" ? (
                        <ActivityTypeIcon type={typeOf(item.entry, typesById)} />
                      ) : (
                        <NotebookPenIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                      )}
                      <span className="grid min-w-0 flex-1">
                        <span className="truncate text-sm font-medium">{itemName(item)}</span>
                        <span className="truncate text-xs text-muted-foreground">
                          {item.kind === "note"
                            ? "Note"
                            : item.entry.day === null || item.entry.day > page.trip.days
                              ? "Ideas"
                              : dayLabel(item.entry.day, page.trip.startDate)}{" "}
                          · deleted {ago(item.entry.deletedAt)}
                        </span>
                      </span>
                      {purging?.entry.id === item.entry.id ? (
                        <>
                          <span className="shrink-0 text-xs text-muted-foreground">Delete for good?</span>
                          <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            disabled={busy}
                            onClick={() => {
                              setPurging(null)
                              void act(item, "purge")
                            }}
                          >
                            Delete
                          </Button>
                          <Button type="button" variant="ghost" size="sm" onClick={() => setPurging(null)}>
                            Cancel
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void act(item, "restore")}>
                            {working === item.entry.id ? <Loader2Icon className="size-4 animate-spin" /> : <RotateCcwIcon className="size-4" />}
                            Put back
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={`Delete ${itemName(item)} for good`}
                            disabled={busy}
                            onClick={() => setPurging(item)}
                          >
                            <Trash2Icon className="size-4" />
                          </Button>
                        </>
                      )}
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
