import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { id } from "@/lib/travel/rules"
import { userPost } from "@/server/guards"
import { makeCalendarLink, resetCalendarLink } from "@/server/travel/calendar"

export type { CalendarLink } from "@/server/travel/calendar"

// Both are POSTs: the first one asked for writes the trip's secret.
const makeCalendarLinkFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ tripId: id }))
  .handler(async ({ data, context }) => makeCalendarLink(context.user.id, data.tripId))

const resetCalendarLinkFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ tripId: id }))
  .handler(async ({ data, context }) => resetCalendarLink(context.user.id, data.tripId))

export function getCalendarLink(tripId: string) {
  return makeCalendarLinkFn({ data: { tripId } })
}
export function replaceCalendarLink(tripId: string) {
  return resetCalendarLinkFn({ data: { tripId } })
}
