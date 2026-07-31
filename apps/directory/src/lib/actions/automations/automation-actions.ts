import { createServerFn } from "@tanstack/react-start"
import {
  createAutomationImpl,
  deleteAutomationsImpl,
  duplicateAutomationImpl,
  getAutomationEditorDataImpl,
  getAutomationsBySiteImpl,
  getRecentAutomationRunsForSiteImpl,
  getRecentAutomationRunsForUserImpl,
  runAutomationNowImpl,
  saveAutomationImpl,
  setAutomationStatusImpl,
} from "./automation-actions.server"
import type { ListOptions } from "./automation-actions.server"

// Types stay importable from this path. `export type` is erased at runtime,
// so no server code reaches the client through it.
export type * from "./automation-actions.server"

export const getAutomationsBySite = createServerFn({ method: "POST" })
  .inputValidator((data: { siteId: string; options?: ListOptions }) => data)
  .handler(async ({ data }) => getAutomationsBySiteImpl(data.siteId, data.options))

export const getRecentAutomationRunsForUser = createServerFn({ method: "POST" })
  .inputValidator((data: { limit?: number }) => data)
  .handler(async ({ data }) => getRecentAutomationRunsForUserImpl(data.limit))

export const getRecentAutomationRunsForSite = createServerFn({ method: "POST" })
  .inputValidator((data: { siteId: string; limit?: number }) => data)
  .handler(async ({ data }) => getRecentAutomationRunsForSiteImpl(data.siteId, data.limit))

export const getAutomationEditorData = createServerFn({ method: "POST" })
  .inputValidator((data: { automationId: string }) => data)
  .handler(async ({ data }) => getAutomationEditorDataImpl(data.automationId))

export const createAutomation = createServerFn({ method: "POST" })
  .inputValidator((data: { siteId: string; name: string }) => data)
  .handler(async ({ data }) => createAutomationImpl(data))

export const saveAutomation = createServerFn({ method: "POST" })
  .inputValidator((data: { automationId: string; name: string; graph: unknown }) => data)
  .handler(async ({ data }) => saveAutomationImpl(data))

export const setAutomationStatus = createServerFn({ method: "POST" })
  .inputValidator((data: { automationId: string; status: 'active' | 'paused' }) => data)
  .handler(async ({ data }) => setAutomationStatusImpl(data.automationId, data.status))

export const duplicateAutomation = createServerFn({ method: "POST" })
  .inputValidator((data: { automationId: string }) => data)
  .handler(async ({ data }) => duplicateAutomationImpl(data.automationId))

export const deleteAutomations = createServerFn({ method: "POST" })
  .inputValidator((data: { automationIds: string[] }) => data)
  .handler(async ({ data }) => deleteAutomationsImpl(data.automationIds))

export const runAutomationNow = createServerFn({ method: "POST" })
  .inputValidator((data: { automationId: string }) => data)
  .handler(async ({ data }) => runAutomationNowImpl(data.automationId))
