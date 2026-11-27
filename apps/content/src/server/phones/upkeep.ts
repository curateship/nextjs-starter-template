import { db as defaultDb, type CustomShellDb } from "@/server/db"

import { tidyPhoneReadings } from "./health"
import { tidyStepPictures } from "./trail"

export { sweepPhoneHealth } from "./health"

/**
 * How often the tidy-up runs. Pictures are kept for whole days and readings
 * for four weeks, so most ticks skip it.
 */
const TIDY_GAP_MS = 60 * 60_000

let lastTidyAt = 0

/**
 * Deletes the step pictures of actions that did not fail once they are older
 * than the days set in Settings → Phones, and chart readings older than four
 * weeks. A failed action's pictures stay until a person clears them.
 */
export async function tidyPhoneRecords(db: CustomShellDb = defaultDb, now: Date = new Date()): Promise<void> {
  if (now.getTime() - lastTidyAt < TIDY_GAP_MS) return
  lastTidyAt = now.getTime()
  const pictures = await tidyStepPictures(db, now)
  const readings = await tidyPhoneReadings(db, now)
  if (pictures || readings) {
    console.log(`Tidied the phones: ${pictures} old step picture(s), ${readings} old battery reading(s)`)
  }
}
