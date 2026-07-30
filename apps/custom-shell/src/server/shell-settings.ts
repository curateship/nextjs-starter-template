import { eq } from "drizzle-orm"

import {
  createDefaultShellConfig,
  DASHBOARD_ROWS_PER_PAGE_OPTIONS,
  type ShellConfig,
} from "@/lib/custom-shell"
import { clampToastSeconds } from "@/lib/toast-seconds"
import { db, type CustomShellDb } from "@/server/db"
import { customShellSettings } from "@/server/schema"
import {
  getOrCreateCurrentWorkspace,
  parseWorkspaceSettings,
} from "@/server/workspaces"

export const DEFAULT_SETTINGS_KEY = "default"

/**
 * Just the configured rows-per-page. A route loader needs this to fetch the
 * first page at the size the table will show, and it is an app-wide global, so
 * it reads the settings row alone rather than paying for the workspace lookup
 * that `readShellSettings` does.
 */
export async function readDashboardRowsPerPage(
  database: CustomShellDb = db
): Promise<number> {
  const [row] = await database
    .select()
    .from(customShellSettings)
    .where(eq(customShellSettings.key, DEFAULT_SETTINGS_KEY))
    .limit(1)

  return parseShellGlobals(row?.settings).dashboardRowsPerPage
}

/**
 * The shell config for one person: app-wide globals from the settings row,
 * merged with their current workspace's own navigation and styling.
 */
export async function readShellSettings(
  userId: string,
  database: CustomShellDb = db
): Promise<ShellConfig> {
  const [row] = await database
    .select()
    .from(customShellSettings)
    .where(eq(customShellSettings.key, DEFAULT_SETTINGS_KEY))
    .limit(1)

  const workspace = await getOrCreateCurrentWorkspace(userId, database)
  const workspaceSettings = parseWorkspaceSettings(workspace.settings)

  return {
    ...parseShellGlobals(row?.settings),
    workspaceName: workspace.name,
    sidebarWidth: workspaceSettings.sidebarWidth,
    favicon: workspaceSettings.favicon,
    topRightNavigation: workspaceSettings.topRightNavigation,
    sections: workspaceSettings.sections,
    styling: workspaceSettings.styling,
  }
}

export function parseShellGlobals(value: unknown) {
  const fallback = createDefaultShellConfig()
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return pickShellGlobals(fallback)
  }

  const settings = value as Partial<ShellConfig>
  return {
    appName: settings.appName ?? fallback.appName,
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
    adminRoute:
      typeof settings.adminRoute === "string"
        ? settings.adminRoute
        : fallback.adminRoute,
  }
}

export function pickShellGlobals(settings: ShellConfig) {
  return {
    appName: settings.appName,
    workspaceName: settings.workspaceName,
    workspacePlan: settings.workspacePlan,
    dashboardRowsPerPage: settings.dashboardRowsPerPage,
    toastSeconds: settings.toastSeconds,
    adminRoute: settings.adminRoute,
  }
}
