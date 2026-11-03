import * as React from "react"
import { toast } from "sonner"
import { ClockIcon, ExternalLinkIcon, Loader2Icon, MapIcon, PhoneIcon, TriangleAlertIcon } from "lucide-react"

import { PlaceSearchField } from "@/components/travel/place-search-field"
import { SavingInput } from "@/components/travel/saving-fields"
import { useTrip } from "@/components/travel/trip-context"
import { useSaveActivity } from "@/components/travel/use-save-activity"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { fillActivityFromMapsLink } from "@/lib/api/travel/maps-link"
import type { Activity } from "@/lib/api/travel/trips"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { dateOfDay, weekday } from "@/lib/travel/dates"
import { getTravelErrorMessage } from "@/lib/travel/errors"
import { hoursLines, hoursWarning } from "@/lib/travel/hours"
import type { OpeningHours } from "@/lib/travel/rules"
import { webAddress } from "@/lib/travel/schemas"
import { showErrorToast } from "@/lib/toast/error-toast"

/** A Google Maps search for a place: its own page when Google named it, otherwise its name and address. */
export function mapsLink(place: NonNullable<Activity["place"]>) {
  const query = encodeURIComponent([place.name, place.address].filter(Boolean).join(", "))
  return place.placeId
    ? `https://www.google.com/maps/search/?api=1&query=${query}&query_place_id=${encodeURIComponent(place.placeId)}`
    : `https://www.google.com/maps/search/?api=1&query=${query}`
}

/**
 * Where the activity is (task parts 20, 21 and 22). Typing shows Google's
 * places; picking one saves its name, address and position, and fills its
 * opening hours, website and phone when Google has them. A place typed by
 * hand keeps whatever hours, website and phone were already there. "Open in
 * Google Maps" opens the place in a new tab.
 */
