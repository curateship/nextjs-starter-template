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

export type AchievementProgress = {
  /** How far the account has got, never past the threshold. */
  value: number
  threshold: number
  /** 0 to 1, for the bar's width. */
  ratio: number
  /** How far along, in the plainest words the counter allows. */
  label: string
}

/**
 * How far a badge has got, for the panel to print and draw. The rule and the
 * progress read the same threshold from the same badge, which is why this lives
 * beside the rules instead of in the component: the two can never disagree.
 *
 * The value is capped at the threshold. A counter can sit past a threshold
 * while the badge still reads as locked, because the award row is written after
 * the counter moves and a failed award is retried by the next finished session.
 * "105 of 100" under a locked badge reads as a bug, so the panel says "100 of
 * 100" and fills the bar.
 *
 * A streak says how far you have got rather than how many days are left,
 * because the days left are not something you can do today.
 */
export function achievementProgress(
  badge: Achievement,
  counters: AchievementCounters
): AchievementProgress {
  const value = Math.min(Math.max(0, counters[badge.counter]), badge.threshold)
  const progress = {
    value,
    threshold: badge.threshold,
    ratio: badge.threshold > 0 ? value / badge.threshold : 1,
  }
  switch (badge.counter) {
    case "focusSessions":
      return { ...progress, label: `${value} of ${badge.threshold} sessions` }
    case "tasksCompleted":
      return { ...progress, label: `${value} of ${badge.threshold} tasks` }
    case "focusSeconds":
      return {
        ...progress,
        label: `${formatHours(value)} of ${formatHours(badge.threshold)}`,
      }
    case "bestStreak":
      return {
        ...progress,
        label: value
          ? `best so far: ${value} of ${badge.threshold} days`
          : "no streak yet",
      }
    case "roomsHosted":
      return {
        ...progress,
        label: value
          ? `${value} of ${badge.threshold} rooms`
          : "no rooms hosted yet",
      }
  }
}

function formatHours(seconds: number) {
  const hours = Math.floor(seconds / 3_600)
  const minutes = Math.floor((seconds % 3_600) / 60)
  if (!hours) return `${minutes}m`
  return minutes ? `${hours}h ${minutes}m` : `${hours}h`
}
