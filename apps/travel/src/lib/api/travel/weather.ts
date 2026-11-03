import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { id } from "@/lib/travel/rules"
import { userGet } from "@/server/guards"
import { loadTripWeather } from "@/server/travel/weather"

const weatherFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(z.object({ tripId: id }))
  .handler(async ({ data, context }) => loadTripWeather(context.user.id, data.tripId))

/** The forecast for each of the trip's days in the next 14 days. Empty when there's none to show. */
export function loadWeather(tripId: string) {
  return weatherFn({ data: { tripId } })
}
