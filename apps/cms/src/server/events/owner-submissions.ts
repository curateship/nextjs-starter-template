import { and, desc, eq } from "drizzle-orm"

import {
  eventSubmissionProblems,
  OWNER_EVENTS_PER_HOUR,
  type EventSubmissionValues,
} from "@/lib/events/event-submission-fields"
import { wallClockAt } from "@/lib/events/event-time"
import { enforceRateLimit, RateLimitError } from "@/server/auth/rate-limit"
import { now, uuid } from "@/server/auth/security"
import { readPageVisibility } from "@/server/content/pages"
import { db, type CustomShellDb } from "@/server/db"
import { featuredEventIds } from "@/server/directory/featured"
import { directoryClaims, directoryListings } from "@/server/directory/schema"
import { siteTimeZone } from "@/server/directory/settings"
import { eventLinksByIds } from "@/server/events/events"
import { eventSubmissions } from "@/server/events/schema"
import {
  hasPendingTwin,
  toSubmission,
  type EventSubmissionOutcome,
  type EventSubmissionStatus,
} from "@/server/events/submissions"
import { isOwnedImageUrl } from "@/server/media/library"
import { customShellUsers } from "@/server/schema"

/**
 * Events a listing's owner sends from My listings for their own place.
 *
 * They go into the same queue as the public's suggestions, marked as from the
 * owner. The place is always the owner's listing and cannot be anything else:
 * the listing comes from the owner's approved claim, looked up by the claim
 * **and** the account, so an id from somebody else's claim is simply not
 * found. Every owner's event is reviewed, however many were approved before,
 * which Tyler chose on 24 Sep 2026. One date at a time; an admin can make an
 * event repeat after approving it.
 */

/** What the owner's window sends. The place and who sent it come from the claim. */
export type OwnerEventInput = Pick<
  EventSubmissionValues,
  "title" | "startDate" | "startTime" | "endTime" | "description"
> & {
  /** One of the owner's own Media library pictures, or empty. */
  coverImage: string
}

/** The owner's approved claim, with the listing, the site and the account. */
async function ownerClaim(
  userId: string,
  claimId: string,
  database: CustomShellDb
) {
  const [row] = await database
    .select({
      workspaceId: directoryClaims.workspaceId,
      listingId: directoryListings.id,
      listingTitle: directoryListings.title,
      contactLinks: directoryListings.contactLinks,
      name: customShellUsers.name,
      email: customShellUsers.email,
    })
    .from(directoryClaims)
    .innerJoin(
      directoryListings,
      and(
        eq(directoryListings.id, directoryClaims.listingId),
        eq(directoryListings.workspaceId, directoryClaims.workspaceId)
      )
    )
    .innerJoin(
      customShellUsers,
      eq(customShellUsers.id, directoryClaims.userId)
    )
    .where(
      and(
        eq(directoryClaims.id, claimId),
        eq(directoryClaims.userId, userId),
        eq(directoryClaims.status, "approved")
      )
    )
    .limit(1)
  return row ?? null
}

function listingAddress(contactLinks: unknown): string {
  const address =
    contactLinks && typeof contactLinks === "object"
      ? (contactLinks as { address?: unknown }).address
      : undefined
  return typeof address === "string" ? address.trim().slice(0, 300) : ""
}

/**
 * An owner's event, into the queue. Refusals come back as words for the
 * owner: another person's listing, an Events page that is off, a day that
 * has been, a photo that is not theirs, or too many in an hour.
 */
export async function sendOwnerEvent(
  userId: string,
  claimId: string,
  input: OwnerEventInput,
  database: CustomShellDb = db,
  at: Date = new Date()
): Promise<
  EventSubmissionOutcome & { listingTitle?: string; workspaceId?: string }
