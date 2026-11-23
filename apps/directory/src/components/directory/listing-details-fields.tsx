import * as React from "react"
import { ClockIcon, ImagesIcon, MapPinIcon } from "lucide-react"

import { PanelCard } from "@/components/shared/panel-card"
import { ImageUpload } from "@/components/shared/image-upload"
import { WeekdayHoursFields } from "@/components/shared/weekday-hours-fields"
import { Button } from "@/components/ui/button"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import {
  coordinatesFromGoogleMapsUrl,
  MAX_LISTING_GALLERY_IMAGES,
  requireListingCoordinates,
  type ListingHours,
} from "@/lib/directory/listing-details"
import { showErrorToast } from "@/lib/toast/error-toast"


export function ListingDetailsFields({
  gallery,
  hours,
  latitude,
  longitude,
  disabled,
  onGalleryChange,
  onHoursChange,
  onLatitudeChange,
  onLongitudeChange,
  locationOpenWhen,
}: {
  gallery: string[]
  hours: ListingHours
  latitude: string
  longitude: string
  disabled: boolean
  onGalleryChange: (gallery: string[]) => void
  onHoursChange: (hours: ListingHours) => void
  onLatitudeChange: (latitude: string) => void
  onLongitudeChange: (longitude: string) => void
  /**
   * Opens the map card each time it turns true. The coordinates are checked
   * before a save, and the message about them is no use at all if this card
   * is folded away, pointing at a box nobody can see.
   */
  locationOpenWhen?: boolean
}) {
  return (
    <>
      <GalleryFields
        gallery={gallery}
        disabled={disabled}
        onChange={onGalleryChange}
      />
      <HoursFields hours={hours} disabled={disabled} onChange={onHoursChange} />
      <LocationFields
        latitude={latitude}
        longitude={longitude}
        disabled={disabled}
        openWhen={locationOpenWhen}
        onLatitudeChange={onLatitudeChange}
        onLongitudeChange={onLongitudeChange}
      />
    </>
  )
}

function GalleryFields({
  gallery,
  disabled,
  onChange,
}: {
  gallery: string[]
  disabled: boolean
  onChange: (gallery: string[]) => void
}) {
  const replace = (index: number, url: string) => {
    if (!url) {
      onChange(gallery.filter((_, itemIndex) => itemIndex !== index))
      return
    }
    onChange(
      gallery.map((item, itemIndex) => (itemIndex === index ? url : item))
    )
  }
  const move = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction
    if (nextIndex < 0 || nextIndex >= gallery.length) return
    const next = [...gallery]
    ;[next[index], next[nextIndex]] = [next[nextIndex]!, next[index]!]
    onChange(next)
  }

  return (
    <PanelCard storageId="listing-gallery" icon={<ImagesIcon />} title="Photo gallery" meta={gallery.length || undefined}>
      <p className="text-sm text-muted-foreground">Up to twelve extra photos, shown below the featured photo in this order.</p>
      {/* Columns from the panel's own width, never the screen's: the panel opens narrow. */}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(6rem,1fr))] gap-4">
      {gallery.map((url, index) => (
        <div key={`${url}-${index}`} className="grid gap-2">
          <ImageUpload
            label={`Gallery photo ${index + 1}`}
            showLabel={false}
            value={url}
            disabled={disabled}
            onChange={(next) => replace(index, next)}
          />
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={disabled || index === 0}
              onClick={() => move(index, -1)}
            >
              Move up
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={disabled || index === gallery.length - 1}
              onClick={() => move(index, 1)}
            >
              Move down
            </Button>
          </div>
        </div>
      ))}
      {gallery.length < MAX_LISTING_GALLERY_IMAGES ? (
        <ImageUpload
          label="Gallery photo"
          showLabel={false}
          value=""
          disabled={disabled}
          emptyLabel="Add gallery photo"
          onChange={(url) => {
            if (url) onChange([...gallery, url])
          }}
        />
      ) : null}
      </div>
    </PanelCard>
  )
}

