import { and, desc, eq, gt, gte, inArray, isNotNull, sql } from "drizzle-orm"

import type { WalkKind } from "@/lib/dating/options"
import { inHourWindow, type DatingSettings } from "@/lib/dating/settings"
import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { sha256Hex } from "@/server/phone/signing"

import { dateMatches, dateMessages, dateProfiles } from "./schema"

/**
 * The limits that keep the account looking like one person with a phone.
 * Tyler's choice, 17 Oct 2026, the careful ones: a gap of 4 to 9 seconds
 * between swipes, at most 60 swipes and 20 messages an hour, and nothing at
 * all from 1am to 7am on the phone's own clock. On 18 Oct 2026 he added 150
 * swipes a day, beside the hourly 60. The numbers and the quiet hours are in
 * Settings → App settings → Dating; the gap is fixed here.
 */

/** The walks that swipe a card, and so count against the swipe limits. */
export const SWIPE_WALKS: readonly WalkKind[] = ["like", "super-like", "pass"]

/** Swipes are kept this far apart, in milliseconds, drawn at random between the two. */
export const SWIPE_GAP_MS = { min: 4_000, max: 9_000 } as const

const HOUR_MS = 60 * 60_000

/** A refusal saying which limit and when it is allowed again. */
export type LimitRefusal = { limit: "quiet" | "day" | "swipes" | "messages" | "gap"; words: string; until: Date }

/** The hour of the day on the phone's own clock. A phone that never said its time zone counts as UTC. */
export function phoneHour(timeZone: string, now: Date): number {
  try {
    const hour = new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: timeZone || "UTC" }).format(now)
    return Number(hour) % 24
  } catch {
    return now.getUTCHours()
  }
}

/** "14:32" on the phone's own clock. */
export function phoneClock(timeZone: string, at: Date): string {
  try {
    return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: timeZone || "UTC" }).format(at)
  } catch {
    return at.toISOString().slice(11, 16)
  }
}

export function inQuietHours(settings: Pick<DatingSettings, "quietStart" | "quietEnd">, hour: number): boolean {
  return inHourWindow(settings.quietStart, settings.quietEnd, hour)
}

/**
 * The last midnight on the phone's own clock, as a moment. Worked out from
 * the hours, minutes and seconds the phone's clock reads now, so on the night
 * the clocks change it is an hour out, which only moves the daily count's
 * start by that hour once a year.
 */
export function phoneMidnight(timeZone: string, now: Date): Date {
  let parts: Intl.DateTimeFormatPart[]
  try {
    parts = new Intl.DateTimeFormat("en-GB", { hour: "numeric", minute: "numeric", second: "numeric", hourCycle: "h23", timeZone: timeZone || "UTC" }).formatToParts(now)
  } catch {
    parts = new Intl.DateTimeFormat("en-GB", { hour: "numeric", minute: "numeric", second: "numeric", hourCycle: "h23", timeZone: "UTC" }).formatToParts(now)
  }
  const part = (type: string) => Number(parts.find((item) => item.type === type)?.value ?? 0)
  const intoDay = ((part("hour") % 24) * 3_600 + part("minute") * 60 + part("second")) * 1_000 + now.getUTCMilliseconds()
  return new Date(now.getTime() - intoDay)
}

/** Swipes on this phone since midnight on its own clock. */
export async function swipesToday(phone: { id: string; timeZone: string }, db: CustomShellDb = defaultDb, now: Date = new Date()): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(dateProfiles)
    .where(and(eq(dateProfiles.phoneId, phone.id), isNotNull(dateProfiles.swipedAt), gte(dateProfiles.swipedAt, phoneMidnight(phone.timeZone, now))))
  return row?.count ?? 0
}

/** When the quiet hours end, as a moment: the next time the phone's clock reads the end hour. */
function quietEndsAt(settings: Pick<DatingSettings, "quietEnd">, timeZone: string, now: Date): Date {
  const at = new Date(now.getTime())
  at.setUTCMinutes(0, 0, 0)
  for (let hours = 0; hours < 25; hours += 1) {
    const candidate = new Date(at.getTime() + hours * HOUR_MS)
    if (candidate > now && phoneHour(timeZone, candidate) === settings.quietEnd) return candidate
  }
  return new Date(now.getTime() + HOUR_MS)
}

/**
 * The gap after one swipe, between 4 and 9 seconds. Worked out from the
 * swipe itself, so asking twice gives the same answer and the gap still
 * varies from swipe to swipe.
 */
export function swipeGapAfter(profileId: string): number {
  const draw = Number.parseInt(sha256Hex(profileId).slice(0, 8), 16) / 0xffffffff
  return Math.round(SWIPE_GAP_MS.min + draw * (SWIPE_GAP_MS.max - SWIPE_GAP_MS.min))
}

