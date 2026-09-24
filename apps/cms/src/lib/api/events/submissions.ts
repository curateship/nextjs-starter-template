import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import {
  EVENT_SUBMISSION_MAX_LENGTH,
  emptyEventSubmission,
  eventPhotoProblem,
  type EventSubmissionField,
  type EventSubmissionValues,
} from "@/lib/events/event-submission-fields"
import { timeZoneLabel, wallClockAt } from "@/lib/events/event-time"
import { requestIp, requireAppOrigin } from "@/server/auth/origin"
import { findCurrentUser } from "@/server/auth/security"
import { readPageVisibility } from "@/server/content/pages"
import { tellAdminsAboutEventSubmission } from "@/server/directory/notify"
import { visitorSite } from "@/server/directory/public"
import { siteTimeZone } from "@/server/directory/settings"
import { eventsAccessFor } from "@/server/events/public"
import {
  createEventSubmission,
  decideEventSubmission,
  EVENT_SUBMISSION_STATUSES,
  listEventSubmissions,
  pendingEventSubmissionCount,
  type EventSubmission,
  type EventSubmissionStatus,
} from "@/server/events/submissions"
import { adminGet, adminPost } from "@/server/guards"
import { getStorageSettingsStatus } from "@/server/media/storage-settings"
import { workspaceIdForRequest } from "@/server/workspaces/for-request"

import { createErrorMessage } from "../error-message"

export type { EventSubmission, EventSubmissionStatus }

/**
 * The Suggest an event page's two doors, and the admin queue's two.
 *
 * The public two are open to anybody, which is the feature, and are written
 * down in `src/app/open-endpoints.ts`. Each checks for itself rather than
 * trusting the page that called it: the site comes from the address, never
 * the request; the page's own switch and the Events page's are both read, so
 * a site that switched the form off takes nothing; and the send insists the
 * request came from this app's own pages.
 */

/** The fallback when something unexpected fails, never the server's words. */
export const getEventSubmissionErrorMessage = createErrorMessage(
  {},
  "That could not be sent. Please try again."
)

/** Whether this visitor may use a page, by its switch on the Pages screen. */
async function mayUsePage(siteId: string, path: string) {
  const visibility = await readPageVisibility(siteId, path)
  if (visibility === "everyone") return true
  if (visibility !== "members") return false
  return Boolean(await findCurrentUser().catch(() => null))
}

/** The visited site, when both the form and the Events page are open to this visitor. */
async function siteTakingSuggestions() {
  const site = await visitorSite()
  if (!site) return null
  const [formOpen, eventsOpen] = await Promise.all([
    mayUsePage(site.id, "/add-event"),
    eventsAccessFor(site.id, async () =>
      Boolean(await findCurrentUser().catch(() => null))
    ),
  ])
  return formOpen && eventsOpen ? site : null
}

async function siteToday(siteId: string) {
  const timeZone = await siteTimeZone(siteId)
  return { timeZone, today: wallClockAt(timeZone, new Date()).slice(0, 10) }
}

export type EventSubmissionForm = {
  siteName: string
  /** "2026-09-24", the site's today. A day before it is refused. */
  today: string
  /** "Eastern Time", the zone the times are in. */
  zone: string
  /** False while the site has no file storage, and then the form has no photo. */
  photosAllowed: boolean
}

const readEventSubmissionFormFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<EventSubmissionForm | null> => {
    const site = await siteTakingSuggestions()
    if (!site) return null
    const [{ timeZone, today }, storage] = await Promise.all([
      siteToday(site.id),
      getStorageSettingsStatus(),
    ])
    return {
      siteName: site.name,
      today,
      zone: timeZoneLabel(timeZone),
      photosAllowed: storage.ready,
    }
  }
)

/** What the Suggest an event page needs to draw itself, or null when it is closed. */
export function loadEventSubmissionForm() {
  return readEventSubmissionFormFn()
}

/** The hidden box a person never sees. A bot fills every box it finds. */
export const EVENT_SUBMISSION_TRAP = "homepage"

/** The box names the form sends, which are the value names. */
const FIELDS = Object.keys(emptyEventSubmission()) as EventSubmissionField[]

