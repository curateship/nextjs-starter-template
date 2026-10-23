import { and, asc, count, eq, inArray, isNotNull, lte } from "drizzle-orm"

import {
  DEFAULT_SITE_TIME_ZONE,
  eventHasStarted,
  eventMomentText,
  isKnownTimeZone,
} from "@/lib/events/event-time"
import {
  OFFER_ENDS_BEFORE_START_HOURS,
  OFFER_HOLD_HOURS,
} from "@/lib/events/sign-up-fields"
import { createSecretToken, hashToken, now } from "@/server/auth/security"
import { db, type CustomShellDb } from "@/server/db"
import { sendDirectoryEmail } from "@/server/directory/mail"
import { siteTimeZone } from "@/server/directory/settings"
import { directorySiteUrl } from "@/server/directory/site-url"
import { eventSignUps, siteEvents } from "@/server/events/schema"
import { customShellWorkspaces } from "@/server/schema"

/**
 * The waiting list: what happens after an event fills up.
 *
 * - **A full event queues people instead of turning them away.** That part is
 *   `signUpForEvent` in `sign-ups.ts`, which writes a `waiting` row.
 * - **A freed seat is offered, never given.** The person at the front of the
 *   queue is emailed a link. Their row becomes `offered`, which holds the seat
 *   so the next visitor cannot take it, and the link is what turns the offer
 *   into a seat.
 * - **A hold runs out** a day later, or two hours before the event starts,
 *   whichever comes first. The seat then passes to the next person, and the
 *   one who did not answer comes off the list. Tyler chose both on
 *   29 Sep 2026.
 * - **Two seats freed at once go to two different people**, because each offer
 *   is written inside the same locked pass that counted the free seats, so the
 *   second offer sees the first one's seat as taken.
 *
 * Nothing here is called from a visitor's request. `runWaitingListPass` is the
 * one way in, and the shell's background pass calls it every fifteen seconds.
 * A seat freed by an admin removing somebody, by the seats being raised, or by
 * a hold running out all reach the queue the same way.
 */

/** How many seats one pass offers for one event, so no pass runs away. */
const OFFERS_PER_EVENT = 50
/** How many events one pass looks at. */
const EVENTS_PER_PASS = 200
/** How many run-out holds one pass clears. */
const EXPIRIES_PER_PASS = 500

/** The event a seat belongs to, and the site whose email and address it uses. */
type OfferContext = {
  eventId: string
  siteId: string
  title: string
  slug: string
  seats: number | null
  startDate: string
  startTime: string
  timeZone: string
  siteUrl: string
}

/**
 * Everything one offer needs, or null when this event offers nothing: it was
 * deleted, unpublished, or its admin switched sign-ups off. Somebody stays on
 * the list through all three, so switching sign-ups back on picks the queue up
 * where it was.
 */
async function offerContext(
  eventId: string,
  database: CustomShellDb
): Promise<OfferContext | null> {
  const [row] = await database
    .select({
      eventId: siteEvents.id,
      siteId: siteEvents.workspaceId,
      title: siteEvents.title,
      slug: siteEvents.slug,
      seats: siteEvents.seats,
      startDate: siteEvents.startDate,
      startTime: siteEvents.startTime,
      subdomain: customShellWorkspaces.subdomain,
      customDomain: customShellWorkspaces.customDomain,
    })
    .from(siteEvents)
    .innerJoin(
      customShellWorkspaces,
      eq(customShellWorkspaces.id, siteEvents.workspaceId)
    )
    .where(
      and(
        eq(siteEvents.id, eventId),
        eq(siteEvents.status, "published"),
        eq(siteEvents.takesSignUps, true)
      )
    )
    .limit(1)
  if (!row) return null

  return {
    eventId: row.eventId,
    siteId: row.siteId,
    title: row.title,
    slug: row.slug,
    seats: row.seats,
    startDate: row.startDate,
    startTime: row.startTime,
    timeZone: await siteTimeZone(row.siteId, database),
    siteUrl: directorySiteUrl({
      subdomain: row.subdomain,
      customDomain: row.customDomain || null,
    }),
  }
}

