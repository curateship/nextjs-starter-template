import { and, asc, count, eq, exists, sql } from "drizzle-orm"

import { eventHasStarted } from "@/lib/events/event-time"
import {
  cleanSignUpName,
  SIGN_UP_EMAIL_MAX,
  SIGN_UPS_PER_HOUR,
  signUpProblem,
} from "@/lib/events/sign-up-fields"
import { enforceRateLimit, RateLimitError } from "@/server/auth/rate-limit"
import { uuid } from "@/server/auth/security"
import { db, type CustomShellDb } from "@/server/db"
import { siteTimeZone } from "@/server/directory/settings"
import { eventSignUps, siteEvents } from "@/server/events/schema"

/**
 * Free sign-ups for an event: a name and an email, no account, and an
 * optional number of seats.
 *
 * - **Seats are counted under a lock.** A sign-up locks the event's row
 *   before it counts, so two people racing for the last seat are taken one
 *   after the other and the second is told the event is full.
 * - **One live sign-up per email per event**, which the database also
 *   enforces. Signing up again with the same email writes nothing and says
 *   the same "You're on the list" as the first time, so the box cannot be
 *   used to find out whether somebody is going. Tyler chose that on
 *   24 Sep 2026.
 * - **Sign-ups close when the event starts**, by the site's clock.
 * - **Removing someone** marks their row cancelled. That frees the seat, and
 *   the same email can sign up again while a seat is free. Tyler chose that
 *   on 24 Sep 2026.
 *
 * Each date of a repeating event is its own event, so it has its own seats and
 * its own list. Every read and write takes the site first.
 */

/** What the event page's sign-up box shows. Counts only, never names. */
export type SignUpBox = {
  /** How many seats there are, or null for no limit. */
  seats: number | null
  /** Seats still free, or null for no limit. */
  left: number | null
  full: boolean
  /** The event has started, so nobody new can sign up. */
  closed: boolean
}

/** Holds a seat. A cancelled row is a record, not a seat. */
const holdsSeat = eq(eventSignUps.status, "confirmed")

async function seatsTaken(
  eventId: string,
  database: CustomShellDb
): Promise<number> {
  const [row] = await database
    .select({ taken: count() })
    .from(eventSignUps)
    .where(and(eq(eventSignUps.eventId, eventId), holdsSeat))
  return row?.taken ?? 0
}

/**
 * A published event's sign-up box, or null when it takes no sign-ups. Read on
 * every visit, after the page cache, so the seats left are never stale.
 */
export async function signUpBoxFor(
  siteId: string,
  eventId: string,
  timeZone: string,
  at: Date,
  database: CustomShellDb = db
): Promise<SignUpBox | null> {
  const [event] = await database
    .select({
      takesSignUps: siteEvents.takesSignUps,
      seats: siteEvents.seats,
      startDate: siteEvents.startDate,
      startTime: siteEvents.startTime,
    })
    .from(siteEvents)
    .where(
      and(
        eq(siteEvents.id, eventId),
        eq(siteEvents.workspaceId, siteId),
        eq(siteEvents.status, "published")
      )
    )
    .limit(1)
  if (!event?.takesSignUps) return null

  const taken = await seatsTaken(eventId, database)
  const left = event.seats === null ? null : Math.max(0, event.seats - taken)
  return {
    seats: event.seats,
    left,
    full: left === 0,
    closed: eventHasStarted(event, timeZone, at),
  }
}

type SignUpOutcome =
  { outcome: "signed-up" } | { outcome: "refused"; problem: string }

export const SIGN_UPS_CLOSED = "Sign-ups have closed. The event has started."
export const EVENT_FULL = "Sorry, this event is full."
const NOT_TAKING = "This event is not taking sign-ups."

/**
 * One visitor signing up, in this order: the name and email are checked, then
 * the hourly limit is counted, then the seat is taken. A typo costs nothing,
 * and the limit is counted before the event is looked up, so the box is not an
 * unmetered way to ask whether an id is an event here.
 */
