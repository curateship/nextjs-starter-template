import * as React from "react"
import { useNavigate } from "@tanstack/react-router"
import { Loader2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { FormDialog } from "@/components/ui/form-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { copyTripAs } from "@/lib/api/travel/trip-admin"
import type { TripListRow } from "@/lib/api/travel/trips"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { useLastValue } from "@/lib/hooks/use-last-value"
import { getTravelErrorMessage } from "@/lib/travel/errors"
import { TRIP_NAME_MAX } from "@/lib/travel/rules"
import { showErrorToast } from "@/lib/toast/error-toast"

/**
 * Copy trip (task part 39), from the copy button on a Trips row, copied from
 * Project's Copy project. It asks for the new name, starting as "Copy of
 * Tokyo" and selected, so typing replaces it. The copy opens straight away.
 */
export function CopyTripDialog({ trip, onClose }: { trip: TripListRow | null; onClose: () => void }) {
  const navigate = useNavigate()
  const closing = useLastValue(trip)
  const shown = trip ?? closing
  const [name, setName] = React.useState("")
  const [openedFor, setOpenedFor] = React.useState<string | null>(null)
  if (trip && openedFor !== trip.id) {
    setOpenedFor(trip.id)
    setName(`Copy of ${trip.name}`.slice(0, TRIP_NAME_MAX))
  }
  if (!trip && openedFor !== null) setOpenedFor(null)
  const [run, busy] = useAsyncAction(getTravelErrorMessage)

  async function copy() {
    if (!trip) return
    if (!name.trim()) {
      showErrorToast("Give the copy a name.")
      return
    }
    let id = ""
    const ok = await run(async () => {
      id = (await copyTripAs(trip.id, name)).id
    }, "Trip copied.")
    if (!ok) return
    onClose()
    await navigate({ to: "/trips/$tripId", params: { tripId: id } })
  }

  return (
    <FormDialog open={trip !== null} dirty={false} busy={busy} onClose={onClose}>
      {(requestClose) => (
        <DialogContent variant="admin" className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Copy trip</DialogTitle>
            <DialogDescription>
              The copy keeps the days and activities. Dates, bookings, files and the journal stay with {shown?.name ?? "the trip"}.
            </DialogDescription>
          </DialogHeader>
          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(event) => {
              event.preventDefault()
              void copy()
            }}
          >
            <DialogBody>
              <Card size="sm">
                <CardHeader>
                  <CardTitle>New trip</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="copy-trip-name">Name</Label>
                    <Input
                      id="copy-trip-name"
                      value={name}
                      maxLength={TRIP_NAME_MAX}
                      autoFocus
                      onFocus={(event) => event.target.select()}
                      onChange={(event) => setName(event.target.value)}
                    />
                  </div>
                </CardContent>
              </Card>
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={requestClose} disabled={busy}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
                Copy trip
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      )}
    </FormDialog>
  )
}
