import * as React from "react"
import { Loader2Icon } from "lucide-react"

import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { DisabledReason } from "@/components/ui/disabled-reason"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { findDirectoryPlace } from "@/lib/api/directory/public"
import {
  DIRECTORY_NEAR_RADII_KM,
  formatDirectoryNearPoint,
} from "@/lib/directory/public-search"

/**
 * Near a place and Within a distance: a typed town or postcode, the browser's
 * own location, and the distance picker. The directory's listings and the
 * Events page both use this one, so the two never differ on how a place is
 * found or when Within can be used.
 *
 * Within stays disabled until a place is active, and says why. A pick made
 * before there is anywhere to measure from would do nothing, and the visitor
 * would only find out later from results that look wrong.
 *
 * Renders a row and, under it, any message about finding the place, so the
 * page around it keeps its own gaps.
 */
export function NearPicker({
  idPrefix,
  near,
  radius,
  onNearChange,
  onRadiusChange,
  onNearClear,
  children,
}: {
  /** Names the two fields, like "directory-place" and "directory-radius". */
  idPrefix: string
  /** The active point from the address, or nothing before a place is picked. */
  near: string | undefined
  radius: number
  onNearChange: (near: string, place: string, radius: number) => void
  onRadiusChange: (radius: number) => void
  onNearClear: () => void
  /** Buttons that end the row, after "Clear location". */
  children?: React.ReactNode
}) {
  const [place, setPlace] = React.useState("")
  const [locationMessage, setLocationMessage] = React.useState("")
  const [searchingPlace, setSearchingPlace] = React.useState(false)
  const [locating, setLocating] = React.useState(false)
  const nearActive = Boolean(near)
  const placeId = `${idPrefix}-place`
  const radiusId = `${idPrefix}-radius`

  const useMyLocation = () => {
    if (!navigator.geolocation) {
      setLocationMessage(
        "This browser cannot share your location. Enter a town, city, or postcode instead."
      )
      return
    }
    setLocationMessage("")
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false)
        onNearChange(
          formatDirectoryNearPoint(position.coords),
          "your location",
          radius
        )
      },
      (error) => {
        setLocating(false)
        setLocationMessage(
          error.code === error.PERMISSION_DENIED
            ? "Location sharing is off. Turn it on in your browser settings, or enter a town, city, or postcode instead."
            : "Your location is unavailable. Enter a town, city, or postcode instead."
        )
      },
      { timeout: 10_000, maximumAge: 300_000 }
    )
  }

  const searchPlace = async () => {
    setLocationMessage("")
    setSearchingPlace(true)
    try {
      const result = await findDirectoryPlace(place)
      if (!result.place) {
        setLocationMessage(
          result.error ?? "We could not look up that place. Try again."
        )
        return
      }
      setPlace("")
      onNearChange(
        formatDirectoryNearPoint(result.place),
        result.place.label,
        radius
      )
    } catch {
      setLocationMessage("We could not look up that place. Try again.")
    } finally {
      setSearchingPlace(false)
    }
  }

  return (
    <>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <form
          className="flex flex-col gap-2 sm:flex-row sm:items-end"
          onSubmit={(event) => {
            event.preventDefault()
            void searchPlace()
          }}
        >
          <div className="grid gap-1">
            <label htmlFor={placeId} className="text-sm font-medium">
              Near
            </label>
            <Input
              id={placeId}
              value={place}
              onChange={(event) => setPlace(event.target.value)}
              placeholder="Town, city, or postcode"
              className="sm:w-56"
            />
          </div>
          <Button type="submit" variant="outline" disabled={searchingPlace}>
            Search place
          </Button>
        </form>
        <Button
          type="button"
          variant="outline"
          onClick={useMyLocation}
          disabled={locating}
        >
          {locating ? <Loader2Icon className="animate-spin" /> : null}
          Use my location
        </Button>
        <div className="grid gap-1">
          <label htmlFor={radiusId} className="text-sm font-medium">
            Within
          </label>
          <DisabledReason
            disabled={!nearActive}
            reason="Pick a location first."
          >
            <Select
              disabled={!nearActive}
              value={String(radius)}
              onValueChange={(value) => onRadiusChange(Number(value))}
            >
              <SelectTrigger id={radiusId}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DIRECTORY_NEAR_RADII_KM.map((option) => (
                  <SelectItem key={option} value={String(option)}>
                    {option} km
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </DisabledReason>
        </div>
        {nearActive ? (
          <Button type="button" variant="ghost" onClick={onNearClear}>
            Clear location
          </Button>
        ) : null}
        {children}
      </div>
      {locationMessage ? (
        <p role="alert" className="text-sm text-muted-foreground">
          {locationMessage}
        </p>
      ) : null}
    </>
  )
}
