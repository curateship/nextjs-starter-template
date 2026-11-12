import * as React from "react"
import { useNavigate } from "@tanstack/react-router"
import { LockIcon, LockOpenIcon, StarIcon, Trash2Icon } from "lucide-react"

import { RateTripDialog } from "@/components/travel/rate-trip-dialog"
import { useTripBin } from "@/components/travel/use-trip-bin"
import { SavingInput } from "@/components/travel/saving-fields"
import { useZoneRows, ZoneChoices } from "@/components/travel/time-zone-select"
import { useSaveTrip } from "@/components/travel/trip-budget-card"
import { useTrip } from "@/components/travel/trip-context"
import { PhotoCreditLine, UnsplashPicker } from "@/components/travel/unsplash-picker"
import { PickChoicesRow, PickDayRow, PickGroup, PickMenuRow, PickRow } from "@/components/travel/pick-rows"
import { TabbedMenu } from "@/components/travel/tabbed-menu"
import { ImageUpload } from "@/components/shared/image-upload"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { formatLongDate } from "@/lib/travel/dates"
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
import { saveTrip } from "@/lib/api/travel/trips"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { getTravelErrorMessage } from "@/lib/travel/errors"
import { showErrorToast } from "@/lib/toast/error-toast"

const WHERE_I_AM = ""
const PINNED_ZONES = [{ value: WHERE_I_AM, label: "Where I am" }]
const ROW = "w-full justify-start font-normal"

/**
 * The trip's ⋮ menu, Trip settings, at the top of its left panel. Since 6 Nov 2026 it is the tabbed ⋮ of the
 * Admin 3 panel design (Tyler: "Look at the serttings dropdown, its not ui
 * standard for example. fix them all"), as Project's project ⋮ is: General
 * is grouped rows (Trip, Dates, Details), each picking in one press where
 * there is a choice and opening a small box for a typed value, then Rate the
 * trip, Lock blocks, and Delete trip in red under a line. It was a folding menu before, and
 * a cog with a window before that (Tyler, 3 Nov 2026).
 *
 * The description isn't in it: it is written in place under the panel's
 * header. The number of days changes on the board, a day at a time. Every
 * field saves itself, so the one being typed in is left before the menu
 * shuts.
 */
