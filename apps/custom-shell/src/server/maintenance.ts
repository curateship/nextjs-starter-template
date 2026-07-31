import { eq } from "drizzle-orm"

import {
  MAX_MAINTENANCE_MESSAGE_LENGTH,
  type ShellMaintenance,
} from "@/lib/custom-shell"
import { recordAdminAudit } from "@/server/accounts"
import { db, type CustomShellDb } from "@/server/db"
import { customShellSettings } from "@/server/schema"
import { now } from "@/server/security"
import {
  DEFAULT_SETTINGS_KEY,
  parseShellGlobals,
  readShellGlobals,
} from "@/server/shell-settings"

/**
 * The app-wide "back soon" switch. While it is on, everyone except an admin is
 * sent to the maintenance page; admins keep working and carry a badge in the
 * header so nobody forgets to switch it back off.
 *
 * It lives in the same global settings row as the app name, but it is written
 * only from here — never from the settings page's auto-save. Two writers would
 * mean an admin whose settings page loaded before somebody flipped the switch
 * could silently flip it back by editing an unrelated field.
 */

export async function readMaintenance(
  database: CustomShellDb = db
): Promise<ShellMaintenance> {
  return (await readShellGlobals(database)).maintenance
}

export async function setMaintenance(
  actorId: string,
  input: ShellMaintenance,
  database: CustomShellDb = db
): Promise<ShellMaintenance> {
  const maintenance: ShellMaintenance = {
    enabled: input.enabled,
    message: input.message.trim().slice(0, MAX_MAINTENANCE_MESSAGE_LENGTH),
  }

  await database.transaction(async (tx) => {
    // Read, merge and write in one transaction, with the row locked first. This
    // is the second writer of the app-wide settings row — the settings page is
    // the other — and the row holds every global, so two saves landing together
    // would each write back what they read and one would lose its changes.
    const [existing] = await tx
      .select({ settings: customShellSettings.settings })
      .from(customShellSettings)
      .where(eq(customShellSettings.key, DEFAULT_SETTINGS_KEY))
      .limit(1)
      .for("update")

    const settings = { ...parseShellGlobals(existing?.settings), maintenance }
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

    // Locking everyone out and letting them back in are both worth a line in
    // the activity trail, with the message so the reason is on the record.
    await recordAdminAudit(
      actorId,
      maintenance.enabled ? "maintenance_on" : "maintenance_off",
      "app",
      [],
      maintenance.enabled ? maintenance.message || null : null,
      tx
    )
  })

  return maintenance
}
