import { and, asc, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm"

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
import { eventLinksByIds, seriesDatesOf } from "@/server/events/events"
import { saveEventAndDates } from "@/server/events/repeats"
import { eventSignUps, eventSubmissions } from "@/server/events/schema"
import {
  hasPendingTwin,
  toSubmission,
  type EventSubmissionOutcome,
  type EventSubmissionStatus,
} from "@/server/events/submissions"
import {
  eventViewsForPages,
  eventViewsKey,
  type EventViews,
} from "@/server/events/views"
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

/**
 * The owner's approved claim, with the listing, the site and the account,
 * found by the claim's id or by the listing it is for.
 */
async function ownerClaim(
  userId: string,
  claim: string | { listingId: string },
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
        typeof claim === "string"
          ? eq(directoryClaims.id, claim)
          : eq(directoryClaims.listingId, claim.listingId),
        eq(directoryClaims.userId, userId),
        eq(directoryClaims.status, "approved")
      )
    )
    .limit(1)
  return row ?? null
}

type OwnerClaim = NonNullable<Awaited<ReturnType<typeof ownerClaim>>>

/**
 * What the owner typed, checked the same way for a new event and for a
 * change: the Events page's switch, the day and times, and the photo being
 * one of their own. The answers come back filled in with the place and the
 * sender from the claim, or a refusal in words.
 */
async function checkOwnerInput(
  userId: string,
  claim: OwnerClaim,
  input: OwnerEventInput,
  database: CustomShellDb,
  at: Date
): Promise<
  | { ok: true; values: EventSubmissionValues; coverImage: string }
  | { ok: false; problem: string }