/** Swipes on this phone in the last hour, and the latest one. */
export async function recentSwipes(
  phoneId: string,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<{ lastHour: number; latest: { id: string; at: Date; oldestInHour: Date | null } | null }> {
  const since = new Date(now.getTime() - HOUR_MS)
  const inHour = await db
    .select({ id: dateProfiles.id, at: dateProfiles.swipedAt })
    .from(dateProfiles)
    .where(and(eq(dateProfiles.phoneId, phoneId), isNotNull(dateProfiles.swipedAt), gt(dateProfiles.swipedAt, since)))
    .orderBy(desc(dateProfiles.swipedAt))
  const [latest] = inHour.length
    ? inHour
    : await db
        .select({ id: dateProfiles.id, at: dateProfiles.swipedAt })
        .from(dateProfiles)
        .where(and(eq(dateProfiles.phoneId, phoneId), isNotNull(dateProfiles.swipedAt)))
        .orderBy(desc(dateProfiles.swipedAt))
        .limit(1)
  return {
    lastHour: inHour.length,
    latest: latest?.at ? { id: latest.id, at: latest.at, oldestInHour: inHour[inHour.length - 1]?.at ?? null } : null,
  }
}

/** Messages of ours that went, or are going, from this phone in the last hour, and the oldest of them. */
export async function recentMessages(
  phoneId: string,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<{ lastHour: number; oldest: Date | null }> {
  const since = new Date(now.getTime() - HOUR_MS)
  const rows = await db
    .select({ at: dateMessages.createdAt })
    .from(dateMessages)
    .innerJoin(dateMatches, eq(dateMatches.id, dateMessages.matchId))
    .where(
      and(
        eq(dateMatches.phoneId, phoneId),
        eq(dateMessages.direction, "out"),
        inArray(dateMessages.status, ["sending", "sent", "unsure"]),
        gt(dateMessages.createdAt, since)
      )
    )
    .orderBy(dateMessages.createdAt)
  return { lastHour: rows.length, oldest: rows[0]?.at ?? null }
}

/**
 * Whether a walk may run on this phone now, or the limit that stops it in
 * words, with when it is allowed again. Quiet hours stop every walk; the
 * daily and hourly numbers stop swipes, the hourly one sends; the gap only
 * delays a swipe.
 */
export async function walkRefusal(
  phone: { id: string; timeZone: string },
  kind: WalkKind,
  settings: DatingSettings,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<LimitRefusal | null> {
  if (inQuietHours(settings, phoneHour(phone.timeZone, now))) {
    const until = quietEndsAt(settings, phone.timeZone, now)
    return {
      limit: "quiet",
      words: `Quiet hours on the phone, ${settings.quietStart}:00 to ${settings.quietEnd}:00. Allowed again at ${phoneClock(phone.timeZone, until)}.`,
      until,
    }
  }
  if (SWIPE_WALKS.includes(kind)) {
    const today = await swipesToday(phone, db, now)
    if (today >= settings.swipesPerDay) {
      const until = new Date(phoneMidnight(phone.timeZone, now).getTime() + 24 * HOUR_MS)
      return {
        limit: "day",
        words: `${plural(today, "swipe")} today, the most allowed. Allowed again at ${phoneClock(phone.timeZone, until)}.`,
        until,
      }
    }
    const swipes = await recentSwipes(phone.id, db, now)
    if (swipes.lastHour >= settings.swipesPerHour && swipes.latest?.oldestInHour) {
      const until = new Date(swipes.latest.oldestInHour.getTime() + HOUR_MS)
      return {
        limit: "swipes",
        words: `${plural(swipes.lastHour, "swipe")} in the last hour, the most allowed. The next is allowed at ${phoneClock(phone.timeZone, until)}.`,
        until,
      }
    }
    if (swipes.latest) {
      const until = new Date(swipes.latest.at.getTime() + swipeGapAfter(swipes.latest.id))
      if (until > now) {
        return {
          limit: "gap",
          words: `Swipes are kept 4 to 9 seconds apart. The next is allowed in ${Math.ceil((until.getTime() - now.getTime()) / 1000)} seconds.`,
          until,
        }
      }
    }
  }
  if (kind === "send-message") {
    const messages = await recentMessages(phone.id, db, now)
    if (messages.lastHour >= settings.messagesPerHour && messages.oldest) {
      const until = new Date(messages.oldest.getTime() + HOUR_MS)
      return {
        limit: "messages",
        words: `${plural(messages.lastHour, "message")} in the last hour, the most allowed. The next is allowed at ${phoneClock(phone.timeZone, until)}.`,
        until,
      }
    }
  }
  return null
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`
}

/** Swipes and messages this hour, and swipes today, for the Swiping card. */
export async function hourCounts(
  phone: { id: string; timeZone: string },
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<{ swipes: number; messages: number; swipesToday: number }> {
  const [swipes, messages, today] = await Promise.all([recentSwipes(phone.id, db, now), recentMessages(phone.id, db, now), swipesToday(phone, db, now)])
  return { swipes: swipes.lastHour, messages: messages.lastHour, swipesToday: today }
}

