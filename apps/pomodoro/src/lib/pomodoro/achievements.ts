/**
 * The badge list, and the arithmetic that decides who has earned what.
 *
 * Everything here is pure and free of server imports, so the panel can name a
 * badge and say what it takes without asking the server, and the award check
 * and the panel can never disagree about a rule.
 *
 * The list is fixed in code rather than stored. A badge is a promise the app
 * made, so it belongs with the code that made it; only the fact that someone
 * earned one, and the day they did, is stored per account.
 *
 * Every counter a rule reads is a number the app already keeps, which is why
 * awards are checked the moment one changes (a focus completes, a room is
 * hosted) and never by a job that scans accounts.
 */

export type AchievementCounters = {
  /** Finished focus sessions, for the whole life of the account. */
  focusSessions: number
  /** Seconds of finished focus, for the whole life of the account. */
  focusSeconds: number
  /** Tasks ticked off, for the whole life of the account. */
  tasksCompleted: number
  /** Focus rooms this account has opened. */
  roomsHosted: number
  /**
   * The longest run of days with a finished focus, ever. The best rather than
   * the current one, because a week you actually ran is a week you ran: a
   * badge for it must not be taken back when the streak breaks.
   */
  bestStreak: number
}

type CounterName = keyof AchievementCounters

export type Achievement = {
  id: string
  name: string
  /** The rule in plain words, shown under a locked badge. */
  description: string
  counter: CounterName
  threshold: number
}

/**
 * Ordered the way the panel shows them: the sessions ladder, then the streak
 * ladder, then the one-offs. Ids are stored, so renaming a badge is free and
 * changing an id is not.
 */
export const ACHIEVEMENTS: readonly Achievement[] = [
  {
    id: "first-focus",
    name: "First focus",
    description: "Finish one focus session.",
    counter: "focusSessions",
    threshold: 1,
  },
  {
    id: "ten-sessions",
    name: "Ten sessions",
    description: "Finish 10 focus sessions.",
    counter: "focusSessions",
    threshold: 10,
  },
  {
    id: "fifty-sessions",
    name: "Fifty sessions",
    description: "Finish 50 focus sessions.",
    counter: "focusSessions",
    threshold: 50,
  },
  {
    id: "hundred-sessions",
    name: "A hundred sessions",
    description: "Finish 100 focus sessions.",
    counter: "focusSessions",
    threshold: 100,
  },
  {
    id: "three-day-streak",
    name: "Three days running",
    description: "Focus on three days in a row.",
    counter: "bestStreak",
    threshold: 3,
  },
  {
    id: "seven-day-streak",
    name: "A week running",
    description: "Focus on seven days in a row.",
    counter: "bestStreak",
    threshold: 7,
  },
  {
    id: "thirty-day-streak",
    name: "A month running",
    description: "Focus on thirty days in a row.",
    counter: "bestStreak",
    threshold: 30,
  },
  {
    id: "ten-hours",
    name: "Ten hours focused",
    description: "Spend ten hours in finished focus sessions.",
    counter: "focusSeconds",
    threshold: 10 * 60 * 60,
  },
  {
    id: "fifty-tasks",
    name: "Fifty tasks done",
    description: "Tick off 50 tasks.",
    counter: "tasksCompleted",
    threshold: 50,
  },
  {
    id: "first-room",
    name: "Host",
    description: "Open a focus room of your own.",
    counter: "roomsHosted",
    threshold: 1,
  },
]

const BY_ID = new Map(ACHIEVEMENTS.map((badge) => [badge.id, badge]))

export function findAchievement(id: string) {
  return BY_ID.get(id) ?? null
}

/** Every badge these counters satisfy, earned or not yet recorded. */
export function earnedAchievementIds(counters: AchievementCounters) {
  return ACHIEVEMENTS.filter(
    (badge) => counters[badge.counter] >= badge.threshold
  ).map((badge) => badge.id)
}

/**
 * What a locked badge still takes, in the plainest words the counter allows.
 * A streak says how far you have got rather than how many days are left,
 * because the days left are not a thing you can do today.
 */
export function remainingLabel(
  badge: Achievement,
  counters: AchievementCounters
) {
  const value = counters[badge.counter]
  const missing = Math.max(0, badge.threshold - value)
  switch (badge.counter) {
    case "focusSessions":
      return `${missing} ${missing === 1 ? "session" : "sessions"} to go`
    case "tasksCompleted":
      return `${missing} ${missing === 1 ? "task" : "tasks"} to go`
    case "focusSeconds":
      return `${formatHours(value)} of ${formatHours(badge.threshold)}`
    case "bestStreak":
      return value === 0
        ? "no streak yet"
        : `best so far: ${value} ${value === 1 ? "day" : "days"}`
    case "roomsHosted":
      return "no rooms hosted yet"
  }
}

function formatHours(seconds: number) {
  const hours = Math.floor(seconds / 3_600)
  const minutes = Math.floor((seconds % 3_600) / 60)
  if (!hours) return `${minutes}m`
  return minutes ? `${hours}h ${minutes}m` : `${hours}h`
}
