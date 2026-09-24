import { and, asc, desc, eq, gte, ilike, or, sql } from "drizzle-orm"

import {
  EVENT_SUBMISSIONS_PER_HOUR,
  eventPhotoProblem,
  eventSubmissionProblems,
  submissionWhen,
  type EventSubmissionValues,
} from "@/lib/events/event-submission-fields"
import { enforceRateLimit, RateLimitError } from "@/server/auth/rate-limit"
import { now, uuid } from "@/server/auth/security"
import { db, type CustomShellDb } from "@/server/db"
import { createEvent, updateEvent } from "@/server/events/events"
import {
  eventSubmissions,
  type EventSubmissionRow,
} from "@/server/events/schema"
import {
  cleanOriginalName,
  getMediaFileType,
  storedFilename,
  validateMediaContent,
} from "@/server/media/library"
import {
  deleteFromR2,
  getPublicMediaUrl,
  uploadToR2,
} from "@/server/media/storage"
import { customShellMedia } from "@/server/schema"
import { sendDirectoryEmail } from "@/server/directory/mail"

/**
 * Events the public suggested on the Suggest an event page.
 *
 * **A suggestion is not an event.** It is a row of what somebody typed, and it
 * becomes a draft event only when an admin approves it, once, because the row
 * remembers what it became. Every read takes the site first and filters on it,
 * so a suggestion sent to alpha only ever becomes an event on alpha.
 *
 * A suggestion goes straight to the queue, with no email to confirm first.
 * Tyler chose that on 24 Sep 2026, the same as the old Directory app. What
 * keeps spam down is the hidden box a person never sees and a limit of five
 * an hour from one internet address on one site.
 */

export type EventSubmissionStatus = "pending" | "approved" | "rejected"

export const EVENT_SUBMISSION_STATUSES: EventSubmissionStatus[] = [
  "pending",
  "approved",
  "rejected",
]

export type EventSubmission = {
  id: string
  status: EventSubmissionStatus
  title: string
  startDate: string
  /** "21:00". */
  startTime: string
  endTime: string | null
  placeName: string
  placeAddress: string
  description: string
  /** Where an admin can look at the photo, or null with none. */
  photoUrl: string | null
  submitterName: string
  submitterEmail: string
  reviewedAt: Date | null
  reviewNote: string
  eventId: string | null
  createdAt: Date
}

/** "21:00:00" from the database as "21:00". */
function clock(value: string | null): string | null {
  return value ? value.slice(0, 5) : null
}

async function toSubmission(row: EventSubmissionRow): Promise<EventSubmission> {
  return {
    id: row.id,
    // The table's own check allows these three and nothing else.
    status: row.status as EventSubmissionStatus,
    title: row.title,
    startDate: row.startDate,
    startTime: clock(row.startTime) ?? "",
    endTime: clock(row.endTime),
    placeName: row.placeName,
    placeAddress: row.placeAddress,
    description: row.description,
    photoUrl: row.photoPath
      ? await getPublicMediaUrl(row.photoPath).catch(() => null)
      : null,
    submitterName: row.submitterName,
    submitterEmail: row.submitterEmail,
    reviewedAt: row.reviewedAt,
    reviewNote: row.reviewNote,
    eventId: row.eventId,
    createdAt: row.createdAt,
  }
}

/** A photo as it arrived, before anything is stored. */
export type EventSubmissionPhoto = {
  name: string
  type: string
  bytes: Uint8Array
}

/**
 * What happened to a suggestion. `refused` carries the words to show the
 * person, so a wrong answer is never an error page and never the server's
 * own wording.
 */
export type EventSubmissionOutcome =
  | { outcome: "sent"; submission: EventSubmission }
  | { outcome: "merged" }
  | { outcome: "refused"; problem: string }

/** A second send of the same event, by the same person, inside this long. */
const DUPLICATE_WINDOW_MS = 24 * 60 * 60 * 1000

/** Where a photo waits for its decision. Not a person's folder, on purpose. */
const PHOTO_FOLDER = "event-submissions"

