"use client"

import { useId, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { geocodeNearMeLocationAction } from "@/lib/actions/directories/directory-near-me-actions"
import { NEAR_ME_RADII_KM, type NearMePoint } from "@/lib/actions/directories/directory-near-me-core"
import Loader2 from "lucide-react/dist/esm/icons/loader-circle.js"
import MapPin from "lucide-react/dist/esm/icons/map-pin.js"

const GEOLOCATION_TIMEOUT_MS = 10_000
/** A fix from the last five minutes is plenty fresh for a 5 km radius. */
const GEOLOCATION_MAX_AGE_MS = 300_000

const TYPE_INSTEAD = "Enter a town, city or postcode instead."

/**
 * The three ways the browser can refuse need three different answers: blocked
 * is fixed in browser settings, unavailable usually means the device or system
 * has location switched off, and a timeout is worth simply retrying.
 */
function getGeolocationMessage(error: GeolocationPositionError): string {
  if (error.code === error.PERMISSION_DENIED) {
    return `Location sharing is switched off for this site. Turn it on from the icon at the left of the address bar — and check your computer's own location setting — or ${TYPE_INSTEAD.toLowerCase()}`
  }
  if (error.code === error.POSITION_UNAVAILABLE) {
    return `Your device couldn't work out where you are. ${TYPE_INSTEAD}`
  }
  if (error.code === error.TIMEOUT) {
    return `Finding your location took too long. Try again, or ${TYPE_INSTEAD.toLowerCase()}`
  }
  return `We couldn't get your location. ${TYPE_INSTEAD}`
}

export interface NearMeSelection extends NearMePoint {
  label: string
}

interface NearMeControlsProps {
  siteId: string
  /** The filter currently applied, or null when the visitor has not set one. */
  selection: NearMeSelection | null
  radiusKm: number
  onApply: (selection: NearMeSelection) => void
  onRadiusChange: (radiusKm: number) => void
  onClear: () => void
}

export function NearMeControls({
  siteId,
  selection,
  radiusKm,
  onApply,
  onRadiusChange,
  onClear,
}: NearMeControlsProps) {
  const locationInputId = useId()
  const radiusInputId = useId()
  const [query, setQuery] = useState("")
  const [locating, setLocating] = useState(false)
  const [searching, setSearching] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const handleUseMyLocation = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setMessage(`This browser can't share a location. ${TYPE_INSTEAD}`)
      return
    }

    setMessage(null)
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false)
        onApply({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          label: "your location",
        })
      },
      (error) => {
        setLocating(false)
        setMessage(getGeolocationMessage(error))
      },
      { timeout: GEOLOCATION_TIMEOUT_MS, maximumAge: GEOLOCATION_MAX_AGE_MS }
    )
  }

  const handleSearchLocation = async (event: React.FormEvent) => {
    event.preventDefault()
    const trimmed = query.trim()
    if (trimmed.length < 2) {
      setMessage("Enter a town, city or postcode.")
      return
    }

    setMessage(null)
    setSearching(true)
    try {
      const result = await geocodeNearMeLocationAction({ data: { input: { siteId, query: trimmed } } })
      if (result.place) {
        setQuery("")
        onApply(result.place)
      } else {
        setMessage(result.error || "Could not look up that location. Try again.")
      }
    } catch {
      setMessage("Could not look up that location. Try again.")
    } finally {
      setSearching(false)
    }
  }

  return (
    <form onSubmit={handleSearchLocation} className="space-y-2">
      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="grid gap-2">
          <Label htmlFor={locationInputId}>Location</Label>
          <div className="flex gap-2">
            <Input
              id={locationInputId}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Town, city or postcode"
              className="sm:w-56"
            />
            <Button type="submit" variant="outline" disabled={searching}>
              {searching && <Loader2 className="size-4 animate-spin" />}
              Search
            </Button>
          </div>
        </div>

        <div className="grid gap-2">
          <Label htmlFor={radiusInputId}>Within</Label>
          <Select value={String(radiusKm)} onValueChange={(value) => onRadiusChange(Number(value))}>
            <SelectTrigger id={radiusInputId} className="w-full sm:w-fit">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {NEAR_ME_RADII_KM.map((option) => (
                <SelectItem key={option} value={String(option)}>{option} km</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button type="button" variant="outline" onClick={handleUseMyLocation} disabled={locating}>
          {locating ? <Loader2 className="size-4 animate-spin" /> : <MapPin className="size-4" />}
          Use my location
        </Button>

        {selection && (
          // Left-aligned on mobile: a stretched ghost button reads as an empty band.
          <Button type="button" variant="ghost" className="self-start sm:self-auto" onClick={onClear}>
            Clear
          </Button>
        )}
      </div>

      {message && (
        <p role="alert" className="text-sm text-destructive">{message}</p>
      )}

      {selection && (
        <p className="text-sm text-muted-foreground">
          Showing listings within {radiusKm} km of {selection.label}, nearest first. Listings without a
          map location aren&apos;t included.
        </p>
      )}
    </form>
  )
}
