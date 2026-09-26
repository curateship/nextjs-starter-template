import * as React from "react"

import { findDirectoryPlace } from "@/lib/api/directory/public"
import { formatDirectoryNearPoint } from "@/lib/directory/public-search"

/**
 * Finding the place a visitor wants to measure from: a typed town or
 * postcode, or the browser's own location.
 *
 * A hook rather than a component because two things draw these controls now.
 * `NearPicker` draws them as a row of fields, which is what the Deals page
 * uses, and the directory's and the Events page's search bars draw the same
 * three inside one bar. Written twice, the two would disagree about what a
 * refused permission says, and that message is the only thing a visitor has to
 * go on.
 */
export function useNearPlace({
  radius,
  onNearChange,
}: {
  radius: number
  onNearChange: (near: string, place: string, radius: number) => void
}) {
  const [place, setPlace] = React.useState("")
  const [message, setMessage] = React.useState("")
  const [searching, setSearching] = React.useState(false)
  const [locating, setLocating] = React.useState(false)

  const useMyLocation = () => {
    if (!navigator.geolocation) {
      setMessage(
        "This browser cannot share your location. Enter a town, city, or postcode instead."
      )
      return
    }
    setMessage("")
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
        setMessage(
          error.code === error.PERMISSION_DENIED
            ? "Location sharing is off. Turn it on in your browser settings, or enter a town, city, or postcode instead."
            : "Your location is unavailable. Enter a town, city, or postcode instead."
        )
      },
      { timeout: 10_000, maximumAge: 300_000 }
    )
  }

  const searchPlace = async () => {
    setMessage("")
    setSearching(true)
    try {
      const result = await findDirectoryPlace(place)
      if (!result.place) {
        setMessage(result.error ?? "We could not look up that place. Try again.")
        return
      }
      setPlace("")
      onNearChange(
        formatDirectoryNearPoint(result.place),
        result.place.label,
        radius
      )
    } catch {
      setMessage("We could not look up that place. Try again.")
    } finally {
      setSearching(false)
    }
  }

  return {
    /** What is in the box. Emptied once a place is found, never before. */
    place,
    setPlace,
    /** Why the last attempt did not work, in words a visitor can act on. */
    message,
    searching,
    locating,
    useMyLocation,
    searchPlace,
  }
}
