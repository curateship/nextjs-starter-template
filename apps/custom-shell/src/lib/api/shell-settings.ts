import { createServerFn } from "@tanstack/react-start"
import { and, eq } from "drizzle-orm"
import { z } from "zod"

import {
  DASHBOARD_ROWS_PER_PAGE_OPTIONS,
  SHELL_ROLES,
  type ShellConfig,
} from "@/lib/custom-shell"
import { MAX_SIDEBAR_WIDTH, MIN_SIDEBAR_WIDTH } from "@/lib/sidebar-width"
import { db } from "@/server/db"
import { requireAppOrigin } from "@/server/origin"
import {
  customShellSettings,
  customShellWorkspaces,
} from "@/server/schema"
import {
  DEFAULT_SETTINGS_KEY,
  pickShellGlobals,
  readShellSettings,
} from "@/server/shell-settings"
import { now, requireAdmin, requireUser } from "@/server/security"

const shellIconSchema = z.string().trim().min(1).max(2048)

const shellRolesSchema = z.array(z.enum(SHELL_ROLES)).optional()

const shellChildItemSchema = z.object({
  id: z.string().min(1),
  label: z.string(),
  href: z.string(),
  icon: shellIconSchema.optional(),
  roles: shellRolesSchema,
})

const shellEntrySchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("item"),
    id: z.string().min(1),
    label: z.string(),
    href: z.string(),
    icon: shellIconSchema,
    visible: z.boolean(),
    roles: shellRolesSchema,
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
  // Per-workspace sidebar width. Always populated with a valid value by the
  // loader (workspace settings default it), so a plain required field is fine.
  sidebarWidth: z.number().int().min(MIN_SIDEBAR_WIDTH).max(MAX_SIDEBAR_WIDTH),
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
    return { settings: await readShellSettings(user.id) }
  }
)

const saveShellSettingsFn = createServerFn({ method: "POST" })
  .inputValidator(shellConfigSchema)
  .handler(async ({ data }) => {
    requireAppOrigin()
    const user = await requireAdmin()

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
            sidebarWidth: data.sidebarWidth,
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

// Lightweight, per-user save for the draggable sidebar width. Unlike the full
// shell save this is not admin-gated — any signed-in user can persist their own
// workspace's sidebar width by dragging the rail.
const saveSidebarWidthFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      sidebarWidth: z
        .number()
        .int()
        .min(MIN_SIDEBAR_WIDTH)
        .max(MAX_SIDEBAR_WIDTH),
    })
  )
  .handler(async ({ data }) => {
    requireAppOrigin()
    const user = await requireUser()
    const { getOrCreateCurrentWorkspace, parseWorkspaceSettings } =
      await import("@/server/workspaces")
    const workspace = await getOrCreateCurrentWorkspace(user.id)
    const settings = parseWorkspaceSettings(workspace.settings)

    const [updated] = await db
      .update(customShellWorkspaces)
      .set({
        settings: { ...settings, sidebarWidth: data.sidebarWidth },
        updatedAt: now(),
      })
      .where(
        and(
          eq(customShellWorkspaces.id, workspace.id),
          eq(customShellWorkspaces.userId, user.id)
        )
      )
      .returning({ id: customShellWorkspaces.id })

    if (!updated) {
      throw new Error("Workspace not found")
    }

    return data
  })

export function saveSidebarWidth(sidebarWidth: number) {
  return saveSidebarWidthFn({ data: { sidebarWidth } })
}