/**
 * A new suggestion, straight into the queue.
 *
 * In this order: the answers are checked, then the photo, then the limit, so
 * a person fixing a typo does not use up their five. A second send of the
 * same title from the same email inside a day, while the first is still
 * waiting, is taken as a double click: nothing new is written, and the person
 * is told it arrived. The photo is stored last, so nothing is stored for a
 * suggestion that was refused.
 */
export async function createEventSubmission(
  workspaceId: string,
  input: EventSubmissionValues & { photo?: EventSubmissionPhoto | null },
  context: { ip: string; today: string },
  database: CustomShellDb = db
): Promise<EventSubmissionOutcome> {
  const problems = eventSubmissionProblems(input, context.today)
  const first = Object.values(problems)[0]
  if (first) return { outcome: "refused", problem: first }

  const photo = input.photo ?? null
  if (photo) {
    const problem =
      eventPhotoProblem({ type: photo.type, size: photo.bytes.byteLength }) ??
      contentProblem(photo)
    if (problem) return { outcome: "refused", problem }
  }

  try {
    await enforceRateLimit(
      `event-submit:${workspaceId}:${context.ip}`,
      { maxAttempts: EVENT_SUBMISSIONS_PER_HOUR, windowSeconds: 60 * 60 },
      database
    )
  } catch (error) {
    if (error instanceof RateLimitError) {
      return {
        outcome: "refused",
        problem: `You have sent ${EVENT_SUBMISSIONS_PER_HOUR} events in the last hour, which is as many as this site takes. Please try again in an hour.`,
      }
    }
    throw error
  }

  // One line, because the title goes into email subjects.
  const title = input.title.replace(/\s+/g, " ").trim()
  const submitterEmail = input.submitterEmail.trim().toLowerCase()
  const at = now()

  const [duplicate] = await database
    .select({ id: eventSubmissions.id })
    .from(eventSubmissions)
    .where(
      and(
        eq(eventSubmissions.workspaceId, workspaceId),
        eq(eventSubmissions.status, "pending"),
        eq(eventSubmissions.submitterEmail, submitterEmail),
        sql`lower(${eventSubmissions.title}) = ${title.toLowerCase()}`,
        gte(
          eventSubmissions.createdAt,
          new Date(at.getTime() - DUPLICATE_WINDOW_MS)
        )
      )
    )
    .limit(1)
  if (duplicate) return { outcome: "merged" }

  // Cleaned the way the Media library cleans a name, so a name sent with
  // folders in it, like "../x.png", keeps only its last part.
  const photoName = photo ? cleanOriginalName(photo.name) : null
  const photoPath =
    photo && photoName
      ? `${PHOTO_FOLDER}/${storedFilename(photoName, photo.type)}`
      : null
  if (photo && photoPath) {
    try {
      await uploadToR2(photoPath, photo.bytes, photo.type)
    } catch {
      return {
        outcome: "refused",
        problem:
          "The photo could not be saved. Try again, or send the event without it.",
      }
    }
  }

  try {
    const [row] = await database
      .insert(eventSubmissions)
      .values({
        id: uuid(),
        workspaceId,
        title,
        startDate: input.startDate.trim(),
        startTime: input.startTime.trim(),
        endTime: input.endTime.trim() || null,
        placeName: input.placeName.trim(),
        placeAddress: input.placeAddress.trim(),
        description: input.description.trim(),
        photoPath,
        photoName,
        photoType: photo ? photo.type : null,
        photoSize: photo ? photo.bytes.byteLength : null,
        submitterName: input.submitterName.trim(),
        submitterEmail,
        createdAt: at,
        updatedAt: at,
      })
      .returning()
    if (!row) throw new Error("The suggestion was not saved.")
    return { outcome: "sent", submission: await toSubmission(row) }
  } catch (error) {
    // A photo with no row would never be found again.
    if (photoPath) await deleteFromR2(photoPath).catch(() => undefined)
    throw error
  }
}

/** The shell's own check that the bytes are the picture they claim to be. */
function contentProblem(photo: EventSubmissionPhoto): string | null {
  try {
    validateMediaContent(photo.type, photo.bytes)
    return null
  } catch {
    return "That file is not the picture it says it is. Try another photo."
  }
}

