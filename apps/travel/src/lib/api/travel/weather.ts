import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { id } from "@/lib/travel/rules"
import { userGet } from "@/server/guards"
import type { TripWeather } from "@/lib/travel/weather"
import { loadTripOutlook } from "@/server/travel/trip-outlook"
import { loadTripWeather } from "@/server/travel/weather"

const weatherFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(z.object({ tripId: id }))
  .handler(async ({ data, context }): Promise<TripWeather> => {
    // The outlook is an extra: if it fails, the forecast still shows.
    const [forecast, outlook] = await Promise.all([
      loadTripWeather(context.user.id, data.tripId),
      loadTripOutlook(context.user.id, data.tripId).catch(() => ({ typical: [], holidays: [] })),
    ])
    return { forecast, ...outlook }
  })

/**
 * Each trip day's forecast in the next 14 days, what later days are usually
 * like (More Travel features part 7) and the public holidays (part 8). Empty
 * lists when there's none to show.
 */
export function loadWeather(tripId: string) {
  return weatherFn({ data: { tripId } })
}
