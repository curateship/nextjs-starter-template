import * as React from "react"
import { CalendarPlusIcon, CheckIcon, CopyIcon, RotateCcwIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { LoadingRow } from "@/components/ui/loading-row"
import { getCalendarLink, replaceCalendarLink, type CalendarLink } from "@/lib/api/travel/calendar"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { getTravelErrorMessage } from "@/lib/travel/errors"
import { showErrorToast } from "@/lib/toast/error-toast"

type LinkState = { kind: "loading" } | { kind: "error"; message: string } | { kind: "ready"; link: CalendarLink }

/**
 * Add to phone calendar (task part 45). Shows the trip's calendar link, which
 * Apple and Google Calendar subscribe to so later edits reach the phone. Reset
 * link swaps the secret in the address, after asking, and the old link stops
 * working. A trip with no start date has no dates to put events on, so the
 * window says to add one first.
 */
export function CalendarLinkDialog({
  open,
  onClose,
  tripId,
  hasStartDate,
}: {
  open: boolean
  onClose: () => void
  tripId: string
  hasStartDate: boolean
}) {
  const [state, setState] = React.useState<LinkState>({ kind: "loading" })
  const [copied, setCopied] = React.useState(false)
  const [confirmReset, setConfirmReset] = React.useState(false)
  const [run, resetting] = useAsyncAction(getTravelErrorMessage)

  const load = React.useCallback(async () => {
    setState({ kind: "loading" })
    try {
      setState({ kind: "ready", link: await getCalendarLink(tripId) })
    } catch (error) {
      setState({ kind: "error", message: getTravelErrorMessage(error) })
    }
  }, [tripId])

  // Asks for the link each time the window opens, so a reset made elsewhere shows.
  React.useEffect(() => {
    if (!open || !hasStartDate) return
    let alive = true
    getCalendarLink(tripId).then(
      (link) => {
        if (alive) setState({ kind: "ready", link })
      },
      (error: unknown) => {
        if (alive) setState({ kind: "error", message: getTravelErrorMessage(error) })
      }
    )
    return () => {
      alive = false
    }
  }, [open, hasStartDate, tripId])

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2_000)
    } catch {
      showErrorToast("The link couldn't be copied. Select it and copy it instead.")
    }
  }

  async function reset() {
    await run(async () => {
      const link = await replaceCalendarLink(tripId)
      setState({ kind: "ready", link })
    })
    setConfirmReset(false)
  }

  return (
    <>
      {/* One window at a time: this one steps aside while Reset link asks. */}
      <Dialog open={open && !confirmReset} onOpenChange={(next) => (next ? null : onClose())}>
        <DialogContent variant="admin" className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add to phone calendar</DialogTitle>
            <DialogDescription>
              Subscribe to this link in Apple or Google Calendar. Each activity with a start time shows as an event, and
              changes reach your phone the next time its calendar checks.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Card size="sm">
              <CardHeader>
                <CardTitle>Calendar link</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4">
                {!hasStartDate ? (
                  <p className="text-sm text-muted-foreground">
                    Add a start date first, from the ⋮ at the top of the trip's left panel.
                  </p>
                ) : state.kind === "loading" ? (
                  <LoadingRow label="Making the link" />
                ) : state.kind === "error" ? (
                  <div className="grid gap-2">
                    <p className="text-sm text-muted-foreground">{state.message}</p>
                    <Button type="button" variant="outline" className="w-fit" onClick={() => void load()}>
                      Try again
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="grid gap-2">
                      <Label htmlFor="trip-calendar-link">Link</Label>
                      <div className="flex gap-2">
                        <Input
                          id="trip-calendar-link"
                          readOnly
                          value={state.link.url}
                          onFocus={(event) => event.currentTarget.select()}
                        />
                        <Button type="button" variant="outline" onClick={() => void copy(state.link.url)}>
                          {copied ? <CheckIcon className="size-4" /> : <CopyIcon className="size-4" />}
                          {copied ? "Copied" : "Copy"}
                        </Button>
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Anyone with this link can see the trip's timed activities. Reset it to stop an old copy working.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Button asChild>
                        <a href={state.link.webcalUrl}>
                          <CalendarPlusIcon className="size-4" />
                          Open in calendar
                        </a>
                      </Button>
                      <Button type="button" variant="outline" onClick={() => setConfirmReset(true)}>
                        <RotateCcwIcon className="size-4" />
                        Reset link
                      </Button>
                    </div>
                  </>
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
      <ConfirmDialog
        open={open && confirmReset}
        onOpenChange={(next) => {
          if (!next && !resetting) setConfirmReset(false)
        }}
        title="Reset the calendar link?"
        description="The old link stops working. Any calendar subscribed to it stops getting changes until you subscribe again with the new link."
        confirmLabel="Reset link"
        destructive
        loading={resetting}
        onConfirm={() => void reset()}
      />
    </>
  )
}
