import { eq } from "drizzle-orm"

import { IDLE_MINUTES_RANGE, MAX_OPEN_RANGE } from "@/lib/browser/limits"
import { db as defaultDb, type CustomShellDb } from "@/server/db"

import { promoBrowserSettings } from "./schema"

/**
 * The machine's browser settings: how many browsers may be open at once, and
 * how long an unused one stays open. One row, "default", made by
 * `drizzle/0098_promo_limits_lanes_backups.sql`.
 *
 * The limit exists because each open browser holds about 1.5GB, and the only
 * ceiling before it was the forty ports the code tries, about 60GB. Three
 * suits this Mac; a server sets its own in Settings.
 */

/**
 * Each browser's own budget, a ceiling so one runaway Firefox cannot take the
 * machine.
 *
 * Started from anti-detect's 1,536MB and half a processor, then measured on
 * 6 Oct 2026 with real Reddit searches on this Mac. Memory peaked at 1.04GB,
 * so 1,536MB stays. Half a processor sat at its cap the whole time: a warm
 * search took 9 and 10 seconds against 1 and 2 on a full processor, and the
 * first, cold search 32 seconds. So one processor each.
 */
export const BROWSER_MEMORY_MB = 1536
export const BROWSER_CPUS = 1

export type BrowserSettings = { maxOpen: number; idleMinutes: number }

const DEFAULTS: BrowserSettings = { maxOpen: 3, idleMinutes: 60 }


export async function readBrowserSettings(db: CustomShellDb = defaultDb): Promise<BrowserSettings> {
  const [row] = await db
    .select({ maxOpen: promoBrowserSettings.maxOpen, idleMinutes: promoBrowserSettings.idleMinutes })
    .from(promoBrowserSettings)
    .where(eq(promoBrowserSettings.id, "default"))
    .limit(1)
  return row ?? DEFAULTS
}

export async function saveBrowserSettings(
  input: BrowserSettings,
  db: CustomShellDb = defaultDb
): Promise<BrowserSettings> {
  const within = (value: number, range: { min: number; max: number }, what: string) => {
    if (!Number.isInteger(value) || value < range.min || value > range.max) {
      throw new Error(`${what} has to be a whole number from ${range.min} to ${range.max}.`)
    }
    return value
  }
  const values = {
    maxOpen: within(input.maxOpen, MAX_OPEN_RANGE, "The number of browsers"),
    idleMinutes: within(input.idleMinutes, IDLE_MINUTES_RANGE, "The minutes"),
  }
  await db
    .insert(promoBrowserSettings)
    .values({ id: "default", ...values })
    .onConflictDoUpdate({
      target: promoBrowserSettings.id,
      set: { ...values, updatedAt: new Date() },
    })
  return values
}

/** What opening one browser too many says, with the count in it. */
export function limitMessage(open: number, max: number): string {
  const browsers = open === 1 ? "1 browser is open" : `${open} browsers are open`
  // More open than the limit happens when the limit was lowered under them.
  const limit = open === max ? "which is the limit" : `and the limit is ${max}`
  return `${browsers}, ${limit}. Stop one on the Browser profiles dashboard, or raise the limit in Settings.`
}
