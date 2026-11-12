import * as React from "react"
import { useNavigate } from "@tanstack/react-router"
import { Loader2Icon } from "lucide-react"

import { draftWhenOpened } from "@/components/travel/draft-on-arrival"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { DatePicker } from "@/components/ui/date-picker"
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
import { NumberField } from "@/components/ui/number-field"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { makeTrip } from "@/lib/api/travel/trips"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { isoToLocalDate, localDateToIso } from "@/lib/travel/dates"
import { getTravelErrorMessage } from "@/lib/travel/errors"
import { CURRENCIES, MAX_TRIP_DAYS, TRIP_NAME_MAX, type Currency } from "@/lib/travel/rules"
import { showErrorToast } from "@/lib/toast/error-toast"

/**
 * New trip asks for a name and a number of days. Dates are optional and can
 * be added later (Tyler, 2 Nov 2026), and the currency is the trip's one
 * currency for every cost and its budget.
 */
export function NewTripDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate()
  const [name, setName] = React.useState("")
  const [destination, setDestination] = React.useState("")
  const [days, setDays] = React.useState(5)
  const [currency, setCurrency] = React.useState<Currency>("USD")
  const [startDate, setStartDate] = React.useState<string | null>(null)
  const [draft, setDraft] = React.useState(false)
  const [invalid, setInvalid] = React.useState(false)
  const [destinationInvalid, setDestinationInvalid] = React.useState(false)
  const [run, saving] = useAsyncAction(getTravelErrorMessage)
  const dirty = Boolean(name.trim() || destination.trim() || startDate)

  function close() {
    setName("")
    setDestination("")
    setDays(5)
    setCurrency("USD")
    setStartDate(null)
    setDraft(false)
    setInvalid(false)
    setDestinationInvalid(false)
    onClose()
  }

  async function create() {
    if (!name.trim()) {
      setInvalid(true)
      showErrorToast("Give the trip a name.")
      return
    }
    if (draft && !destination.trim()) {
      setDestinationInvalid(true)
      showErrorToast("Add a destination, so the AI knows where to plan.")
      return
    }
    let tripId = ""
    const ok = await run(async () => {
      tripId = (await makeTrip({ name, days, currency, startDate, destination: destination || null })).id
    })
    if (!ok) return
    // The trip opens on its drafted plan, still to be checked before anything is saved (Travel features part 7).
    if (draft) draftWhenOpened(tripId)
    close()
    await navigate({ to: "/trips/$tripId", params: { tripId } })
  }

  return (
    <FormDialog open={open} dirty={dirty} busy={saving} onClose={close}>
      {(requestClose) => (
        <DialogContent variant="admin" className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New trip</DialogTitle>
            <DialogDescription>Dates are optional. Plan the days now and add dates later.</DialogDescription>
          </DialogHeader>
          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(event) => {
              event.preventDefault()
              void create()
            }}
          >
            <DialogBody>
              <Card size="sm">
                <CardHeader>
                  <CardTitle>Trip</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="new-trip-name">Name</Label>
                    <Input
                      id="new-trip-name"
                      value={name}
                      maxLength={TRIP_NAME_MAX}
                      placeholder="Tokyo in spring"
                      aria-invalid={invalid || undefined}
                      onChange={(event) => {
                        setName(event.target.value)
                        setInvalid(false)
                      }}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="new-trip-destination">Destination</Label>
                    <Input
                      id="new-trip-destination"
                      value={destination}
                      maxLength={120}
                      placeholder="Tokyo, Japan"
                      aria-invalid={destinationInvalid || undefined}
                      onChange={(event) => {
                        setDestination(event.target.value)
                        setDestinationInvalid(false)
                      }}
                    />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <NumberField
                      id="new-trip-days"
                      label="Days"
                      value={days}
                      min={1}
                      max={MAX_TRIP_DAYS}
                      onChange={setDays}
                    />
                    <div className="grid gap-2">
                      <Label htmlFor="new-trip-currency">Currency</Label>
                      <Select value={currency} onValueChange={(value) => setCurrency(value as Currency)}>
                        <SelectTrigger id="new-trip-currency" className="w-full sm:w-fit">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CURRENCIES.map((code) => (
                            <SelectItem key={code} value={code}>
                              {code}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="new-trip-start">Start date</Label>
                    <DatePicker
                      id="new-trip-start"
                      value={isoToLocalDate(startDate)}
                      placeholder="No dates yet"
                      onChange={(date) => setStartDate(localDateToIso(date))}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="new-trip-draft"
                      checked={draft}
                      onCheckedChange={(on) => setDraft(on === true)}
                    />
                    <Label htmlFor="new-trip-draft" className="font-normal">
                      Fill it with a first plan, drafted by AI
                    </Label>
                  </div>
                </CardContent>
              </Card>
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={requestClose} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? <Loader2Icon className="size-4 animate-spin" /> : null}
                Create trip
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      )}
    </FormDialog>
  )
}
