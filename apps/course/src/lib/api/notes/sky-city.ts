import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import type { SkyCity } from "@/lib/notes/sky-city"
import { adminPost } from "@/server/guards"

import { createErrorMessage } from "../error-message"

/**
 * Finds the city typed in Settings → General → Sky city, for the cover sky's
 * real sunrise and sunset (`src/lib/notes/sky-city.ts`). Open-Meteo's
 * geocoding is free and needs no key, as Project's weather uses it. Asked
 * from the server, once, when the field is left; the sky then works out its
 * sun times on its own with no service at all.
 */
const GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search"
const TIMEOUT_MS = 4000
const SKY_CITY_UNAVAILABLE = "SKY_CITY_UNAVAILABLE"

const findFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ name: z.string().trim().min(1).max(100) }))
  .handler(async ({ data }): Promise<SkyCity | null> => {
    const url = `${GEOCODING_URL}?${new URLSearchParams({ name: data.name, count: "1", language: "en", format: "json" })}`
    const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) }).catch(() => null)
    if (!response?.ok) throw new Error(SKY_CITY_UNAVAILABLE)
    const body = (await response.json().catch(() => null)) as {
      results?: { name: string; latitude: number; longitude: number; admin1?: string; country?: string }[]
    } | null
    const place = body?.results?.[0]
    if (!place) return null
    return {
      label: [place.name, place.admin1 ?? place.country].filter(Boolean).join(", ").slice(0, 120),
      latitude: place.latitude,
      longitude: place.longitude,
    }
  })

/** The city found for `name`, or null when there is none by that name. */
export function findSkyCity(name: string) {
  return findFn({ data: { name } })
}

export const getSkyCityErrorMessage = createErrorMessage(
  { [SKY_CITY_UNAVAILABLE]: "The city search did not answer. Try again in a moment." },
  "That city could not be looked up. Try again."
)