export function ActivityPlaceFields({ activity }: { activity: Activity }) {
  const { page } = useTrip()
  const [save] = useSaveActivity(activity.id)
  const [editingHours, setEditingHours] = React.useState(false)
  const idBase = `activity-${activity.id}`
  const date = activity.day === null ? null : dateOfDay(page.trip.startDate, activity.day)
  const warning = hoursWarning(activity.openingHours, date ? weekday(date) : null, activity.startTime)

  return (
      <div className="grid gap-3">
        <MapsLinkField activityId={activity.id} />
        <div className="grid gap-2">
          <Label htmlFor={`${idBase}-place`}>Address</Label>
          <PlaceSearchField
            key={activity.id}
            id={`${idBase}-place`}
            defaultValue={activity.place?.name || activity.place?.address || ""}
            placeholder="Search for a place"
            onPick={(details) => {
              if (
                activity.place &&
                details.place.name === activity.place.name &&
                details.place.address === activity.place.address &&
                details.place.placeId === activity.place.placeId
              ) {
                return
              }
              // Only a Google pick brings hours, website and phone; a typed place keeps what was there.
              const fromGoogle = details.place.placeId !== null
              void save({
                place: details.place.name || details.place.address ? details.place : null,
                ...(fromGoogle
                  ? {
                      openingHours: details.openingHours,
                      ...(details.website ? { website: details.website } : {}),
                      ...(details.phone ? { phone: details.phone } : {}),
                    }
                  : {}),
              })
            }}
          />
          {activity.place?.address && activity.place.address !== activity.place.name ? (
            <p className="text-xs break-words text-muted-foreground">{activity.place.address}</p>
          ) : null}
          {activity.place ? (
            <div>
              <Button asChild type="button" variant="outline" size="sm">
                <a href={mapsLink(activity.place)} target="_blank" rel="noopener noreferrer">
                  <MapIcon className="size-4" />
                  Open in Google Maps
                </a>
              </Button>
            </div>
          ) : null}
        </div>

        <div className="grid gap-2">
          <div className="flex items-center gap-2">
            <ClockIcon className="size-3.5 text-muted-foreground" aria-hidden />
            <span className="text-sm font-medium">Opening hours</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="ml-auto"
              onClick={() => setEditingHours((was) => !was)}
            >
              {editingHours ? "Done" : activity.openingHours ? "Edit" : "Add"}
            </Button>
          </div>
          {warning ? (
            <p className="flex items-start gap-1.5 text-xs text-destructive">
              <TriangleAlertIcon className="mt-0.5 size-3 shrink-0" aria-hidden />
              {warning}
            </p>
          ) : null}
          {editingHours ? (
            <HoursEditor
              idBase={idBase}
              hours={activity.openingHours}
              onSave={(openingHours) => save({ openingHours })}
            />
          ) : activity.openingHours ? (
            <dl className="grid grid-cols-[6rem_minmax(0,1fr)] gap-x-2 gap-y-0.5 text-xs">
              {hoursLines(activity.openingHours).map((line) => (
                <React.Fragment key={line.weekday}>
                  <dt className="text-muted-foreground">{line.weekday}</dt>
                  <dd>{line.text}</dd>
                </React.Fragment>
              ))}
            </dl>
          ) : (
            <p className="text-xs text-muted-foreground">
              {date ? "No hours yet." : "No hours yet. With a start date, a card set outside them warns."}
            </p>
          )}
        </div>

        <LinkField
          id={`${idBase}-website`}
          label="Website"
          value={activity.website}
          onSave={(website) => save({ website })}
        />
        <LinkField id={`${idBase}-menu`} label="Menu" value={activity.menuUrl} onSave={(menuUrl) => save({ menuUrl })} />
        <div className="grid gap-2">
          <Label htmlFor={`${idBase}-phone`}>Phone</Label>
          <div className="flex gap-2">
            <SavingInput
              id={`${idBase}-phone`}
              type="tel"
              value={activity.phone ?? ""}
              maxLength={40}
              placeholder="+81 3-1234-5678"
              onSave={(next) => save({ phone: next.trim() || null })}
            />
            {activity.phone ? (
              <Button asChild type="button" variant="outline" size="icon" aria-label={`Call ${activity.phone}`}>
                <a href={`tel:${activity.phone.replace(/[^\d+]/g, "")}`}>
                  <PhoneIcon className="size-4" />
                </a>
              </Button>
            ) : null}
          </div>
        </div>
      </div>
  )
}

