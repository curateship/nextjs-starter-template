import { and, asc, eq, gt, inArray, isNotNull, lt, sql } from "drizzle-orm"
import type { PgUpdateSetSource } from "drizzle-orm/pg-core"

import { addDays } from "@/lib/events/event-repeat"
import { formatEventClock, formatEventDay, toClock } from "@/lib/events/event-time"
import {
  readScheduleStatus,
  type ScheduleNotice,
  type ScheduleStatus,
} from "@/lib/events/schedule-status"
import { now } from "@/server/auth/security"
import { db, type CustomShellDb } from "@/server/db"
import { moveEventSpotEnd } from "@/server/directory/featured"
import { sendDirectoryEmail } from "@/server/directory/mail"
import { clearPublicDirectoryCache } from "@/server/directory/public-cache"
import { directorySiteUrl } from "@/server/directory/site-url"
import { cleanEventWhen, toEvent, type SiteEvent } from "@/server/events/events"
import { eventSignUps, siteEvents } from "@/server/events/schema"
import { customShellWorkspaces } from "@/server/schema"

/**
 * Cancelled and postponed events (task events/27).
 *
 * - **The change** is `changeEventSchedule`, which the event record calls
 *   after the admin confirms. It is never part of the record's save, so it
 *   never happens without the confirm.
 * - **Telling people** is `runEventNoticePass`, which the shell's background
 *   pass calls every fifteen seconds. A change bumps the event's
 *   `noticeNumber`; everybody on the list whose `toldNotice` is behind it is
 *   emailed once, and their number moves up. Saving the same status twice
 *   bumps nothing, so it sends nothing (the task's "sent once, even if the
 *   status is saved twice").
 * - **Who is told:** everybody signed up, everybody holding a seat offered
 *   from the waiting list, and everybody waiting (Tyler, 19 Nov 2026: "Signed
 *   up + waiting").
 */

/** What the admin asked for. A new day and time only when going ahead again. */
export type ScheduleChange = {
  status: ScheduleStatus
  when?: { startDate: string; startTime: string }
}

/**
 * Sets whether an event is going ahead, and leaves a notice for everybody on
 * its list when that really changed.
 *
 * Going back to scheduled from cancelled or postponed takes the day and time
 * it goes ahead on. A different day or time moves the event there, keeps
 * where it was for the "Rescheduled from" note, and the notice says
 * rescheduled. The same day and time is "back on". A scheduled event's date is
 * changed in the record as always, and sends nothing.
 */
export async function changeEventSchedule(
  workspaceId: string,
  id: string,
  change: ScheduleChange,
  database: CustomShellDb = db
): Promise<SiteEvent> {
  const result = await database.transaction(async (tx) => {
    // Locked, so two admins pressing at once make one change, not two notices.
    const [row] = await tx
      .select()
      .from(siteEvents)
      .where(and(eq(siteEvents.id, id), eq(siteEvents.workspaceId, workspaceId)))
      .for("update")
    if (!row) throw new Error("That event no longer exists.")

    const was = readScheduleStatus(row.scheduleStatus)
    if (was === change.status) return { row, moved: false }

    const values: PgUpdateSetSource<typeof siteEvents> = {
      scheduleStatus: change.status,
      updatedAt: now(),
    }
    let notice: ScheduleNotice = change.status === "scheduled" ? "back-on" : change.status
    let moved = false
    if (change.status === "scheduled" && change.when) {
      const startTime = toClock(row.startTime)
      if (change.when.startDate !== row.startDate || change.when.startTime !== startTime) {
        // The main event of a repeat anchors its rule, so a new day for it
        // is a change to the repeat, made in the record, not here.
        if (row.repeatRule) {
          throw new Error(
            "This event repeats. Put it back on, then change its day in When and where, or open the one date from Later dates."
          )
        }
        Object.assign(
          values,
          cleanEventWhen({
            startDate: change.when.startDate,
            startTime: change.when.startTime,
            ...movedEnd(
              { startDate: row.startDate, startTime, endDate: row.endDate, endTime: row.endTime ? toClock(row.endTime) : null },
              change.when
            ),
          })
        )
        values.rescheduledFromDate = row.startDate
        values.rescheduledFromTime = row.startTime
        notice = "rescheduled"
        moved = true
      }
    }
    values.notice = notice
    values.noticeNumber = sql`${siteEvents.noticeNumber} + 1`
    // One date of a repeat changed by itself stops following its main event,
    // so a later change to the repeat neither undoes it nor deletes it.
    if (row.seriesId) values.editedAlone = true

    const [updated] = await tx
      .update(siteEvents)
      .set(values)
      .where(eq(siteEvents.id, id))
      .returning()
    if (!updated) throw new Error("That event no longer exists.")
    if (change.status !== "scheduled") {
      // A seat being offered goes back to the waiting list, still at the
      // front, rather than running out while the event is off and taking the
      // person off the list. The waiting list offers it again once the event
      // is back on. The token and its time are kept (the database wants both
      // or neither), so an old link says what happened.
      await tx
        .update(eventSignUps)
        .set({ status: "waiting" })
        .where(and(eq(eventSignUps.eventId, id), eq(eventSignUps.status, "offered")))
    }
    return { row: updated, moved }
  })

  const event = toEvent(result.row)
  // An owner's paid spot lasts until the event ends, wherever it moves to.
  if (result.moved) await moveEventSpotEnd(workspaceId, id, event, database)
  clearPublicDirectoryCache(workspaceId)
  return event
}

