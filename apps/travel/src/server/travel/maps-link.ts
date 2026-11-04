import { eq } from "drizzle-orm"

import type { BuiltinType } from "@/lib/travel/activity-types"
import { isMapsLink } from "@/lib/travel/maps-links"
import { getTravelErrorMessage, isAlreadyOnTrip, TRAVEL_ERRORS } from "@/lib/travel/errors"
import type { Place } from "@/lib/travel/rules"
import { now } from "@/server/auth/security"
import { db, type CustomShellDb } from "@/server/db"
import { requireActivity } from "@/server/travel/access"
import { placeExtras, toOpeningHours, type GoogleExtras, type GooglePeriod } from "@/server/travel/google"
import { downloadPicture, googlePhoto, PHOTO_TYPES, savePicture, type Picture } from "@/server/travel/place-photo"
import { travelActivities } from "@/server/travel/schema"
import { createActivity, refuseSamePlace } from "@/server/travel/trips"
import { readVenue, type Venue } from "@/server/travel/maps-browser"
import { builtinTypeId } from "@/server/travel/types"

/**
 * A Google Maps link fills an activity in (task "Misc": "Add ability to add a
 * google map link and the app fills all the fields automatically including
 * the cover"; Tyler then picked "On an activity"). The link is read for the
 * place's name and position, Google finds the place, and the activity gets
 * its name, type, place, opening hours, website, phone and the place's first
 * Google photo as its picture, saved into the person's media library.
 *
 * Only Google's own addresses are ever fetched: a short link is followed one
 * hop at a time, and every hop must be a Google Maps address, so the server
 * can't be pointed anywhere else.
 *
 * With no Google key, the link alone fills the name and the map pin, and the
 * rest waits for the key (Tyler, 3 Nov 2026: "The map link to create details
 * automatically does not work", on a computer with no key).
 */

const TIMEOUT_MS = 10_000
const MAX_HOPS = 4

async function google(url: string, init: RequestInit = {}) {
  try {
    const response = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) })
    if (!response.ok) throw new Error(TRAVEL_ERRORS.googleFailed)
    return response
  } catch {
    throw new Error(TRAVEL_ERRORS.googleFailed)
  }
}

/** A short link's full address, following Google's redirects one hop at a time. */
async function fullLink(link: string) {
  let current = link.trim()
  for (let hop = 0; hop < MAX_HOPS; hop += 1) {
    if (!isMapsLink(current)) throw new Error(TRAVEL_ERRORS.notMapsLink)
    const url = new URL(current)
    if (url.hostname !== "maps.app.goo.gl" && url.hostname !== "goo.gl") return url
    let response: Response
    try {
      response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(TIMEOUT_MS) })
    } catch {
      throw new Error(TRAVEL_ERRORS.googleFailed)
    }
    const next = response.headers.get("location")
    if (!next) throw new Error(TRAVEL_ERRORS.notMapsLink)
    const target = new URL(next, url)
    // In some countries Google first asks about cookies, carrying the real
    // address in `continue`; that address is checked like any other.
    current = target.hostname === "consent.google.com" ? (target.searchParams.get("continue") ?? "") : target.toString()
  }
  throw new Error(TRAVEL_ERRORS.notMapsLink)
}

export type LinkClues = { name: string | null; lat: number | null; lng: number | null; placeId: string | null }

/** What a full Maps address says about its place: a name, a position, sometimes Google's place id. */
export function readLinkClues(url: URL): LinkClues {
  const placeId = url.searchParams.get("query_place_id") || url.searchParams.get("place_id")
  const query = url.searchParams.get("query") || url.searchParams.get("q")
  const named = /\/maps\/(?:place|search)\/([^/@]+)/.exec(url.pathname)?.[1]
  const name = named ? decodeURIComponent(named.replace(/\+/g, " ")) : query
  const at = /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/.exec(url.pathname)
  // A place's own pin (!3d lat !4d lng) beats where the map was centred.
  const pin = /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/.exec(url.pathname + url.search)
  const position = pin ?? at
  return {
    name: name?.trim() || null,
    lat: position ? Number(position[1]) : null,
    lng: position ? Number(position[2]) : null,
    placeId: placeId?.trim() || null,
  }
}