/** One tab of the queue, newest first, searched by title, email or name. */
export async function listEventSubmissions(
  workspaceId: string,
  options: {
    status: EventSubmissionStatus
    search?: string
    limit?: number
    offset?: number
  },
  database: CustomShellDb = db
): Promise<{ submissions: EventSubmission[]; total: number }> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200)
  const offset = Math.max(options.offset ?? 0, 0)
  const search = options.search?.trim()
  const pattern = search ? `%${search}%` : null
  // The site's own suggestions always. The search only narrows inside that.
  const where = and(
    eq(eventSubmissions.workspaceId, workspaceId),
    eq(eventSubmissions.status, options.status),
    pattern
      ? or(
          ilike(eventSubmissions.title, pattern),
          ilike(eventSubmissions.submitterEmail, pattern),
          ilike(eventSubmissions.submitterName, pattern)
        )
      : undefined
  )

  const [rows, [countRow]] = await Promise.all([
    database
      .select()
      .from(eventSubmissions)
      .where(where)
      // The id breaks ties so a page boundary never repeats or skips a row.
      .orderBy(desc(eventSubmissions.createdAt), asc(eventSubmissions.id))
      .limit(limit)
      .offset(offset),
    database
      .select({ total: sql<number>`count(*)::int` })
      .from(eventSubmissions)
      .where(where),
  ])
  return {
    submissions: await Promise.all(rows.map(toSubmission)),
    total: countRow?.total ?? 0,
  }
}

/** How many are waiting, for the Pending tab to say so. */
export async function pendingEventSubmissionCount(
  workspaceId: string,
  database: CustomShellDb = db
): Promise<number> {
  const [row] = await database
    .select({ total: sql<number>`count(*)::int` })
    .from(eventSubmissions)
    .where(
      and(
        eq(eventSubmissions.workspaceId, workspaceId),
        eq(eventSubmissions.status, "pending")
      )
    )
  return row?.total ?? 0
}

/**
 * The description as a body: its paragraphs as plain text. `updateEvent`
 * runs it through the post body's own cleaner, so nothing typed on a public
 * form reaches the page as markup.
 */
function bodyFromDescription(description: string) {
  const paragraphs = description
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean)
  return {
    type: "doc",
    content: paragraphs.map((text) => ({
      type: "paragraph",
      content: [{ type: "text", text }],
    })),
  }
}

/** The first sentence or so of the description, for the event's summary. */
function summaryFromDescription(description: string) {
  const firstParagraph = description.split(/\n{2,}/)[0]?.trim() ?? ""
  return firstParagraph.replace(/\s+/g, " ").slice(0, 300)
}

/**
 * An admin's answer.
 *
 * Approving makes a draft event in one transaction, with every field the
 * person filled in: the title, the day and times, the place, the description
 * as both the summary and the body, and the photo as its cover, filed in the
 * Media library under the admin who approved it. It stays a draft, so nothing
 * is public until the admin publishes it. **Approving twice cannot make two
 * events**: the status is part of the final match, and the second finds
 * nothing to change.
 *
 * Rejecting keeps the row, as a record, and deletes the photo, because a
 * picture nobody will use should not stay in the site's storage.
 */
