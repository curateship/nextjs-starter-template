import * as React from "react"
import { useNavigate } from "@tanstack/react-router"
import { Trash2Icon } from "lucide-react"

import { FoldingMenu, MenuAction, MenuLine, MenuSection, useOpenSections } from "@/components/travel/folding-menu"
import { SavingInput } from "@/components/travel/saving-fields"
import { TimeZoneSelect } from "@/components/travel/time-zone-select"
import { useSaveTrip } from "@/components/travel/trip-budget-card"
import { useTrip } from "@/components/travel/trip-context"
import { PhotoCreditLine, UnsplashPicker } from "@/components/travel/unsplash-picker"
import { ImageUpload } from "@/components/shared/image-upload"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { DatePicker } from "@/components/ui/date-picker"
import { FieldLabel } from "@/components/ui/field-label"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { removeTrip } from "@/lib/api/travel/trips"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { formatLongDate, isoToLocalDate, localDateToIso } from "@/lib/travel/dates"
import { getTravelErrorMessage } from "@/lib/travel/errors"
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

type Section = "name" | "destination" | "tags" | "status" | "start" | "zone" | "currency" | "mode" | "cover"

/**
 * The trip's ⋮ menu, at the top of its left panel, where the cog and its
 * Trip settings window were (Tyler, 3 Nov 2026: "change this to 3 vertical
 * dot and isntead of modal, make it into a dropdown and using the same ui and
 * spacing as the previous dropdown"). It is Travel's one ⋮ menu, the same
 * as an activity's: a folding row per setting, each saving itself, then a
 * line and Delete trip in red. The description isn't in it: it is written in
 * place right under the panel's header. The number of days changes on the
 * board, a day at a time (task part 10).
 */
