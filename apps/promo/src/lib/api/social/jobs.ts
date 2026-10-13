import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { adminGet, adminPost } from "@/server/guards"
import { cancelJobs, listJobs, retryJobs, type JobList, type JobRow } from "@/server/social/job-list"

import { createErrorMessage } from "../error-message"

export type { JobList, JobRow }

/**
 * The browser program's queue, for the Jobs dashboard. Admin-only, like
 * every other Promo screen.
 */

export const getJobsErrorMessage = createErrorMessage({}, "The jobs could not be read. Please try again.")

const loadFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async ({ context }): Promise<JobList> => listJobs(context.user.id))

export function loadJobs() {
  return loadFn()
}

const ids = z.object({ ids: z.array(z.string().min(1)).min(1).max(200) })

const cancelFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(ids)
  .handler(async ({ context, data }) => cancelJobs(context.user.id, data.ids))

/** Takes waiting jobs off the queue. One already running is left to finish. */
export function cancelWaitingJobs(jobIds: string[]) {
  return cancelFn({ data: { ids: jobIds } })
}

const retryFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(ids)
  .handler(async ({ context, data }) => retryJobs(context.user.id, data.ids))

/** Puts failed jobs that only read back on the queue. */
export function retryFailedJobs(jobIds: string[]) {
  return retryFn({ data: { ids: jobIds } })
}
