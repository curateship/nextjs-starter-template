import * as React from "react"
import { Loader2Icon } from "lucide-react"

import { dayLabel } from "@/components/travel/new-activity"
import { ActivityTypeSelect } from "@/components/travel/type-icon"
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { readBooking, type BookingDraft } from "@/lib/api/travel/booking-email"
import { makeActivity, saveActivity } from "@/lib/api/travel/trips"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import type { ActivityType } from "@/lib/travel/activity-types"
import { formatLongDate } from "@/lib/travel/dates"
import { getTravelErrorMessage } from "@/lib/travel/errors"
import { MAX_TRIP_DAYS, parseMoney } from "@/lib/travel/rules"
import { showErrorToast } from "@/lib/toast/error-toast"

const IDEAS = "ideas"
const EMAIL_MAX = 20_000

type Form = {
  title: string
  typeId: string | null
  day: string
  startTime: string
  nights: string
  placeName: string
  address: string
  cost: string
}

function formOf(draft: BookingDraft): Form {
  return {
    title: draft.title,
    typeId: draft.typeId,
    day: draft.day === null ? IDEAS : String(draft.day),
    startTime: draft.startTime ?? "",
    nights: draft.nights === null ? "" : String(draft.nights),
    placeName: draft.placeName,
    address: draft.address,
    cost: draft.costCents === null ? "" : String(draft.costCents / 100),
  }
}

/**
 * Paste a booking (task part 44). The person pastes a confirmation email and
 * presses Read email. The AI fills in a new activity, which shows here to be
 * checked and changed. Nothing is saved until Create activity.
 */
