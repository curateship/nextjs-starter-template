import { addDays, daysBetween, weekStart, type Day } from "@/lib/fitness/dates"
import { roundToStep } from "@/lib/fitness/weights"

type ProgressionRules = {
  /** Added after a session where every working rep was hit. */
  increaseKg: number
  /** Sessions in a row with missed reps before the weight drops. */
  missesBeforeDrop: number
  /** How much a drop takes off, out of 100. */
  dropPercent: number
}

export const DEFAULT_PROGRESSION: ProgressionRules = {
  increaseKg: 2.5,
  missesBeforeDrop: 3,
  dropPercent: 10,
}

/**
 * The weight for the next session of one exercise.
 *
 * Hit every rep and it goes up by `increaseKg`. Miss reps three sessions in a
 * row and it comes down by `dropPercent`, rounded to the plates: a 100 kg
 * squat missed three times becomes 90 kg. Any other result keeps the weight
 * and counts the miss.
 */
export function nextWeight(
  current: { weightKg: number; missStreak: number },
  allRepsHit: boolean,
  rules: ProgressionRules,
  stepKg: number
): { weightKg: number; missStreak: number } {
  if (allRepsHit) {
    return { weightKg: current.weightKg + rules.increaseKg, missStreak: 0 }
  }
  const missStreak = current.missStreak + 1
  if (rules.missesBeforeDrop > 0 && missStreak >= rules.missesBeforeDrop) {
    const dropped = current.weightKg * (1 - rules.dropPercent / 100)
    return { weightKg: Math.max(0, roundToStep(dropped, stepKg)), missStreak: 0 }
  }
  return { weightKg: current.weightKg, missStreak }
}

type WeighIn = { day: Day; weightKg: number }

/**
 * Each weigh-in beside the average of the seven days ending on it.
 *
 * Bodyweight moves a kilogram or more from one morning to the next, from
 * water and food rather than fat or muscle. The seven-day average is the line
 * that shows which way it is really going.
 */
export function weightTrend(weighIns: readonly WeighIn[]): { day: Day; weightKg: number; averageKg: number }[] {
  const sorted = [...weighIns].sort((a, b) => a.day.localeCompare(b.day))
  return sorted.map((entry) => {
    const from = addDays(entry.day, -6)
    const window = sorted.filter((other) => other.day >= from && other.day <= entry.day)
    const averageKg = window.reduce((sum, other) => sum + other.weightKg, 0) / window.length
    return { day: entry.day, weightKg: entry.weightKg, averageKg }
  })
}

/**
 * How many weeks in a row the weekly goal was hit, counting back from this
 * week. This week counts once it is hit, and does not break the run while it
 * is still under way. A paused week neither counts nor breaks the run.
 *
 * A day skipped on purpose is neither done nor missed (Tyler, 21 Oct 2026),
 * so it comes off that week's goal: with a goal of 3 and Friday skipped, two
 * workouts keep the run going. A week whose every workout was skipped counts
 * like a paused one.
 */
export function weeklyStreak({
  workoutDays,
  goal,
  today,
  pausedWeeks,
  skippedDays = [],
}: {
  workoutDays: readonly Day[]
  goal: number
  today: Day
  /** Mondays of weeks that were paused for their whole length. */
  pausedWeeks: ReadonlySet<Day>
  /** Planned dates skipped on purpose. */
  skippedDays?: readonly Day[]
}): { streak: number; thisWeek: number; weekGoal: number } {
  const perWeek = new Map<Day, number>()
  for (const day of workoutDays) {
    const week = weekStart(day)
    perWeek.set(week, (perWeek.get(week) ?? 0) + 1)
  }
  const skipped = new Map<Day, number>()
  for (const day of skippedDays) {
    const week = weekStart(day)
    skipped.set(week, (skipped.get(week) ?? 0) + 1)
  }
  const goalOf = (week: Day) => Math.max(0, goal - (skipped.get(week) ?? 0))
  const currentWeek = weekStart(today)
  const thisWeek = perWeek.get(currentWeek) ?? 0
  const weekGoal = goalOf(currentWeek)
  if (goal <= 0) return { streak: 0, thisWeek, weekGoal }

  let streak = weekGoal > 0 && thisWeek >= weekGoal ? 1 : 0
  const earliest = [...perWeek.keys()].sort()[0]
  if (!earliest) return { streak, thisWeek, weekGoal }
  for (let week = addDays(currentWeek, -7); week >= earliest; week = addDays(week, -7)) {
    if (pausedWeeks.has(week) || goalOf(week) === 0) continue
    if ((perWeek.get(week) ?? 0) < goalOf(week)) break
    streak += 1
  }
  return { streak, thisWeek, weekGoal }
}

/** The Mondays of every week a pause covered from Monday to Sunday. */
export function fullyPausedWeeks(from: Day, until: Day): Day[] {
  const weeks: Day[] = []
  let monday = weekStart(from)
  if (monday < from) monday = addDays(monday, 7)
  while (daysBetween(monday, until) >= 6) {
    weeks.push(monday)
    monday = addDays(monday, 7)
  }
  return weeks
}
