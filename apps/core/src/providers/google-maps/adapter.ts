import type { ProviderExecutionStatus } from "@/providers/types"

const apiBase = "https://api.apify.com/v2"
const categoryFilterWordsByKeyword: Record<string, string> = {
  bar: "bar",
  bars: "bar",
  cafe: "cafe",
  cafes: "cafe",
  restaurant: "restaurant",
  restaurants: "restaurant",
}
const customGeolocationRadiusKm = 0.5

export type GoogleMapsInput = {
  keyword: string
  location: string
  latitude: number | null
  longitude: number | null
  language: string
  maxResults: number
}

type ApifyRun = {
  id: string
  status: string
  statusMessage?: string | null
  defaultDatasetId?: string | null
  startedAt?: string | null
  finishedAt?: string | null
}

export function buildActorInput(input: GoogleMapsInput) {
  const keyword = input.keyword.trim()
  const location = input.location.trim()
  const customGeolocation = customGeolocationForInput(input)
  const categoryFilterWords = categoryFilterWordsForKeyword(keyword)

  return {
    searchStringsArray: [customGeolocation ? keyword : `${keyword} in ${location}`],
    ...(!customGeolocation ? { locationQuery: location } : {}),
    maxCrawledPlacesPerSearch: input.maxResults,
    language: input.language,
    ...(customGeolocation ? { customGeolocation } : {}),
    ...(categoryFilterWords.length ? { categoryFilterWords } : {}),
  }
}

export function mapApifyStatus(status: string): ProviderExecutionStatus {
  if (status === "READY") return "queued"
  if (status === "RUNNING" || status === "TIMING-OUT") return "running"
  if (status === "SUCCEEDED") return "succeeded"
  if (status === "ABORTING" || status === "ABORTED") return "aborted"
  return "failed"
}

export async function startActor({
  token,
  actorId,
  input,
}: {
  token: string
  actorId: string
  input: GoogleMapsInput
}) {
  const url = new URL(`${apiBase}/acts/${encodeActorId(actorId)}/runs`)
  url.searchParams.set("maxItems", String(input.maxResults))
  const result = await apifyRequest<{ data: ApifyRun }>(url, token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildActorInput(input)),
  })
  return result.data
}

export async function getRun(token: string, runId: string) {
  const url = new URL(`${apiBase}/actor-runs/${encodeURIComponent(runId)}`)
  return apifyRequest<{ data: ApifyRun }>(url, token).then((result) => result.data)
}

export async function getDatasetItems(token: string, datasetId: string, limit: number) {
  const url = new URL(`${apiBase}/datasets/${encodeURIComponent(datasetId)}/items`)
  url.searchParams.set("format", "json")
  url.searchParams.set("clean", "1")
  url.searchParams.set("limit", String(limit))
  return apifyRequest<Record<string, unknown>[]>(url, token)
}

export function normalizeResult(item: Record<string, unknown>) {
  const placeId = text(item, ["placeId", "place_id"])
  const mapsUrl = url(item, ["url", "googleUrl", "googleMapsUrl"])
  const businessName = text(item, ["title", "name"]) ?? "Untitled place"

  return {
    externalId: placeId ?? text(item, ["cid", "fid", "id"]) ?? mapsUrl,
    title: businessName,
    data: {
      businessName,
      category: category(item),
      categoryName: text(item, ["categoryName"]),
      neighborhood: text(item, ["neighborhood"]),
      address: text(item, ["address", "street"]),
      street: text(item, ["street"]),
      city: text(item, ["city"]),
      state: text(item, ["state"]),
      countryCode: text(item, ["countryCode"]),
      region: text(item, ["state"]),
      country: text(item, ["countryCode"]),
      phone: text(item, ["phone", "phoneNumber", "phoneUnformatted"]),
      website: url(item, ["website", "websiteUrl"]),
      rating: number(item, ["totalScore", "rating", "stars"]),
      reviewCount: integer(item, ["reviewsCount", "reviewCount", "reviews"]),
      mapsUrl,
      latitude: locationNumber(item, ["lat", "latitude"]),
      longitude: locationNumber(item, ["lng", "longitude"]),
      placeId,
      sourceImageUrl: imageUrl(item),
      raw: item,
    },
  }
}

function encodeActorId(actorId: string) {
  return encodeURIComponent(actorId.trim().replace("/", "~"))
}

function customGeolocationForInput(input: GoogleMapsInput) {
  if (input.latitude === null || input.longitude === null) return null
  const latitudeOffset = customGeolocationRadiusKm / 111.32
  const longitudeOffset = customGeolocationRadiusKm / (111.32 * Math.cos(input.latitude * Math.PI / 180))
  const north = input.latitude + latitudeOffset
  const south = input.latitude - latitudeOffset
  const east = input.longitude + longitudeOffset
  const west = input.longitude - longitudeOffset

  return {
    type: "Polygon",
    coordinates: [[
      [west, south],
      [east, south],
      [east, north],
      [west, north],
      [west, south],
    ]],
  }
}

function categoryFilterWordsForKeyword(keyword: string) {
  const category = categoryFilterWordsByKeyword[keyword.trim().toLowerCase()]
  return category ? [category] : []
}

async function apifyRequest<T>(url: URL, token: string, init: RequestInit = {}) {
  const response = await fetch(url, {
    ...init,
    headers: { ...init.headers, Authorization: `Bearer ${token}` },
  })
  if (response.ok) return response.json() as Promise<T>

  try {
    const body = (await response.json()) as { error?: { message?: string } }
    throw new Error(body.error?.message || `Apify request failed (${response.status}).`)
  } catch (error) {
    if (error instanceof Error) throw error
    throw new Error(`Apify request failed (${response.status}).`)
  }
}

function text(item: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = item[key]
    if (typeof value === "string" && value.trim()) return value.trim()
  }
  return null
}

function url(item: Record<string, unknown>, keys: string[]) {
  const value = text(item, keys)
  if (!value) return null
  try {
    const parsed = new URL(value)
    return ["http:", "https:"].includes(parsed.protocol) ? parsed.toString() : null
  } catch {
    return null
  }
}

function number(item: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = item[key]
    const parsed =
      typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function integer(item: Record<string, unknown>, keys: string[]) {
  const value = number(item, keys)
  return value === null ? null : Math.trunc(value)
}

function category(item: Record<string, unknown>) {
  return Array.isArray(item.categories)
    ? item.categories.filter((value) => typeof value === "string").join(", ") || null
    : text(item, ["category", "type"])
}

function imageUrl(item: Record<string, unknown>) {
  const direct = url(item, [
    "imageUrl",
    "image",
    "photoUrl",
    "thumbnailUrl",
    "mainImageUrl",
  ])
  if (direct) return direct

  for (const key of ["imageUrls", "images", "photos", "photoUrls"]) {
    const value = item[key]
    if (!Array.isArray(value)) continue
    for (const entry of value) {
      if (typeof entry === "string") {
        const parsed = url({ entry }, ["entry"])
        if (parsed) return parsed
      }
      if (entry && typeof entry === "object" && !Array.isArray(entry)) {
        const parsed = url(entry as Record<string, unknown>, [
          "url",
          "imageUrl",
          "photoUrl",
          "thumbnailUrl",
        ])
        if (parsed) return parsed
      }
    }
  }

  return null
}

function locationNumber(item: Record<string, unknown>, keys: string[]) {
  const direct = number(item, keys)
  if (direct !== null) return direct
  return item.location && typeof item.location === "object" && !Array.isArray(item.location)
    ? number(item.location as Record<string, unknown>, keys)
    : null
}
