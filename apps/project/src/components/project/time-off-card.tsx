import * as React from "react"
import { useRouter } from "@tanstack/react-router"
import { Loader2Icon, PlaneIcon, PlusIcon, Trash2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { DatePicker } from "@/components/ui/date-picker"
import { ErrorRow } from "@/components/ui/error-row"
import { Label } from "@/components/ui/label"
import { LoadingRow } from "@/components/ui/loading-row"
import { addDaysOff, loadDaysOff, removeDaysOff, type TimeOff } from "@/lib/api/project/checkins"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { keyFromDate } from "@/lib/project/dates"
import { dayLabel, dayRangeLabel } from "@/lib/project/days"
import { getProjectErrorMessage } from "@/lib/project/errors"
import { showErrorToast } from "@/lib/toast/error-toast"

/** "Oct 14", or "Oct 14 to Oct 16", with the year only when it isn't this one. */
const spanLabel = (entry: TimeOff) => dayRangeLabel(entry.firstDay, entry.lastDay)

/**
 * Days off for one person: my own on My dashboard, or a teammate's in their
 * window on the Members page for the owner and admins. On those days there
 * is no reminder and the Team dashboard reads "Away".
 */
export function TimeOffSection({
  userId,
  idPrefix,
  compact = false,
  initial,
}: {
  /** Left out for my own. */
  userId?: string
  idPrefix: string
  /**
   * My dashboard's card: "No time off coming up." and a small Add on one
   * line, as Tyler drew it on 13 Oct 2026.
   */
  compact?: boolean
  /**
   * The days off the page loaded with it. Without them the card loads its own
   * and shows "Loading time off…"; My dashboard passes them, since its card
   * folds shut, and opening it again would flash the load (Tyler, 14 Oct 2026).
   */
  initial?: TimeOff[]
}) {
  const router = useRouter()
  const [entries, setEntries] = React.useState<TimeOff[] | null>(initial ?? null)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [reloads, setReloads] = React.useState(0)
  const [removing, setRemoving] = React.useState<TimeOff | null>(null)
  const [adding, setAdding] = React.useState(false)
  const [first, setFirst] = React.useState<Date | undefined>()
  const [last, setLast] = React.useState<Date | undefined>()
  const [run, busy] = useAsyncAction(getProjectErrorMessage)
  // The page's own copy is fresh on the first open; an add or remove loads again.
  const seeded = React.useRef(initial !== undefined)

  React.useEffect(() => {
    if (seeded.current) {
      seeded.current = false
      return
    }
    let live = true
    loadDaysOff(userId).then(
      (found) => {
        if (!live) return
        setEntries(found)
        setLoadError(null)
      },
      (error: unknown) => live && setLoadError(getProjectErrorMessage(error))
    )
    return () => {
      live = false
    }
  }, [userId, reloads])

  async function add() {
    const firstDay = keyFromDate(first)
    const lastDay = keyFromDate(last ?? first)
    if (!firstDay || !lastDay) {
      showErrorToast("Pick the first day off.")
      return
    }
    const ok = await run(() => addDaysOff({ userId, firstDay, lastDay }), "Time off saved.")
    if (!ok) return
    setAdding(false)
    setFirst(undefined)
    setLast(undefined)
    setReloads((n) => n + 1)
    await router.invalidate()
  }

  async function remove(entry: TimeOff) {
    if (await run(() => removeDaysOff(entry.id), "Time off removed.")) {
      setRemoving(null)
      setReloads((n) => n + 1)
      await router.invalidate()
    }
  }

  return (
    <div className="grid gap-3">
      {entries === null && loadError ? (
        <ErrorRow
          message={loadError}
          className="py-4"
          onRetry={() => {
            setLoadError(null)
            setReloads((n) => n + 1)
          }}
        />
      ) : entries === null ? (
        <LoadingRow label="Loading time off…" />
      ) : entries.length === 0 ? (
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">No time off coming up.</p>
          {compact && !adding ? (
            <Button type="button" variant="outline" size="sm" onClick={() => setAdding(true)}>
              <PlusIcon className="size-4" />
              Add
            </Button>
          ) : null}
        </div>
      ) : (
        <ul className="grid gap-2">
          {entries.map((entry) => (
            <li key={entry.id} className="flex items-center gap-2 text-sm">
              <PlaneIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="min-w-0 flex-1">{spanLabel(entry)}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Remove time off from ${dayLabel(entry.firstDay)}`}
                disabled={busy}
                onClick={() => setRemoving(entry)}
              >
                <Trash2Icon className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
      {adding ? (
        <div className="grid gap-3">
          <div className="grid gap-2">
            <Label htmlFor={`${idPrefix}-first`}>First day off</Label>
            <DatePicker id={`${idPrefix}-first`} value={first} onChange={setFirst} placeholder="Pick a day" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`${idPrefix}-last`}>Last day off</Label>
            <DatePicker
              id={`${idPrefix}-last`}
              value={last}
              onChange={setLast}
              placeholder="Same as the first"
            />
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => setAdding(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={busy} onClick={() => void add()}>
              {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
              Save time off
            </Button>
          </div>
        </div>
      ) : compact && entries?.length === 0 ? null : (
        <div>
          <Button type="button" variant="outline" onClick={() => setAdding(true)}>
            <PlusIcon className="size-4" />
            Add time off
          </Button>
        </div>
      )}
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open && !busy) setRemoving(null)
        }}
        title={removing ? `Remove time off for ${spanLabel(removing)}?` : "Remove time off?"}
        description="The check-in reminder and the Team dashboard treat those days as normal again."
        confirmLabel="Remove time off"
        loading={busy}
        onConfirm={() => removing && void remove(removing)}
      />
    </div>
  )
}