/** Google's place id for a link's clues, from Text Search near its position. */
async function findPlaceId(clues: LinkClues, key: string) {
  if (clues.placeId) return clues.placeId
  if (!clues.name) throw new Error(TRAVEL_ERRORS.mapsLinkNoPlace)
  const response = await google("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": "places.id" },
    body: JSON.stringify({
      textQuery: clues.name,
      ...(clues.lat !== null && clues.lng !== null
        ? { locationBias: { circle: { center: { latitude: clues.lat, longitude: clues.lng }, radius: 500 } } }
        : {}),
    }),
  })
  const body = (await response.json().catch(() => null)) as { places?: { id?: string }[] } | null
  const id = body?.places?.[0]?.id
  if (!id) throw new Error(TRAVEL_ERRORS.mapsLinkNoPlace)
  return id
}

type GoogleDetails = GoogleExtras & {
  id?: string
  displayName?: { text?: string }
  formattedAddress?: string
  location?: { latitude?: number; longitude?: number }
  regularOpeningHours?: { periods?: GooglePeriod[] }
  websiteUri?: string
  internationalPhoneNumber?: string
  photos?: { name?: string }[]
}

const DETAIL_FIELDS = [
  "id",
  "displayName",
  "formattedAddress",
  "location",
  "regularOpeningHours",
  "websiteUri",
  "internationalPhoneNumber",
  "primaryType",
  "types",
  "photos",
  // Google's stars, reviews and price (More Travel features part 1).
  "rating",
  "userRatingCount",
  "priceLevel",
].join(",")

/** Google's kinds of place, as one of the person's built-in types. */
export function builtinOf(types: readonly string[]): BuiltinType {
  const has = (...kinds: string[]) => kinds.some((kind) => types.includes(kind))
  if (has("airport")) return "flight"
  if (has("lodging", "hotel", "motel", "resort_hotel", "hostel", "bed_and_breakfast", "guest_house")) return "hotel"
  if (has("restaurant", "cafe", "bar", "bakery", "food", "meal_takeaway", "coffee_shop", "ramen_restaurant", "sushi_restaurant")) {
    return "food"
  }
  if (has("train_station", "subway_station", "bus_station", "transit_station", "ferry_terminal", "light_rail_station")) {
    return "transport"
  }
  if (
    has(
      "tourist_attraction",
      "museum",
      "park",
      "place_of_worship",
      "hindu_temple",
      "buddhist_temple",
      "church",
      "shrine",
      "art_gallery",
      "zoo",
      "aquarium",
      "amusement_park",
      "national_park",
      "historical_landmark",
      "observation_deck"
    )
  ) {
    return "sight"
  }
  return "other"
}

const BROWSER =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"

/**
 * The picture a Maps link carries, with no key (Tyler, 3 Nov 2026: "You dont
 * need google key to capture an image"): a photo of the place when the link's
 * page holds one, otherwise the map snapshot of the spot Google puts in every
 * link's preview, the picture chat apps show.
 */
export async function linkPicture(page: URL): Promise<Picture | null> {
  if (!isMapsLink(page.toString())) return null
  let html = ""
  try {
    const response = await fetch(page, {
      headers: { "User-Agent": BROWSER, "Accept-Language": "en" },
      redirect: "error",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!response.ok) return null
    html = (await response.text()).slice(0, 3_000_000)
  } catch {
    return null
  }
  const photo = /https:\/\/lh\d\.googleusercontent\.com\/(?:p|gps-cs-s|gps-proxy)\/[\w-]+/.exec(html)?.[0]
  if (photo) {
    const picture = await downloadPicture(`${photo}=w1200-h800-k-no`)
    if (picture && PHOTO_TYPES.has(picture.mimeType)) return picture
  }
  const preview =
    /<meta[^>]+content="([^"]+)"[^>]+property="og:image"/.exec(html)?.[1] ??
    /<meta[^>]+property="og:image"[^>]+content="([^"]+)"/.exec(html)?.[1]
  if (!preview) return null
  const picture = await downloadPicture(preview.replace(/&amp;/g, "&"))
  // The preview is a map of the spot, kept only when no photo turns up.
  return picture && PHOTO_TYPES.has(picture.mimeType) ? { ...picture, isMap: true } : null
}


/** A photo, not a map: anything from Google's photo addresses or Wikimedia. */
function isPhoto(picture: Picture | null): picture is Picture {
  return picture !== null && PHOTO_TYPES.has(picture.mimeType)
}

/**
 * The venue's picture, best first: Google's own photo (through the key, or
 * read from the venue's panel in a hidden browser), then the map snapshot
 * from the link's preview so the card still has something.
 */
