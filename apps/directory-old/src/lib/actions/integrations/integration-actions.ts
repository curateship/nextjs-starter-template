import { createServerFn } from "@tanstack/react-start"
import { getSiteIntegrationImpl, getSiteIntegrationsImpl, createOrUpdateIntegrationImpl } from "./integration-actions.server"

// Types stay importable from this path. `export type` is erased at runtime,
// so no server code reaches the client through it.
export type * from "./integration-actions.server"

export const getSiteIntegration = createServerFn({ method: "POST" })
  .inputValidator((data: { siteId: string; integrationType: string }) => data)
  .handler(async ({ data }) => getSiteIntegrationImpl(data.siteId, data.integrationType))

export const getSiteIntegrations = createServerFn({ method: "POST" })
  .inputValidator((data: { siteId: string }) => data)
  .handler(async ({ data }) => getSiteIntegrationsImpl(data.siteId))

export const createOrUpdateIntegration = createServerFn({ method: "POST" })
  .inputValidator((data: { siteId: string; integrationType: string; config: Record<string, any> }) => data)
  .handler(async ({ data }) => createOrUpdateIntegrationImpl(data.siteId, data.integrationType, data.config))
