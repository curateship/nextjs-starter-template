/**
 * How fast an upload is going and how long it has left, for the upload line.
 *
 * The speed is the bytes sent over the last 30 seconds, not since the start
 * and not since the last reading. Since the start would never notice the
 * wifi getting faster; since the last reading jumps about with every piece,
 * because four pieces land in bursts.
 */

const UPLOAD_SPEED_WINDOW_MS = 30_000

type Reading = { atMs: number; bytes: number }

export type UploadSpeedMeter = {
  /** One reading: how many bytes of the file have gone by now. */
  record: (atMs: number, bytes: number) => void
  /** Bytes a second over the last 30 seconds, or null before there is a span to measure. */
  bytesPerSecond: () => number | null
  /** Forgets the readings, after a pause, so the wait does not count as slow. */
  reset: () => void
}

/** Shortest span worth turning into a speed. Under it, one burst reads as the whole rate. */
const MIN_SPAN_MS = 2_000

export function createUploadSpeedMeter(
  windowMs: number = UPLOAD_SPEED_WINDOW_MS
): UploadSpeedMeter {
  let readings: Reading[] = []
  return {
    record(atMs, bytes) {
      readings.push({ atMs, bytes })
      // Keep one reading at or before the window's start, so the span is the
      // whole window rather than whatever happened to land inside it.
      while (readings.length > 2 && readings[1].atMs <= atMs - windowMs) {
        readings.shift()
      }
    },
    bytesPerSecond() {
      if (readings.length < 2) return null
      const first = readings[0]
      const last = readings[readings.length - 1]
      const spanMs = last.atMs - first.atMs
      if (spanMs < MIN_SPAN_MS) return null
      return Math.max(0, ((last.bytes - first.bytes) / spanMs) * 1000)
    },
    reset() {
      readings = []
    },
  }
}

/**
 * "about 18 minutes left", or null when there is no speed yet. Rounded the
 * way a person says it: seconds under a minute, minutes under two hours, then
 * hours.
 */
export function timeLeftText(remainingBytes: number, bytesPerSecond: number | null) {
  if (bytesPerSecond === null || bytesPerSecond <= 0) return null
  const seconds = Math.max(0, remainingBytes) / bytesPerSecond
  if (seconds < 60) return "less than a minute left"
  const minutes = Math.round(seconds / 60)
  if (minutes < 120) {
    return minutes === 1 ? "about a minute left" : `about ${minutes} minutes left`
  }
  const hours = Math.round(seconds / 3600)
  return `about ${hours} hours left`
}

/** "12.5 MB/s", in the same units the file sizes use. */
export function speedText(bytesPerSecond: number | null) {
  if (bytesPerSecond === null) return null
  const mb = bytesPerSecond / (1024 * 1024)
  return mb >= 10 ? `${Math.round(mb)} MB/s` : `${mb.toFixed(1)} MB/s`
}
