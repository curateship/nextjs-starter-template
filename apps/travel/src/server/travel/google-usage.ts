import { desc, eq, gte, sql, sum } from "drizzle-orm"

import { TRAVEL_ERRORS } from "@/lib/travel/errors"
import { db, type CustomShellDb } from "@/server/db"
import { customShellUsers } from "@/server/schema"
import { travelGoogleLookups } from "@/server/travel/schema"

/**
 * Each person's Google lookups (Travel features 4, part 4; Tyler, 6 Nov 2026:
 * "100 a day"). Google bills every lookup and anyone can sign up, so a person
 * gets 100 a day, counted from midnight UTC. What counts as one: picking a
 * place from the search (Google bills the typing and the pick as one), filling
 * a card from a Maps link, a place a drafted plan looks up, a place's Google
 * photo, and a travel time not already saved. The typing itself and saved
 * travel times cost nothing, so they don't count.
 */
export const GOOGLE_DAILY_LOOKUPS = 100

/** How many people the Google use tab lists. */
const TOP_PEOPLE = 5

const utcDay = (at: Date) => at.toISOString().slice(0, 10)

/**
 * Counts one lookup for the person, or throws googleLimit when today's 100
 * are used. The count and the check are one statement, so two lookups at
 * once can't both take the hundredth.
 */
export async function spendGoogleLookup(userId: string, database: CustomShellDb = db, at: Date = new Date()) {
  const counted = await database
    .insert(travelGoogleLookups)
    .values({ userId, day: utcDay(at), lookups: 1 })
    .onConflictDoUpdate({
      target: [travelGoogleLookups.userId, travelGoogleLookups.day],
      set: { lookups: sql`${travelGoogleLookups.lookups} + 1` },
      setWhere: sql`${travelGoogleLookups.lookups} < ${GOOGLE_DAILY_LOOKUPS}`,
    })
    .returning({ lookups: travelGoogleLookups.lookups })
  if (counted.length === 0) throw new Error(TRAVEL_ERRORS.googleLimit)
}

export type GoogleUse = {
  today: number
  month: number
  /** The people who used the most this month, most first. */
  top: { name: string; email: string; lookups: number }[]
}

/** Lookups today and this calendar month, in UTC, and who used the most this month. */
export async function loadGoogleUse(database: CustomShellDb = db, at: Date = new Date()): Promise<GoogleUse> {
  const today = utcDay(at)
  const monthStart = `${today.slice(0, 8)}01`
  const total = sum(travelGoogleLookups.lookups).mapWith(Number)
  const [[todayRow], [monthRow], top] = await Promise.all([
    database.select({ lookups: total }).from(travelGoogleLookups).where(eq(travelGoogleLookups.day, today)),
    database.select({ lookups: total }).from(travelGoogleLookups).where(gte(travelGoogleLookups.day, monthStart)),
    database
      .select({ name: customShellUsers.name, email: customShellUsers.email, lookups: total })
      .from(travelGoogleLookups)
      .innerJoin(customShellUsers, eq(customShellUsers.id, travelGoogleLookups.userId))
      .where(gte(travelGoogleLookups.day, monthStart))
      .groupBy(customShellUsers.id, customShellUsers.name, customShellUsers.email)
      .orderBy(desc(total))
      .limit(TOP_PEOPLE),
  ])
  return { today: todayRow?.lookups ?? 0, month: monthRow?.lookups ?? 0, top }
}
