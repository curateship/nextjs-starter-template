import { createServerFn } from "@tanstack/react-start"
import { getMailDashboardActionImpl, saveMxrouteIntegrationActionImpl, createMailboxActionImpl, setupMailDomainActionImpl, disableMailboxActionImpl } from "./mail-actions.server"
import type { SaveMxrouteInput, CreateMailboxInput } from "./mail-actions.server"

// Types stay importable from this path. `export type` is erased at runtime,
// so no server code reaches the client through it.
export type * from "./mail-actions.server"

export const getMailDashboardAction = createServerFn({ method: "POST" })
  .inputValidator((data: { siteId: string }) => data)
  .handler(async ({ data }) => getMailDashboardActionImpl(data.siteId))

export const saveMxrouteIntegrationAction = createServerFn({ method: "POST" })
  .inputValidator((data: { input: SaveMxrouteInput }) => data)
  .handler(async ({ data }) => saveMxrouteIntegrationActionImpl(data.input))

export const createMailboxAction = createServerFn({ method: "POST" })
  .inputValidator((data: { input: CreateMailboxInput }) => data)
  .handler(async ({ data }) => createMailboxActionImpl(data.input))

export const setupMailDomainAction = createServerFn({ method: "POST" })
  .inputValidator((data: { siteId: string }) => data)
  .handler(async ({ data }) => setupMailDomainActionImpl(data.siteId))

export const disableMailboxAction = createServerFn({ method: "POST" })
  .inputValidator((data: { siteId: string; mailboxId: string }) => data)
  .handler(async ({ data }) => disableMailboxActionImpl(data.siteId, data.mailboxId))
