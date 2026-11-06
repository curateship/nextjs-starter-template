import { eq } from "drizzle-orm"

import type { BuiltinType } from "@/lib/travel/activity-types"
import { addDays, todayIn } from "@/lib/travel/dates"
import type { OpeningHours, Place } from "@/lib/travel/rules"
import { now, uuid } from "@/server/auth/security"
import { db, type CustomShellDb } from "@/server/db"
import { travelActivities, travelSampleGiven, travelTrips } from "@/server/travel/schema"
import { blankActivity } from "@/server/travel/trips"
import { listTypes } from "@/server/travel/types"

/**
 * The Tokyo sample trip (task part 2; Tyler, 2 Nov 2026: "Tokyo, 5 days"). A
 * new person's Trips table starts with it, so the board has something on it
 * to look at. It is given once: `travel_sample_given` remembers, so a deleted
 * sample never comes back.
 *
 * It starts 30 days from the day it is made, so its dates, countdown and
 * calendar all show.
 */

/** One paragraph of notes as the editor's document. */
function notesOf(text: string) {
  return JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] })
}

const open = (from: string, to: string) => [{ open: from, close: to }]
const everyDay = (from: string, to: string): OpeningHours => Array.from({ length: 7 }, () => open(from, to))

function place(name: string, address: string, lat: number, lng: number): Place {
  return { name, address, lat, lng, placeId: null }
}

type SampleActivity = {
  day: number | null
  title: string
  type: BuiltinType
  startTime?: string
  durationMinutes?: number
  nights?: number
  place?: Place
  openingHours?: OpeningHours
  website?: string
  phone?: string
  notes?: string
  costCents?: number
}

const ACTIVITIES: SampleActivity[] = [
  {
    day: 1,
    title: "Flight to Tokyo Haneda",
    type: "flight",
    startTime: "08:10",
    durationMinutes: 180,
    place: place("Haneda Airport", "Hanedakuko, Ota City, Tokyo 144-0041, Japan", 35.5494, 139.7798),
    costCents: 9_800_000,
  },
  {
    day: 1,
    title: "Hotel Gracery Shinjuku",
    type: "hotel",
    startTime: "15:00",
    nights: 3,
    place: place("Hotel Gracery Shinjuku", "1-19-1 Kabukicho, Shinjuku City, Tokyo 160-8466, Japan", 35.6951, 139.7019),
    website: "https://gracery.com/shinjuku/",
    costCents: 6_600_000,
  },
  {
    day: 1,
    title: "Ramen at Fuunji",
    type: "food",
    startTime: "18:30",
    durationMinutes: 60,
    place: place("Fuunji", "2-14-3 Yoyogi, Shibuya City, Tokyo 151-0053, Japan", 35.6866, 139.6983),
    openingHours: Array.from({ length: 7 }, (_, weekday) =>
      weekday === 0 ? [] : [{ open: "11:00", close: "15:00" }, { open: "17:00", close: "21:00" }]
    ),
    costCents: 120_000,
  },
  {
    day: 2,
    title: "Senso-ji temple",
    type: "sight",
    startTime: "08:00",
    durationMinutes: 90,
    place: place("Senso-ji", "2-3-1 Asakusa, Taito City, Tokyo 111-0032, Japan", 35.7148, 139.7967),
    openingHours: everyDay("06:00", "17:00"),
    website: "https://www.senso-ji.jp/",
    notes: "Go early, before the tour groups. Nakamise street for snacks on the way out.",
  },
  {
    day: 2,
    title: "Tsukiji outer market",
    type: "food",
    startTime: "11:00",
    durationMinutes: 90,
    place: place("Tsukiji Outer Market", "4-16-2 Tsukiji, Chuo City, Tokyo 104-0045, Japan", 35.6655, 139.7707),
    openingHours: Array.from({ length: 7 }, (_, weekday) => (weekday === 0 ? [] : [{ open: "06:00", close: "14:00" }])),
    costCents: 300_000,
  },
  {
    day: 2,
    title: "teamLab Planets",
    type: "sight",
    startTime: "15:00",
    durationMinutes: 120,
    place: place("teamLab Planets TOKYO", "6-1-16 Toyosu, Koto City, Tokyo 135-0061, Japan", 35.6491, 139.7898),
    website: "https://www.teamlab.art/e/planets/",
    costCents: 380_000,
  },
  {
    day: 3,
    title: "Meiji Shrine",
    type: "sight",
    startTime: "09:00",
    durationMinutes: 75,
    place: place("Meiji Jingu", "1-1 Yoyogikamizonocho, Shibuya City, Tokyo 151-8557, Japan", 35.6764, 139.6993),
    openingHours: everyDay("05:00", "18:00"),
  },
  {
    day: 3,
    title: "Shibuya crossing and Shibuya Sky",
    type: "sight",
    startTime: "16:30",
    durationMinutes: 120,
    place: place("Shibuya Sky", "2-24-12 Shibuya, Shibuya City, Tokyo 150-6145, Japan", 35.6585, 139.7023),
    costCents: 250_000,
  },
  {
    day: 4,
    title: "Train to Nikko",
    type: "transport",
    startTime: "07:30",
    durationMinutes: 110,
    place: place("Asakusa Station", "1-4-1 Hanakawado, Taito City, Tokyo 111-0033, Japan", 35.7119, 139.7983),
    costCents: 560_000,
  },
  {
    day: 4,
    title: "Toshogu shrine",
    type: "sight",
    startTime: "10:00",
    durationMinutes: 150,
    place: place("Nikko Toshogu", "2301 Sannai, Nikko, Tochigi 321-1431, Japan", 36.758, 139.5988),
    openingHours: everyDay("09:00", "17:00"),
    costCents: 130_000,
  },
  {
    day: 5,
    title: "Flight home",
    type: "flight",
    startTime: "17:45",
    durationMinutes: 720,
    place: place("Haneda Airport", "Hanedakuko, Ota City, Tokyo 144-0041, Japan", 35.5494, 139.7798),
  },
  {
    day: null,
    title: "Ghibli Museum",
    type: "sight",
    place: place("Ghibli Museum", "1-1-83 Shimorenjaku, Mitaka, Tokyo 181-0013, Japan", 35.6962, 139.5704),
    costCents: 100_000,
  },
]

