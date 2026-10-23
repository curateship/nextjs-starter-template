import { createServerFn } from "@tanstack/react-start"
import { getEventsCalendarDataImpl } from "./page-events-calendar-actions.server"

// Types stay importable from this path. `export type` is erased at runtime,
// so no server code reaches the client through it.
export type * from "./page-events-calendar-actions.server"

export const getEventsCalendarData = createServerFn({ method: "POST" })
  .inputValidator((data: { params: { siteId: string } }) => data)
  .handler(async ({ data }) => getEventsCalendarDataImpl(data.params))
