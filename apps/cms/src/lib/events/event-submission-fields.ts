import { isValidDateString } from "@/lib/events/calendar-grid"
import { addDays } from "@/lib/events/event-repeat"
import type { EventWhen } from "@/lib/events/event-time"
import { looksLikeEmail } from "@/lib/directory/submission-fields"

/**
 * What the Suggest an event page asks for, and what makes an answer wrong.
 *
 * One list and one check, read by the form in the browser and by the server,
 * so the two never disagree about what is required. The old Directory app
 * checked its required fields in the browser only, so anybody calling its
 * endpoint directly could skip them. Here the server runs the same check.
 *
 * The required fields are fixed: the title, the day, the start time and the
 * email. Tyler chose a fixed list on 24 Sep 2026, the same as Add your
 * listing, over a setting where the admin picks.
 */

export type EventSubmissionValues = {
  title: string
  /** "2026-10-03", on the site's calendar. */
  startDate: string
  /** "21:00", the site's clock. */
  startTime: string
  /** "01:00". Earlier than the start time means the next day. */
  endTime: string
  placeName: string
  placeAddress: string
  description: string
  submitterName: string
  submitterEmail: string
}

export type EventSubmissionField = keyof EventSubmissionValues

/** The longest answer each box takes, the same as its column. */
export const EVENT_SUBMISSION_MAX_LENGTH: Record<EventSubmissionField, number> =
  {
    title: 200,
    startDate: 10,
    startTime: 5,
    endTime: 5,
    placeName: 200,
    placeAddress: 300,
    description: 2000,
    submitterName: 120,
    submitterEmail: 255,
  }

/** The photo: one picture a phone takes or a poster saved as an image. */
export const EVENT_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"]
export const EVENT_PHOTO_MAX_BYTES = 5 * 1024 * 1024

/** How many suggestions one internet address may send to one site an hour. */
export const EVENT_SUBMISSIONS_PER_HOUR = 5

export function emptyEventSubmission(): EventSubmissionValues {
  return {
    title: "",
    startDate: "",
    startTime: "",
    endTime: "",
    placeName: "",
    placeAddress: "",
    description: "",
    submitterName: "",
    submitterEmail: "",
  }
}

const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/

/**
 * What is wrong with each answer, by field. Empty when it can be sent.
 * `today` is the site's today, "2026-09-24", so a day before it is refused
 * by the site's calendar and never the visitor's.
 */
export function eventSubmissionProblems(
  values: EventSubmissionValues,
  today: string
): Partial<Record<EventSubmissionField, string>> {
  const problems: Partial<Record<EventSubmissionField, string>> = {}
  const title = values.title.trim()
  const startDate = values.startDate.trim()
  const startTime = values.startTime.trim()
  const endTime = values.endTime.trim()
  const email = values.submitterEmail.trim()

  if (!title) problems.title = "Give the event a name."
  if (!startDate) problems.startDate = "Pick the day it is on."
  else if (!isValidDateString(startDate)) {
    problems.startDate = "That is not a real day."
  } else if (startDate < today) {
    problems.startDate = "That day has already been. Pick today or a later day."
  }
  if (!startTime) problems.startTime = "Give the time it starts."
  else if (!CLOCK.test(startTime)) {
    problems.startTime = "That is not a time of day."
  }
  if (endTime && !CLOCK.test(endTime)) {
    problems.endTime = "That is not a time of day."
  } else if (endTime && endTime === startTime) {
    problems.endTime = "The end time is the same as the start time."
  }
  if (!email) problems.submitterEmail = "Give an email address to hear back."
  else if (!looksLikeEmail(email)) {
    problems.submitterEmail = "That does not look like an email address."
  }

  // The text fields only: a caller may hand over more, like the photo.
  for (const field of Object.keys(
    EVENT_SUBMISSION_MAX_LENGTH
  ) as EventSubmissionField[]) {
    if (
      !problems[field] &&
      values[field].trim().length > EVENT_SUBMISSION_MAX_LENGTH[field]
    ) {
      problems[field] = "That is longer than this box takes."
    }
  }
  return problems
}

/** A photo that cannot be taken, in words, or null when it is fine. */
export function eventPhotoProblem(file: {
  type: string
  size: number
}): string | null {
  if (!EVENT_PHOTO_TYPES.includes(file.type)) {
    return "The photo has to be a JPG, PNG or WebP picture."
  }
  if (file.size > EVENT_PHOTO_MAX_BYTES) {
    return "The photo is bigger than 5 MB. Try a smaller one."
  }
  if (file.size === 0) return "That photo file is empty."
  return null
}

/**
 * A suggestion's day and times as an event's. An end time earlier than the
 * start is the next day, like a gig from 9pm to 1am, which is how the form's
 * hint tells people to type it.
 */
export function submissionWhen(suggestion: {
  startDate: string
  startTime: string
  endTime: string | null
}): EventWhen {
  const { startDate, startTime, endTime } = suggestion
  return {
    startDate,
    startTime,
    endDate: endTime
      ? endTime < startTime
        ? addDays(startDate, 1)
        : startDate
      : null,
    endTime,
  }
}