export function PasteBookingDialog({
  open,
  onClose,
  tripId,
  days,
  startDate,
  types,
  currency,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  tripId: string
  days: number
  startDate: string | null
  types: readonly ActivityType[]
  currency: string
  onCreated: (activityId: string) => void
}) {
  const [email, setEmail] = React.useState("")
  const [draft, setDraft] = React.useState<BookingDraft | null>(null)
  const [form, setForm] = React.useState<Form | null>(null)
  const [emailInvalid, setEmailInvalid] = React.useState(false)
  const [titleInvalid, setTitleInvalid] = React.useState(false)
  const [costInvalid, setCostInvalid] = React.useState(false)
  const [run, busy] = useAsyncAction(getTravelErrorMessage)

  // Each opening starts with an empty box.
  const [wasOpen, setWasOpen] = React.useState(open)
  if (wasOpen !== open) {
    setWasOpen(open)
    if (open) {
      setEmail("")
      setDraft(null)
      setForm(null)
      setEmailInvalid(false)
      setTitleInvalid(false)
      setCostInvalid(false)
    }
  }

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((was) => (was ? { ...was, [key]: value } : was))

  async function read() {
    if (!email.trim()) {
      setEmailInvalid(true)
      showErrorToast("Paste the booking email first.")
      return
    }
    await run(async () => {
      const next = await readBooking({ tripId, text: email })
      setDraft(next)
      setForm(formOf(next))
    })
  }

  async function create() {
    if (!form) return
    if (!form.title.trim()) {
      setTitleInvalid(true)
      showErrorToast("Give the activity a name.")
      return
    }
    const costCents = form.cost.trim() ? parseMoney(form.cost) : null
    if (form.cost.trim() && costCents === null) {
      setCostInvalid(true)
      showErrorToast("Type the cost as a number, such as 120 or 1,240.50.")
      return
    }
    const nights = Number.parseInt(form.nights, 10)
    const day = form.day === IDEAS ? null : Number(form.day)
    let activityId = ""
    const ok = await run(async () => {
      activityId = (
        await makeActivity({
          tripId,
          day,
          title: form.title,
          typeId: form.typeId,
          startTime: day === null ? null : form.startTime || null,
          costCents,
        })
      ).id
      const placeName = form.placeName.trim()
      const address = form.address.trim()
      await saveActivity({
        activityId,
        nights: Number.isInteger(nights) && nights >= 1 && nights <= MAX_TRIP_DAYS ? nights : null,
        place: placeName || address ? { name: placeName, address, lat: null, lng: null, placeId: null } : null,
      })
    }, "Activity created.")
    // When the activity was made but the rest didn't save, it opens anyway so
    // the person fixes it there, rather than pressing again and making two.
    if (!ok && !activityId) return
    onCreated(activityId)
    onClose()
  }

  const dirty = email.trim() !== "" || draft !== null

  return (
    <FormDialog open={open} dirty={dirty} busy={busy} onClose={onClose}>
      {(requestClose) => (
        <DialogContent variant="admin" className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Paste a booking</DialogTitle>
            <DialogDescription>
              {form
                ? "Check what the email said, change anything that's wrong, then create the activity."
                : "Paste a confirmation email for a flight, hotel, table or ticket. AI reads it and fills in a new activity."}
            </DialogDescription>
          </DialogHeader>
          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(event) => {
              event.preventDefault()
              void (form ? create() : read())
            }}
          >
            <DialogBody>
              {!form ? (
                <Card size="sm">
                  <CardHeader>
                    <CardTitle>Booking email</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="paste-booking-email">Email</Label>
                      <Textarea
                        id="paste-booking-email"
                        autoFocus
                        value={email}
                        maxLength={EMAIL_MAX}
                        className="max-h-80"
                        placeholder="Paste the whole email here"
                        aria-invalid={emailInvalid || undefined}
                        onChange={(event) => {
                          setEmail(event.target.value)
                          setEmailInvalid(false)
                        }}
                      />
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <>
                  <Card size="sm">
                    <CardHeader>
                      <CardTitle>Activity</CardTitle>
                    </CardHeader>
                    <CardContent className="grid gap-4">
                      <div className="grid gap-2">
                        <Label htmlFor="paste-booking-title">Name</Label>
                        <Input
                          id="paste-booking-title"
                          value={form.title}
                          maxLength={200}
                          aria-invalid={titleInvalid || undefined}
                          onChange={(event) => {
                            set("title", event.target.value)
                            setTitleInvalid(false)
                          }}
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="paste-booking-type">Type</Label>
                        <ActivityTypeSelect
                          id="paste-booking-type"
                          types={types}
                          value={form.typeId}
                          onChange={(typeId) => set("typeId", typeId)}
                        />
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="grid gap-2">
                          <Label htmlFor="paste-booking-day">Day</Label>
                          <Select value={form.day} onValueChange={(value) => set("day", value)}>
                            <SelectTrigger id="paste-booking-day" className="w-full">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={IDEAS}>Ideas</SelectItem>
                              {Array.from({ length: days }, (_, index) => (
                                <SelectItem key={index} value={String(index + 1)}>
                                  {dayLabel(index + 1, startDate)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="paste-booking-time">Start time</Label>
                          <Input
                            id="paste-booking-time"
                            type="time"
                            value={form.startTime}
                            disabled={form.day === IDEAS}
                            onChange={(event) => set("startTime", event.target.value)}
                          />
                        </div>
                      </div>
                      {draft?.date && draft.day === null ? (
                        <p className="text-sm text-muted-foreground">
                          {startDate
                            ? `The email says ${formatLongDate(draft.date)}, which isn't on this trip, so it goes in Ideas.`
                            : `The email says ${formatLongDate(draft.date)}. The trip has no dates yet, so it goes in Ideas.`}
                        </p>
                      ) : null}
                      <div className="grid gap-2">
                        <Label htmlFor="paste-booking-nights">Nights</Label>
                        <Input
                          id="paste-booking-nights"
                          type="number"
                          inputMode="numeric"
                          min={1}
                          max={MAX_TRIP_DAYS}
                          className="sm:w-32"
                          value={form.nights}
                          onChange={(event) => set("nights", event.target.value)}
                        />
                      </div>
                    </CardContent>
                  </Card>
                  <Card size="sm">
                    <CardHeader>
                      <CardTitle>Place and booking</CardTitle>
                    </CardHeader>
                    <CardContent className="grid gap-4">
                      <div className="grid gap-2">
                        <Label htmlFor="paste-booking-place">Place</Label>
                        <Input
                          id="paste-booking-place"
                          value={form.placeName}
                          maxLength={200}
                          onChange={(event) => set("placeName", event.target.value)}
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="paste-booking-address">Address</Label>
                        <Input
                          id="paste-booking-address"
                          value={form.address}
                          maxLength={400}
                          onChange={(event) => set("address", event.target.value)}
                        />
                      </div>
                      <div className="grid gap-4">
                        <div className="grid gap-2">
                          <Label htmlFor="paste-booking-cost">Cost ({currency})</Label>
                          <Input
                            id="paste-booking-cost"
                            inputMode="decimal"
                            value={form.cost}
                            aria-invalid={costInvalid || undefined}
                            onChange={(event) => {
                              set("cost", event.target.value)
                              setCostInvalid(false)
                            }}
                          />
                        </div>
                      </div>
                      {draft?.otherCost ? (
                        <p className="text-sm text-muted-foreground">
                          {draft.otherCost.currency
                            ? `The email's price is ${draft.otherCost.amount} ${draft.otherCost.currency}, not ${currency}, so it wasn't copied.`
                            : `The email's price is ${draft.otherCost.amount} with no currency named, so it wasn't copied.`}
                        </p>
                      ) : null}
                    </CardContent>
                  </Card>
                </>
              )}
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={requestClose} disabled={busy}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
                {form ? "Create activity" : "Read email"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      )}
    </FormDialog>
  )
}