/**
 * When a seat offered now would stop being held, or null when there is no
 * point offering it. Exported for its own test; nothing else calls it.
 *
 * Null is the last two hours before the event and everything after it. A seat
 * that frees then goes straight back on the page for anybody to take, because
 * a hold nobody has time to answer would keep the seat empty on the night.
 */
export function holdUntil(
  event: { startDate: string; startTime: string },
  timeZone: string,
  at: Date
): Date | null {
  const starts = new Date(
    eventMomentText(event.startDate, event.startTime, timeZone)
  )
  const latest = new Date(
    starts.getTime() - OFFER_ENDS_BEFORE_START_HOURS * 60 * 60 * 1000
  )
  const aDayOn = new Date(at.getTime() + OFFER_HOLD_HOURS * 60 * 60 * 1000)
  const until = aDayOn < latest ? aDayOn : latest
  return until > at ? until : null
}

/** Seats taken: somebody coming, or somebody a seat is being held for. */
async function seatsHeld(
  eventId: string,
  database: CustomShellDb
): Promise<number> {
  const [row] = await database
    .select({ taken: count() })
    .from(eventSignUps)
    .where(
      and(
        eq(eventSignUps.eventId, eventId),
        inArray(eventSignUps.status, ["confirmed", "offered"])
      )
    )
  return row?.taken ?? 0
}

/** One offer, as it leaves the locked pass and goes into an inbox. */
type MadeOffer = {
  signUpId: string
  name: string
  email: string
  token: string
  expiresAt: Date
}

/**
 * Marks as many people at the front of the queue as there are free seats.
 *
 * The event's row is locked first, exactly as a sign-up locks it, so this
 * counts the same seats a visitor signing up at that moment would count and
 * the two cannot both take the last one.
 *
 * Two seats freed at the same moment reach two different people because the
 * count and both offers happen inside that one lock: two free seats take the
 * first two people off the front of the queue, and the event is full again
 * before anything else can look at it.
 */
async function takeOffers(
  context: OfferContext,
  expiresAt: Date,
  database: CustomShellDb
): Promise<MadeOffer[]> {
  return database.transaction(async (tx) => {
    await tx
      .select({ id: siteEvents.id })
      .from(siteEvents)
      .where(eq(siteEvents.id, context.eventId))
      .for("update")

    const waiting = await tx
      .select({
        id: eventSignUps.id,
        name: eventSignUps.name,
        email: eventSignUps.email,
      })
      .from(eventSignUps)
      .where(
        and(
          eq(eventSignUps.eventId, context.eventId),
          eq(eventSignUps.status, "waiting")
        )
      )
      .orderBy(asc(eventSignUps.createdAt), asc(eventSignUps.id))
      .limit(OFFERS_PER_EVENT)
    if (!waiting.length) return []

    const free =
      context.seats === null
        ? waiting.length
        : Math.min(
            waiting.length,
            context.seats - (await seatsHeld(context.eventId, tx))
          )
    if (free <= 0) return []

    const offers: MadeOffer[] = []
    for (const person of waiting.slice(0, free)) {
      const token = createSecretToken()
      // Guarded on 'waiting' so an admin removing this person a moment ago
      // wins, and their seat stays free for the next pass.
      const [taken] = await tx
        .update(eventSignUps)
        .set({
          status: "offered",
          offerTokenHash: hashToken(token),
          offerExpiresAt: expiresAt,
        })
        .where(
          and(
            eq(eventSignUps.id, person.id),
            eq(eventSignUps.status, "waiting")
          )
        )
        .returning({ id: eventSignUps.id })
      if (!taken) continue
      offers.push({
        signUpId: person.id,
        name: person.name,
        email: person.email,
        token,
        expiresAt,
      })
    }
    return offers
  })
}

