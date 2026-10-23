import { createServerFn } from "@tanstack/react-start"
import {
  checkInAttendeeActionImpl,
  checkInByCodeActionImpl,
  getEventCheckInBoardActionImpl,
  getTicketCheckInStateActionImpl,
} from "./event-check-in-actions.server"

// Types stay importable from this path. `export type` is erased at runtime,
// so no server code reaches the client through it.
export type * from "./event-check-in-actions.server"

export const getEventCheckInBoardAction = createServerFn({ method: "POST" })
  .inputValidator((data: { siteId: string; eventId?: string }) => data)
  .handler(async ({ data }) => getEventCheckInBoardActionImpl(data))

export const checkInByCodeAction = createServerFn({ method: "POST" })
  .inputValidator((data: { scanned: string; eventId?: string }) => data)
  .handler(async ({ data }) => checkInByCodeActionImpl(data))

export const checkInAttendeeAction = createServerFn({ method: "POST" })
  .inputValidator((data: { registrationId: string }) => data)
  .handler(async ({ data }) => checkInAttendeeActionImpl(data))

export const getTicketCheckInStateAction = createServerFn({ method: "POST" })
  .inputValidator((data: { code: string }) => data)
  .handler(async ({ data }) => getTicketCheckInStateActionImpl(data))
