import { eq } from "drizzle-orm"

import {
  isDirectoryDefaultSort,
  type DirectoryDefaultSort,
} from "@/lib/directory/public-search"
import { now } from "@/server/auth/security"
import { decryptSecret, encryptSecret } from "@/server/auth/encryption"
import { db, type CustomShellDb } from "@/server/db"
import { clearPublicDirectoryCache } from "@/server/directory/public-cache"
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
  defaultSort: DirectoryDefaultSort
  browseTitle: string
  browseIntro: string
  featuredFirst: boolean
  /** Whether the browse page offers the map view at all. */
  mapEnabled: boolean
  /**
   * A map key is saved for this site. Read off the same row rather than asked
   * for separately, because the browse page needs it on every load and a
   * second query for one boolean is a second query for one boolean.
   *
   * Never the key itself. This travels to a public page; the key is fetched on
   * its own, by the one read that has a use for it.
   */
  hasMapKey: boolean
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
  // Off, so a site that already exists gains no map button by this shipping.
  mapEnabled: false,
  hasMapKey: false,
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
      Number.isInteger(row.pageSize) &&
      row.pageSize! >= 6 &&
      row.pageSize! <= 48
        ? row.pageSize!
        : DIRECTORY_SETTING_DEFAULTS.pageSize,
    defaultSort: isDirectoryDefaultSort(row.defaultSort)
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
    mapEnabled: row.mapEnabled,
    hasMapKey: Boolean(row.mapDisplayKeyEncrypted),
  }
}

export async function directoryGeocodingKey(
  workspaceId: string,
  database: CustomShellDb = db
) {
  const [row] = await database
    .select({ key: directorySettings.geocodingApiKeyEncrypted })
    .from(directorySettings)
    .where(eq(directorySettings.workspaceId, workspaceId))
    .limit(1)
  return row?.key
    ? decryptSecret(row.key)
    : process.env.GOOGLE_MAPS_GEOCODING_API_KEY || null
}

export async function directoryGeocodingKeyStatus(
  workspaceId: string,
  database: CustomShellDb = db
) {
  try {
    const key = await directoryGeocodingKey(workspaceId, database)
    return key ? `••••${key.slice(-4)}` : null
  } catch {
    // A changed encryption secret must not block the settings page. Pasting a
    // new key replaces the unreadable value.
    return null
  }
}

export async function saveDirectoryGeocodingKey(
  workspaceId: string,
  key: string,
  database: CustomShellDb = db
) {
  const value = key.trim()
  if (!value) throw new Error("Paste a Google Maps key.")
  const at = now()
  const encrypted = encryptSecret(value)
  await database
    .insert(directorySettings)
    .values({
      workspaceId,
      geocodingApiKeyEncrypted: encrypted,
      createdAt: at,
      updatedAt: at,
    })
    .onConflictDoUpdate({
      target: directorySettings.workspaceId,
      set: { geocodingApiKeyEncrypted: encrypted, updatedAt: at },
    })
  return directoryGeocodingKeyStatus(workspaceId, database)
}

/**
 * The Google key the visitor's browser uses to draw the map.
 *
 * **A different key from the geocoding one above, and it has to be.** A key a
 * browser may use is restricted to a website address; a key restricted that way
 * is refused by the server-side Geocoding API. One key for both jobs would have
 * to be left unrestricted, and an unrestricted key sitting in a public page is
 * anybody's free geocoding on this site's bill.
 *
 * There is deliberately no environment-variable fallback, unlike the geocoding
 * key. This one is handed to the open internet, so it is only ever a value a
 * site's own admin chose to publish.
 */
export async function directoryMapDisplayKey(
  workspaceId: string,
  database: CustomShellDb = db
) {
  const [row] = await database
    .select({ key: directorySettings.mapDisplayKeyEncrypted })
    .from(directorySettings)
    .where(eq(directorySettings.workspaceId, workspaceId))
    .limit(1)
  if (!row?.key) return null
  try {
    return decryptSecret(row.key)
  } catch {
    // A changed encryption secret must not throw a public page. No key means
    // no map, which is already a state the browse page draws.
    return null
  }
}

export async function directoryMapDisplayKeyStatus(
  workspaceId: string,
  database: CustomShellDb = db
) {
  const key = await directoryMapDisplayKey(workspaceId, database)
  return key ? `••••${key.slice(-4)}` : null
}

export async function saveDirectoryMapDisplayKey(
  workspaceId: string,
  key: string,
  database: CustomShellDb = db
) {
  const value = key.trim()
  if (!value) throw new Error("Paste a Google Maps key.")
  const at = now()
  const encrypted = encryptSecret(value)
  await database
    .insert(directorySettings)
    .values({
      workspaceId,
      mapDisplayKeyEncrypted: encrypted,
      createdAt: at,
      updatedAt: at,
    })
    .onConflictDoUpdate({
      target: directorySettings.workspaceId,
      set: { mapDisplayKeyEncrypted: encrypted, updatedAt: at },
    })

  // The browse page remembers whether a map is on offer, so a key arriving has
  // to forget that answer or the switch stays missing for two minutes.
  clearPublicDirectoryCache(workspaceId)
  return directoryMapDisplayKeyStatus(workspaceId, database)
}

/** Changes only the map switch, leaving every other directory choice alone. */
export async function saveDirectoryMapEnabled(
  workspaceId: string,
  mapEnabled: boolean,
  database: CustomShellDb = db
) {
  const at = now()
  await database
    .insert(directorySettings)
    .values({ workspaceId, mapEnabled, createdAt: at, updatedAt: at })
    .onConflictDoUpdate({
      target: directorySettings.workspaceId,
      set: { mapEnabled, updatedAt: at },
    })

  clearPublicDirectoryCache(workspaceId)
  return { mapEnabled }
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
        mapEnabled: row.mapEnabled,
        hasMapKey: Boolean(row.mapDisplayKeyEncrypted),
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
        mapEnabled: DIRECTORY_SETTING_DEFAULTS.mapEnabled,
        hasMapKey: DIRECTORY_SETTING_DEFAULTS.hasMapKey,
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

  clearPublicDirectoryCache(workspaceId)
  return directorySettingsFor(workspaceId, database)
}

export type DirectoryBrowseSettingsInput = Pick<
  DirectorySettings,
  "pageSize" | "defaultSort" | "browseTitle" | "browseIntro" | "featuredFirst"
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
  if (!isDirectoryDefaultSort(input.defaultSort)) {
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

  clearPublicDirectoryCache(workspaceId)
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
