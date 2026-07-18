// Minute options offered by the player's sleep timer.
export const SLEEP_TIMER_PRESETS = [15, 30, 60] as const

// Format the remaining sleep-timer time as m:ss, rounding up so the countdown
// only reads 0:00 once the audio has actually faded out.
export function formatSleepRemaining(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, "0")}`
}
