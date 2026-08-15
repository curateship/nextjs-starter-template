import * as React from "react"

import { ImageUpload } from "@/components/shared/image-upload"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  coordinatesFromGoogleMapsUrl,
  LISTING_WEEKDAYS,
  LISTING_WEEKDAY_LABELS,
  MAX_LISTING_GALLERY_IMAGES,
  requireListingCoordinates,
  type ListingHours,
  type ListingWeekday,
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
    <Card size="sm">
      <CardHeader>
        <CardTitle>Photo gallery</CardTitle>
        <CardDescription>
          Up to twelve extra photos, shown below the featured photo in this
          order.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {gallery.map((url, index) => (
          <div key={`${url}-${index}`} className="grid gap-2">
            <ImageUpload
              label={`Gallery photo ${index + 1}`}
              showLabel={false}
              value={url}
              disabled={disabled}
              onChange={(next) => replace(index, next)}
              inlinePicker
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
            inlinePicker
          />
        ) : null}
      </CardContent>
    </Card>
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
  const updateDay = (day: ListingWeekday, next: ListingHours[ListingWeekday]) =>
    onChange({ ...hours, [day]: next })

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Opening hours</CardTitle>
        <CardDescription>
          Turn on each open day. Closed days stay off and show as closed
          publicly.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="hidden grid-cols-[minmax(8rem,1fr)_1fr_1fr] gap-4 text-sm font-medium sm:grid">
          <span>Day</span>
          <span>Opens</span>
          <span>Closes</span>
        </div>
        <div className="grid gap-4">
          {LISTING_WEEKDAYS.map((day) => {
            const value = hours[day]
            const openId = `listing-hours-${day}-open`
            const closeId = `listing-hours-${day}-close`
            return (
              <div
                key={day}
                className="grid gap-2 sm:grid-cols-[minmax(8rem,1fr)_1fr_1fr] sm:items-end sm:gap-4"
              >
                <div className="flex h-8 items-center gap-2">
                  <Checkbox
                    id={`listing-hours-${day}`}
                    checked={Boolean(value)}
                    disabled={disabled}
                    onCheckedChange={(checked) =>
                      updateDay(
                        day,
                        checked ? { open: "09:00", close: "17:00" } : null
                      )
                    }
                  />
                  <Label htmlFor={`listing-hours-${day}`}>
                    {LISTING_WEEKDAY_LABELS[day]}
                  </Label>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor={openId} className="sm:sr-only">
                    {LISTING_WEEKDAY_LABELS[day]} opens
                  </Label>
                  <Input
                    id={openId}
                    type="time"
                    value={value?.open ?? ""}
                    disabled={disabled || !value}
                    onChange={(event) =>
                      value &&
                      updateDay(day, { ...value, open: event.target.value })
                    }
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor={closeId} className="sm:sr-only">
                    {LISTING_WEEKDAY_LABELS[day]} closes
                  </Label>
                  <Input
                    id={closeId}
                    type="time"
                    value={value?.close ?? ""}
                    disabled={disabled || !value}
                    onChange={(event) =>
                      value &&
                      updateDay(day, { ...value, close: event.target.value })
                    }
                  />
                </div>
              </div>
            )
          })}
        </div>
        <div>
          <Button
            type="button"
            variant="outline"
            disabled={disabled || !hours.monday}
            onClick={() => {
              const monday = hours.monday
              if (!monday) return
              onChange({
                ...hours,
                tuesday: { ...monday },
                wednesday: { ...monday },
                thursday: { ...monday },
                friday: { ...monday },
              })
            }}
          >
            Copy Monday to weekdays
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function LocationFields({
  latitude,
  longitude,
  disabled,
  onLatitudeChange,
  onLongitudeChange,
}: {
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
    <Card size="sm">
      <CardHeader>
        <CardTitle>Map pin</CardTitle>
        <CardDescription>
          Paste a full Google Maps link to fill the exact point. No map appears
          without both coordinates.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
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
      </CardContent>
    </Card>
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
