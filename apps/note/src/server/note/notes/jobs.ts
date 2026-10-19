import { purgeOldTrash } from "@/server/note/notes/notes"
import { sendDueReminders } from "@/server/note/notes/reminders"

/**
 * The `note-notes` worker, run on the shell's 15-second background pass.
 * Two small jobs each pass: ring the date reminders that have come due, and
 * delete for good whatever has sat in Trash for 30 days. Both read through
 * an index that only holds the rows waiting, so a quiet pass costs two
 * small queries.
 */
let running: Promise<void> | null = null

export async function tick(): Promise<void> {
  if (running) return
  running = runOnce()
    .catch((error) => {
      console.error("A note-notes pass failed", error)
    })
    .finally(() => {
      running = null
    })
  await running
}

/** At most this many batches of 50 reminders in one pass, so a pass always ends. */
const REMINDER_BATCHES = 10

async function runOnce(): Promise<void> {
  // A full batch means more may be due, so keep going: one person with many
  // reminders due at once never holds everybody else's back a whole pass.
  for (let batch = 0; batch < REMINDER_BATCHES; batch += 1) {
    if (!(await sendDueReminders()).full) break
  }
  await purgeOldTrash()
}