const submitEventFn = createServerFn({ method: "POST" })
  .inputValidator((data) => {
    if (!(data instanceof FormData)) throw new Error("Expected form data")
    const values = emptyEventSubmission()
    for (const field of FIELDS) {
      const value = data.get(field)
      // Past the box's own limit is cut here and refused by the check.
      values[field] =
        typeof value === "string"
          ? value.slice(0, EVENT_SUBMISSION_MAX_LENGTH[field] + 1)
          : ""
    }
    const photo = data.get("photo")
    const trap = data.get(EVENT_SUBMISSION_TRAP)
    return {
      values,
      photo: photo instanceof File && photo.size > 0 ? photo : null,
      trapped: typeof trap === "string" && trap.trim().length > 0,
    }
  })
  .handler(
    async ({
      data,
    }): Promise<{ sent: true } | { sent: false; problem: string }> => {
      // No guard can say "anybody, but only from our own pages", so this is
      // the same check every guarded POST runs.
      requireAppOrigin()

      const site = await siteTakingSuggestions()
      if (!site) {
        return {
          sent: false,
          problem: "This site is not taking event suggestions right now.",
        }
      }
      // A bot is told it worked, so it learns nothing, and nothing is kept.
      if (data.trapped) return { sent: true }

      // Refused before its bytes are copied out of the request.
      const photoProblem = data.photo ? eventPhotoProblem(data.photo) : null
      if (photoProblem) return { sent: false, problem: photoProblem }

      const { today } = await siteToday(site.id)
      const photo = data.photo
        ? {
            name: data.photo.name,
            type: data.photo.type,
            bytes: new Uint8Array(await data.photo.arrayBuffer()),
          }
        : null
      const result = await createEventSubmission(
        site.id,
        { ...data.values, photo },
        { ip: requestIp(), today }
      )
      if (result.outcome === "refused") {
        return { sent: false, problem: result.problem }
      }
      if (result.outcome === "sent") {
        await tellAdminsAboutEventSubmission(site.id, result.submission.title)
      }
      return { sent: true }
    }
  )

/**
 * Sends one suggestion, with its photo when there is one. A refusal comes
 * back as words for the person, like a day that has been or a sixth send in
 * an hour.
 */
export function submitEvent(
  values: EventSubmissionValues,
  photo: File | null,
  trap: string
) {
  const data = new FormData()
  for (const field of FIELDS) data.set(field, values[field])
  if (photo) data.set("photo", photo)
  data.set(EVENT_SUBMISSION_TRAP, trap)
  return submitEventFn({ data })
}

export type EventSubmissionsPage = {
  submissions: EventSubmission[]
  total: number
  page: number
  pageSize: number
  /** How many are waiting, for the Pending tab. */
  waiting: number
}

const loadEventSubmissionsPageFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(
    z.object({
      status: z.enum(EVENT_SUBMISSION_STATUSES).optional(),
      search: z.string().max(120).optional(),
      page: z.number().int().min(1).max(10_000).optional(),
      limit: z.number().int().min(1).max(200).optional(),
    })
  )
  .handler(async ({ data, context }): Promise<EventSubmissionsPage> => {
    const site = await workspaceIdForRequest(context.user.id)
    const pageSize = data.limit ?? 50
    const page = data.page ?? 1
    const [{ submissions, total }, waiting] = await Promise.all([
      listEventSubmissions(site, {
        status: data.status ?? "pending",
        search: data.search,
        limit: pageSize,
        offset: (page - 1) * pageSize,
      }),
      pendingEventSubmissionCount(site),
    ])
    return { submissions, total, page, pageSize, waiting }
  })

export function loadEventSubmissionsPage(input: {
  status?: EventSubmissionStatus
  search?: string
  page?: number
  limit?: number
}) {
  return loadEventSubmissionsPageFn({ data: input })
}

const reviewEventSubmissionFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({
      id: z.string().min(1).max(36),
      decision: z.enum(["approve", "reject"]),
      note: z.string().max(500).optional(),
    })
  )
  .handler(async ({ data, context }) =>
    decideEventSubmission(
      await workspaceIdForRequest(context.user.id),
      data.id,
      {
        decision: data.decision,
        note: data.note,
        reviewerId: context.user.id,
      }
    )
  )

/**
 * Approve, which makes a draft event, or reject with a reason. `emailed` is
 * whether the sender was actually told.
 */
export function decideSuggestedEvent(input: {
  id: string
  decision: "approve" | "reject"
  note?: string
}) {
  return reviewEventSubmissionFn({ data: input })
}