/** Minutes on a wall clock, counted as if every day were 24 hours long. */
function wallMinutes(date: string, time: string): number {
  return Date.parse(`${date}T${time}:00Z`) / 60_000
}

/**
 * Where the end goes when the start moves: the event keeps its length. A 7 to
 * 10 PM concert moved to 8:30 PM ends at 11:30 PM, and one moved to 11 PM ends
 * at 2 AM the next day. A Friday-to-Sunday festival with no end time stays
 * three days. No end stays no end.
 */
export function movedEnd(
  was: { startDate: string; startTime: string; endDate: string | null; endTime: string | null },
  to: { startDate: string; startTime: string }
): { endDate: string | null; endTime: string | null } {
  if (was.endTime) {
    const length = wallMinutes(was.endDate ?? was.startDate, was.endTime) - wallMinutes(was.startDate, was.startTime)
    const ends = new Date((wallMinutes(to.startDate, to.startTime) + length) * 60_000).toISOString()
    return { endDate: ends.slice(0, 10), endTime: ends.slice(11, 16) }
  }
  if (was.endDate) {
    const days = Math.round((wallMinutes(was.endDate, "00:00") - wallMinutes(was.startDate, "00:00")) / 1440)
    return { endDate: addDays(to.startDate, days), endTime: null }
  }
  return { endDate: null, endTime: null }
}

/** How many emails one pass sends, so a pass with 2,000 to tell stays short. */
const NOTICES_PER_PASS = 100

/** Everybody on a list, the three ways of being on one. */
const ON_THE_LIST = ["confirmed", "offered", "waiting"]

type Due = {
  signUpId: string
  name: string
  email: string
  status: string
  told: number
  siteId: string
  eventStatus: string
  title: string
  slug: string
  startDate: string
  startTime: string
  notice: string | null
  noticeNumber: number
  rescheduledFromDate: string | null
  rescheduledFromTime: string | null
  subdomain: string
  customDomain: string | null
}

/**
 * One pass of telling people, for the shell's background pass. Each person is
 * marked told before the email goes, so two passes at once never send it
 * twice; an email that fails puts their number back, and the next pass tries
 * again. One person's failure never stops the rest.
 */
