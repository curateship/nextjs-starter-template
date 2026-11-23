import { ladderOf } from "@/lib/fitness/exercise-catalog"

/**
 * How a Calisthenics move gets harder (Tyler, 21 Oct 2026: "Reps, then the
 * next version"). Each move in the week has a rep range, such as 8 to 12,
 * and a target inside it.
 *
 * - A good session is every working set done at the top of the range. After
 *   as many good sessions in a row as the program's settings ask (1 to
 *   start), the move steps up to its next harder version, starting again at
 *   the bottom of the range: three sets of 12 knee push-ups make the next
 *   session three sets of 8 push-ups.
 * - Anything less keeps the move, and the next session aims for one more rep
 *   a set than the fewest done, inside the range: 12, 10 and 9 make the next
 *   target 10.
 * - A move at the top of its ladder keeps adding reps: the range moves up by
 *   one each good session.
 *
 * A hold such as a plank works the same way in seconds.
 */

/** The most reps, or seconds, a move's range can reach. */
export const MOST_REPS = 100

export type CalisthenicsPlan = {
  /** The target the next session starts each set at. */
  reps: number
  repsMin: number
  repsMax: number
  /** Good sessions in a row so far toward the step up. */
  goodStreak: number
}

export type CalisthenicsResult = CalisthenicsPlan & {
  /** True when the move steps up to its next harder version. */
  stepUp: boolean
}

/** A range for a move given only a target: the target up to four more, "8 to 12" from 8. */
export function defaultRange(reps: number): { repsMin: number; repsMax: number } {
  return { repsMin: reps, repsMax: reps + 4 }
}

export function nextCalisthenics(
  plan: CalisthenicsPlan,
  session: { allDone: boolean; reps: readonly number[] },
  { sessionsToStep, hasHarder }: { sessionsToStep: number; hasHarder: boolean }
): CalisthenicsResult {
  const good = session.allDone && session.reps.length > 0 && session.reps.every((reps) => reps >= plan.repsMax)
  if (good) {
    const goodStreak = plan.goodStreak + 1
    if (goodStreak < Math.max(1, sessionsToStep)) return { ...plan, reps: plan.repsMax, goodStreak, stepUp: false }
    if (hasHarder) return { ...plan, reps: plan.repsMin, goodStreak: 0, stepUp: true }
    // The range stops climbing at 100, the most a set can be planned for.
    const repsMax = Math.min(MOST_REPS, plan.repsMax + 1)
    const repsMin = Math.min(repsMax, plan.repsMin + (repsMax > plan.repsMax ? 1 : 0))
    return { reps: repsMax, repsMin, repsMax, goodStreak: 0, stepUp: false }
  }
  if (session.reps.length === 0) return { ...plan, goodStreak: 0, stepUp: false }
  const fewest = Math.min(...session.reps)
  const reps = Math.min(plan.repsMax, Math.max(plan.repsMin, fewest + 1))
  return { ...plan, reps, goodStreak: 0, stepUp: false }
}

/**
 * What a lift's sets count: weight and reps for a strength lift, reps alone
 * for a Calisthenics move, or seconds for a Calisthenics hold, which keeps
 * them in the set's reps.
 */
export type SetMeasure = "load" | "reps" | "seconds"

export function measureOf(exercise: { routineType: string; isTimed: boolean } | undefined): SetMeasure {
  if (exercise?.routineType !== "calisthenics") return "load"
  return exercise.isTimed ? "seconds" : "reps"
}

/** "10 reps", "1 rep", "30 seconds": a count in the words its measure uses. */
export function countWords(count: number, measure: SetMeasure) {
  if (measure === "seconds") return `${count} ${count === 1 ? "second" : "seconds"}`
  return `${count} ${count === 1 ? "rep" : "reps"}`
}

/** "8 to 12 reps", a move's range. */
export function rangeWords(repsMin: number, repsMax: number, measure: SetMeasure) {
  return `${repsMin} to ${repsMax} ${measure === "seconds" ? "seconds" : "reps"}`
}

/**
 * The Calisthenics moves that are the hardest version reached in their
 * ladder: of push-ups and knee push-ups both logged, push-ups. A move with
 * no other versions is never one.
 */
export function hardestReached(
  logged: readonly { exerciseId: string; slug: string | null; measure: SetMeasure }[]
): Set<string> {
  const bySlug = new Map(logged.flatMap((lift) => (lift.slug ? [[lift.slug, lift.exerciseId] as const] : [])))
  const hardest = new Set<string>()
  for (const lift of logged) {
    if (lift.measure === "load" || !lift.slug) continue
    const ladder = ladderOf(lift.slug)
    if (ladder.length < 2) continue
    const top = [...ladder].reverse().find((slug) => bySlug.has(slug))
    if (top === lift.slug) hardest.add(lift.exerciseId)
  }
  return hardest
}
