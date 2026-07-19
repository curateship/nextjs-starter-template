import { createServerFn } from "@tanstack/react-start"
import { and, eq } from "drizzle-orm"
import { z } from "zod"

import {
  createDefaultShellConfig,
  DASHBOARD_ROWS_PER_PAGE_OPTIONS,
  type ShellConfig,
} from "@/lib/custom-shell"
import { db } from "@/server/db"
import { requireAppOrigin } from "@/server/origin"
import {
  customShellSettings,
  customShellWorkspaces,
} from "@/server/schema"
import { findCurrentUser, now } from "@/server/security"

const DEFAULT_SETTINGS_KEY = "default"

const shellIconSchema = z.string().trim().min(1).max(2048)

const shellChildItemSchema = z.object({
  id: z.string().min(1),
  label: z.string(),
  href: z.string(),
  icon: shellIconSchema.optional(),
})

const shellEntrySchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("item"),
    id: z.string().min(1),
    label: z.string(),
    href: z.string(),
    icon: shellIconSchema,
    visible: z.boolean(),
    children: z.array(shellChildItemSchema).optional(),
  }),
  z.object({
    type: z.literal("divider"),
    id: z.string().min(1),
    label: z.string(),
  }),
])

const shellBackgroundSchema = z.object({
  mode: z.enum(["default", "muted", "custom"]),
  strength: z.number().int().min(0).max(100),
  color: z.string(),
})

const shellModalStylingSchema = z.object({
  background: shellBackgroundSchema,
  borderWidth: z.number().int().min(0).max(3),
  borderColor: shellBackgroundSchema,
  padding: z.number().int().min(0).max(48),
  overlayOpacity: z.number().int().min(0).max(100),
  cardBackground: shellBackgroundSchema,
  cardBorderWidth: z.number().int().min(0).max(3),
  cardBorderColor: shellBackgroundSchema,
})

const shellStylingSchema = z.object({
  gutter: z.number().int().min(0).max(48),
  cardBorderWidth: z.number().int().min(0).max(3),
  cardBorderColor: shellBackgroundSchema,
  content: shellBackgroundSchema,
  chrome: shellBackgroundSchema,
  modal: shellModalStylingSchema,
})

const shellConfigSchema = z.object({
  appName: z.string(),
  workspaceName: z.string(),
  workspacePlan: z.string(),
  dashboardRowsPerPage: z.number().int().refine((value) =>
    DASHBOARD_ROWS_PER_PAGE_OPTIONS.includes(
      value as (typeof DASHBOARD_ROWS_PER_PAGE_OPTIONS)[number]
    )
  ),
  adminRoute: z.string().catch(""),
  favicon: z.string(),
  topRightNavigation: z.array(
    z.object({
      id: z.enum(["feedback", "theme", "notifications"]),
      visible: z.boolean(),
    })
  ),
  sections: z.array(
    z.object({
      id: z.string().min(1),
      title: z.string(),
      entries: z.array(shellEntrySchema),
    })
  ),
  styling: shellStylingSchema,
})

export function getShellSettingsErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Shell settings request failed."
}

const loadShellSettingsFn = createServerFn({ method: "GET" }).handler(
  async () => {
    const user = await requireUser()

    const [row] = await db
      .select()
      .from(customShellSettings)
      .where(eq(customShellSettings.key, DEFAULT_SETTINGS_KEY))
      .limit(1)

    const { getOrCreateCurrentWorkspace, parseWorkspaceSettings } =
      await import("@/server/workspaces")
    const workspace = await getOrCreateCurrentWorkspace(user.id)
    const workspaceSettings = parseWorkspaceSettings(workspace.settings)
    const shellGlobals = parseShellGlobals(row?.settings)

    return {
      settings: {
        ...shellGlobals,
        workspaceName: workspace.name,
        favicon: workspaceSettings.favicon,
        topRightNavigation: workspaceSettings.topRightNavigation,
        sections: workspaceSettings.sections,
        styling: workspaceSettings.styling,
      },
    }
  }
)

const saveShellSettingsFn = createServerFn({ method: "POST" })
  .inputValidator(shellConfigSchema)
  .handler(async ({ data }) => {
    requireAppOrigin()
    const user = await requireAdminUser()

    const updatedAt = now()
    const { getOrCreateCurrentWorkspace, parseWorkspaceSettings } =
      await import("@/server/workspaces")
    const workspace = await getOrCreateCurrentWorkspace(user.id)
    const workspaceSettings = parseWorkspaceSettings(workspace.settings)
    const workspaceName = data.workspaceName.trim()
    if (!workspaceName) {
      throw new Error("Workspace name is required")
    }

    const globalSettings = pickShellGlobals(data)
    await db.transaction(async (tx) => {
      await tx
        .update(customShellWorkspaces)
        .set({
          name: workspaceName.slice(0, 255),
          settings: {
            ...workspaceSettings,
            favicon: data.favicon,
            topRightNavigation: data.topRightNavigation,
            sections: data.sections,
            styling: data.styling,
          },
          updatedAt,
        })
        .where(
          and(
            eq(customShellWorkspaces.id, workspace.id),
            eq(customShellWorkspaces.userId, user.id)
          )
        )

      const [existing] = await tx
        .select({ key: customShellSettings.key })
        .from(customShellSettings)
        .where(eq(customShellSettings.key, DEFAULT_SETTINGS_KEY))
        .limit(1)

      if (existing) {
        await tx
          .update(customShellSettings)
          .set({ settings: globalSettings, updatedAt })
          .where(eq(customShellSettings.key, DEFAULT_SETTINGS_KEY))
      } else {
        await tx.insert(customShellSettings).values({
          key: DEFAULT_SETTINGS_KEY,
          settings: globalSettings,
          createdAt: updatedAt,
          updatedAt,
        })
      }
    })

    return { settings: data }
  })

export function loadShellSettings() {
  return loadShellSettingsFn()
}

export function saveShellSettings(settings: ShellConfig) {
  return saveShellSettingsFn({ data: settings })
}

async function requireUser() {
  const user = await findCurrentUser()
  if (!user) {
    throw new Error("Missing Custom Shell session")
  }
  return user
}

async function requireAdminUser() {
  const user = await requireUser()
  if (user.role !== "admin") {
    throw new Error("Not authorized")
  }
  return user
}

function parseShellGlobals(value: unknown) {
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
    adminRoute:
      typeof settings.adminRoute === "string"
        ? settings.adminRoute
        : fallback.adminRoute,
  }
}

function pickShellGlobals(settings: ShellConfig) {
  return {
    appName: settings.appName,
    workspaceName: settings.workspaceName,
    workspacePlan: settings.workspacePlan,
    dashboardRowsPerPage: settings.dashboardRowsPerPage,
    adminRoute: settings.adminRoute,
  }
}
