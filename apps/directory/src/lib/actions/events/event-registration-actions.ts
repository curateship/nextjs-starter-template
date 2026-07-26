import { createServerFn } from "@tanstack/react-start"
import {
  cancelEventRegistrationActionImpl,
  confirmEventTicketCheckoutActionImpl,
  createEventTicketCheckoutActionImpl,
  getEventRegistrationListActionImpl,
  getEventRegistrationStateActionImpl,
  submitEventRegistrationActionImpl,
} from "./event-registration-actions.server"

// Types stay importable from this path. `export type` is erased at runtime,
// so no server code reaches the client through it.
export type * from "./event-registration-actions.server"

export const getEventRegistrationStateAction = createServerFn({ method: "POST" })
  .inputValidator((data: { siteId: string; eventSlug: string }) => data)
  .handler(async ({ data }) => getEventRegistrationStateActionImpl(data))

export const submitEventRegistrationAction = createServerFn({ method: "POST" })
  .inputValidator((data: { input: {
  siteId: string
  eventSlug: string
  name: string
  email: string
  honeypot?: string
} }) => data)
  .handler(async ({ data }) => submitEventRegistrationActionImpl(data.input))

export const createEventTicketCheckoutAction = createServerFn({ method: "POST" })
  .inputValidator((data: { input: {
  siteId: string
  eventSlug: string
  name: string
  email: string
  honeypot?: string
} }) => data)
  .handler(async ({ data }) => createEventTicketCheckoutActionImpl(data.input))

export const confirmEventTicketCheckoutAction = createServerFn({ method: "POST" })
  .inputValidator((data: { siteId: string; sessionId: string }) => data)
  .handler(async ({ data }) => confirmEventTicketCheckoutActionImpl(data))

export const getEventRegistrationListAction = createServerFn({ method: "POST" })
  .inputValidator((data: { siteId: string; eventId?: string }) => data)
  .handler(async ({ data }) => getEventRegistrationListActionImpl(data))

export const cancelEventRegistrationAction = createServerFn({ method: "POST" })
  .inputValidator((data: { registrationId: string }) => data)
  .handler(async ({ data }) => cancelEventRegistrationActionImpl(data))
