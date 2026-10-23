import { and, asc, count, eq, exists, inArray, lt, or, sql } from "drizzle-orm"

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
 * - **A full event offers the waiting list instead.** The same box joins a
 *   queue, and `server/events/waiting-list.ts` holds everything that happens
 *   after that. A waiting row takes no seat; an offered one does.
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
  /** Full, but the box takes names for the waiting list. */
  waitingList: boolean
}

/**
 * Holds a seat: somebody who is coming, or somebody a seat is being held for
 * while they claim it. A seat under offer has to count, or the next visitor
 * would take it out from under the person who was just emailed.
 */
const holdsSeat = inArray(eventSignUps.status, ["confirmed", "offered"])

/** Coming, as opposed to waiting or holding an unclaimed offer. */
const isComing = eq(eventSignUps.status, "confirmed")

/** In the queue, holding no seat yet. */
const isWaiting = eq(eventSignUps.status, "waiting")

/**
 * On the list in any live sense. The database's unique index uses the same
 * three, so this is what "already signed up" means.
 */
const onTheList = inArray(eventSignUps.status, [
  "confirmed",
  "waiting",
  "offered",
])

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
  const closed = eventHasStarted(event, timeZone, at)
  return {
    seats: event.seats,
    left,
    full: left === 0,
    closed,
    // Only a full event that has not started: with seats free there is
    // nothing to wait for, and once it has started nothing can free up in
    // time to matter.
    waitingList: left === 0 && !closed,
  }
}

/**
 * Somebody's place in the queue, counting from 1. Worked out from the times
 * rather than stored, so removing the person in front moves everybody behind
 * them up without a second write.
 */
async function queuePlace(
  eventId: string,
  person: { id: string; createdAt: Date },
  database: CustomShellDb
): Promise<number> {
  const [row] = await database
    .select({ ahead: count() })
    .from(eventSignUps)
    .where(
      and(
        eq(eventSignUps.eventId, eventId),
        isWaiting,
        // The same order the offers go out in, ties and all, so the number a
        // person is told is the number of offers that have to happen first.
        or(
          lt(eventSignUps.createdAt, person.createdAt),
          and(
            eq(eventSignUps.createdAt, person.createdAt),
            lt(eventSignUps.id, person.id)
          )
        )
      )
    )
  return (row?.ahead ?? 0) + 1
}

type SignUpOutcome =
  | { outcome: "signed-up" }
  /** On the waiting list, at `place`, counting from 1. */
  | { outcome: "waiting"; place: number }
  /** A seat is already being held for this email, and the link is in an inbox. */
  | { outcome: "offered" }
  | { outcome: "refused"; problem: string }

export const SIGN_UPS_CLOSED = "Sign-ups have closed. The event has started."
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
      .select({
        id: eventSignUps.id,
        status: eventSignUps.status,
        createdAt: eventSignUps.createdAt,
      })
      .from(eventSignUps)
      .where(
        and(
          eq(eventSignUps.eventId, eventId),
          eq(eventSignUps.email, email),
          onTheList
        )
      )
      .limit(1)
    if (already) {
      // The same answer as a new sign-up would get, so nobody learns who is
      // going by typing somebody else's address. Nothing is written either
      // way.
      //
      // The waiting list bends that a little, on purpose: it answers with
      // the real place, so typing somebody else's address on a full event
      // does say they are on the queue. Telling a real person a made-up
      // place would send them to an event they have no seat at, and that is
      // the worse of the two.
      if (already.status === "confirmed")
        return { outcome: "signed-up" as const }
      if (already.status === "offered") return { outcome: "offered" as const }
      return {
        outcome: "waiting" as const,
        place: await queuePlace(eventId, already, tx),
      }
    }

    const full =
      event.seats !== null && (await seatsTaken(eventId, tx)) >= event.seats

    const id = uuid()
    await tx.insert(eventSignUps).values({
      id,
      workspaceId: siteId,
      eventId,
      name,
      email,
      status: full ? "waiting" : "confirmed",
      createdAt: at,
    })
    // Written first, then counted, so the answer includes this row and the
    // first person to join a queue is told they are 1st, not 0th.
    return full
      ? {
          outcome: "waiting" as const,
          place: await queuePlace(eventId, { id, createdAt: at }, tx),
        }
      : { outcome: "signed-up" as const }
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
        isComing
      )
    )
    .orderBy(asc(eventSignUps.createdAt), asc(eventSignUps.id))
}

/** Somebody in the queue, for the Sign-ups card in Admin → Events. */
export type EventWaitingPerson = EventSignUp & {
  /** When the seat being held for them passes on, or null while they wait. */
  offerExpiresAt: Date | null
}

/**
 * The queue for one event, front first. The person holding an offer is first,
 * because the offer went to whoever was at the front.
 */
export async function listWaitingList(
  workspaceId: string,
  eventId: string,
  database: CustomShellDb = db
): Promise<EventWaitingPerson[]> {
  return database
    .select({
      id: eventSignUps.id,
      name: eventSignUps.name,
      email: eventSignUps.email,
      createdAt: eventSignUps.createdAt,
      offerExpiresAt: eventSignUps.offerExpiresAt,
    })
    .from(eventSignUps)
    .where(
      and(
        eq(eventSignUps.workspaceId, workspaceId),
        eq(eventSignUps.eventId, eventId),
        inArray(eventSignUps.status, ["waiting", "offered"])
      )
    )
    .orderBy(asc(eventSignUps.createdAt), asc(eventSignUps.id))
}

/**
 * Takes somebody off, wherever they were: coming, waiting, or holding an
 * offer. Removing one of the first two frees a seat that the background pass
 * then offers to the front of the queue.
 */
export async function removeSignUp(
  workspaceId: string,
  signUpId: string,
  database: CustomShellDb = db
): Promise<void> {
  const removed = await database
    .update(eventSignUps)
    // Their claim link stops working at once: only an 'offered' row can be
    // claimed. The token is kept so the link says what happened rather than
    // pretending it was never sent.
    .set({ status: "cancelled", cancelledAt: new Date() })
    .where(
      and(
        eq(eventSignUps.id, signUpId),
        eq(eventSignUps.workspaceId, workspaceId),
        onTheList
      )
    )
    .returning({ id: eventSignUps.id })
  if (!removed.length) {
    throw new Error("That person is no longer on the list.")
  }
}

/**
 * An event somebody is signed up for or waiting for. Changing a repeat keeps
 * such a date rather than deleting it, so nobody's place is thrown away.
 */
export function holdsSignUps(database: CustomShellDb) {
  return exists(
    database
      .select({ one: sql`1` })
      .from(eventSignUps)
      .where(and(eq(eventSignUps.eventId, siteEvents.id), onTheList))
  )
}
