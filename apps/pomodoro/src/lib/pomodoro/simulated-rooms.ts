import { drawInt, seededRandom } from "@/lib/pomodoro/simulated-days"

/**
 * The rooms made-up members host and sit in (live activity task 02), as pure
 * rules: what a host's room looks like, how long it runs, and when people
 * arrive and leave. See "Rooms" in `workspace/docs/made-up-members.md`.
 *
 * Every draw is seeded by the room or the membership, so a worker that
 * restarts makes the same decision it made before.
 */

/** A host's own room, saved on its habit when it becomes a host. */
export type SimulatedHost = {
  roomName: string
  focusMinutes: number
  shortBreakMinutes: number
  longBreakMinutes: number
  /** `curated:<key>` and `scene:<key>`, one pair no other host has. */
  sound: string
  background: string
  /** Keeps a weekly booked room as well (three hosts). */
  weekly: boolean
}

/**
 * Half the made-up accounts host rooms, so at least three are awake at any
 * hour. Tyler, 9 Oct 2026: "there needs to be a few rooms open at all times".
 */
export const HOST_SHARE = 2
/** Three hosts keep a weekly booked room. */
export const WEEKLY_HOSTS = 3
/**
 * Rooms always on Open to join besides the ones counting down. Tyler, 9 Oct
 * 2026: "we need at least 10 rooms open at all times", then "10 room is just a
 * suggestion... It can be whatever make sense". Six fills the first page
 * before "Load more", and with the three under Starting soon that is nine
 * rooms on the first screen. A made-up host only starts a focus, or closes,
 * while this many other rooms stay listed.
 */
export const MIN_OPEN_ROOMS = 6
/** Made-up rooms kept open while hosts are awake, so some can focus. */
export const TARGET_OPEN_ROOMS = 16

/** Focus, short break and long break, in minutes. House presets join these. */
export const ROOM_RHYTHMS: ReadonlyArray<readonly [number, number, number]> = [
  [25, 5, 15],
  [30, 5, 20],
  [45, 10, 20],
  [50, 10, 30],
  [90, 20, 30],
]

/**
 * Room names in a person's own voice. `{city}` becomes the host's city. Task
 * 03's AI does not name rooms; these are the names.
 */
export const ROOM_NAMES: readonly string[] = [
  "Night shift, rain",
  "Morning pages",
  "Thesis grind",
  "Quiet desk",
  "Deep work, no chat",
  "Coffee and code",
  "Library hours",
  "Two then lunch",
  "Writing sprint",
  "Exam season",
  "Lo-fi and spreadsheets",
  "Early birds",
  "Late owls",
  "Inbox zero attempt",
  "Draft day",
  "Grant writing",
  "Silent study",
  "Just start",
  "Ten more minutes",
  "Reading room",
  "Slow and steady",
  "Chapter by chapter",
  "Revision club",
  "Code and tea",
  "Rainy {city} study",
  "{city} mornings",
  "Afternoon slump busters",
  "Get the hard thing done",
  "Flashcards and focus",
  "Portfolio push",
]

/** The room's name with the host's city filled in. */
export function roomNameFor(template: string, city: string) {
  return template.replace("{city}", city)
}

/**
 * How many focuses a room runs before its host closes it. Most run four; one
 * in five runs six or eight, and one in ten closes after one. A long rhythm
 * runs two at most, because four ninety-minute focuses is a whole day.
 */
export function focusTargetFor(roomId: string, focusMinutes: number) {
  const random = seededRandom("room-focuses", roomId)
  const roll = random()
  const target = roll < 0.1 ? 1 : roll < 0.3 ? (random() < 0.5 ? 6 : 8) : 4
  return focusMinutes >= 90 ? Math.min(target, 2) : target
}

/**
 * How many other made-up members a room aims for: one to three, mostly two.
 * With ten or more rooms open there are not enough people for three in each.
 */
export function memberTargetFor(roomId: string) {
  const roll = seededRandom("room-members", roomId)()
  return roll < 0.3 ? 1 : roll < 0.75 ? 2 : 3
}

/** How long the host waits for people before the first focus: five to seven minutes. */
export function firstFocusDelayMs(roomId: string) {
  return drawInt(seededRandom("room-wait", roomId), 5, 7) * 60_000
}

/**
 * How long after the room opened, or after the last made-up arrival, the
 * next made-up member arrives: one to four minutes for the first, so a room
 * has people within five minutes, and one to eight after that.
 */
export function arrivalDelayMs(roomId: string, arrived: number) {
  const random = seededRandom("room-arrival", roomId, arrived)
  return (arrived === 0 ? drawInt(random, 1, 4) : drawInt(random, 1, 8)) * 60_000
}

/**
 * How long a made-up member stays, from their join: one to four focuses with
 * their breaks, and one in three leaves after two.
 */
export function stayMs(membershipId: string, focusMinutes: number, shortBreakMinutes: number) {
  const random = seededRandom("room-stay", membershipId)
  const focuses = random() < 1 / 3 ? 2 : drawInt(random, 1, 4)
  return focuses * (focusMinutes + shortBreakMinutes) * 60_000
}

/** How long a host waits between rounds, when nobody real is waiting: one to four minutes. */
export function betweenRoundsMs(roomId: string, round: number) {
  return drawInt(seededRandom("room-between", roomId, round), 1, 4) * 60_000
}

/** How far apart two UTC offsets are on a 24-hour clock, in minutes. */
export function offsetDistance(a: number, b: number) {
  const gap = Math.abs(a - b) % (24 * 60)
  return Math.min(gap, 24 * 60 - gap)
}

/**
 * The "Starting in" countdown, in seconds, a made-up room starts to fill
 * "Starting soon": 8 to 15 minutes. Tyler asked for "at least 3 starting
 * in..." and first suggested 1 to 5 minutes. Three rooms counting down 3
 * minutes each need a new start every minute, and each start takes a room
 * off the list for half an hour or more; a hundred members cannot feed that.
 * Measured over a simulated day at one-minute steps: 1 to 5 minutes kept three
 * counting 16 checks in 100, 8 to 15 minutes 90 in 100 and two or more 99 in
 * 100. A real host still picks 1 to 5 minutes.
 */
export function longCountdownFor(roomId: string, round: number) {
  return drawInt(seededRandom("room-countdown", roomId, round), 8, 15) * 60
}
