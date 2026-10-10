/**
 * "Starting in": the countdown a host's Start begins in a waiting room
 * (9 Oct 2026). Tyler: "there should be a default timer of 5 seconds for
 * hosted room for everyone until they change it". Browser-safe, so the host's
 * picker and the server check the same list.
 */

/** The countdowns a host may pick, in seconds. Five is everybody's default. */
export const START_DELAYS = [5, 60, 120, 180, 240, 300] as const
export type StartDelay = (typeof START_DELAYS)[number]
export const DEFAULT_START_DELAY: StartDelay = 5

export const START_DELAY_LABELS: Record<StartDelay, string> = {
  5: "5 seconds",
  60: "1 minute",
  120: "2 minutes",
  180: "3 minutes",
  240: "4 minutes",
  300: "5 minutes",
}

export function isStartDelay(value: number): value is StartDelay {
  return (START_DELAYS as readonly number[]).includes(value)
}

/**
 * A room counting down at least this long shows under "Starting soon". Tyler:
 * "the 5 second default rooms will not show up in the rooms".
 */
export const STARTING_SOON_MIN_SECONDS = 60

/**
 * How many rooms "Starting soon" shows, the soonest, and how many the made-up
 * hosts keep counting down so it is always full. Tyler, 9 Oct 2026: "Shuffle a
 * few starting in... from 1 to 5 minutes", "At least 3 starting in..." and
 * "Only 3 starting in.. shows".
 */
export const STARTING_SOON_SHOWN = 3
export const STARTING_SOON_WANTED = 3

/** Whether a listed room belongs under "Starting soon" right now. */
export function isStartingSoon(
  room: { phase: string; startingAt: Date | string | null; countdownSeconds: number | null },
  now = Date.now()
) {
  return (
    room.phase === "waiting" &&
    room.startingAt !== null &&
    new Date(room.startingAt).getTime() > now &&
    (room.countdownSeconds ?? 0) >= STARTING_SOON_MIN_SECONDS
  )
}
