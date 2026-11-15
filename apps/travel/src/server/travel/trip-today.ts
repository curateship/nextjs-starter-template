import { and, eq, isNotNull, isNull } from "drizzle-orm"

import { todaysDay } from "@/lib/travel/dates"
import { db, type CustomShellDb } from "@/server/db"
import { travelTrips } from "@/server/travel/schema"

/**
 * The trip that's on today, for `/trips/today` (Travel features 4, part 8;
 * Tyler, 6 Nov 2026: "On sign-in and Home", then "Travel-only address"). A
 * trip is on when today, where the trip is, is one of its days. With two on at
 * once, the one that started last wins. Archived trips and trips in the bin
 * don't count. Null when none is on.
 */
export async function findTripOnToday(userId: string, database: CustomShellDb = db, at: Date = new Date()) {
  const dated = await database
    .select({ id: travelTrips.id, startDate: travelTrips.startDate, days: travelTrips.days, timeZone: travelTrips.timeZone })
    .from(travelTrips)
    .where(
      and(
        eq(travelTrips.ownerUserId, userId),
        isNotNull(travelTrips.startDate),
        isNull(travelTrips.archivedAt),
        isNull(travelTrips.deletedAt)
      )
    )
  const on = dated
    .filter((trip) => todaysDay(trip, at) !== null)
    .sort((a, b) => (b.startDate ?? "").localeCompare(a.startDate ?? ""))
  return on[0]?.id ?? null
}