export async function signUpForEvent(
  siteId: string,
  eventId: string,
  input: { name: string; email: string },
  context: { ip: string; at?: Date },
  database: CustomShellDb = db
): Promise<SignUpOutcome> {
  const problem = signUpProblem(input)
  if (problem) return { outcome: "refused", problem }

  try {
    await enforceRateLimit(
      `event-sign-up:${siteId}:${context.ip}`,
      { maxAttempts: SIGN_UPS_PER_HOUR, windowSeconds: 60 * 60 },
      database
    )
  } catch (error) {
    if (error instanceof RateLimitError) {
      return {
        outcome: "refused",
        problem: `You have signed up ${SIGN_UPS_PER_HOUR} times in the last hour, which is as many as this site takes. Please try again in an hour.`,
      }
    }
    throw error
  }

  const name = cleanSignUpName(input.name)
  const email = input.email.trim().toLowerCase().slice(0, SIGN_UP_EMAIL_MAX)
  const at = context.at ?? new Date()
  const timeZone = await siteTimeZone(siteId, database)

  return database.transaction(async (tx) => {
    // The lock: a second sign-up for this event waits here until the first
    // has counted and written, so its count includes the first one's seat.
    const [event] = await tx
      .select({
        takesSignUps: siteEvents.takesSignUps,
        seats: siteEvents.seats,
        startDate: siteEvents.startDate,
        startTime: siteEvents.startTime,
      })
      .from(siteEvents)
      .where(
        and(
          eq(siteEvents.id, eventId),
          eq(siteEvents.workspaceId, siteId),
          eq(siteEvents.status, "published")
        )
      )
      .for("update")
    if (!event?.takesSignUps) {
      return { outcome: "refused" as const, problem: NOT_TAKING }
    }
    if (eventHasStarted(event, timeZone, at)) {
      return { outcome: "refused" as const, problem: SIGN_UPS_CLOSED }
    }

    const [already] = await tx
      .select({ id: eventSignUps.id })
      .from(eventSignUps)
      .where(
        and(
          eq(eventSignUps.eventId, eventId),
          eq(eventSignUps.email, email),
          holdsSeat
        )
      )
      .limit(1)
    // The same answer as a new sign-up, so nobody learns who is going.
    if (already) return { outcome: "signed-up" as const }

    if (
      event.seats !== null &&
      (await seatsTaken(eventId, tx)) >= event.seats
    ) {
      return { outcome: "refused" as const, problem: EVENT_FULL }
    }

    await tx.insert(eventSignUps).values({
      id: uuid(),
      workspaceId: siteId,
      eventId,
      name,
      email,
      createdAt: at,
    })
    return { outcome: "signed-up" as const }
  })
}

/** A person on an event's list, for Admin → Events. */
export type EventSignUp = {
  id: string
  name: string
  email: string
  createdAt: Date
}

/** Who is coming to one event, first to sign up first. */
export async function listSignUps(
  workspaceId: string,
  eventId: string,
  database: CustomShellDb = db
): Promise<EventSignUp[]> {
  return database
    .select({
      id: eventSignUps.id,
      name: eventSignUps.name,
      email: eventSignUps.email,
      createdAt: eventSignUps.createdAt,
    })
    .from(eventSignUps)
    .where(
      and(
        eq(eventSignUps.workspaceId, workspaceId),
        eq(eventSignUps.eventId, eventId),
        holdsSeat
      )
    )
    .orderBy(asc(eventSignUps.createdAt), asc(eventSignUps.id))
}

/** Takes somebody off the list, which frees their seat. */
export async function removeSignUp(
  workspaceId: string,
  signUpId: string,
  database: CustomShellDb = db
): Promise<void> {
  const removed = await database
    .update(eventSignUps)
    .set({ status: "cancelled", cancelledAt: new Date() })
    .where(
      and(
        eq(eventSignUps.id, signUpId),
        eq(eventSignUps.workspaceId, workspaceId),
        holdsSeat
      )
    )
    .returning({ id: eventSignUps.id })
  if (!removed.length) {
    throw new Error("That person is no longer on the list.")
  }
}

/**
 * An event that somebody is signed up for. Changing a repeat keeps such a
 * date rather than deleting it, so nobody's place is thrown away.
 */
export function holdsSignUps(database: CustomShellDb) {
  return exists(
    database
      .select({ one: sql`1` })
      .from(eventSignUps)
      .where(and(eq(eventSignUps.eventId, siteEvents.id), holdsSeat))
  )
}