/** "Thursday, October 2 at 6:00 PM", on the site's clock, for the email. */
function heldUntilText(expiresAt: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    // A zone this JavaScript does not know would throw and lose the email,
    // which is the same guard `wallClockAt` makes for the same reason.
    timeZone: isKnownTimeZone(timeZone) ? timeZone : DEFAULT_SITE_TIME_ZONE,
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(expiresAt)
}

async function emailTheOffer(
  context: OfferContext,
  offer: MadeOffer,
  database: CustomShellDb
): Promise<void> {
  await sendDirectoryEmail(
    {
      workspaceId: context.siteId,
      to: offer.email,
      subject: `A seat has come free: ${context.title}`,
      lines: [
        `Hello ${offer.name},`,
        `You are on the waiting list for ${context.title}, and a seat has come free.`,
        `The seat is held for you until ${heldUntilText(offer.expiresAt, context.timeZone)}. After that it goes to the next person on the list.`,
      ],
      action: {
        label: "Claim your seat",
        url: `${context.siteUrl}/api/event-seat?token=${offer.token}`,
      },
    },
    database
  )
}

/**
 * Offers every free seat on one event to the front of its queue, and returns
 * how many offers reached an inbox.
 *
 * The email is sent after the seats are taken, never inside the lock: a mail
 * server that takes four seconds must not hold every sign-up on the event for
 * four seconds. An email that fails puts the person back at their old place in
 * the queue, so nobody loses their turn to a mail problem, and the next pass
 * tries again.
 */
async function offerFreeSeats(
  eventId: string,
  at: Date = now(),
  database: CustomShellDb = db
): Promise<number> {
  const context = await offerContext(eventId, database)
  if (!context) return 0
  const expiresAt = holdUntil(context, context.timeZone, at)
  if (!expiresAt) return 0
  // Asked without the lock first. A full event with fifty people waiting is
  // the ordinary state for days on end, and it must not lock the event's row
  // and open a transaction every fifteen seconds to be told so. The locked
  // count below is still the one that decides.
  if (
    context.seats !== null &&
    (await seatsHeld(context.eventId, database)) >= context.seats
  ) {
    return 0
  }

  const offers = await takeOffers(context, expiresAt, database)

  let sent = 0
  for (const offer of offers) {
    try {
      await emailTheOffer(context, offer, database)
      sent += 1
    } catch (error) {
      await database
        .update(eventSignUps)
        .set({ status: "waiting", offerTokenHash: null, offerExpiresAt: null })
        .where(
          and(
            eq(eventSignUps.id, offer.signUpId),
            eq(eventSignUps.status, "offered")
          )
        )
      console.error(
        `The waiting-list offer for event ${eventId} was not emailed`,
        error
      )
    }
  }
  return sent
}

/**
 * Clears every hold that has run out and returns how many. Those people are
 * off the list, which Tyler chose on 29 Sep 2026: an offer nobody answers is
 * an answer. Their seat is free again the instant the row stops being
 * 'offered', and the same pass then offers it to the next person.
 */
async function expireHolds(
  at: Date = now(),
  database: CustomShellDb = db
): Promise<number> {
  const runOut = await database
    .select({ id: eventSignUps.id })
    .from(eventSignUps)
    .where(
      and(
        eq(eventSignUps.status, "offered"),
        isNotNull(eventSignUps.offerExpiresAt),
        lte(eventSignUps.offerExpiresAt, at)
      )
    )
    .limit(EXPIRIES_PER_PASS)
  if (!runOut.length) return 0

  const cleared = await database
    .update(eventSignUps)
    .set({ status: "expired" })
    .where(
      and(
        inArray(
          eventSignUps.id,
          runOut.map((row) => row.id)
        ),
        eq(eventSignUps.status, "offered")
      )
    )
    .returning({ id: eventSignUps.id })
  return cleared.length
}