async function venuePicture(first: () => Promise<Picture | null>, venue: Venue | null, page: URL): Promise<Picture | null> {
  const google = await first()
  if (isPhoto(google) && !google.isMap) return google
  if (venue?.photoUrl) {
    const photo = await downloadPicture(venue.photoUrl)
    if (isPhoto(photo)) return photo
  }
  const preview = await linkPicture(page)
  return isPhoto(preview) ? preview : null
}

/** Google's category words, as one of the person's built-in types: "Ramen restaurant" is Food. */
export function builtinOfCategory(category: string | null): BuiltinType {
  const text = (category ?? "").toLowerCase()
  if (!text) return "other"
  if (/airport/.test(text)) return "flight"
  if (/hotel|hostel|motel|inn\b|ryokan|resort|lodging|guest ?house|bed and breakfast|apartment/.test(text)) return "hotel"
  if (/restaurant|cafe|café|coffee|bar\b|pub|bakery|izakaya|ramen|sushi|food|diner|bistro|tea house|dessert|market/.test(text)) {
    return "food"
  }
  if (/station|terminal|bus stop|airport|ferry|port\b|subway|metro|railway/.test(text)) return "transport"
  if (
    /temple|shrine|museum|park|garden|gallery|tower|castle|church|cathedral|landmark|attraction|monument|zoo|aquarium|observation|viewpoint|palace|historical|theater|theatre|stadium|beach|mountain/.test(
      text
    )
  ) {
    return "sight"
  }
  return "other"
}

/** A venue's website, without the tracking Google adds to it. */
function cleanWebsite(link: string | null) {
  if (!link) return null
  try {
    const url = new URL(link)
    if (url.protocol !== "https:" && url.protocol !== "http:") return null
    for (const key of [...url.searchParams.keys()]) if (/^utm_/i.test(key)) url.searchParams.delete(key)
    // Google writes "?utm_source=gbp?utm_medium=organic", a second "?" inside the first value.
    return url.toString().replace(/\?$/, "").slice(0, 500)
  } catch {
    return null
  }
}

/** Fills an activity in from a Maps link. Returns what it filled, for the toast. */
export async function fillFromMapsLink(
  userId: string,
  input: { activityId: string; link: string },
  database: CustomShellDb = db
) {
  const { activity } = await requireActivity(userId, input.activityId, database)
  if (!isMapsLink(input.link)) throw new Error(TRAVEL_ERRORS.notMapsLink)
  const full = await fullLink(input.link)
  const clues = readLinkClues(full)
  const key = process.env.GOOGLE_MAPS_API_KEY?.trim()
  // With no key, the link alone still gives the place's name, its pin and a picture.
  if (!key) return fillFromClues(userId, activity, full, clues, database)
  const placeId = await findPlaceId(clues, key)
  if (!/^[\w-]{1,300}$/.test(placeId)) throw new Error(TRAVEL_ERRORS.mapsLinkNoPlace)
  const response = await google(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
    headers: { "X-Goog-Api-Key": key, "X-Goog-FieldMask": DETAIL_FIELDS },
  })
  const details = (await response.json().catch(() => null)) as GoogleDetails | null
  if (!details?.displayName?.text) throw new Error(TRAVEL_ERRORS.mapsLinkNoPlace)

  const title = details.displayName.text.slice(0, 200)
  const place: Place = {
    name: title,
    address: (details.formattedAddress ?? "").slice(0, 400),
    lat: details.location?.latitude ?? clues.lat,
    lng: details.location?.longitude ?? clues.lng,
    placeId: details.id ?? placeId,
    ...placeExtras(details),
  }
  // Checked before the photo is downloaded, so a skipped place costs no picture (More Travel features part 3).
  await refuseSamePlace(activity.tripId, { title, place }, activity.id, database)
  const typeId = await builtinTypeId(userId, builtinOf(place.kinds ?? []), database)
  const googleOwn = await googlePhoto(details.photos?.[0]?.name, key)
  // The hidden browser is only opened when Google's service has no photo.
  const venue = isPhoto(googleOwn) ? null : await readVenue(full, { name: title, lat: place.lat, lng: place.lng })
  const picture = await venuePicture(async () => googleOwn, venue, full)
  const photoUrl = picture ? await savePicture(userId, picture.data, picture.mimeType, title, database) : null
  const website = details.websiteUri && /^https?:\/\//.test(details.websiteUri) ? details.websiteUri.slice(0, 500) : null

  await database
    .update(travelActivities)
    .set({
      title,
      ...(typeId ? { typeId } : {}),
      place,
      openingHours: toOpeningHours(details.regularOpeningHours?.periods),
      ...(website ? { website } : {}),
      ...(details.internationalPhoneNumber ? { phone: details.internationalPhoneNumber.slice(0, 40) } : {}),
      ...(photoUrl ? { photoUrl, photoCredit: null } : {}),
      updatedAt: now(),
    })
    .where(eq(travelActivities.id, activity.id))
  return { title, photo: photoUrl !== null, partial: false }
}

