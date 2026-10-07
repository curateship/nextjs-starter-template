/**
 * Why a Pomodoro control is switched off, in one place.
 *
 * Each line is written as the thing to do, not the state the app is in:
 * "Reset or finish the timer to change durations or presets", never "Timer
 * is running". A state tells the reader what they already saw; an
 * instruction tells them how to get the button back.
 *
 * They live together so one sentence is never kept in two copies that drift
 * apart.
 */

/** Durations and presets are the rhythm the running countdown is using. */
export const RESET_TO_CHANGE_RHYTHM_REASON =
  "Reset or finish the timer to change durations or presets."

/**
 * The daily goal's + or − at the end of its range. The numbers are passed in
 * from the limits themselves, so the sentence cannot drift from them.
 */
export function dailyGoalLimitReason(min: number, max: number) {
  return `The goal can be between ${min} and ${max} sessions.`
}
