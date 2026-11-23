import * as React from "react"

import { useTravelServices } from "@/components/travel/use-travel-services"
import { findRouteMinutes } from "@/lib/api/travel/services"
import type { Activity } from "@/lib/api/travel/trips"
import { formatMinutes, minutesOf } from "@/lib/travel/board"
import type { TravelMode } from "@/lib/travel/rules"
import { cn } from "@/lib/utils"

const MODE_WORD: Record<TravelMode, string> = { walk: "walk", transit: "by transit", drive: "drive" }

// One question per pair of places and way of travel per page load; the server keeps the answers too.
const asked = new Map<string, Promise<number | null>>()

function keyOf(from: { lat: number; lng: number }, to: { lat: number; lng: number }, mode: TravelMode) {
  return `${from.lat.toFixed(5)},${from.lng.toFixed(5)}|${to.lat.toFixed(5)},${to.lng.toFixed(5)}|${mode}`
}

/**
 * The travel time between two cards on the same day (task part 43), such as
 * "20 min walk", from Google, by the trip's way of getting around. It shows
 * only when both places came from Google and Google answers. When getting
 * there takes longer than the free time between them, it warns.
 */
export function RouteTime({ first, next, mode }: { first: Activity; next: Activity; mode: TravelMode }) {
  const { google } = useTravelServices()
  const from = first.place?.lat != null && first.place.lng != null ? { lat: first.place.lat, lng: first.place.lng } : null
  const to = next.place?.lat != null && next.place.lng != null ? { lat: next.place.lat, lng: next.place.lng } : null
  const key = from && to ? keyOf(from, to, mode) : null
  const [answer, setAnswer] = React.useState<{ key: string; minutes: number | null } | null>(null)

  React.useEffect(() => {
    if (!google || !key || !from || !to) return
    let alive = true
    let question = asked.get(key)
    if (!question) {
      question = findRouteMinutes(from, to, mode).catch(() => null)
      asked.set(key, question)
    }
    void question.then((minutes) => {
      if (alive) setAnswer({ key, minutes })
    })
    return () => {
      alive = false
    }
    // `from` and `to` are read through `key`, which changes exactly when they do.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [google, key, mode])

  if (!key || answer?.key !== key || answer.minutes === null) return null
  const free =
    first.startTime && first.durationMinutes && next.startTime
      ? minutesOf(next.startTime) - (minutesOf(first.startTime) + first.durationMinutes)
      : null
  const tooLong = free !== null && answer.minutes > free
  return (
    <span className={cn("shrink-0", tooLong && "text-destructive")}>
      {free !== null ? "· " : ""}
      {formatMinutes(answer.minutes)} {MODE_WORD[mode]}
      {tooLong ? ", not enough time" : ""}
    </span>
  )
}
