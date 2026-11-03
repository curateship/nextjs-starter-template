import * as React from "react"
import { useNavigate } from "@tanstack/react-router"
import { Loader2Icon, Trash2Icon } from "lucide-react"

import { useTrip } from "@/components/travel/trip-context"
import { TimeZoneSelect } from "@/components/travel/time-zone-select"
import { PhotoCreditLine, UnsplashPicker } from "@/components/travel/unsplash-picker"
import { ImageUpload } from "@/components/shared/image-upload"
import { DocumentEditor } from "@/components/shared/rich-text-editor"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
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
import { FieldLabel } from "@/components/ui/field-label"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { removeTrip, saveTrip } from "@/lib/api/travel/trips"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { isoToLocalDate, localDateToIso } from "@/lib/travel/dates"
import { getTravelErrorMessage } from "@/lib/travel/errors"
import { readNotes } from "@/lib/travel/notes"
import {
  CURRENCIES,
  TRAVEL_MODES,
  TRAVEL_MODE_LABEL,
  TRIP_NAME_MAX,
  TRIP_STATUSES,
  TRIP_STATUS_LABEL,
  type Currency,
  type TravelMode,
  type TripStatus,
} from "@/lib/travel/rules"
import { showErrorToast } from "@/lib/toast/error-toast"

const WHERE_I_AM = ""

/**
 * Trip settings, from the cog on the trip's left panel: the trip's name,
 * destination, dates, currency, time zone, how travel times are worked out,
 * its status, and Delete trip. The number of days changes on the board
 * itself, a day at a time (task part 10).
 */
