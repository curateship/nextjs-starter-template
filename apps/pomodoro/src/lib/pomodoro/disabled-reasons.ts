/**
 * Why a Pomodoro control is switched off, in one place.
 *
 * Each line is written as the thing to do, not the state the app is in:
 * "Pause or finish the focus to choose a different task", never "Timer is
 * running". A state tells the reader what they already saw; an instruction
 * tells them how to get the button back.
 *
 * They live together because the same rule switches controls off on three
 * screens — the dashboard's list, the tasks page and the header's Timer
 * popover — and three copies of one sentence drift apart.
 */

/** The timer is mid-countdown, so the focus task is fixed until it stops. */
export const PAUSE_TO_CHOOSE_REASON =
  "Pause or finish the focus to choose a different task."

/** Durations and presets are the rhythm the running countdown is using. */
export const RESET_TO_CHANGE_RHYTHM_REASON =
  "Reset or finish the timer to change durations or presets."
