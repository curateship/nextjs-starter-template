import { looksLikeEmail } from "@/lib/directory/submission-fields"

/**
 * What the sign-up box on an event page asks for, and what makes an answer
 * wrong. Read by the box in the browser and by the server, so the two never
 * disagree.
 */

export const SIGN_UP_NAME_MAX = 120
export const SIGN_UP_EMAIL_MAX = 255

/** How many sign-ups one internet address may make on one site an hour. */
export const SIGN_UPS_PER_HOUR = 8

/** The most seats an admin can set, the same as the database's check. */
export const MAX_EVENT_SEATS = 100_000

/** The hidden box a person never sees. A bot fills every box it finds. */
export const SIGN_UP_TRAP = "homepage"

/**
 * How long a freed seat is held for the person it was offered to: a day, or
 * until two hours before the event starts, whichever comes first. Tyler chose
 * that on 29 Sep 2026. The second half matters on the day itself, where a hold
 * of a day would outlive the event it is for.
 */
export const OFFER_HOLD_HOURS = 24
export const OFFER_ENDS_BEFORE_START_HOURS = 2

/** "1st", "2nd", "3rd", "4th" — the place a person has in the queue. */
export function placeInQueue(place: number): string {
  const lastTwo = place % 100
  if (lastTwo >= 11 && lastTwo <= 13) return `${place}th`
  switch (place % 10) {
    case 1:
      return `${place}st`
    case 2:
      return `${place}nd`
    case 3:
      return `${place}rd`
    default:
      return `${place}th`
  }
}

// Tabs, line breaks and the invisible characters below space. The database
// refuses some of them outright.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/

/**
 * The name as it is kept: one line, no invisible characters, and no longer
 * than the column. It is shown in a list and will go into emails.
 */
export function cleanSignUpName(raw: string): string {
  return raw
    .split(CONTROL_CHARACTERS)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, SIGN_UP_NAME_MAX)
}

/** The first thing wrong with a name and email, or null when both are fine. */
export function signUpProblem(input: {
  name: string
  email: string
}): string | null {
  // Checked as it would be kept, so a name of nothing but invisible
  // characters is not saved as a blank one.
  if (!cleanSignUpName(input.name)) return "Enter your name."
  if (
    CONTROL_CHARACTERS.test(input.email.trim()) ||
    !looksLikeEmail(input.email)
  ) {
    return "Enter a valid email address."
  }
  return null
}

/**
 * A typed seat count as the number to save: null for an empty box, which
 * means no limit, and an error in words for anything else that is not a
 * whole number from 1 up.
 */
export function readSeats(typed: string): number | null {
  const trimmed = typed.trim()
  if (!trimmed) return null
  const seats = Number(trimmed)
  if (!Number.isInteger(seats) || seats < 1 || seats > MAX_EVENT_SEATS) {
    throw new Error(
      "Seats has to be a whole number from 1 up, or empty for no limit."
    )
  }
  return seats
}

/** The event's own question, and the answer a person gives to it. */
export const SIGN_UP_QUESTION_MAX = 200
export const SIGN_UP_ANSWER_MAX = 500

/** The question as it is kept: one line, as long as the column at most. */
export function cleanSignUpQuestion(raw: string): string {
  return oneLine(raw).slice(0, SIGN_UP_QUESTION_MAX)
}

/** An answer as it is kept: one line, as long as the column at most. */
export function cleanSignUpAnswer(raw: string): string {
  return oneLine(raw).slice(0, SIGN_UP_ANSWER_MAX)
}

function oneLine(raw: string): string {
  return raw.split(CONTROL_CHARACTERS).join(" ").replace(/\s+/g, " ").trim()
}

/**
 * When sign-ups close, as the Sign-ups card offers it (Tyler, 19 Nov 2026:
 * "On each event"). Null is the start of the event, which is where they
 * closed before this choice existed.
 */
export const SIGN_UPS_CLOSE_CHOICES: { hours: number | null; label: string }[] =
  [
    { hours: null, label: "When it starts" },
    { hours: 1, label: "1 hour before" },
    { hours: 3, label: "3 hours before" },
    { hours: 24, label: "1 day before" },
    { hours: 48, label: "2 days before" },
    { hours: 72, label: "3 days before" },
    { hours: 168, label: "1 week before" },
  ]

/** The most hours a cut-off may be, the same as the database's check. */
export const MAX_SIGN_UPS_CLOSE_HOURS = 720

/** A cut-off as it is kept: a whole number of hours from 1 to 720, or null. */
export function cleanCloseHours(hours: number | null): number | null {
  if (hours === null) return null
  if (
    !Number.isInteger(hours) ||
    hours < 1 ||
    hours > MAX_SIGN_UPS_CLOSE_HOURS
  ) {
    throw new Error("Sign-ups close a whole number of hours before, up to 30 days.")
  }
  return hours
}