/** A web address that saves itself, with a button to open it in a new tab. */
function LinkField({
  id,
  label,
  value,
  onSave,
}: {
  id: string
  label: string
  value: string | null
  onSave: (next: string | null) => Promise<boolean>
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex gap-2">
        <SavingInput
          id={id}
          type="url"
          inputMode="url"
          value={value ?? ""}
          maxLength={500}
          placeholder="https://"
          onSave={async (next) => {
            const text = next.trim()
            if (!text) return onSave(null)
            // A bare "example.com" is read as https://example.com.
            const full = /^https?:\/\//i.test(text) ? text : `https://${text}`
            if (!webAddress.safeParse(full).success) {
              showErrorToast("Type a full web address, starting with https://.")
              return false
            }
            return onSave(full)
          }}
        />
        {value ? (
          <Button asChild type="button" variant="outline" size="icon" aria-label={`Open ${label.toLowerCase()} in a new tab`}>
            <a href={value} target="_blank" rel="noopener noreferrer">
              <ExternalLinkIcon className="size-4" />
            </a>
          </Button>
        ) : null}
      </div>
    </div>
  )
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

/**
 * Opening hours typed by hand, for a place Google doesn't have (task part 21):
 * one row per weekday with its opening and closing time, or Closed. Each
 * change saves when its field is left. A closing time before the opening
 * time runs past midnight.
 */
function HoursEditor({
  idBase,
  hours,
  onSave,
}: {
  idBase: string
  hours: OpeningHours | null
  onSave: (hours: OpeningHours | null) => Promise<boolean>
}) {
  const start: OpeningHours = hours ?? Array.from({ length: 7 }, () => [{ open: "09:00", close: "17:00" }])
  const [draft, setDraft] = React.useState<OpeningHours>(start)

  function commit(next: OpeningHours) {
    setDraft(next)
    void onSave(next)
  }

  return (
    <div className="grid gap-1.5">
      {draft.map((spans, weekdayIndex) => {
        const closed = spans.length === 0
        const span = spans[0] ?? { open: "09:00", close: "17:00" }
        const setSpan = (patch: Partial<typeof span>) =>
          setDraft(draft.map((day, index) => (index === weekdayIndex ? [{ ...span, ...patch }, ...day.slice(1)] : day)))
        return (
          <div key={weekdayIndex} className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-2 text-xs">
            <span className="text-muted-foreground">{DAY_NAMES[weekdayIndex].slice(0, 3)}</span>
            <div className="flex flex-wrap items-center gap-1.5">
              <Checkbox
                id={`${idBase}-closed-${weekdayIndex}`}
                checked={!closed}
                aria-label={`Open on ${DAY_NAMES[weekdayIndex]}`}
                onCheckedChange={(on) =>
                  commit(draft.map((day, index) => (index === weekdayIndex ? (on ? [span] : []) : day)))
                }
              />
              {closed ? (
                <span className="text-muted-foreground">Closed</span>
              ) : (
                <>
                  <Input
                    type="time"
                    aria-label={`${DAY_NAMES[weekdayIndex]} opens`}
                    className="w-28"
                    value={span.open}
                    onChange={(event) => setSpan({ open: event.target.value })}
                    onBlur={() => commit(draft)}
                  />
                  <span className="text-muted-foreground">to</span>
                  <Input
                    type="time"
                    aria-label={`${DAY_NAMES[weekdayIndex]} closes`}
                    className="w-28"
                    value={span.close}
                    onChange={(event) => setSpan({ close: event.target.value })}
                    onBlur={() => commit(draft)}
                  />
                </>
              )}
            </div>
          </div>
        )
      })}
      {hours ? (
        <div>
          <Button type="button" variant="ghost" size="sm" onClick={() => void onSave(null)}>
            Clear hours
          </Button>
        </div>
      ) : null}
    </div>
  )
}

/** What a fill from a Maps link did, said in the toast. */
export function filledLine(result: { title: string; partial: boolean }) {
  return result.partial
    ? `${result.title}: the name and map pin came from the link. Hours, website, phone and the photo need a Google Maps key.`
    : `Filled in from Google Maps: ${result.title}`
}

/**
 * Paste a Google Maps link and press Fill: the activity's name, type, place,
 * hours, website, phone and picture all come from Google (task "Misc").
 */
function MapsLinkField({ activityId }: { activityId: string }) {
  const { refresh } = useTrip()
  const [link, setLink] = React.useState("")
  const [run, busy] = useAsyncAction(getTravelErrorMessage)
  const id = `activity-${activityId}-maps-link`

  async function fill() {
    if (!link.trim()) {
      showErrorToast("Paste a Google Maps link first.")
      return
    }
    let result: Awaited<ReturnType<typeof fillActivityFromMapsLink>> | null = null
    const ok = await run(async () => {
      result = await fillActivityFromMapsLink(activityId, link)
      await refresh()
    })
    if (!ok || !result) return
    setLink("")
    toast.success(filledLine(result))
  }

  return (
    <form
      className="grid gap-2"
      onSubmit={(event) => {
        event.preventDefault()
        void fill()
      }}
    >
      <Label htmlFor={id}>Google Maps link</Label>
      <div className="flex gap-2">
        <Input
          id={id}
          type="url"
          inputMode="url"
          value={link}
          maxLength={2000}
          placeholder="Paste to fill everything in"
          onChange={(event) => setLink(event.target.value)}
        />
        <Button type="submit" variant="outline" disabled={busy}>
          {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
          Fill
        </Button>
      </div>
    </form>
  )
}