export function TripMenu() {
  const { page } = useTrip()
  const { trip } = page
  const navigate = useNavigate()
  const save = useSaveTrip()
  const [open, setOpen] = React.useState(false)
  const [shown, toggle] = useOpenSections<Section>()
  const [confirmDelete, setConfirmDelete] = React.useState(false)
  const [run, deleting] = useAsyncAction(getTravelErrorMessage)

  async function deleteTrip() {
    const ok = await run(() => removeTrip(trip.id), "Trip deleted.")
    if (!ok) return
    setConfirmDelete(false)
    await navigate({ to: "/trips" })
  }

  const row = (section: Section) => ({ open: shown.has(section), onToggle: () => toggle(section) })

  return (
    <>
      <FoldingMenu label="Trip settings" align="start" open={open} onOpenChange={setOpen}>
        <MenuSection label="Name" value={trip.name} {...row("name")}>
          <div className="grid gap-2">
            <Label htmlFor="trip-name">Name</Label>
            <SavingInput
              id="trip-name"
              value={trip.name}
              maxLength={TRIP_NAME_MAX}
              onSave={(name) => {
                if (!name.trim()) {
                  showErrorToast("Give the trip a name.")
                  return Promise.resolve(false)
                }
                return save({ name })
              }}
            />
          </div>
        </MenuSection>
        <MenuSection label="Destination" value={trip.destination || "Not set"} {...row("destination")}>
          <div className="grid gap-2">
            <Label htmlFor="trip-destination">Destination</Label>
            <SavingInput
              id="trip-destination"
              value={trip.destination ?? ""}
              maxLength={120}
              onSave={(destination) => save({ destination: destination.trim() || null })}
            />
          </div>
        </MenuSection>
        <MenuSection label="Tags" value={trip.tags.join(", ") || "None"} {...row("tags")}>
          <div className="grid gap-2">
            <FieldLabel htmlFor="trip-tags" hint="Comma between tags, such as Work, Family. They filter the Trips table.">
              Tags
            </FieldLabel>
            <SavingInput
              id="trip-tags"
              value={trip.tags.join(", ")}
              maxLength={340}
              placeholder="Family, Beach"
              onSave={(text) => save({ tags: readTags(text) })}
            />
          </div>
        </MenuSection>
        <MenuSection label="Status" value={TRIP_STATUS_LABEL[trip.status]} {...row("status")}>
          <div className="grid gap-2">
            <Label htmlFor="trip-status">Status</Label>
            <Select value={trip.status} onValueChange={(value) => void save({ status: value as TripStatus })}>
              <SelectTrigger id="trip-status" className="w-full">
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
        </MenuSection>
        <MenuSection
          label="Start date"
          value={trip.startDate ? formatLongDate(trip.startDate) : "No dates yet"}
          {...row("start")}
        >
          <div className="grid gap-2">
            <Label htmlFor="trip-start">Start date</Label>
            <div className="flex gap-2">
              <DatePicker
                id="trip-start"
                className="w-auto min-w-0 flex-1"
                value={isoToLocalDate(trip.startDate)}
                placeholder="No dates yet"
                onChange={(date) => void save({ startDate: localDateToIso(date) })}
              />
              {trip.startDate ? (
                <Button type="button" variant="outline" onClick={() => void save({ startDate: null })}>
                  Clear
                </Button>
              ) : null}
            </div>
          </div>
        </MenuSection>
        <MenuSection label="Time zone" value={trip.timeZone ?? "Where I am"} {...row("zone")}>
          <div className="grid gap-2">
            <Label htmlFor="trip-time-zone">Time zone</Label>
            <TimeZoneSelect
              id="trip-time-zone"
              value={trip.timeZone ?? WHERE_I_AM}
              pinned={[{ value: WHERE_I_AM, label: "Where I am" }]}
              onChange={(value) => void save({ timeZone: value || null })}
            />
          </div>
        </MenuSection>
        <MenuSection label="Currency" value={trip.currency} {...row("currency")}>
          <div className="grid gap-2">
            <Label htmlFor="trip-currency">Currency</Label>
            <Select value={trip.currency} onValueChange={(value) => void save({ currency: value as Currency })}>
              <SelectTrigger id="trip-currency" className="w-full">
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
        </MenuSection>
        <MenuSection label="Getting around" value={TRAVEL_MODE_LABEL[trip.travelMode]} {...row("mode")}>
          <div className="grid gap-2">
            <Label htmlFor="trip-travel-mode">Getting around</Label>
            <Select value={trip.travelMode} onValueChange={(value) => void save({ travelMode: value as TravelMode })}>
              <SelectTrigger id="trip-travel-mode" className="w-full">
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
        </MenuSection>
        <MenuSection
          label="Cover photo"
          value={trip.coverUrl ? (trip.coverCredit ? "Unsplash" : "Uploaded") : "None"}
          {...row("cover")}
        >
          <div className="grid gap-2">
            <ImageUpload
              label="Cover photo"
              showLabel={false}
              value={trip.coverUrl ?? ""}
              aspect="video"
              fit="cover"
              emptyLabel="Upload a cover photo"
              onChange={(url) => void save({ coverUrl: url || null, coverCredit: null })}
            />
            {trip.coverCredit ? <PhotoCreditLine credit={trip.coverCredit} /> : null}
            <div>
              <UnsplashPicker
                startQuery={trip.destination || trip.name}
                onPick={(photo) => void save({ coverUrl: photo.url, coverCredit: photo.credit })}
              />
            </div>
          </div>
        </MenuSection>
        <MenuLine />
        <MenuAction
          icon={<Trash2Icon className="size-4" />}
          destructive
          disabled={deleting}
          onClick={() => {
            // One box at a time: the menu closes, then the confirm opens.
            setOpen(false)
            setConfirmDelete(true)
          }}
        >
          Delete trip
        </MenuAction>
      </FoldingMenu>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete ${trip.name}?`}
        description="The trip goes for good, with every activity, file and note on it."
        confirmLabel="Delete trip"
        destructive
        loading={deleting}
        onConfirm={() => void deleteTrip()}
      />
    </>
  )
}

/** "Work, family , Work" as ["Work", "family"]: trimmed, empty ones dropped, each once. */
function readTags(text: string) {
  return [...new Set(text.split(",").map((tag) => tag.trim()).filter(Boolean))]
}
