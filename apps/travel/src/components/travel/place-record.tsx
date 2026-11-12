import * as React from "react"
import { Link } from "@tanstack/react-router"
import { ArrowUpRightIcon, ExternalLinkIcon, MapPinIcon, StarIcon } from "lucide-react"

import type { RowMenuItem } from "@/components/crm/crm-row"
import { RecordFrame } from "@/components/crm/record-frame"
import { PanelHeading } from "@/components/shared/panel-card"
import { AddToTrip } from "@/components/travel/add-to-trip"
import { mapsLink } from "@/components/travel/activity-place-fields"
import { GoogleMap } from "@/components/travel/google-map"
import { BlendedBanner } from "@/components/travel/panel-bits"
import { SavedPlaceEditor } from "@/components/travel/saved-place-editor"
import { ActivityTypeIcon } from "@/components/travel/type-icon"
import { useTravelOffline } from "@/components/travel/use-travel-offline"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { addGoAgain, addSavedPlace, type SavedPlace } from "@/lib/api/travel/saved-places"
import { placeFacts, type PlaceRow } from "@/lib/travel/trips-lists"
import type { TripPlace } from "@/lib/api/travel/trips-dashboard"
import { saveActivity, type TripListRow } from "@/lib/api/travel/trips"
import type { ActivityType } from "@/lib/api/travel/types"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { getTravelErrorMessage } from "@/lib/travel/errors"
import { googleRatingLine } from "@/lib/travel/google-rating"
import { cn } from "@/lib/utils"

/**
 * The place picked in the Places section, in the right panel (Tyler,
 * 12 Nov 2026).
 *
 * - **Body:** a small map of it, its address, Google's stars and price, its
 *   website, menu and phone. A saved place's name, type, picture and notes
 *   change here, each saving itself. A place from a trip has its stars and
 *   Would go again here, saved on the trip's card, and a link to the trip.
 * - **Foot:** Open in Google Maps and Add to a trip, then the bin; in the Bin,
 *   Put back and Delete for good. Only a place ticked Would go again can be
 *   added to a trip from Been, as on the trip page.
 */
export function PlaceRecord({
  row,
  types,
  trips,
  actions,
  busy,
  onSavedChange,
  onCardChange,
}: {
  row: PlaceRow
  types: readonly ActivityType[]
  trips: readonly TripListRow[]
  /** The bin, or Put back and Delete for good: the list's own. */
  actions: RowMenuItem[]
  busy: boolean
  onSavedChange: (place: SavedPlace) => void
  /** A trip card's stars or Would go again, as saved. */
  onCardChange: (card: TripPlace) => void
}) {
  const readOnly = useTravelOffline()
  const facts = placeFacts(row)
  const type = facts.typeId ? (types.find((each) => each.id === facts.typeId) ?? null) : null
  const binned = row.kind === "saved" && row.saved.deletedAt !== null
  const [broken, setBroken] = React.useState<string | null>(null)
  const banner = facts.photoUrl && facts.photoUrl !== broken ? facts.photoUrl : null
  const canAdd =
    !readOnly && !binned && (row.kind === "saved" || row.card.goAgain)

  return (
    <RecordFrame
      avatar={<ActivityTypeIcon type={type} />}
      title={facts.title}
      line={row.kind === "trip" ? `${row.card.tripName} · ${row.card.day === null ? "Ideas" : `Day ${row.card.day}`}` : facts.place?.address}
      hideLabel="Hide the place"
      body={
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
          {banner ? <BlendedBanner url={banner} onBroken={() => setBroken(banner)} /> : null}
          <PlaceDetails facts={facts} />
          {row.kind === "trip" ? (
            <TripCardFields card={row.card} readOnly={readOnly} onChange={onCardChange} />
          ) : !binned && !readOnly ? (
            <section className="relative grid gap-1.5" aria-label="About the place">
              <PanelHeading>About the place</PanelHeading>
              <SavedPlaceEditor place={row.saved} types={types} onChange={onSavedChange} />
            </section>
          ) : null}
        </div>
      }
      footer={
        <>
          <span className="flex flex-wrap items-center gap-2">
            {facts.place ? (
              <Button asChild type="button" size="sm" variant="outline">
                <a href={mapsLink(facts.place)} target="_blank" rel="noreferrer">
                  <ExternalLinkIcon className="size-4" />
                  Google Maps
                </a>
              </Button>
            ) : null}
            {canAdd ? (
              <AddToTrip
                trips={trips}
                add={(tripId, day) =>
                  row.kind === "saved" ? addSavedPlace(tripId, row.saved.id, day) : addGoAgain(tripId, row.card.id, day)
                }
              />
            ) : null}
          </span>
          {readOnly
            ? null
            : actions.map((action, index) => (
                <Tooltip key={action.label}>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={action.label}
                      disabled={busy}
                      className={cn(index === 0 && "ml-auto", action.destructive && "hover:text-destructive")}
                      onClick={action.onSelect}
                    >
                      {action.icon}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{action.label}</TooltipContent>
                </Tooltip>
              ))}
        </>
      }
    />
  )
}