/**
 * A new card filled from a Maps link. Paste Maps links (Travel features part
 * 6; Tyler, 3 Nov 2026: "Ideas, wait for photos") makes each at the end of
 * Ideas; a link that can't be read makes no card: the card made for it goes
 * again, for good, and the reason is thrown. New activity with a link
 * (`keepOnFailure`) keeps its card, named as typed, to fill by hand, and says
 * why the link didn't fill it. Either way, a place already on the trip makes
 * no card (More Travel features part 3: "Skip it, say where").
 */
export async function addActivityFromMapsLink(
  userId: string,
  input: { tripId: string; link: string; day?: number | null; title?: string; typeId?: string | null; startTime?: string | null },
  database: CustomShellDb = db,
  { keepOnFailure = false }: { keepOnFailure?: boolean } = {}
): Promise<{ id: string; title: string; photo: boolean; partial: boolean; failed?: string }> {
  if (!isMapsLink(input.link)) throw new Error(TRAVEL_ERRORS.notMapsLink)
  const typed = input.title?.trim() ?? ""
  const { id } = await createActivity(
    userId,
    {
      tripId: input.tripId,
      day: input.day ?? null,
      title: typed || "New place",
      typeId: input.typeId ?? null,
      startTime: input.day == null ? null : (input.startTime ?? null),
    },
    database
  )
  try {
    return { id, ...(await fillFromMapsLink(userId, { activityId: id, link: input.link }, database)) }
  } catch (error) {
    const reason = error instanceof Error ? error.message : ""
    if (keepOnFailure && !isAlreadyOnTrip(reason)) {
      // Only a sentence written for people goes back, never an internal error's own text.
      return { id, title: typed || "New place", photo: false, partial: false, failed: getTravelErrorMessage(error) }
    }
    await database.delete(travelActivities).where(eq(travelActivities.id, id))
    throw error
  }
}

/**
 * With no Google key: the venue's panel read in a hidden browser gives the
 * name, category, address, phone, website and main photo. When no panel
 * shows (or there's no browser on the server), the link's own name, address
 * and pin still fill in, with the map snapshot from its preview.
 */
async function fillFromClues(
  userId: string,
  activity: { id: string; tripId: string },
  page: URL,
  clues: LinkClues,
  database: CustomShellDb
) {
  if (!clues.name) throw new Error(TRAVEL_ERRORS.mapsLinkNoPlace)
  const [name, ...rest] = clues.name.split(",")
  const venue = await readVenue(page, { name: name.trim(), lat: clues.lat, lng: clues.lng })
  const title = (venue?.name || name.trim()).slice(0, 200)
  const place: Place = {
    name: title,
    address: (venue?.address ?? rest.join(",").trim()).slice(0, 400),
    lat: clues.lat,
    lng: clues.lng,
    placeId: clues.placeId,
  }
  await refuseSamePlace(activity.tripId, { title, place }, activity.id, database)
  const picture = await venuePicture(async () => null, venue, page)
  const photoUrl = picture ? await savePicture(userId, picture.data, picture.mimeType, title, database) : null
  const typeId = venue?.category ? await builtinTypeId(userId, builtinOfCategory(venue.category), database) : null
  const website = cleanWebsite(venue?.website ?? null)
  await database
    .update(travelActivities)
    .set({
      title,
      ...(typeId ? { typeId } : {}),
      place,
      ...(website ? { website } : {}),
      ...(venue?.phone ? { phone: venue.phone.replace(/[^0-9+()\-.\s]/g, "").trim().slice(0, 40) || null } : {}),
      ...(photoUrl ? { photoUrl, photoCredit: null } : {}),
      updatedAt: now(),
    })
    .where(eq(travelActivities.id, activity.id))
  // Partial now means only that hours need the key; a venue read in the browser has the rest.
  return { title, photo: photoUrl !== null, partial: venue === null }
}
