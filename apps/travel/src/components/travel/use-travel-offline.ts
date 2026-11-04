import { getRouteApi } from "@tanstack/react-router"

import { useOfflinePages, useOnline } from "@/lib/hooks/use-offline-pages"

const authenticated = getRouteApi("/_authenticated")

/** The pages that open with no signal: the Trips table and every trip (Travel features part 10). */
const TRAVEL_OFFLINE_PAGES = ["/trips"]

/**
 * Keeps the Trips table and each trip opened, so they open again with no
 * signal (Tyler, 3 Nov 2026: "Read only"), and says whether there is no
 * signal now. With none, Travel shows the "No signal" line and turns every
 * change off, since a change can't reach the server.
 */
export function useTravelOffline() {
  const { user } = authenticated.useLoaderData()
  useOfflinePages(TRAVEL_OFFLINE_PAGES, user.id)
  return !useOnline()
}