export function TripSettingsDialog({
  open,
  onClose,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  /** After a save, so the left panel's description redraws from it. */
  onSaved?: () => void
}) {
  const { page, refresh } = useTrip()
  const { trip } = page
  const navigate = useNavigate()
  const [form, setForm] = React.useState(() => formOf(trip))
  const [openedFor, setOpenedFor] = React.useState<string | null>(null)
  // Each opening starts from the trip as saved now.
  const stamp = open ? JSON.stringify(formOf(trip)) : null
  if (open && openedFor !== stamp) {
    setOpenedFor(stamp)
    setForm(formOf(trip))
  }
  const [confirmDelete, setConfirmDelete] = React.useState(false)
  const [nameInvalid, setNameInvalid] = React.useState(false)
  const [run, saving] = useAsyncAction(getTravelErrorMessage)
  const dirty = JSON.stringify(form) !== JSON.stringify(formOf(trip))
  const set = <K extends keyof TripForm>(key: K, value: TripForm[K]) => setForm((was) => ({ ...was, [key]: value }))

  async function save() {
    if (!form.name.trim()) {
      setNameInvalid(true)
      showErrorToast("Give the trip a name.")
      return
    }
    const ok = await run(async () => {
      await saveTrip({
        tripId: trip.id,
        name: form.name,
        destination: form.destination.trim() || null,
        startDate: form.startDate,
        currency: form.currency,
        timeZone: form.timeZone || null,
        travelMode: form.travelMode,
        status: form.status,
        tags: readTags(form.tags),
        ...(form.description !== trip.description ? { description: form.description } : {}),
        ...(form.coverUrl !== trip.coverUrl ? { coverUrl: form.coverUrl, coverCredit: form.coverCredit } : {}),
      })
      await refresh()
    }, "Trip saved.")
    if (!ok) return
    onSaved?.()
    onClose()
  }

  async function deleteTrip() {
    const ok = await run(() => removeTrip(trip.id), "Trip deleted.")
    if (!ok) return
    setConfirmDelete(false)
    await navigate({ to: "/trips" })
  }

  return (
    <>
      <FormDialog open={open} dirty={dirty} busy={saving} onClose={onClose}>
        {(requestClose) => (
          <DialogContent variant="admin" className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Trip settings</DialogTitle>
              <DialogDescription>Add or remove days from a day's menu on the board.</DialogDescription>
            </DialogHeader>
            <form
              className="flex min-h-0 flex-1 flex-col"
              onSubmit={(event) => {
                event.preventDefault()
                void save()
              }}
            >
              <DialogBody>
                <Card size="sm">
                  <CardHeader>
                    <CardTitle>Trip</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="trip-name">Name</Label>
                      <Input
                        id="trip-name"
                        value={form.name}
                        maxLength={TRIP_NAME_MAX}
                        aria-invalid={nameInvalid || undefined}
                        onChange={(event) => {
                          set("name", event.target.value)
                          setNameInvalid(false)
                        }}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label id="trip-description-label">Description</Label>
                      <div
                        role="group"
                        aria-labelledby="trip-description-label"
                        className="[&_.page-rte_.tiptap]:!min-h-[5rem] [&_.page-rte_.tiptap]:!px-2.5 [&_.page-rte_.tiptap]:!py-1.5 [&_.page-rte_.tiptap]:!text-sm"
                      >
                        <DocumentEditor
                          value={readNotes(trip.description)}
                          placeholder="Write something about the trip"
                          onChange={(body) => set("description", JSON.stringify(body))}
                        />
                      </div>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="trip-destination">Destination</Label>
                      <Input
                        id="trip-destination"
                        value={form.destination}
                        maxLength={120}
                        onChange={(event) => set("destination", event.target.value)}
                      />
                    </div>
                    <div className="grid gap-2">
                      <FieldLabel htmlFor="trip-tags" hint="Comma between tags, such as Work, Family. They filter the Trips table.">
                        Tags
                      </FieldLabel>
                      <Input
                        id="trip-tags"
                        value={form.tags}
                        maxLength={340}
                        placeholder="Family, Beach"
                        onChange={(event) => set("tags", event.target.value)}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="trip-status">Status</Label>
                      <Select value={form.status} onValueChange={(value) => set("status", value as TripStatus)}>
                        <SelectTrigger id="trip-status" className="w-full sm:w-fit">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TRIP_STATUSES.map((status) => (
                            <SelectItem key={status} value={status}>
                              {TRIP_STATUS_LABEL[status]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </CardContent>
                </Card>
                <Card size="sm">
                  <CardHeader>
                    <CardTitle>Dates and money</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="trip-start">Start date</Label>
                      <div className="flex gap-2">
                        <DatePicker
                          id="trip-start"
                          value={isoToLocalDate(form.startDate)}
                          placeholder="No dates yet"
                          onChange={(date) => set("startDate", localDateToIso(date))}
                        />
                        {form.startDate ? (
                          <Button type="button" variant="outline" onClick={() => set("startDate", null)}>
                            Clear
                          </Button>
                        ) : null}
                      </div>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="trip-time-zone">Time zone</Label>
                      <TimeZoneSelect
                        id="trip-time-zone"
                        value={form.timeZone}
                        pinned={[{ value: WHERE_I_AM, label: "Where I am" }]}
                        onChange={(value) => set("timeZone", value)}
                      />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="grid gap-2">
                        <Label htmlFor="trip-currency">Currency</Label>
                        <Select value={form.currency} onValueChange={(value) => set("currency", value as Currency)}>
                          <SelectTrigger id="trip-currency" className="w-full sm:w-fit">
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
                      <div className="grid gap-2">
                        <Label htmlFor="trip-travel-mode">Getting around</Label>
                        <Select
                          value={form.travelMode}
                          onValueChange={(value) => set("travelMode", value as TravelMode)}
                        >
                          <SelectTrigger id="trip-travel-mode" className="w-full sm:w-fit">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {TRAVEL_MODES.map((mode) => (
                              <SelectItem key={mode} value={mode}>
                                {TRAVEL_MODE_LABEL[mode]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card size="sm">
                  <CardHeader>
                    <CardTitle>Pictures</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-2">
                    <ImageUpload
                      label="Cover photo"
                      value={form.coverUrl ?? ""}
                      aspect="video"
                      fit="cover"
                      className="max-w-48"
                      hint="Shown at the top of the trip and beside it in the Trips table."
                      onChange={(url) => setForm((was) => ({ ...was, coverUrl: url || null, coverCredit: null }))}
                    />
                    {form.coverCredit ? <PhotoCreditLine credit={form.coverCredit} /> : null}
                    <div>
                      <UnsplashPicker
                        startQuery={form.destination || form.name}
                        onPick={(photo) => setForm((was) => ({ ...was, coverUrl: photo.url, coverCredit: photo.credit }))}
                      />
                    </div>
                  </CardContent>
                </Card>
              </DialogBody>
              <DialogFooter>
                <Button
                  type="button"
                  variant="destructive"
                  className="sm:mr-auto"
                  disabled={saving}
                  onClick={() => {
                    // One window at a time: settings closes, then the confirm opens.
                    onClose()
                    setConfirmDelete(true)
                  }}
                >
                  <Trash2Icon className="size-4" />
                  Delete trip
                </Button>
                <Button type="button" variant="outline" onClick={requestClose} disabled={saving}>
                  Cancel
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? <Loader2Icon className="size-4 animate-spin" /> : null}
                  Save changes
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        )}
      </FormDialog>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete ${trip.name}?`}
        description="The trip goes for good, with every activity, file and note on it."
        confirmLabel="Delete trip"
        destructive
        loading={saving}
        onConfirm={() => void deleteTrip()}
      />
    </>
  )
}

type TripForm = ReturnType<typeof formOf>

/** "Work, family , Work" as ["Work", "family"]: trimmed, empty ones dropped, each once. */
function readTags(text: string) {
  return [...new Set(text.split(",").map((tag) => tag.trim()).filter(Boolean))]
}

function formOf(trip: ReturnType<typeof useTrip>["page"]["trip"]) {
  return {
    name: trip.name,
    destination: trip.destination ?? "",
    startDate: trip.startDate,
    currency: trip.currency as Currency,
    timeZone: trip.timeZone ?? WHERE_I_AM,
    travelMode: trip.travelMode,
    status: trip.status,
    coverUrl: trip.coverUrl,
    coverCredit: trip.coverCredit,
    tags: trip.tags.join(", "),
    description: trip.description,
  }
}
