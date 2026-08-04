import { eq } from "drizzle-orm"

import {
  createDefaultMemberSections,
  createDefaultShellConfig,
  createDefaultTopRightNavigation,
  DASHBOARD_ROWS_PER_PAGE_OPTIONS,
  normalizeMaintenance,
  normalizeSessionPolicy,
  normalizeTopLeftNavLimit,
  type ShellConfig,
} from "@/lib/custom-shell"
import { clampToastSeconds } from "@/lib/toast-seconds"
import { db, type CustomShellDb } from "@/server/db"
import {
  customShellSettings,
  DEFAULT_SETTINGS_KEY,
  type CustomShellUser,
} from "@/server/schema"
import { isAdmin } from "@/server/security"
import {
  getOrCreateCurrentWorkspace,
  parseWorkspaceSettings,
} from "@/server/workspaces"

/** The app-wide globals row, already parsed and defaulted. */
export async function readShellGlobals(database: CustomShellDb) {
  const [row] = await database
    .select()
    .from(customShellSettings)
    .where(eq(customShellSettings.key, DEFAULT_SETTINGS_KEY))
    .limit(1)

  return parseShellGlobals(row?.settings)
}

/**
 * Just the configured rows-per-page. A route loader needs this to fetch the
 * first page at the size the table will show, and it is an app-wide global, so
 * it reads the settings row alone rather than paying for the workspace lookup
 * that `readShellSettings` does.
 */
export async function readDashboardRowsPerPage(
  database: CustomShellDb = db
): Promise<number> {
  return (await readShellGlobals(database)).dashboardRowsPerPage
}

/**
 * The two branded things a signed-out visitor sees: the app name and the logo.
 * Public pages (sign in, register, pricing) show them before there is a session,
 * so like rows-per-page this reads the settings row on its own rather than going
 * through the workspace lookup.
 */
export async function readBranding(
  database: CustomShellDb = db
): Promise<{ appName: string; logo: string }> {
  const globals = await readShellGlobals(database)
  return { appName: globals.appName, logo: globals.logo }
}

/**
 * The shell config for one person: app-wide globals from the settings row,
 * merged with their current workspace's own styling.
 *
 * Which sidebar they get depends on who they are. An admin edits and sees their
 * own, saved on their workspace. Everybody else gets the one an admin built for
 * them, saved app-wide — one list in one place, rather than the private frozen
 * copy every member used to be handed on their first sign-in.
 */
export async function readShellSettings(
  user: Pick<CustomShellUser, "id" | "role">,
  database: CustomShellDb = db
): Promise<ShellConfig> {
  const globals = await readShellGlobals(database)
  const workspace = await getOrCreateCurrentWorkspace(user.id, database)
  const workspaceSettings = parseWorkspaceSettings(workspace.settings)

  return {
    ...globals,
    workspaceName: workspace.name,
    sidebarWidth: workspaceSettings.sidebarWidth,
    favicon: workspaceSettings.favicon,
    // Same rule as the sidebar below: an admin sees and edits their own row,
    // everybody else gets the one an admin built for them.
    topRightNavigation: isAdmin(user)
      ? workspaceSettings.topRightNavigation
      : globals.memberTopRightNavigation,
    sections: isAdmin(user) ? workspaceSettings.sections : globals.memberSections,
    styling: workspaceSettings.styling,
    dashboardWidgets: workspaceSettings.dashboardWidgets,
  }
}

export function parseShellGlobals(value: unknown) {
  const fallback = createDefaultShellConfig()
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return pickShellGlobals(fallback)
  }

  const settings = value as Partial<ShellConfig>
  return {
    // Guarded rather than defaulted, because the app name is the one global a
    // signed-out visitor renders — a junk value in the row must not reach the
    // sign-in page.
    appName:
      typeof settings.appName === "string"
        ? settings.appName
        : fallback.appName,
    // Guarded for the same reason as the app name: the logo is drawn on the
    // signed-out pages, so a junk value in the row must not reach an <img>.
    logo: typeof settings.logo === "string" ? settings.logo : fallback.logo,
    workspaceName: settings.workspaceName ?? fallback.workspaceName,
    workspacePlan: settings.workspacePlan ?? fallback.workspacePlan,
    dashboardRowsPerPage:
      typeof settings.dashboardRowsPerPage === "number" &&
      DASHBOARD_ROWS_PER_PAGE_OPTIONS.includes(
        settings.dashboardRowsPerPage as (typeof DASHBOARD_ROWS_PER_PAGE_OPTIONS)[number]
      )
        ? settings.dashboardRowsPerPage
        : fallback.dashboardRowsPerPage,
    // Rows saved before this setting existed have no value; clampToastSeconds
    // falls back to the default rather than writing NaN into the Toaster.
    toastSeconds: clampToastSeconds(settings.toastSeconds),
    // Rows saved before this setting existed have no value, and the fallback is
    // no limit — so an existing install's top bar looks exactly as it did.
    topLeftNavLimit: normalizeTopLeftNavLimit(settings.topLeftNavLimit),
    adminRoute:
      typeof settings.adminRoute === "string"
        ? settings.adminRoute
        : fallback.adminRoute,
    memberHomeRoute:
      typeof settings.memberHomeRoute === "string"
        ? settings.memberHomeRoute
        : fallback.memberHomeRoute,
    // Saved is saved, empty included: an admin who deletes every member link
    // means it, and handing the starter set back on read would undo that. The
    // starter only fills in a row that has never had a member sidebar at all.
    memberSections: Array.isArray(settings.memberSections)
      ? settings.memberSections
      : createDefaultMemberSections(),
    // Same rule as memberSections: saved is saved, empty included. The starter
    // set only fills a row that has never held a member top-right menu at all.
    memberTopRightNavigation: Array.isArray(settings.memberTopRightNavigation)
      ? settings.memberTopRightNavigation
      : createDefaultTopRightNavigation(),
    // Rows saved before this setting existed have no value, and the feature is
    // meant to be on — so only an explicit `false` turns it off.
    liveNotifications: settings.liveNotifications !== false,
    maintenance: normalizeMaintenance(settings.maintenance),
    sessionPolicy: normalizeSessionPolicy(settings.sessionPolicy),
  }
}

/**
 * Takes the fields it reads rather than a whole `ShellConfig`: the settings save
 * hands it a validated request, and the parts of that request which are not
 * app-wide — the widget arrangement — are checked on their own way into the
 * workspace row, in their own shape.
 */
export function pickShellGlobals(
  settings: Pick<
    ShellConfig,
    | "appName"
    | "logo"
    | "workspaceName"
    | "workspacePlan"
    | "dashboardRowsPerPage"
    | "toastSeconds"
    | "topLeftNavLimit"
    | "adminRoute"
    | "memberHomeRoute"
    | "memberSections"
    | "memberTopRightNavigation"
    | "liveNotifications"
    | "maintenance"
    | "sessionPolicy"
  >
) {
  return {
    appName: settings.appName,
    logo: settings.logo,
    workspaceName: settings.workspaceName,
    workspacePlan: settings.workspacePlan,
    dashboardRowsPerPage: settings.dashboardRowsPerPage,
    toastSeconds: settings.toastSeconds,
    topLeftNavLimit: settings.topLeftNavLimit,
    adminRoute: settings.adminRoute,
    memberHomeRoute: settings.memberHomeRoute,
    memberSections: settings.memberSections,
    memberTopRightNavigation: settings.memberTopRightNavigation,
    liveNotifications: settings.liveNotifications,
    maintenance: settings.maintenance,
    sessionPolicy: settings.sessionPolicy,
  }
}
