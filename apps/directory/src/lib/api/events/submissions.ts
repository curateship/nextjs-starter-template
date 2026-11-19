import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import {
  EVENT_SUBMISSION_MAX_LENGTH,
  emptyEventSubmission,
  eventPhotoProblem,
  submissionWhen,
  type EventSubmissionField,
  type EventSubmissionValues,
} from "@/lib/events/event-submission-fields"
import {
  eventRowText,
  timeZoneLabel,
  wallClockAt,
} from "@/lib/events/event-time"
import { requestIp, requireAppOrigin } from "@/server/auth/origin"
import { findCurrentUser } from "@/server/auth/security"
import { readPageVisibility } from "@/server/content/pages"
import { fireEventSuggested } from "@/server/directory/automation-events"
import { tellAdminsAboutEventSubmission } from "@/server/directory/notify"
import { visitorSite } from "@/server/directory/public"
import { siteTimeZone } from "@/server/directory/settings"
import {
  changeOwnerEvent,
  ownerEventsFor,
  sendOwnerEvent,
  withdrawOwnerEvent,
  type OwnerEvent,
  type OwnerEventPerson,
  type OwnerEvents,
} from "@/server/events/owner-submissions"
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
import { adminGet, adminPost, userGet, userPost } from "@/server/guards"
import { getStorageSettingsStatus } from "@/server/media/storage-settings"
import { workspaceIdForRequest } from "@/server/workspaces/for-request"

import { createErrorMessage } from "../error-message"

export type { EventSubmission, EventSubmissionStatus }

/**
 * The Suggest an event page's two doors, My listings' two for an owner's own
 * events, and the admin queue's two.
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
  /**
   * Whether the place box offers the site's listings as somebody types. Only
   * while the directory is open to everyone, because a picked place links to
   * its listing's page.
   */
  listingsOpen: boolean
}

const readEventSubmissionFormFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<EventSubmissionForm | null> => {
    const site = await siteTakingSuggestions()
    if (!site) return null
    const [{ timeZone, today }, storage, directoryVisibility] =
      await Promise.all([
        siteToday(site.id),
        getStorageSettingsStatus(),
        readPageVisibility(site.id, "/directory"),
      ])
    return {
      siteName: site.name,
      today,
      zone: timeZoneLabel(timeZone),
      photosAllowed: storage.ready,
      listingsOpen: directoryVisibility === "everyone",
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
      // "Event suggested" flows start when an admin approves this one, not
      // here: the address was typed on a public form and nobody has proved
      // it is theirs, so a flow must never write to it before a person has
      // read the suggestion.
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

/** What the "Event suggested" starting point hands a flow about one event. */
function suggestedFacts(workspaceId: string, submission: EventSubmission) {
  return {
    id: submission.id,
    workspaceId,
    title: submission.title,
    when: eventRowText(submissionWhen(submission)),
    placeName: submission.placeName,
    submitterEmail: submission.submitterEmail,
    submitterName: submission.submitterName,
    listingId: submission.listingId,
  }
}

const sendOwnerEventFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    z.object({
      claimId: z.string().min(1).max(36),
      title: z.string().max(EVENT_SUBMISSION_MAX_LENGTH.title + 1),
      startDate: z.string().max(10),
      startTime: z.string().max(5),
      endTime: z.string().max(5),
      description: z.string().max(EVENT_SUBMISSION_MAX_LENGTH.description + 1),
      coverImage: z.string().max(600),
    })
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<{ sent: true } | { sent: false; problem: string }> => {
      const { claimId, ...input } = data
      const result = await sendOwnerEvent(context.user.id, claimId, input)
      if (result.outcome === "refused") {
        return { sent: false, problem: result.problem }
      }
      if (result.outcome === "sent" && result.workspaceId) {
        await tellAdminsAboutEventSubmission(
          result.workspaceId,
          result.submission.title,
          result.listingTitle
        )
        await fireEventSuggested(
          suggestedFacts(result.workspaceId, result.submission)
        )
      }
      return { sent: true }
    }
  )

/**
 * An owner's event for their own listing, from My listings. It waits for an
 * admin, and approving it publishes it with the listing as the place.
 */
export function sendEventForMyListing(input: {
  claimId: string
  title: string
  startDate: string
  startTime: string
  endTime: string
  description: string
  coverImage: string
}) {
  return sendOwnerEventFn({ data: input })
}

const ownerEventFields = {
  title: z.string().max(EVENT_SUBMISSION_MAX_LENGTH.title + 1),
  startDate: z.string().max(10),
  startTime: z.string().max(5),
  endTime: z.string().max(5),
  description: z.string().max(EVENT_SUBMISSION_MAX_LENGTH.description + 1),
  coverImage: z.string().max(600),
}

const changeOwnerEventFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    z.object({ id: z.string().min(1).max(36), ...ownerEventFields })
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<{ sent: true } | { sent: false; problem: string }> => {
      const { id, ...input } = data
      const result = await changeOwnerEvent(context.user.id, id, input)
      if (result.outcome === "refused") {
        return { sent: false, problem: result.problem }
      }
      // A waiting one changed in place is already in the queue; only a
      // change to a published event is news to the admins.
      if (
        result.outcome === "sent" &&
        result.workspaceId &&
        result.submission.changes
      ) {
        await tellAdminsAboutEventSubmission(
          result.workspaceId,
          result.submission.title,
          result.listingTitle,
          undefined,
          true
        )
      }
      return { sent: true }
    }
  )

/**
 * An owner changing one of their own events from My listings. A waiting one
 * changes in the queue; a published one waits for an admin to approve the
 * change, and stays as it is until then.
 */
export function changeMyListingEvent(input: {
  id: string
  title: string
  startDate: string
  startTime: string
  endTime: string
  description: string
  coverImage: string
}) {
  return changeOwnerEventFn({ data: input })
}

const withdrawOwnerEventFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ id: z.string().min(1).max(36) }))
  .handler(async ({ data, context }) =>
    withdrawOwnerEvent(context.user.id, data.id)
  )

/**
 * An owner taking back one of their own events: out of the queue, or off the
 * site, at once.
 */
export function withdrawMyListingEvent(id: string) {
  return withdrawOwnerEventFn({ data: { id } })
}

const loadMyListingEventsFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async ({ context }): Promise<OwnerEvents> =>
    ownerEventsFor(context.user.id)
  )

/** The events this account sent, by listing, and what each site allows. */
export function loadMyListingEvents() {
  return loadMyListingEventsFn()
}

export type { OwnerEvent, OwnerEventPerson, OwnerEvents }

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
  .handler(async ({ data, context }) => {
    const site = await workspaceIdForRequest(context.user.id)
    const { submission, ...decided } = await decideEventSubmission(site, data.id, {
      decision: data.decision,
      note: data.note,
      reviewerId: context.user.id,
    })
    // A public suggestion reaches "Event suggested" flows once an admin has
    // read and approved it. An owner's already did when it was sent.
    if (data.decision === "approve" && !submission.fromOwner && !submission.changes) {
      await fireEventSuggested(suggestedFacts(site, submission))
    }
    return decided
  })

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
