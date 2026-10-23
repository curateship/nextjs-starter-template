import { createServerFn } from "@tanstack/react-start"
import { getCronStatusImpl, getCronJobsImpl, toggleCronJobImpl } from "./cron-actions.server"

// Types stay importable from this path. `export type` is erased at runtime,
// so no server code reaches the client through it.
export type * from "./cron-actions.server"

export const getCronStatus = createServerFn({ method: "POST" })
  .inputValidator((data: { siteId: string }) => data)
  .handler(async ({ data }) => getCronStatusImpl(data.siteId))

export const getCronJobs = createServerFn({ method: "POST" })
  
  .handler(async () => getCronJobsImpl())

export const toggleCronJob = createServerFn({ method: "POST" })
  .inputValidator((data: { jobId: string; enabled: boolean }) => data)
  .handler(async ({ data }) => toggleCronJobImpl(data.jobId, data.enabled))
