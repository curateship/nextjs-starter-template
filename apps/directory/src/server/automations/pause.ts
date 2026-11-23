import { count, eq } from "drizzle-orm"

import {
  MAX_AUTOMATION_PAUSE_NAME_LENGTH,
  type ShellAutomationPause,
} from "@/lib/custom-shell"
import { db, type CustomShellDb } from "@/server/db"
import {
  customShellAutomationRuns,
  customShellSettings,
  DEFAULT_SETTINGS_KEY,
} from "@/server/schema"
import { now } from "@/server/auth/security"
import {
  readShellGlobals,
  shellGlobalsForWrite,
} from "@/server/shell-settings"

/**
 * The automations kill switch: one flag that stops every flow at once.
 *
 * **The whole rule, in one place.** While it is on:
 *
 * - The engine claims nothing. A pass ends before it takes a single run.
 * - A run already part-way through finishes the step it is inside, then stops
 *   between steps and keeps its place. Nothing is killed mid-step.
 * - Approval deadlines stop counting down. A checkpoint that would have timed
 *   out during the pause is still there to answer afterwards — auto-rejecting
 *   it would be the switch throwing work away, which is the opposite of what
 *   it is for.
 * - Starting a flow by hand is refused, with a reason. That is the one place
 *   this deliberately does not "hold": a person is standing there with their
 *   finger on the button, and an answer beats a silent queue they did not mean
 *   to build. Everything that was already going is held.
 *
 * Switching it back off loses nothing and doubles nothing. Held runs are simply
 * due again, so the next pass picks them up exactly where they stopped — and
 * the resume kicks a pass straight away rather than waiting up to fifteen
 * seconds for the ticker.
 *
 * It lives in the same global settings row as the app name and maintenance
 * mode, and like those two it is written only from here — never from the
 * settings page's auto-save. Two writers would mean an admin whose settings
 * page loaded before somebody hit the switch could silently start everything
 * running again by editing an unrelated field.
 */

/**
 * Is everything stopped?
 *
 * The engine asks this between steps as well as once per pass, so it reads the
 * settings row on its own rather than going through anything heavier: one
 * lookup by primary key of a row Postgres is already holding in cache.
 *
 * Measured at 0.38ms a read, so the worst pass the engine allows itself — the
 * full twenty runs, each walking its full twenty-five steps — pays 189ms out of
 * a fifteen-second gap. That is why there is no cache in front of this: it would
 * buy about one percent of one tick and cost a second answer that could be
 * wrong about whether everything is stopped.
 *
 * Who flipped it and when are read with the rest of the shell config, by the
 * header badge. Nothing on this path needs them.
 */
export async function readAutomationsPaused(
  database: CustomShellDb = db
): Promise<boolean> {
  return (await readShellGlobals(database)).automationPause.enabled
}

/**
 * How many runs are stopped where they stand, waiting for the switch to go
 * back off.
 *
 * App-wide, because the switch is: `active` is exactly "would be running right
 * now". Runs parked at an approval checkpoint are not counted — those are
 * waiting on a person, and they would still be waiting with the switch off.
 */
export async function countHeldAutomationRuns(
  database: CustomShellDb = db
): Promise<number> {
  const [row] = await database
    .select({ total: count() })
    .from(customShellAutomationRuns)
    .where(eq(customShellAutomationRuns.status, "active"))
  return row?.total ?? 0
}

export async function setAutomationPause(
  {
    enabled,
    changedBy,
  }: {
    enabled: boolean
    /** The admin flipping it, by name — this is the record of the flip. */
    changedBy: string
  },
  database: CustomShellDb = db
): Promise<ShellAutomationPause> {
  const automationPause: ShellAutomationPause = {
    enabled,
    changedBy: changedBy.trim().slice(0, MAX_AUTOMATION_PAUSE_NAME_LENGTH),
    changedAt: now().toISOString(),
  }

  await database.transaction(async (tx) => {
    // Read, merge and write in one transaction with the row locked first — the
    // same dance the maintenance switch does, and for the same reason: this row
    // holds every global, so two saves landing together would each write back
    // what they read and one would lose its changes.
    const [existing] = await tx
      .select({ settings: customShellSettings.settings })
      .from(customShellSettings)
      .where(eq(customShellSettings.key, DEFAULT_SETTINGS_KEY))
      .limit(1)
      .for("update")

    const settings = {
      ...shellGlobalsForWrite(existing?.settings),
      automationPause,
    }
    const timestamp = now()

    if (existing) {
      await tx
        .update(customShellSettings)
        .set({ settings, updatedAt: timestamp })
        .where(eq(customShellSettings.key, DEFAULT_SETTINGS_KEY))
    } else {
      await tx.insert(customShellSettings).values({
        key: DEFAULT_SETTINGS_KEY,
        settings,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
    }
  })

  return automationPause
}
