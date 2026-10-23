import { NextRequest, NextResponse } from "@/lib/web-response"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { sites } from "@/lib/db/schema"
import { getAuthenticatedUser } from "@/lib/db/helpers"
import { getGoogleMapsConfig } from "@/lib/actions/integrations/config-helpers"
import { getSiteFromHeaders } from "@/lib/utils/site-resolver"
import { isUuid } from "@/lib/utils/validation"
import {
  DIRECTORY_OPENING_HOURS_FIELD_MASK,
  normalizeDirectoryOpeningHoursPlaceId,
  parseDirectoryOpeningHoursPlace,
} from "@/lib/actions/directories/directory-opening-hours"

function openingHoursResponse(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  })
}

async function getSiteIdForRequest(request: NextRequest) {
  const requestedSiteId = request.nextUrl.searchParams.get("siteId")

  if (requestedSiteId) {
    if (!isUuid(requestedSiteId)) {
      return { error: "Invalid site ID", status: 400 }
    }

    const user = await getAuthenticatedUser()
    if (!user) return { error: "Authentication required", status: 401 }

    const [site] = await db
      .select({ id: sites.id, userId: sites.userId })
      .from(sites)
      .where(eq(sites.id, requestedSiteId))
      .limit(1)

    if (!site || site.userId !== user.id) {
      return { error: "Site not found or unauthorized", status: 403 }
    }

    return { siteId: site.id }
  }

  const result = await getSiteFromHeaders()
  if (!result.success || !result.site) {
    return { error: "Site not found", status: 404 }
  }

  return { siteId: result.site.id }
}

export async function GET(request: NextRequest) {
  const placeId = normalizeDirectoryOpeningHoursPlaceId(request.nextUrl.searchParams.get("placeId"))

  if (!placeId) {
    return openingHoursResponse({ data: null, error: "Google Place ID is required" }, 400)
  }

  try {
    const siteResult = await getSiteIdForRequest(request)
    if ("error" in siteResult) {
      return openingHoursResponse({ data: null, error: siteResult.error }, siteResult.status)
    }

    const googleMapsConfig = await getGoogleMapsConfig(siteResult.siteId)
    if (!googleMapsConfig?.apiKey) {
      return openingHoursResponse({ data: null, error: "Opening hours are unavailable" })
    }

    const params = new URLSearchParams({
      fields: DIRECTORY_OPENING_HOURS_FIELD_MASK,
      languageCode: "en",
    })
    const googleResponse = await fetch(
      `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?${params.toString()}`,
      {
        cache: "no-store",
        headers: {
          "X-Goog-Api-Key": googleMapsConfig.apiKey,
        },
      }
    )

    if (!googleResponse.ok) {
      return openingHoursResponse({ data: null, error: "Opening hours are unavailable" }, 502)
    }

    const place = await googleResponse.json()
    const data = parseDirectoryOpeningHoursPlace(place)

    if (!data) {
      return openingHoursResponse({ data: null, error: "Opening hours are unavailable" })
    }

    return openingHoursResponse({ data })
  } catch (error) {
    console.error("Opening hours lookup failed:", error)
    return openingHoursResponse({ data: null, error: "Opening hours are unavailable" }, 500)
  }
}
