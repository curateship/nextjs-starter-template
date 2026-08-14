import { eq } from "drizzle-orm"

import {
  isDirectorySort,
  type DirectorySort,
} from "@/lib/directory/public-search"
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
  pageSize: number
  defaultSort: DirectorySort
  browseTitle: string
  browseIntro: string
  featuredFirst: boolean
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
  pageSize: 12,
  defaultSort: "order",
  browseTitle: "Directory",
  browseIntro: "",
  featuredFirst: true,
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

function resolvedBrowseSettings(row: {
  pageSize: number | null
  defaultSort: string | null
  browseTitle: string | null
  browseIntro: string | null
  featuredFirst: boolean | null
}) {
  return {
    pageSize:
      Number.isInteger(row.pageSize) && row.pageSize! >= 6 && row.pageSize! <= 48
        ? row.pageSize!
        : DIRECTORY_SETTING_DEFAULTS.pageSize,
    defaultSort: isDirectorySort(row.defaultSort)
      ? row.defaultSort
      : DIRECTORY_SETTING_DEFAULTS.defaultSort,
    browseTitle: orDefault(
      row.browseTitle ?? "",
      DIRECTORY_SETTING_DEFAULTS.browseTitle
    ),
    browseIntro: (row.browseIntro ?? "").trim(),
    featuredFirst:
      typeof row.featuredFirst === "boolean"
        ? row.featuredFirst
        : DIRECTORY_SETTING_DEFAULTS.featuredFirst,
  }
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
    ...resolvedBrowseSettings(row),
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
        ...resolvedBrowseSettings(row),
      }
    : {
        claimsEnabled: DIRECTORY_SETTING_DEFAULTS.claimsEnabled,
        badgesEnabled: DIRECTORY_SETTING_DEFAULTS.badgesEnabled,
        claimButtonLabel: "",
        claimPendingMessage: "",
        claimApprovedMessage: "",
        pageSize: DIRECTORY_SETTING_DEFAULTS.pageSize,
        defaultSort: DIRECTORY_SETTING_DEFAULTS.defaultSort,
        browseTitle: DIRECTORY_SETTING_DEFAULTS.browseTitle,
        browseIntro: DIRECTORY_SETTING_DEFAULTS.browseIntro,
        featuredFirst: DIRECTORY_SETTING_DEFAULTS.featuredFirst,
      }
}

export async function saveDirectorySettings(
  workspaceId: string,
  input: Partial<
    Pick<
      DirectorySettings,
      | "claimsEnabled"
      | "claimButtonLabel"
      | "claimPendingMessage"
      | "claimApprovedMessage"
    >
  >,
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

export type DirectoryBrowseSettingsInput = Pick<
  DirectorySettings,
  | "pageSize"
  | "defaultSort"
  | "browseTitle"
  | "browseIntro"
  | "featuredFirst"
>

/** Changes the public directory choices without touching claims or badges. */
export async function saveDirectoryBrowseSettings(
  workspaceId: string,
  input: DirectoryBrowseSettingsInput,
  database: CustomShellDb = db
): Promise<DirectorySettings> {
  if (
    !Number.isInteger(input.pageSize) ||
    input.pageSize < 6 ||
    input.pageSize > 48
  ) {
    throw new Error("Listings per page must be between 6 and 48.")
  }
  if (!isDirectorySort(input.defaultSort)) {
    throw new Error("Choose a listing order from the available options.")
  }

  const browseTitle = input.browseTitle.trim()
  if (!browseTitle) throw new Error("Give the directory browse page a title.")

  const at = now()
  const values = {
    pageSize: input.pageSize,
    defaultSort: input.defaultSort,
    browseTitle: browseTitle.slice(0, 120),
    browseIntro: input.browseIntro.trim().slice(0, 500),
    featuredFirst: input.featuredFirst,
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