> {
  const claim = await ownerClaim(userId, claimId, database)
  if (!claim) {
    return {
      outcome: "refused",
      problem: "You do not look after that listing.",
    }
  }
  if (
    (await readPageVisibility(claim.workspaceId, "/events", database)) === "off"
  ) {
    return {
      outcome: "refused",
      problem:
        "This site has its Events page switched off, so there is nowhere for the event to appear.",
    }
  }

  const today = wallClockAt(
    await siteTimeZone(claim.workspaceId, database),
    at
  ).slice(0, 10)
  const values: EventSubmissionValues = {
    ...input,
    placeName: claim.listingTitle.slice(0, 200),
    placeAddress: listingAddress(claim.contactLinks),
    submitterName: claim.name.slice(0, 120),
    submitterEmail: claim.email,
  }
  const first = Object.values(eventSubmissionProblems(values, today))[0]
  if (first) return { outcome: "refused", problem: first }

  const coverImage = input.coverImage.trim()
  if (coverImage && !(await isOwnedImageUrl(userId, coverImage, database))) {
    return {
      outcome: "refused",
      problem: "That photo is not one of your uploads. Pick it again.",
    }
  }

  try {
    await enforceRateLimit(
      `event-owner-submit:${userId}`,
      { maxAttempts: OWNER_EVENTS_PER_HOUR, windowSeconds: 60 * 60 },
      database
    )
  } catch (error) {
    if (error instanceof RateLimitError) {
      return {
        outcome: "refused",
        problem: `You have sent ${OWNER_EVENTS_PER_HOUR} events in the last hour. Please send the rest in an hour.`,
      }
    }
    throw error
  }

  // One line, because the title goes into email subjects.
  const title = values.title.replace(/\s+/g, " ").trim()
  const email = values.submitterEmail.trim().toLowerCase()
  const saved = now()
  if (await hasPendingTwin(claim.workspaceId, email, title, saved, database)) {
    return { outcome: "merged" }
  }

  const [row] = await database
    .insert(eventSubmissions)
    .values({
      id: uuid(),
      workspaceId: claim.workspaceId,
      title,
      startDate: values.startDate.trim(),
      startTime: values.startTime.trim(),
      endTime: values.endTime.trim() || null,
      placeName: values.placeName,
      placeAddress: values.placeAddress,
      description: values.description.trim(),
      submitterName: values.submitterName,
      submitterEmail: email,
      fromOwner: true,
      ownerUserId: userId,
      listingId: claim.listingId,
      coverImage,
      createdAt: saved,
      updatedAt: saved,
    })
    .returning()
  if (!row) throw new Error("The event was not saved.")
  return {
    outcome: "sent",
    submission: await toSubmission(row),
    listingTitle: claim.listingTitle,
    workspaceId: claim.workspaceId,
  }
}

/** One of the owner's events as My listings shows it. */
export type OwnerEvent = {
  id: string
  status: EventSubmissionStatus
  title: string
  startDate: string
  startTime: string
  endTime: string | null
  /** The admin's note, shown on a rejected one. */
  reviewNote: string
  /** The event's address once it is published, for a link to its page. */
  eventSlug: string | null
  /** The published event's id, for the Feature button. Null until then. */
  eventId: string | null
  /** Featured now, by the admin or by this owner's payment. */
  featured: boolean
  createdAt: Date
}

/** How many of an owner's events My listings shows for each listing. */
const OWNER_EVENTS_SHOWN = 20

/** What My listings needs for one site the owner has a listing on. */
export type OwnerSite = {
  /** False while the site's Events page is switched off, and then there is no Add event. */
  eventsOn: boolean
  /** The site's today, "2026-09-24", so a day before it is refused in the window. */
  today: string
}

export type OwnerEvents = {
  /** By listing id. */
  events: Record<string, OwnerEvent[]>
  /** By site id, for every site this account owns a listing on. */
  sites: Record<string, OwnerSite>
}

/**
 * The events this account sent, newest first, by listing, and what each of
 * its sites allows. **Only this account's**: a listing that changes hands
 * shows its new owner none of the old owner's events.
 */
export async function ownerEventsFor(
  userId: string,
  database: CustomShellDb = db,
  at: Date = new Date()
): Promise<OwnerEvents> {
  const claims = await database
    .selectDistinct({ workspaceId: directoryClaims.workspaceId })
    .from(directoryClaims)
    .where(
      and(
        eq(directoryClaims.userId, userId),
        eq(directoryClaims.status, "approved")
      )
    )
  const sites: Record<string, OwnerSite> = {}
  await Promise.all(
    claims.map(async ({ workspaceId }) => {
      const [visibility, timeZone] = await Promise.all([
        readPageVisibility(workspaceId, "/events", database),
        siteTimeZone(workspaceId, database),
      ])
      sites[workspaceId] = {
        eventsOn: visibility !== "off",
        today: wallClockAt(timeZone, at).slice(0, 10),
      }
    })
  )

  const rows = await database
    .select()
    .from(eventSubmissions)
    .where(
      and(
        eq(eventSubmissions.ownerUserId, userId),
        eq(eventSubmissions.fromOwner, true)
      )
    )
    .orderBy(desc(eventSubmissions.createdAt))
    .limit(500)

  const eventIds = rows.map((row) => row.eventId ?? "")
  const [links, featured] = await Promise.all([
    eventLinksByIds(eventIds, database),
    featuredEventIds(eventIds, database),
  ])
  const byListing: Record<string, OwnerEvent[]> = {}
  for (const row of rows) {
    if (!row.listingId) continue
    const list = (byListing[row.listingId] ??= [])
    if (list.length >= OWNER_EVENTS_SHOWN) continue
    const link = row.eventId ? links.get(row.eventId) : undefined
    const published = link?.status === "published"
    list.push({
      id: row.id,
      status: row.status as EventSubmissionStatus,
      title: row.title,
      startDate: row.startDate,
      startTime: row.startTime.slice(0, 5),
      endTime: row.endTime ? row.endTime.slice(0, 5) : null,
      reviewNote: row.status === "rejected" ? row.reviewNote : "",
      eventSlug: published ? link.slug : null,
      eventId: published ? row.eventId : null,
      featured: published && featured.has(row.eventId ?? ""),
      createdAt: row.createdAt,
    })
  }
  return { events: byListing, sites }
}
