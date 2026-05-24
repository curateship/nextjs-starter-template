import { createServerFn } from "@tanstack/react-start"
import { and, eq } from "drizzle-orm"
import { z } from "zod"

import {
  createDefaultShellConfig,
  iconMeta,
  type IconKey,
  type ShellConfig,
} from "@/lib/core"
import { db } from "@/server/db"
import { requireAppOrigin } from "@/server/origin"
import { settings, workspaces } from "@/server/schema"
import { findCurrentUser, now } from "@/server/security"

const DEFAULT_SETTINGS_KEY = "default"

const iconSchema = z.custom<IconKey>(
  (value) => typeof value === "string" && value in iconMeta,
  { message: "Invalid icon." }
)

const shellChildItemSchema = z.object({
  id: z.string().min(1),
  label: z.string(),
  href: z.string(),
  icon: iconSchema.optional(),
})

const shellEntrySchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("item"),
    id: z.string().min(1),
    label: z.string(),
    href: z.string(),
    icon: iconSchema,
    visible: z.boolean(),
    children: z.array(shellChildItemSchema).optional(),
  }),
  z.object({
    type: z.literal("divider"),
    id: z.string().min(1),
    label: z.string(),
  }),
])

const shellConfigSchema = z.object({
  appName: z.string(),
  workspaceName: z.string(),
  workspacePlan: z.string(),
  favicon: z.string(),
  topNavigation: z.array(
    z.object({
      id: z.string().min(1),
      label: z.string(),
      href: z.string(),
      icon: iconSchema.optional(),
      visible: z.boolean(),
    })
  ),
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
})

export function getShellSettingsErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Shell settings request failed."
}

const loadShellSettingsFn = createServerFn({ method: "GET" }).handler(
  async () => {
    const user = await requireUser()

    const [row] = await db
      .select()
      .from(settings)
      .where(eq(settings.key, DEFAULT_SETTINGS_KEY))
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
        topNavigation: workspaceSettings.topNavigation,
        topRightNavigation: workspaceSettings.topRightNavigation,
        sections: workspaceSettings.sections,
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

    await db
      .update(workspaces)
      .set({
        name: workspaceName.slice(0, 255),
        settings: {
          ...workspaceSettings,
          favicon: data.favicon,
          topNavigation: data.topNavigation,
          topRightNavigation: data.topRightNavigation,
          sections: data.sections,
        },
        updatedAt,
      })
      .where(
        and(eq(workspaces.id, workspace.id), eq(workspaces.userId, user.id))
      )

    const [existing] = await db
      .select({ key: settings.key })
      .from(settings)
      .where(eq(settings.key, DEFAULT_SETTINGS_KEY))
      .limit(1)

    const globalSettings = pickShellGlobals(data)
    if (existing) {
      await db
        .update(settings)
        .set({ settings: globalSettings, updatedAt })
        .where(eq(settings.key, DEFAULT_SETTINGS_KEY))
    } else {
      await db.insert(settings).values({
        key: DEFAULT_SETTINGS_KEY,
        settings: globalSettings,
        createdAt: updatedAt,
        updatedAt,
      })
    }

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
    throw new Error("Missing Core session")
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
  }
}

function pickShellGlobals(settings: ShellConfig) {
  return {
    appName: settings.appName,
    workspaceName: settings.workspaceName,
    workspacePlan: settings.workspacePlan,
  }
}
