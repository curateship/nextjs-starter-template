import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { TRAVEL_MODES, type TravelMode } from "@/lib/travel/rules"
import { TRAVEL_ERRORS } from "@/lib/travel/errors"
import { enforceRateLimit } from "@/server/auth/rate-limit"
import { userGet, userPost } from "@/server/guards"
import {
  autocompletePlaces,
  googleEnabled,
  placeDetails,
  routeMinutes,
} from "@/server/travel/google"
import { spendGoogleLookup } from "@/server/travel/google-usage"
import { fillPickedPlacePhoto } from "@/server/travel/place-photo"
import { searchPhotos, trackDownload, unsplashEnabled } from "@/server/travel/unsplash"
import { id } from "@/lib/travel/rules"

export type { LatLng, PlaceDetails, PlaceSuggestion } from "@/server/travel/google"
export type { UnsplashPhoto } from "@/server/travel/unsplash"

/** Google bills a typing session by this token; the browser makes one per search. */
const sessionToken = z.string().trim().max(100)
const point = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) })

/**
 * Google bills every call and Unsplash allows few an hour, so one person can
 * only ask so often: generous for typing and browsing, and a stop on a script.
 */
async function limit(kind: string, userId: string, maxAttempts: number) {
  try {
    await enforceRateLimit(`travel-${kind}:${userId}`, { maxAttempts, windowSeconds: 10 * 60 })
  } catch (error) {
    if (error instanceof Error && error.message.includes("RATE_LIMITED")) throw new Error(TRAVEL_ERRORS.tooManySearches)
    throw error
  }
}

const loadTravelServicesFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async () => ({
    google: googleEnabled(),
    unsplash: unsplashEnabled(),
    // The map is drawn in the browser, so it needs a key the browser may see:
    // a separate key, limited in Google Cloud to this site's address.
    mapsKey: process.env.GOOGLE_MAPS_BROWSER_KEY?.trim() || null,
  }))

const searchPlacesFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(z.object({ query: z.string().max(200), sessionToken }))
  .handler(async ({ data, context }) => {
    await limit("places", context.user.id, 400)
    return autocompletePlaces(data.query, data.sessionToken)
  })

const loadPlaceDetailsFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(z.object({ placeId: z.string().trim().min(1).max(300), sessionToken }))
  .handler(async ({ data, context }) => {
    await limit("place-details", context.user.id, 120)
    return placeDetails(data.placeId, data.sessionToken, () => spendGoogleLookup(context.user.id))
  })

const fillPlacePhotoFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ activityId: id, photoName: z.string().trim().min(1).max(400) }))
  .handler(async ({ data, context }) => {
    await limit("place-photo", context.user.id, 120)
    return fillPickedPlacePhoto(context.user.id, data)
  })

const findRouteMinutesFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(z.object({ from: point, to: point, mode: z.enum(TRAVEL_MODES) }))
  .handler(async ({ data, context }) => {
    await limit("routes", context.user.id, 400)
    return routeMinutes(data.from, data.to, data.mode, () => spendGoogleLookup(context.user.id))
  })

const searchUnsplashFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(
    z.object({ query: z.string().trim().min(1).max(100), page: z.number().int().min(1).max(50) })
  )
  .handler(async ({ data, context }) => {
    await limit("unsplash", context.user.id, 60)
    return searchPhotos(data.query, data.page)
  })

const pickUnsplashPhotoFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ downloadLocation: z.string().max(500) }))
  .handler(async ({ data, context }) => {
    await limit("unsplash-pick", context.user.id, 60)
    return trackDownload(data.downloadLocation)
  })

/** Whether Google Maps and Unsplash have keys on this server, and the browser's map key. */
export function loadTravelServices() {
  return loadTravelServicesFn()
}
export function searchPlaces(query: string, sessionToken: string) {
  return searchPlacesFn({ data: { query, sessionToken } })
}
export function loadPlaceDetails(placeId: string, sessionToken: string) {
  return loadPlaceDetailsFn({ data: { placeId, sessionToken } })
}
/** The picked place's Google photo as the card's picture, when the card has none (More Travel features part 2). */
export function fillPlacePhoto(activityId: string, photoName: string) {
  return fillPlacePhotoFn({ data: { activityId, photoName } })
}
export function findRouteMinutes(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
  mode: TravelMode
) {
  return findRouteMinutesFn({ data: { from, to, mode } })
}
export function searchUnsplash(query: string, page: number) {
  return searchUnsplashFn({ data: { query, page } })
}
export function pickUnsplashPhoto(downloadLocation: string) {
  return pickUnsplashPhotoFn({ data: { downloadLocation } })
}
