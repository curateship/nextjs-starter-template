import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { queueDueAppWarmUps } from "@/server/social/phone-apps/warm-up"

import { remindAppeals } from "./appeals"
import { queueBanLooks } from "./look"

/**
 * The Bans task's timed work, on the shell's ticker (`src/app/server-options.ts`):
 * every five minutes, a time for each warming Instagram or TikTok account's
 * daily visit (part 19); every ten, the bell for appeals 7 days old with no
 * answer (part 25) and the weekly look at banned accounts (part 26). Only
 * rows and jobs are written; the phones and the browser program do the rest.
 */

const WARM_UP_GAP_MS = 5 * 60_000
const CHECK_GAP_MS = 10 * 60_000

let lastWarmUpAt = 0
let lastCheckAt = 0

export async function banUpkeep(db: CustomShellDb = defaultDb, now: Date = new Date()): Promise<void> {
  if (now.getTime() - lastWarmUpAt >= WARM_UP_GAP_MS) {
    lastWarmUpAt = now.getTime()
    const warmUps = await queueDueAppWarmUps(db, now)
    if (warmUps) console.log(`Picked a time for ${warmUps} Instagram or TikTok warm-up visit(s)`)
  }
  if (now.getTime() - lastCheckAt >= CHECK_GAP_MS) {
    lastCheckAt = now.getTime()
    const reminded = await remindAppeals(db, now)
    if (reminded) console.log(`Reminded about ${reminded} appeal(s) with no answer`)
    const looks = await queueBanLooks(db, now)
    if (looks) console.log(`Asked for ${looks} weekly look(s) at banned accounts`)
  }
}