export function TripMenu({ actions = [] }: {
  /** More rows above Rate the trip, from the Trips dashboard's right panel: Copy and Archive. */
  actions?: readonly { label: string; icon: React.ReactNode; onSelect: () => void }[]
} = {}) {
  const { page } = useTrip()
  const { trip } = page
  const navigate = useNavigate()
  const save = useSaveTrip()
  const [open, setOpen] = React.useState(false)
  // Rate the trip (Travel features 3, part 11), opened from this menu only.
  const [rating, setRating] = React.useState(false)
  const { binTrips, busy: deleting } = useTripBin()
  const zones = useZoneRows(trip.timeZone ?? WHERE_I_AM, PINNED_ZONES)

  // Into the Trips table's bin with Undo, so it doesn't ask first (Travel features part 8).
  async function deleteTrip() {
    setOpen(false)
    if (await binTrips([trip])) await navigate({ to: "/trips" })
  }

  const general = (
    <div className="grid">
      <div className="grid gap-5 px-4 py-3">
        <PickGroup title="Trip">
          <PickRow label="Name" value={trip.name}>
            <Label htmlFor="trip-name" className="sr-only">
              Name
            </Label>
            <SavingInput
              id="trip-name"
              value={trip.name}
              maxLength={TRIP_NAME_MAX}
              autoFocus
              onSave={(name) => {
                if (!name.trim()) {
                  showErrorToast("Give the trip a name.")
                  return Promise.resolve(false)
                }
                return save({ name })
              }}
            />
          </PickRow>
          <PickRow label="Destination" empty={!trip.destination} value={trip.destination || "None"}>
            <Label htmlFor="trip-destination" className="sr-only">
              Destination
            </Label>
            <SavingInput
              id="trip-destination"
              value={trip.destination ?? ""}
              maxLength={120}
              autoFocus
              onSave={(destination) => save({ destination: destination.trim() || null })}
            />
          </PickRow>
          <PickRow label="Tags" empty={trip.tags.length === 0} value={trip.tags.join(", ") || "None"}>
            <Label htmlFor="trip-tags" className="sr-only">
              Tags
            </Label>
            <SavingInput
              id="trip-tags"
              value={trip.tags.join(", ")}
              maxLength={340}
              autoFocus
              placeholder="Family, Beach (a comma between)"
              onSave={(text) => save({ tags: readTags(text) })}
            />
          </PickRow>
          <PickRow
            label="Cover photo"
            empty={!trip.coverUrl}
            value={trip.coverUrl ? (trip.coverCredit ? "Unsplash" : "Uploaded") : "None"}
          >
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
          </PickRow>
        </PickGroup>
        <PickGroup title="Dates">
          <PickDayRow
            label="Start date"
            empty={!trip.startDate}
            value={trip.startDate ? formatLongDate(trip.startDate) : "No dates yet"}
            day={trip.startDate}
            clearLabel="No dates yet"
            onPick={(startDate) => void save({ startDate })}
          />
          <PickChoicesRow label="Time zone" value={trip.timeZone?.replaceAll("_", " ") ?? "Where I am"} contentClassName="w-72">
            {(close) => (
              <ZoneChoices
                rows={zones}
                value={trip.timeZone ?? WHERE_I_AM}
                onPick={(next) => {
                  close()
                  if (next !== (trip.timeZone ?? WHERE_I_AM)) void save({ timeZone: next || null })
                }}
              />
            )}
          </PickChoicesRow>
        </PickGroup>
        <PickGroup title="Details">
          <PickMenuRow
            label="Status"
            value={TRIP_STATUS_LABEL[trip.status]}
            selected={trip.status}
            options={TRIP_STATUSES.map((status) => ({ value: status, label: TRIP_STATUS_LABEL[status] }))}
            onPick={(status) => void save({ status: status as TripStatus })}
          />
          <PickMenuRow
            label="Currency"
            value={trip.currency}
            selected={trip.currency}
            options={CURRENCIES.map((code) => ({ value: code, label: code }))}
            onPick={(currency) => void save({ currency: currency as Currency })}
          />
          <PickMenuRow
            label="Getting around"
            value={TRAVEL_MODE_LABEL[trip.travelMode]}
            selected={trip.travelMode}
            options={TRAVEL_MODES.map((mode) => ({ value: mode, label: TRAVEL_MODE_LABEL[mode] }))}
            onPick={(mode) => void save({ travelMode: mode as TravelMode })}
          />
        </PickGroup>
      </div>
      {/* Under the groups, the actions as ghost rows, then Delete in red under a line of its own. */}
      <div className="grid gap-1 px-2 pb-2">
        {actions.map((action) => (
          <Button
            key={action.label}
            type="button"
            variant="ghost"
            className={ROW}
            onClick={() => {
              setOpen(false)
              action.onSelect()
            }}
          >
            {action.icon}
            {action.label}
          </Button>
        ))}
        <Button
          type="button"
          variant="ghost"
          className={ROW}
          onClick={() => {
            setOpen(false)
            setRating(true)
          }}
        >
          <StarIcon className="size-4" />
          Rate the trip
        </Button>
        <LockBlocksButton />
      </div>
      <div className="grid border-t p-2">
        <Button
          type="button"
          variant="ghost"
          className={`${ROW} text-destructive hover:text-destructive`}
          disabled={deleting}
          onClick={() => void deleteTrip()}
        >
          <Trash2Icon className="size-4" />
          Delete trip
        </Button>
      </div>
    </div>
  )

  return (
    <>
      <TabbedMenu
        label="Trip settings"
        align="start"
        width="20.4rem"
        open={open}
        onOpenChange={setOpen}
        tabs={[{ value: "general", label: "General", content: general }]}
      />
      <RateTripDialog open={rating} onClose={() => setRating(false)} />
    </>
  )
}

/** "Work, family , Work" as ["Work", "family"]: trimmed, empty ones dropped, each once. */
/**
 * Lock blocks (Tyler, 7 Nov 2026: "add lock blocks button"): the trip's
 * description in the left panel, its words and blocks, reads only until it's
 * unlocked, as Project's Lock the notes does for a page. The Budget block's
 * tabs and fold still work, since they change nothing on the trip. The words
 * change once the save is back; a refused save says why.
 */
function LockBlocksButton() {
  const { page, refresh } = useTrip()
  const { trip } = page
  const locked = trip.descriptionLocked
  const [run, busy] = useAsyncAction(getTravelErrorMessage)
  return (
    <Button
      type="button"
      variant="ghost"
      className={ROW}
      disabled={busy}
      onClick={() =>
        void run(
          async () => {
            await saveTrip({ tripId: trip.id, descriptionLocked: !locked })
            await refresh()
          }
        )
      }
    >
      {locked ? <LockOpenIcon className="size-4" /> : <LockIcon className="size-4" />}
      {locked ? "Unlock blocks" : "Lock blocks"}
    </Button>
  )
}

function readTags(text: string) {
  return [...new Set(text.split(",").map((tag) => tag.trim()).filter(Boolean))]
}
