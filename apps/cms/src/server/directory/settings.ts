import { eq } from "drizzle-orm"

import { now } from "@/server/auth/security"
import { db, type CustomShellDb } from "@/server/db"
import { directorySettings } from "@/server/directory/schema"

/**
 * What a site says to the public about claiming a listing.
 *
 * A site with no row gets the built-in wording, which is every site until an
 * admin saves something — so this shipping changes nothing that is already on a
 * page.
 *
 * **The defaults are written once, here.** The public page, the admin form and
 * the tests all read through `directorySettingsFor`, so there is no second place
 * for them to drift out of step with.
 */

export type DirectorySettings = {
  claimsEnabled: boolean
  badgesEnabled: boolean
  claimButtonLabel: string
  claimPendingMessage: string
  claimApprovedMessage: string
}

/** The wording a site gets before anybody changes it. */
export const DIRECTORY_SETTING_DEFAULTS: DirectorySettings = {
  claimsEnabled: true,
  badgesEnabled: false,
  claimButtonLabel: "Is this your business?",
  claimPendingMessage:
    "Thanks — we have your request. We check each one by hand and will email you when it is done.",
  claimApprovedMessage:
    "You look after this listing. Open My listings to suggest a change.",
}

/**
 * An empty box means "use the built-in wording" rather than an empty page.
 *
 * An admin who clears a field is saying "I have nothing better than the
 * default", and showing them a blank claim button instead would be the setting
 * working exactly as written and completely wrong.
 */
function orDefault(saved: string, fallback: string): string {
  const trimmed = saved.trim()
  return trimmed || fallback
}

export async function directorySettingsFor(
  workspaceId: string,
  database: CustomShellDb = db
): Promise<DirectorySettings> {
  const [row] = await database
    .select()
    .from(directorySettings)
    .where(eq(directorySettings.workspaceId, workspaceId))
    .limit(1)

  if (!row) return { ...DIRECTORY_SETTING_DEFAULTS }

  return {
    claimsEnabled: row.claimsEnabled,
    badgesEnabled: row.badgesEnabled,
    claimButtonLabel: orDefault(
      row.claimButtonLabel,
      DIRECTORY_SETTING_DEFAULTS.claimButtonLabel
    ),
    claimPendingMessage: orDefault(
      row.claimPendingMessage,
      DIRECTORY_SETTING_DEFAULTS.claimPendingMessage
    ),
    claimApprovedMessage: orDefault(
      row.claimApprovedMessage,
      DIRECTORY_SETTING_DEFAULTS.claimApprovedMessage
    ),
  }
}

/**
 * What the admin form last typed, defaults and all, so a cleared box comes back
 * empty rather than pre-filled with the wording it falls back to.
 */
export async function savedDirectorySettings(
  workspaceId: string,
  database: CustomShellDb = db
): Promise<DirectorySettings> {
  const [row] = await database
    .select()
    .from(directorySettings)
    .where(eq(directorySettings.workspaceId, workspaceId))
    .limit(1)

  return row
    ? {
        claimsEnabled: row.claimsEnabled,
        badgesEnabled: row.badgesEnabled,
        claimButtonLabel: row.claimButtonLabel,
        claimPendingMessage: row.claimPendingMessage,
        claimApprovedMessage: row.claimApprovedMessage,
      }
    : {
        claimsEnabled: DIRECTORY_SETTING_DEFAULTS.claimsEnabled,
        badgesEnabled: DIRECTORY_SETTING_DEFAULTS.badgesEnabled,
        claimButtonLabel: "",
        claimPendingMessage: "",
        claimApprovedMessage: "",
      }
}

export async function saveDirectorySettings(
  workspaceId: string,
  input: Partial<Omit<DirectorySettings, "badgesEnabled">>,
  database: CustomShellDb = db
): Promise<DirectorySettings> {
  const at = now()
  const values = {
    claimsEnabled:
      input.claimsEnabled ?? DIRECTORY_SETTING_DEFAULTS.claimsEnabled,
    claimButtonLabel: (input.claimButtonLabel ?? "").trim().slice(0, 80),
    claimPendingMessage: (input.claimPendingMessage ?? "").trim().slice(0, 300),
    claimApprovedMessage: (input.claimApprovedMessage ?? "")
      .trim()
      .slice(0, 300),
  }

  await database
    .insert(directorySettings)
    .values({ workspaceId, ...values, createdAt: at, updatedAt: at })
    .onConflictDoUpdate({
      target: directorySettings.workspaceId,
      set: { ...values, updatedAt: at },
    })

  return directorySettingsFor(workspaceId, database)
}

/** Changes only the badge switch, leaving every claim setting untouched. */
export async function saveDirectoryBadgesEnabled(
  workspaceId: string,
  badgesEnabled: boolean,
  database: CustomShellDb = db
) {
  const at = now()
  await database
    .insert(directorySettings)
    .values({
      workspaceId,
      badgesEnabled,
      createdAt: at,
      updatedAt: at,
    })
    .onConflictDoUpdate({
      target: directorySettings.workspaceId,
      set: { badgesEnabled, updatedAt: at },
    })

  return { badgesEnabled }
}
