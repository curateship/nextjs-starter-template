import { eq } from "drizzle-orm"

import {
  createDefaultMemberSections,
  createDefaultShellConfig,
  createDefaultTopRightNavigation,
  DASHBOARD_ROWS_PER_PAGE_OPTIONS,
  normalizeAutomationPause,
  normalizeMaintenance,
  normalizeSessionPolicy,
  normalizeTopLeftNavLimit,
  type ShellConfig,
} from "@/lib/custom-shell"
import { normalizePageOverrides } from "@/lib/pages/page-visibility"
import { normalizeNotificationTypeVisibility } from "@/lib/notification-types"
import { clampToastSeconds } from "@/lib/toast/toast-seconds"
import { db, type CustomShellDb } from "@/server/db"
import {
  customShellSettings,
  DEFAULT_SETTINGS_KEY,
  type CustomShellUser,
} from "@/server/schema"
import { isAdmin } from "@/server/auth/security"
import {
  currentWorkspace,
  parseWorkspaceSettings,
} from "@/server/people/workspaces"
import { answerForRequest } from "@/server/workspaces/host"

/** The app-wide globals row, already parsed and defaulted. */
export async function readShellGlobals(database: CustomShellDb = db) {
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
 * Everything a signed-out visitor's page needs before there is a session: the
 * app name, the logo, and the look every public page wears. Like rows-per-page
 * this used to read the settings row on its own, because a visitor signed in to
 * nothing has no workspace to read.
 *
 * They can have one now: the domain they typed. A visitor on a workspace's own
 * address sees that workspace's name, not the deployment's — which is the whole
 * point of one deployment serving many. On the deployment's own address, and on
 * an app with no base domain configured, nothing resolves and the app-wide
 * values answer exactly as before.
 *
 * The root route loads this on the server, which is what puts the theme in the
 * first paint instead of applying it after the page has already been drawn.
 */
export async function readBranding(
  database: CustomShellDb = db
): Promise<{
  appName: string
  logo: string
  logoDark: string
  /**
   * True when the domain belongs to no workspace at all — a subdomain nobody
   * has taken, or one whose workspace is switched off. The root route turns
   * that into a dead end, because serving the deployment's own pages under a
   * stranger's address is worse than answering nothing.
   */
  hostIsUnknown: boolean
}> {
  const globals = await readShellGlobals(database)
  const answer = await answerForRequest(database)

  if (answer.kind !== "workspace") {
    return {
      appName: globals.appName,
      logo: globals.logo,
      logoDark: globals.logoDark,
      hostIsUnknown: answer.kind === "unknown",
    }
  }

  return {
    appName: answer.workspace.name || globals.appName,
    // A workspace has a favicon of its own but no logo yet — that arrives with
    // the rest of its look, in a later task. Until then the deployment's logo
    // is shown, which beats a site with no mark at all.
    logo: globals.logo,
    logoDark: globals.logoDark,
    hostIsUnknown: false,
  }
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
  // Reads never make a workspace. This runs on every signed-in page load,
  // including a member's, and the old read created one when it missed — which
  // is how members ended up owning workspaces they never saw. Nobody in a
  // workspace yet simply gets the app-wide defaults.
  const workspace = await currentWorkspace(user.id, database)
  const workspaceSettings = parseWorkspaceSettings(workspace?.settings)

  return {
    ...globals,
    workspaceName: workspace?.name ?? globals.workspaceName,
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
    // Same guard, same reason. A row saved before this setting existed has no
    // value at all, which reads as "no dark logo" — so the one logo keeps being
    // shown on both backgrounds, exactly as before.
    logoDark:
      typeof settings.logoDark === "string"
        ? settings.logoDark
        : fallback.logoDark,
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
    notificationTypes: normalizeNotificationTypeVisibility(
      settings.notificationTypes
    ),
    maintenance: normalizeMaintenance(settings.maintenance),
    // Rows saved before this switch existed have no value, and the default is
    // running — so an existing install's automations keep going exactly as
    // they did.
    automationPause: normalizeAutomationPause(settings.automationPause),
    sessionPolicy: normalizeSessionPolicy(settings.sessionPolicy),
    // Rows saved before this setting existed have none, which normalizes to an
    // empty map — every page on "everyone", exactly as the app behaved before
    // pages could be switched off.
    pages: normalizePageOverrides(settings.pages),
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
    | "logoDark"
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
    | "notificationTypes"
    | "maintenance"
    | "automationPause"
    | "sessionPolicy"
    | "pages"
  >
) {
  return {
    appName: settings.appName,
    logo: settings.logo,
    logoDark: settings.logoDark,
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
    notificationTypes: settings.notificationTypes,
    maintenance: settings.maintenance,
    automationPause: settings.automationPause,
    sessionPolicy: settings.sessionPolicy,
    pages: settings.pages,
  }
}