export async function runEventNoticePass(database: CustomShellDb = db): Promise<number> {
  const due: Due[] = await database
    .select({
      signUpId: eventSignUps.id,
      name: eventSignUps.name,
      email: eventSignUps.email,
      status: eventSignUps.status,
      told: eventSignUps.toldNotice,
      siteId: siteEvents.workspaceId,
      eventStatus: siteEvents.status,
      title: siteEvents.title,
      slug: siteEvents.slug,
      startDate: siteEvents.startDate,
      startTime: siteEvents.startTime,
      notice: siteEvents.notice,
      noticeNumber: siteEvents.noticeNumber,
      rescheduledFromDate: siteEvents.rescheduledFromDate,
      rescheduledFromTime: siteEvents.rescheduledFromTime,
      subdomain: customShellWorkspaces.subdomain,
      customDomain: customShellWorkspaces.customDomain,
    })
    .from(siteEvents)
    .innerJoin(eventSignUps, eq(eventSignUps.eventId, siteEvents.id))
    .innerJoin(customShellWorkspaces, eq(customShellWorkspaces.id, siteEvents.workspaceId))
    .where(
      and(
        // Asked first, so a site whose events never changed costs one look.
        gt(siteEvents.noticeNumber, 0),
        isNotNull(siteEvents.notice),
        lt(eventSignUps.toldNotice, siteEvents.noticeNumber),
        inArray(eventSignUps.status, ON_THE_LIST)
      )
    )
    .orderBy(asc(eventSignUps.createdAt), asc(eventSignUps.id))
    .limit(NOTICES_PER_PASS)

  let sent = 0
  for (const person of due) {
    const [claimed] = await database
      .update(eventSignUps)
      .set({ toldNotice: person.noticeNumber })
      .where(and(eq(eventSignUps.id, person.signUpId), eq(eventSignUps.toldNotice, person.told)))
      .returning({ id: eventSignUps.id })
    if (!claimed) continue

    try {
      await emailTheNotice(person, database)
      sent += 1
    } catch (error) {
      await database
        .update(eventSignUps)
        .set({ toldNotice: person.told })
        .where(and(eq(eventSignUps.id, person.signUpId), eq(eventSignUps.toldNotice, person.noticeNumber)))
      console.error(`The schedule email for sign-up ${person.signUpId} was not sent`, error)
    }
  }
  return sent
}

/**
 * "Saturday, November 22, 2026 at 7:00 PM". The stored day and time are the
 * site's own clock already, so no time zone is needed to say them.
 */
function whenText(date: string, time: string): string {
  return `${formatEventDay(date)} at ${formatEventClock(time)}`
}

/** What one person is emailed, by the notice and by whether they have a seat. */
export function noticeEmail(person: Pick<Due, "name" | "status" | "title" | "startDate" | "startTime" | "notice" | "rescheduledFromDate" | "rescheduledFromTime">): {
  subject: string
  lines: string[]
} | null {
  const when = whenText(person.startDate, person.startTime)
  const waiting = person.status === "waiting"
  const kept = waiting ? "You keep your place on the waiting list." : "Your place on the list is kept."
  const hello = `Hello ${person.name},`
  switch (person.notice) {
    case "cancelled":
      return {
        subject: `Cancelled: ${person.title}`,
        lines: [hello, `${person.title}, planned for ${when}, has been cancelled.`, "You don't need to do anything."],
      }
    case "postponed":
      return {
        subject: `Postponed: ${person.title}`,
        lines: [
          hello,
          `${person.title}, planned for ${when}, has been postponed. There is no new date yet.`,
          `${kept} We'll email you when there is a new date.`,
        ],
      }
    case "rescheduled":
      return {
        subject: `New date: ${person.title}`,
        lines: [
          hello,
          `${person.title} has a new date: ${when}.`,
          ...(person.rescheduledFromDate && person.rescheduledFromTime
            ? [`It was planned for ${whenText(person.rescheduledFromDate, toClock(person.rescheduledFromTime))}.`]
            : []),
          kept,
        ],
      }
    case "back-on":
      return {
        subject: `Going ahead: ${person.title}`,
        lines: [hello, `${person.title} is going ahead after all, on ${when}.`, kept],
      }
    default:
      return null
  }
}

async function emailTheNotice(person: Due, database: CustomShellDb): Promise<void> {
  const email = noticeEmail(person)
  if (!email) return
  await sendDirectoryEmail(
    {
      workspaceId: person.siteId,
      to: person.email,
      subject: email.subject,
      lines: email.lines,
      // A draft has no page to send anybody to.
      ...(person.eventStatus === "published"
        ? {
            action: {
              label: "See the event",
              url: `${directorySiteUrl({ subdomain: person.subdomain, customDomain: person.customDomain || null })}/events/${person.slug}`,
            },
          }
        : {}),
    },
    database
  )
}