> {
  if (
    (await readPageVisibility(claim.workspaceId, "/events", database)) === "off"
  ) {
    return {
      ok: false,
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
    // The owner's place is always their listing, set by its id.
    placeListing: "",
    submitterName: claim.name.slice(0, 120),
    submitterEmail: claim.email,
  }
  const first = Object.values(eventSubmissionProblems(values, today))[0]
  if (first) return { ok: false, problem: first }

  const coverImage = input.coverImage.trim()
  if (coverImage && !(await isOwnedImageUrl(userId, coverImage, database))) {
    return {
      ok: false,
      problem: "That photo is not one of your uploads. Pick it again.",
    }
  }
  return { ok: true, values, coverImage }
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
  const checked = await checkOwnerInput(userId, claim, input, database, at)
  if (!checked.ok) return { outcome: "refused", problem: checked.problem }
  const { values, coverImage } = checked

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

/**
 * One of this account's own events from My listings, never a change request
 * and never anybody else's. The claim on its listing has to be approved
 * still, so a listing that changed hands is out of reach.
 */
async function ownersOwnEvent(
  userId: string,
  submissionId: string,
  database: CustomShellDb
) {
  const [row] = await database
    .select()
    .from(eventSubmissions)
    .where(
      and(
        eq(eventSubmissions.id, submissionId),
        eq(eventSubmissions.ownerUserId, userId),
        eq(eventSubmissions.fromOwner, true),
        isNull(eventSubmissions.changesEventId)
      )
    )
    .limit(1)
  if (!row?.listingId) return null
  const claim = await ownerClaim(userId, { listingId: row.listingId }, database)
  return claim ? { row, claim } : null
}

const NOT_YOURS = "That is not one of your events any more."

/**
 * An owner changing an event they sent (task events/37, Part 3).
 *
 * - **Still waiting:** the answers are changed where they are, and it keeps
 *   its place in the queue.
 * - **Approved:** the change is a request of its own in the same queue,
 *   because every owner's event is reviewed (`events.md`). The event stays as
 *   it is until an admin approves the change. A second change while the first
 *   is waiting replaces it, so the admin reads one.
 * - **Turned down:** refused. The owner sends it again as a new event.
 */
export async function changeOwnerEvent(
  userId: string,
  submissionId: string,
  input: OwnerEventInput,
  database: CustomShellDb = db,
  at: Date = new Date()
): Promise<EventSubmissionOutcome & { workspaceId?: string; listingTitle?: string }> {
  const found = await ownersOwnEvent(userId, submissionId, database)
  if (!found) return { outcome: "refused", problem: NOT_YOURS }
  const { row, claim } = found
  if (row.status === "rejected") {
    return {
      outcome: "refused",
      problem: "This one was turned down. Send it again as a new event.",
    }
  }
  const checked = await checkOwnerInput(userId, claim, input, database, at)
  if (!checked.ok) return { outcome: "refused", problem: checked.problem }
  const { values, coverImage } = checked
  const asked = {
    title: values.title.replace(/\s+/g, " ").trim(),
    startDate: values.startDate.trim(),
    startTime: values.startTime.trim(),
    endTime: values.endTime.trim() || null,
    description: values.description.trim(),
    coverImage,
    updatedAt: now(),
  }

  if (row.status === "pending") {
    const [changed] = await database
      .update(eventSubmissions)
      .set(asked)
      .where(
        and(
          eq(eventSubmissions.id, row.id),
          eq(eventSubmissions.status, "pending")
        )
      )
      .returning()
    if (!changed) {
      return {
        outcome: "refused",
        problem: "An admin has just looked at this one. Open My listings again.",
      }
    }
    return {
      outcome: "sent",
      submission: await toSubmission(changed),
      workspaceId: claim.workspaceId,
      listingTitle: claim.listingTitle,
    }
  }

  if (!row.eventId) return { outcome: "refused", problem: NOT_YOURS }
  // A withdrawn event is off the site, so there is no live page to change.
  if ((await eventLinksByIds([row.eventId], database)).get(row.eventId)?.status !== "published") {
    return {
      outcome: "refused",
      problem: "This event is withdrawn, so it is not on the site. Ask the site's admin to publish it again first.",
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
        problem: `You have sent ${OWNER_EVENTS_PER_HOUR} events and changes in the last hour. Please send the rest in an hour.`,
      }
    }
    throw error
  }
  const [waiting] = await database
    .select({ id: eventSubmissions.id })
    .from(eventSubmissions)
    .where(
      and(
        eq(eventSubmissions.changesEventId, row.eventId),
        eq(eventSubmissions.status, "pending")
      )
    )
    .limit(1)
  // Still pending in the same write, so a change an admin approves between
  // the look above and this one is never rewritten; a new request is made
  // instead.
  const [replaced] = waiting
    ? await database
        .update(eventSubmissions)
        .set(asked)
        .where(and(eq(eventSubmissions.id, waiting.id), eq(eventSubmissions.status, "pending")))
        .returning()
    : []
  const [saved] = replaced
    ? [replaced]
    : await database
        .insert(eventSubmissions)
        .values({
          ...asked,
          id: uuid(),
          workspaceId: row.workspaceId,
          placeName: values.placeName,
          placeAddress: values.placeAddress,
          submitterName: values.submitterName,
          submitterEmail: values.submitterEmail.trim().toLowerCase(),
          fromOwner: true,
          ownerUserId: userId,
          listingId: row.listingId,
          changesEventId: row.eventId,
          createdAt: asked.updatedAt,
        })
        .returning()
  if (!saved) throw new Error("The change was not saved.")
  return {
    outcome: "sent",
    submission: await toSubmission(saved),
    workspaceId: claim.workspaceId,
    listingTitle: claim.listingTitle,
  }
}

/**
 * An owner taking back an event they sent (task events/37, Part 3). A
 * waiting one leaves the queue. A published one goes back to Draft at once,
 * because all it does is take the owner's own event down, and any change
 * still waiting for it goes too. An admin can publish it again. A repeat's
 * dates still to come go down with it; ones already past stay as a record,
 * the same rule as any edit to a repeating event.
 */
export async function withdrawOwnerEvent(
  userId: string,
  submissionId: string,
  database: CustomShellDb = db,
  at: Date = new Date()
): Promise<{ withdrawn: true } | { withdrawn: false; problem: string }> {
  const found = await ownersOwnEvent(userId, submissionId, database)
  if (!found) return { withdrawn: false, problem: NOT_YOURS }
  const { row } = found
  if (row.status === "pending") {
    await database
      .delete(eventSubmissions)
      .where(
        and(
          eq(eventSubmissions.id, row.id),
          eq(eventSubmissions.status, "pending")
        )
      )
    return { withdrawn: true }
  }
  if (row.status !== "approved" || !row.eventId) {
    return {
      withdrawn: false,
      problem: "This one was turned down, so it is not on the site.",
    }
  }
  const eventId = row.eventId
  await database.transaction(async (tx) => {
    // Through the repeat's own save, so an event an admin has since made
    // repeat takes its dates down with it.
    await saveEventAndDates(
      row.workspaceId,
      eventId,
      { status: "draft" },
      tx,
      at
    )
    await tx
      .delete(eventSubmissions)
      .where(
        and(
          eq(eventSubmissions.changesEventId, eventId),
          eq(eventSubmissions.status, "pending")
        )
      )
  })
  return { withdrawn: true }
}

/** Somebody coming to an owner's event, as My listings lists them. */
export type OwnerEventPerson = {
  name: string
  email: string
  /** Their answer to the event's question, or empty. */
  answer: string
}

/** One of the owner's events as My listings shows it. */
export type OwnerEvent = {
  id: string
  status: EventSubmissionStatus
  title: string
  startDate: string
  startTime: string
  endTime: string | null
  /** What the owner last sent, so Change opens filled in. */
  description: string
  coverImage: string
  /** The admin's note, shown on a rejected one. */
  reviewNote: string
  /** The event's address once it is published, for a link to its page. */
  eventSlug: string | null
  /** The published event's id, for the Feature button. Null until then. */
  eventId: string | null
  /** Featured now, by the admin or by this owner's payment. */
  featured: boolean
  /** Views of its page, or null while it has no page. */
  views: EventViews | null
  /** A change the owner asked for is waiting for an admin. */
  changeWaiting: boolean
  /** Approved, then taken back to Draft, so it is not on the site. */
  withdrawn: boolean
  /**
   * Who is coming, for a published event that takes sign-ups (Tyler, 19 Nov
   * 2026: "Count, names and emails"). Null otherwise.
   */
  signUps: {
    seats: number | null
    people: OwnerEventPerson[]
  } | null
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
    .selectDistinct({
      workspaceId: directoryClaims.workspaceId,
      listingId: directoryClaims.listingId,
    })
    .from(directoryClaims)
    .where(
      and(
        eq(directoryClaims.userId, userId),
        eq(directoryClaims.status, "approved")
      )
    )
  // Who is coming is only for a listing this account still looks after, so
  // an owner whose listing changed hands stops seeing the people's emails.
  const stillOwned = new Set(claims.map((claim) => claim.listingId))
  const sites: Record<string, OwnerSite> = {}
  const siteIds = [...new Set(claims.map((claim) => claim.workspaceId))]
  await Promise.all(
    siteIds.map(async (workspaceId) => {
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
        eq(eventSubmissions.fromOwner, true),
        isNull(eventSubmissions.changesEventId)
      )
    )
    .orderBy(desc(eventSubmissions.createdAt))
    .limit(500)

  const eventIds = rows.map((row) => row.eventId ?? "")
  const [links, featured, waitingChanges] = await Promise.all([
    eventLinksByIds(eventIds, database),
    featuredEventIds(eventIds, database),
    database
      .select({ eventId: eventSubmissions.changesEventId })
      .from(eventSubmissions)
      .where(
        and(
          eq(eventSubmissions.ownerUserId, userId),
          eq(eventSubmissions.status, "pending"),
          isNotNull(eventSubmissions.changesEventId)
        )
      ),
  ])
  const changeWaiting = new Set(waitingChanges.map((row) => row.eventId))
  // Who is coming, read for this account's own published events only, so an
  // owner never sees the list of an event somebody else sent.
  const withSignUps = rows.flatMap((row) => {
    const link = row.eventId ? links.get(row.eventId) : undefined
    return row.eventId &&
      row.listingId &&
      stillOwned.has(row.listingId) &&
      link?.status === "published" &&
      link.takesSignUps
      ? [row.eventId]
      : []
  })
  const people = new Map<string, OwnerEventPerson[]>()
  // A repeat's later dates take their own sign-ups, so they count under the
  // owner's event too.
  const dateToMain = await seriesDatesOf(withSignUps, database)
  if (withSignUps.length) {
    const coming = await database
      .select({
        eventId: eventSignUps.eventId,
        name: eventSignUps.name,
        email: eventSignUps.email,
        answer: eventSignUps.answer,
      })
      .from(eventSignUps)
      .where(
        and(
          inArray(eventSignUps.eventId, [...withSignUps, ...dateToMain.keys()]),
          eq(eventSignUps.status, "confirmed"),
          // Only people the box told the host would see them.
          eq(eventSignUps.hostTold, true)
        )
      )
      .orderBy(asc(eventSignUps.createdAt), asc(eventSignUps.id))
    for (const { eventId, ...person } of coming) {
      const main = dateToMain.get(eventId) ?? eventId
      const list = people.get(main) ?? []
      list.push(person)
      people.set(main, list)
    }
  }
  // Only this account's own events reach this point, so the counts are only
  // ever for pages the owner sent. Nobody else's event is counted here.
  const views = await eventViewsForPages(
    rows.flatMap((row) => {
      const link = row.eventId ? links.get(row.eventId) : undefined
      return link?.status === "published"
        ? [{ workspaceId: row.workspaceId, slug: link.slug }]
        : []
    }),
    database,
    at
  )
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
      description: row.description,
      coverImage: row.coverImage,
      reviewNote: row.status === "rejected" ? row.reviewNote : "",
      eventSlug: published ? link.slug : null,
      eventId: published ? row.eventId : null,
      featured: published && featured.has(row.eventId ?? ""),
      changeWaiting: changeWaiting.has(row.eventId),
      withdrawn: row.status === "approved" && link?.status === "draft",
      signUps:
        published &&
        link.takesSignUps &&
        row.eventId &&
        stillOwned.has(row.listingId)
          ? {
              // Each date of a repeat has its own seats, so one count
              // against them all would mislead; it reads "N signed up".
              seats: [...dateToMain.values()].includes(row.eventId) ? null : link.seats,
              people: people.get(row.eventId) ?? [],
            }
          : null,
      // A published page with no traffic yet reads as 0, not as nothing.
      views: published
        ? (views.get(eventViewsKey(row.workspaceId, link.slug)) ?? {
            recent: 0,
            all: 0,
          })
        : null,
      createdAt: row.createdAt,
    })
  }
  return { events: byListing, sites }
}
