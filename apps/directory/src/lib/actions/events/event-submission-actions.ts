import { createServerFn } from "@tanstack/react-start"
import {
  submitEventSubmissionActionImpl,
  getEventSubmissionListActionImpl,
  reviewEventSubmissionActionImpl,
} from "./event-submission-actions.server"
import type { EventSubmissionStatus } from "./event-submission-actions.server"

// Types stay importable from this path. `export type` is erased at runtime,
// so no server code reaches the client through it.
export type * from "./event-submission-actions.server"

export const submitEventSubmissionAction = createServerFn({ method: "POST" })
  .inputValidator((data: { input: {
  siteId: string
  eventName: string
  description?: string
  dateTimeText?: string
  location?: string
  submitterEmail: string
  honeypot?: string
} }) => data)
  .handler(async ({ data }) => submitEventSubmissionActionImpl(data.input))

export const getEventSubmissionListAction = createServerFn({ method: "POST" })
  .inputValidator((data: { siteId: string; status?: EventSubmissionStatus }) => data)
  .handler(async ({ data }) => getEventSubmissionListActionImpl(data.siteId, data.status))

export const reviewEventSubmissionAction = createServerFn({ method: "POST" })
  .inputValidator((data: { input: {
  submissionId: string
  status: 'approved' | 'rejected'
  note?: string
} }) => data)
  .handler(async ({ data }) => reviewEventSubmissionActionImpl(data.input))
