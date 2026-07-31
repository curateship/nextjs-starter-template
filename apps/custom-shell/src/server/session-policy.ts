import { eq } from "drizzle-orm"

import {
  normalizeSessionPolicy,
  type ShellSessionPolicy,
} from "@/lib/custom-shell"
import { db, type CustomShellDb } from "@/server/db"
import { customShellSettings, DEFAULT_SETTINGS_KEY } from "@/server/schema"
import { now } from "@/server/security"
import { parseShellGlobals } from "@/server/shell-settings"

/**
 * How long a sign-in may last, app-wide (Settings → Security).
 *
 * It lives in the same global settings row as the app name, but it is written
 * only from here — never from the settings page's auto-save. Two writers would
 * mean an admin whose settings page loaded before somebody tightened the policy
 * could silently loosen it back by editing an unrelated field.
 *
 * Enforcement reads the policy in `server/security.ts` on every request.
 */

export async function setSessionPolicy(
  input: ShellSessionPolicy,
  database: CustomShellDb = db
): Promise<ShellSessionPolicy> {
  const sessionPolicy = normalizeSessionPolicy(input)

  await database.transaction(async (tx) => {
    // Read, merge and write in one transaction, with the row locked first. The
    // row holds every app-wide global and has two other writers (the settings
    // page and the maintenance switch); two saves landing together would each
    // write back what they read and one would lose its changes.
    const [existing] = await tx
      .select({ settings: customShellSettings.settings })
      .from(customShellSettings)
      .where(eq(customShellSettings.key, DEFAULT_SETTINGS_KEY))
      .limit(1)
      .for("update")

    const settings = { ...parseShellGlobals(existing?.settings), sessionPolicy }
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

  return sessionPolicy
}