/**
 * One pass of the waiting list, for the shell's background pass.
 *
 * Two steps, in this order: clear the holds that have run out, then offer
 * every free seat on every event that has somebody waiting. The second step
 * asks the question rather than being told the answer, which is what makes an
 * admin removing somebody, the seats being raised, a hold running out and a
 * crashed server all end the same way. One broken event never stops the rest.
 */
export async function runWaitingListPass(
  at: Date = now(),
  database: CustomShellDb = db
): Promise<void> {
  await expireHolds(at, database)

  const events = await database
    .selectDistinct({ eventId: eventSignUps.eventId })
    .from(eventSignUps)
    .where(eq(eventSignUps.status, "waiting"))
    .limit(EVENTS_PER_PASS)

  for (const row of events) {
    try {
      await offerFreeSeats(row.eventId, at, database)
    } catch (error) {
      console.error(
        `The waiting list for event ${row.eventId} was not worked through`,
        error
      )
    }
  }
}

/** What clicking a claim link did. Each one is a sentence on the page. */
export type ClaimOutcome =
  | { outcome: "claimed"; title: string; eventUrl: string }
  | { outcome: "already"; title: string; eventUrl: string }
  | { outcome: "ran-out"; title: string; eventUrl: string }
  | { outcome: "started"; title: string; eventUrl: string }
  | { outcome: "unknown" }

/**
 * Turns an offer into a seat.
 *
 * The seat is already being held by the offered row, so claiming only changes
 * what the row is, never how many seats are taken. That is why there is no
 * lock here: two clicks on the same link race to the same single-row update
 * and the second one changes nothing.
 *
 * The token is not cleared. A second click, a link clicked after the hold ran
 * out, and a link belonging to somebody an admin has removed each get a
 * sentence saying so, rather than the same shrug an invented token gets.
 */
export async function claimOfferedSeat(
  token: string,
  at: Date = now(),
  database: CustomShellDb = db
): Promise<ClaimOutcome> {
  const [row] = await database
    .select({
      id: eventSignUps.id,
      status: eventSignUps.status,
      expiresAt: eventSignUps.offerExpiresAt,
      siteId: eventSignUps.workspaceId,
      eventId: siteEvents.id,
      title: siteEvents.title,
      slug: siteEvents.slug,
      startDate: siteEvents.startDate,
      startTime: siteEvents.startTime,
      subdomain: customShellWorkspaces.subdomain,
      customDomain: customShellWorkspaces.customDomain,
    })
    .from(eventSignUps)
    .innerJoin(siteEvents, eq(siteEvents.id, eventSignUps.eventId))
    .innerJoin(
      customShellWorkspaces,
      eq(customShellWorkspaces.id, eventSignUps.workspaceId)
    )
    .where(eq(eventSignUps.offerTokenHash, hashToken(token)))
    .limit(1)
  if (!row) return { outcome: "unknown" }

  const eventUrl = `${directorySiteUrl({
    subdomain: row.subdomain,
    customDomain: row.customDomain || null,
  })}/events/${row.slug}`
  const where = { title: row.title, eventUrl }

  if (row.status === "confirmed") return { outcome: "already", ...where }
  if (row.status !== "offered") return { outcome: "ran-out", ...where }

  const timeZone = await siteTimeZone(row.siteId, database)
  if (eventHasStarted(row, timeZone, at)) {
    return { outcome: "started", ...where }
  }
  // Read again here rather than trusted from the row above: the pass may have
  // cleared this hold between the two, and the guard below settles it either
  // way.
  if (row.expiresAt && row.expiresAt <= at) {
    return { outcome: "ran-out", ...where }
  }

  const [claimed] = await database
    .update(eventSignUps)
    .set({ status: "confirmed" })
    .where(and(eq(eventSignUps.id, row.id), eq(eventSignUps.status, "offered")))
    .returning({ id: eventSignUps.id })
  return claimed
    ? { outcome: "claimed", ...where }
    : { outcome: "ran-out", ...where }
}