function HoursFields({
  hours,
  disabled,
  onChange,
}: {
  hours: ListingHours
  disabled: boolean
  onChange: (hours: ListingHours) => void
}) {
  return (
    <PanelCard storageId="listing-hours" icon={<ClockIcon />} title="Opening hours">
      <p className="text-sm text-muted-foreground">Turn on each open day. Closed days stay off and show as closed publicly.</p>
      <WeekdayHoursFields
        idPrefix="listing-hours"
        words={{ start: "Opens", end: "Closes" }}
        newDay={{ open: "09:00", close: "17:00" }}
        hours={hours}
        disabled={disabled}
        onChange={onChange}
      />
    </PanelCard>
  )
}

function LocationFields({
  latitude,
  longitude,
  disabled,
  openWhen,
  onLatitudeChange,
  onLongitudeChange,
}: {
  openWhen?: boolean
  latitude: string
  longitude: string
  disabled: boolean
  onLatitudeChange: (latitude: string) => void
  onLongitudeChange: (longitude: string) => void
}) {
  const [mapsUrl, setMapsUrl] = React.useState("")
  const [coordinatesTouched, setCoordinatesTouched] = React.useState(false)
  const invalid = coordinatesAreInvalid(latitude, longitude)

  return (
    <PanelCard storageId="listing-map" icon={<MapPinIcon />} title="Map pin" openWhen={openWhen}>
      <p className="text-sm text-muted-foreground">Paste a full Google Maps link to fill the exact point. No map appears without both coordinates.</p>
      <div className="grid gap-2">
        <FieldLabel htmlFor="listing-google-maps-url">
          Google Maps link
        </FieldLabel>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id="listing-google-maps-url"
            type="url"
            value={mapsUrl}
            disabled={disabled}
            placeholder="https://www.google.com/maps/place/…"
            onChange={(event) => setMapsUrl(event.target.value)}
          />
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            onClick={() => {
              const point = coordinatesFromGoogleMapsUrl(mapsUrl)
              if (!point) {
                showErrorToast(
                  "That full Google Maps link does not contain coordinates."
                )
                return
              }
              onLatitudeChange(point.latitude.toFixed(6))
              onLongitudeChange(point.longitude.toFixed(6))
              setCoordinatesTouched(false)
            }}
          >
            Use coordinates
          </Button>
        </div>
      </div>
      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="grid gap-2 sm:flex-1">
          <FieldLabel htmlFor="listing-latitude">Latitude</FieldLabel>
          <Input
            id="listing-latitude"
            inputMode="decimal"
            value={latitude}
            disabled={disabled}
            aria-invalid={coordinatesTouched && invalid}
            onChange={(event) => onLatitudeChange(event.target.value)}
            onBlur={() =>
              checkCoordinates(latitude, longitude, setCoordinatesTouched)
            }
          />
        </div>
        <div className="grid gap-2 sm:flex-1">
          <FieldLabel htmlFor="listing-longitude">Longitude</FieldLabel>
          <Input
            id="listing-longitude"
            inputMode="decimal"
            value={longitude}
            disabled={disabled}
            aria-invalid={coordinatesTouched && invalid}
            onChange={(event) => onLongitudeChange(event.target.value)}
            onBlur={() =>
              checkCoordinates(latitude, longitude, setCoordinatesTouched)
            }
          />
        </div>
      </div>
      {latitude || longitude ? (
        <div>
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            onClick={() => {
              onLatitudeChange("")
              onLongitudeChange("")
              setCoordinatesTouched(false)
            }}
          >
            Remove map pin
          </Button>
        </div>
      ) : null}
    </PanelCard>
  )
}

function coordinatesAreInvalid(latitude: string, longitude: string) {
  try {
    requireListingCoordinates(latitude, longitude)
    return false
  } catch {
    return true
  }
}

function checkCoordinates(
  latitude: string,
  longitude: string,
  setTouched: (touched: boolean) => void
) {
  setTouched(true)
  if (coordinatesAreInvalid(latitude, longitude)) {
    showErrorToast(
      "Add both coordinates using numbers from -90 to 90 and -180 to 180."
    )
  }
}
