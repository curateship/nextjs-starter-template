import { createServerFn } from "@tanstack/react-start"
import { and, eq } from "drizzle-orm"
import { z } from "zod"

import {
  DASHBOARD_ROWS_PER_PAGE_OPTIONS,
  MAX_MAINTENANCE_MESSAGE_LENGTH,
  SHELL_ROLES,
  type ShellConfig,
} from "@/lib/custom-shell"
import { MAX_SIDEBAR_WIDTH, MIN_SIDEBAR_WIDTH } from "@/lib/sidebar-width"
import { MAX_TOAST_SECONDS, MIN_TOAST_SECONDS } from "@/lib/toast-seconds"
import { db } from "@/server/db"
import { requireAppOrigin } from "@/server/origin"
import {
  customShellSettings,
  customShellWorkspaces,
  DEFAULT_SETTINGS_KEY,
} from "@/server/schema"
import {
  parseShellGlobals,
  pickShellGlobals,
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

/** Both sidebars are the same shape — the admin's own, and the members'. */
const shellSectionSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  entries: z.array(shellEntrySchema),
})

/**
 * Both header rows are the same shape — the admin's own, and the members'. The
 * client normalizes what it reads (normalizeTopRightNavigation), so a save only
 * ever carries the two-way union, never the old `{ id, visible }` rows.
 */
const shellTopRightItemSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("builtIn"),
    id: z.enum(["feedback", "theme", "notifications"]),
    visible: z.boolean(),
  }),
  z.object({
    type: z.literal("link"),
    id: z.string().min(1),
    label: z.string(),
    href: z.string(),
    icon: shellIconSchema,
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
  dividerColor: shellBackgroundSchema,
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
  toastSeconds: z
    .number()
    .int()
    .min(MIN_TOAST_SECONDS)
    .max(MAX_TOAST_SECONDS),
  // Per-workspace sidebar width. Always populated with a valid value by the
  // loader (workspace settings default it), so a plain required field is fine.
  sidebarWidth: z.number().int().min(MIN_SIDEBAR_WIDTH).max(MAX_SIDEBAR_WIDTH),
  adminRoute: z.string().catch(""),
  memberHomeRoute: z.string().catch(""),
  favicon: z.string(),
  topRightNavigation: z.array(shellTopRightItemSchema),
  memberTopRightNavigation: z.array(shellTopRightItemSchema),
  sections: z.array(shellSectionSchema),
  memberSections: z.array(shellSectionSchema),
  maintenance: z.object({
    enabled: z.boolean(),
    message: z.string().max(MAX_MAINTENANCE_MESSAGE_LENGTH),
  }),
  // Carried in the config for display only; the save below never writes it.
  sessionPolicy: z.object({
    maxAgeDays: z.number().int().min(0),
    idleMinutes: z.number().int().min(0),
  }),
  styling: shellStylingSchema,
})

export function getShellSettingsErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Shell settings request failed."
}

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
        .select({
          key: customShellSettings.key,
          settings: customShellSettings.settings,
        })
        .from(customShellSettings)
        .where(eq(customShellSettings.key, DEFAULT_SETTINGS_KEY))
        .limit(1)
        // Locked because the maintenance switch writes this same row (see
        // server/maintenance.ts); without it the two saves could each write
        // back what they read and one would lose its changes.
        .for("update")

      // The maintenance switch is only ever flipped by its own confirmed
      // action (lib/api/maintenance.ts). An admin whose settings page loaded
      // before somebody turned it on must not switch it back off by renaming
      // the app, so the switch keeps whatever the row already says; only its
      // message comes from this save. The session policy is kept whole for
      // the same reason — its one writer is lib/api/session-policy.ts.
      const existingGlobals = parseShellGlobals(existing?.settings)
      const globalSettings = {
        ...pickShellGlobals(data),
        maintenance: {
          enabled: existingGlobals.maintenance.enabled,
          message: data.maintenance.message,
        },
        sessionPolicy: existingGlobals.sessionPolicy,
      }

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