export async function reviewEventSubmission(
  workspaceId: string,
  id: string,
  input: {
    decision: "approve" | "reject"
    note?: string
    reviewerId: string
  },
  database: CustomShellDb = db
): Promise<{ submission: EventSubmission; eventId: string | null }> {
  const [row] = await database
    .select()
    .from(eventSubmissions)
    .where(
      and(
        eq(eventSubmissions.id, id),
        eq(eventSubmissions.workspaceId, workspaceId)
      )
    )
    .limit(1)
  if (!row) throw new Error("That suggestion no longer exists.")
  if (row.status !== "pending") {
    throw new Error("Somebody has already dealt with this one.")
  }

  const at = now()
  const note = (input.note ?? "").trim().slice(0, 500)
  const decided = {
    reviewedAt: at,
    reviewedByUserId: input.reviewerId,
    reviewNote: note,
    updatedAt: at,
  }
  const stillPending = and(
    eq(eventSubmissions.id, row.id),
    eq(eventSubmissions.status, "pending")
  )

  if (input.decision === "reject") {
    const [updated] = await database
      .update(eventSubmissions)
      .set({ ...decided, status: "rejected" })
      .where(stillPending)
      .returning()
    if (!updated) throw new Error("Somebody has already dealt with this one.")
    // After the decision, and never undoing it: a file left behind is the
    // smaller harm than a rejection that did not stick.
    if (row.photoPath) await deleteFromR2(row.photoPath).catch(() => undefined)
    return { submission: await toSubmission(updated), eventId: null }
  }

  const coverImage = row.photoPath
    ? await getPublicMediaUrl(row.photoPath).catch(() => "")
    : ""

  return database.transaction(async (tx) => {
    const event = await createEvent(
      workspaceId,
      {
        title: row.title,
        when: submissionWhen({
          startDate: row.startDate,
          startTime: clock(row.startTime) ?? "",
          endTime: clock(row.endTime),
        }),
      },
      tx
    )
    await updateEvent(
      workspaceId,
      event.id,
      {
        summary: summaryFromDescription(row.description),
        body: bodyFromDescription(row.description),
        placeName: row.placeName,
        placeAddress: row.placeAddress,
        coverImage,
      },
      tx
    )
    if (row.photoPath && coverImage) {
      await tx.insert(customShellMedia).values({
        id: uuid(),
        workspaceId,
        userId: input.reviewerId,
        filename: row.photoPath.slice(PHOTO_FOLDER.length + 1),
        originalName: row.photoName ?? "photo",
        altText: row.title,
        fileSize: row.photoSize ?? 0,
        mimeType: row.photoType ?? "image/jpeg",
        fileType: getMediaFileType(row.photoType ?? "image/jpeg"),
        storagePath: row.photoPath,
        emailProtectedAt: null,
        createdAt: at,
        updatedAt: at,
      })
    }

    const [updated] = await tx
      .update(eventSubmissions)
      .set({ ...decided, status: "approved", eventId: event.id })
      .where(stillPending)
      .returning()
    if (!updated) throw new Error("Somebody has already dealt with this one.")
    return { submission: await toSubmission(updated), eventId: event.id }
  })
}

/**
 * The decision, then the email to the sender about it.
 *
 * The same rule as a listing's, in `workspace/docs/submission-review-email.md`:
 * telling the sender is a courtesy, not part of the decision. The decision is
 * saved first, and a failed email is caught rather than thrown, so a mail
 * server having a bad afternoon never undoes it. `emailed` is whether the
 * sender was actually told, so the screen never claims a send that did not
 * happen.
 */
export async function decideEventSubmission(
  workspaceId: string,
  id: string,
  input: {
    decision: "approve" | "reject"
    note?: string
    reviewerId: string
  },
  database: CustomShellDb = db,
  send: typeof sendDirectoryEmail = sendDirectoryEmail
): Promise<{ eventId: string | null; emailed: boolean }> {
  const { submission, eventId } = await reviewEventSubmission(
    workspaceId,
    id,
    input,
    database
  )

  let emailed = false
  try {
    const sent = await send(
      {
        workspaceId,
        to: submission.submitterEmail,
        subject:
          input.decision === "approve"
            ? `${submission.title} has been accepted`
            : `About your event, ${submission.title}`,
        lines:
          input.decision === "approve"
            ? [
                `Thank you for suggesting ${submission.title}. It has been accepted, and it will be on the site's Events page once it is published.`,
                submission.reviewNote,
              ].filter(Boolean)
            : [
                `We are not adding ${submission.title} to the site at the moment.`,
                submission.reviewNote ||
                  "If you think this is a mistake, reply to this email.",
              ],
      },
      database
    )
    emailed = sent.delivered
  } catch {
    // The decision stands. `emailed` stays false, and the screen says so.
  }
  return { eventId, emailed }
}