/** The small map, the address, Google's stars and price, and the links. */
function PlaceDetails({ facts }: { facts: ReturnType<typeof placeFacts> }) {
  const { place } = facts
  const google = googleRatingLine(place)
  const links = [
    facts.website ? { label: "Website", href: facts.website } : null,
    facts.menuUrl ? { label: "Menu", href: facts.menuUrl } : null,
    facts.phone ? { label: facts.phone, href: `tel:${facts.phone.replace(/[^\d+]/g, "")}` } : null,
  ].filter((link): link is { label: string; href: string } => link !== null)
  return (
    <div className="relative grid gap-2">
      {place?.lat !== null && place?.lat !== undefined && place.lng !== null ? (
        <GoogleMap
          className="h-36 overflow-hidden rounded-lg"
          pins={[{ id: "place", lat: place.lat, lng: place.lng, title: facts.title }]}
          emptyText="The map shows once Google Maps is set up."
          onPick={() => undefined}
        />
      ) : null}
      {place?.address ? (
        <p className="flex items-start gap-2 px-1 text-sm">
          <MapPinIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="min-w-0">{place.address}</span>
        </p>
      ) : (
        <p className="px-1 text-sm text-muted-foreground">No address saved for this place.</p>
      )}
      {google ? <p className="px-1 text-xs text-muted-foreground">{google}</p> : null}
      {links.length ? (
        <p className="flex flex-wrap gap-x-3 gap-y-1 px-1 text-sm">
          {links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              target={link.href.startsWith("tel:") ? undefined : "_blank"}
              rel="noreferrer"
              className="underline underline-offset-2 hover:text-foreground"
            >
              {link.label}
            </a>
          ))}
        </p>
      ) : null}
    </div>
  )
}

/**
 * A place from a trip: its stars and Would go again, saved on the trip's
 * card the moment they change, and the trip it was on.
 */
function TripCardFields({
  card,
  readOnly,
  onChange,
}: {
  card: TripPlace
  readOnly: boolean
  onChange: (card: TripPlace) => void
}) {
  const [run, busy] = useAsyncAction(getTravelErrorMessage)
  const save = (patch: { rating?: number | null; goAgain?: boolean }) =>
    void run(async () => {
      await saveActivity({ activityId: card.id, ...patch })
      onChange({ ...card, ...patch })
    })
  return (
    <section className="relative grid gap-3" aria-label="How it was">
      <PanelHeading>How it was</PanelHeading>
      <div className="flex items-center gap-0.5 px-1" role="group" aria-label="Your stars">
        {[1, 2, 3, 4, 5].map((stars) => (
          <Button
            key={stars}
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={readOnly || busy}
            aria-label={`${stars} of 5`}
            aria-pressed={card.rating === stars}
            // Pressing the stars given again takes them away.
            onClick={() => save({ rating: card.rating === stars ? null : stars })}
          >
            <StarIcon
              className={cn("size-4", card.rating !== null && stars <= card.rating ? "fill-current text-amber-500" : "text-muted-foreground")}
            />
          </Button>
        ))}
      </div>
      <div className="flex items-center gap-2 px-1">
        <Checkbox
          id={`go-again-${card.id}`}
          checked={card.goAgain}
          disabled={readOnly || busy}
          onCheckedChange={(checked) => save({ goAgain: checked === true })}
        />
        <Label htmlFor={`go-again-${card.id}`}>Would go again</Label>
      </div>
      <Link
        to="/trips/$tripId"
        params={{ tripId: card.tripId }}
        search={{ open: card.id }}
        className="flex items-center gap-1.5 px-1 text-sm underline underline-offset-2 hover:text-foreground"
      >
        <ArrowUpRightIcon className="size-4" aria-hidden />
        Open it in {card.tripName}
      </Link>
    </section>
  )
}
