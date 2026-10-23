import { createServerFn } from "@tanstack/react-start"
import { setEventRecurrenceImpl } from "./event-recurrence.server"

export const setEventRecurrenceAction = createServerFn({ method: "POST" })
  .inputValidator((data: { eventId: string; rule: unknown }) => data)
  .handler(async ({ data }) => setEventRecurrenceImpl(data.eventId, data.rule))