/** Makes the sample trip for a person who has never had one. Safe to call on every visit. */
export async function giveSampleTrip(userId: string, database: CustomShellDb = db) {
  const [given] = await database
    .select({ userId: travelSampleGiven.userId })
    .from(travelSampleGiven)
    .where(eq(travelSampleGiven.userId, userId))
    .limit(1)
  if (given) return
  const types = await listTypes(userId, database)
  const typeId = (builtin: BuiltinType) => types.find((type) => type.builtin === builtin)?.id ?? null
  await database.transaction(async (tx) => {
    // Claimed first, so two tabs opening at once make one sample, not two.
    const claimed = await tx
      .insert(travelSampleGiven)
      .values({ userId, givenAt: now() })
      .onConflictDoNothing()
      .returning({ userId: travelSampleGiven.userId })
    if (claimed.length === 0) return
    const at = now()
    const tripId = uuid()
    await tx.insert(travelTrips).values({
      id: tripId,
      ownerUserId: userId,
      name: "Tokyo, 5 days",
      destination: "Tokyo, Japan",
      days: 5,
      startDate: addDays(todayIn(null), 30),
      currency: "JPY",
      timeZone: "Asia/Tokyo",
      timeZoneGuessed: true,
      budgetCents: 25_000_000,
      status: "planning",
      coverUrl: null,
      coverCredit: null,
      dayInfo: [
        { note: "Land, check in, ramen" },
        { note: "Asakusa and the bay" },
        { note: "" },
        { note: "Day trip, early train" },
        { note: "" },
      ],
      description: notesOf("Five days of temples, food and one early train to Nikko."),
      travelMode: "transit",
      tags: ["Sample"],
      calendarToken: null,
      isSample: true,
      archivedAt: null,
      createdAt: at,
      updatedAt: at,
    })
    const positions = new Map<number | null, number>()
    await tx.insert(travelActivities).values(
      ACTIVITIES.map((item) => {
        const position = positions.get(item.day) ?? 0
        positions.set(item.day, position + 1)
        return {
          ...blankActivity(tripId, at),
          id: uuid(),
          day: item.day,
          position,
          title: item.title,
          typeId: typeId(item.type),
          startTime: item.startTime ?? null,
          durationMinutes: item.durationMinutes ?? null,
          nights: item.nights ?? null,
          place: item.place ?? null,
          openingHours: item.openingHours ?? null,
          website: item.website ?? null,
          phone: item.phone ?? null,
          notes: item.notes ? notesOf(item.notes) : "",
          costCents: item.costCents ?? null,
        }
      })
    )
  })
}
