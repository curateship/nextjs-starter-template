import { createServerFn } from "@tanstack/react-start"
import { and, eq } from "drizzle-orm"
import { z } from "zod"

import { createDefaultShellConfig, type ShellConfig } from "@/lib/ai-video"
import { API_USAGE_DEFAULT_COST_PER_CREDIT_USD } from "@/lib/api-usage-constants"
import {
  requireCanonicalShellGlobals,
  shellConfigSchema,
} from "@/lib/shell-config-schema"
import { MAX_SIDEBAR_WIDTH, MIN_SIDEBAR_WIDTH } from "@/lib/sidebar-width"
import { db } from "@/server/db"
import { mediaFileUrl } from "@/server/media-urls"
import { requireAppOrigin } from "@/server/origin"
import {
  aiVideoMedia,
  aiVideoSettings,
  aiVideoWorkspaces,
} from "@/server/schema"
import { now, requireAdminUser, requireUser } from "@/server/security"

const DEFAULT_SETTINGS_KEY = "default"

export function getShellSettingsErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Shell settings request failed."
}

const loadShellSettingsFn = createServerFn({ method: "GET" }).handler(
  async () => {
    const user = await requireUser()

    const { getDefaultApiUsageLimit } = await import("@/server/api-usage")
    const [[row], defaultApiUsageMonthlyCredits] = await Promise.all([
      db
        .select()
        .from(aiVideoSettings)
        .where(eq(aiVideoSettings.key, DEFAULT_SETTINGS_KEY))
        .limit(1),
      getDefaultApiUsageLimit(),
    ])

    const { getOrCreateCurrentWorkspace, parseWorkspaceSettingsForReset } =
      await import("@/server/workspaces")
    const workspace = await getOrCreateCurrentWorkspace(user.id)
    const { settings: workspaceSettings, error: workspaceSettingsError } =
      parseWorkspaceSettingsForReset(workspace.settings)
    const shellGlobals = row
      ? parseShellGlobals(row.settings)
      : pickShellGlobals(createDefaultShellConfig())
    const apiUsageCostPerCreditUsd =
      user.role === "admin"
        ? shellGlobals.apiUsageCostPerCreditUsd
        : API_USAGE_DEFAULT_COST_PER_CREDIT_USD

    return {
      settingsError: workspaceSettingsError,
      settings: {
        ...shellGlobals,
        apiUsageCostPerCreditUsd,
        workspaceName: workspace.name,
        defaultApiUsageMonthlyCredits,
        sidebarWidth: workspaceSettings.sidebarWidth,
        duckingDb: workspaceSettings.duckingDb,
        favicon: workspaceSettings.favicon,
        brandKit: workspaceSettings.brandKit,
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
    const { getOrCreateCurrentWorkspace, parseWorkspaceSettingsForReset } =
      await import("@/server/workspaces")
    const workspace = await getOrCreateCurrentWorkspace(user.id)
    const { settings: workspaceSettings } = parseWorkspaceSettingsForReset(
      workspace.settings
    )
    const workspaceName = data.workspaceName.trim()
    if (!workspaceName) {
      throw new Error("Workspace name is required")
    }
    const brandKit = await validateBrandKitLogo(user.id, data.brandKit)

    const globalSettings = pickShellGlobals(data)
    const { setDefaultApiUsageLimit } = await import("@/server/api-usage")
    await db.transaction(async (tx) => {
      await tx
        .update(aiVideoWorkspaces)
        .set({
          name: workspaceName.slice(0, 255),
          settings: {
            ...workspaceSettings,
            sidebarWidth: data.sidebarWidth,
            duckingDb: data.duckingDb,
            favicon: data.favicon,
            brandKit,
            topNavigation: data.topNavigation,
            topRightNavigation: data.topRightNavigation,
            sections: data.sections,
          },
          updatedAt,
        })
        .where(
          and(
            eq(aiVideoWorkspaces.id, workspace.id),
            eq(aiVideoWorkspaces.userId, user.id)
          )
        )

      const [existing] = await tx
        .select({ key: aiVideoSettings.key })
        .from(aiVideoSettings)
        .where(eq(aiVideoSettings.key, DEFAULT_SETTINGS_KEY))
        .limit(1)

      if (existing) {
        await tx
          .update(aiVideoSettings)
          .set({ settings: globalSettings, updatedAt })
          .where(eq(aiVideoSettings.key, DEFAULT_SETTINGS_KEY))
      } else {
        await tx.insert(aiVideoSettings).values({
          key: DEFAULT_SETTINGS_KEY,
          settings: globalSettings,
          createdAt: updatedAt,
          updatedAt,
        })
      }

      await setDefaultApiUsageLimit(data.defaultApiUsageMonthlyCredits, tx)
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
    const { getOrCreateCurrentWorkspace, parseWorkspaceSettingsForReset } =
      await import("@/server/workspaces")
    const workspace = await getOrCreateCurrentWorkspace(user.id)
    const { settings } = parseWorkspaceSettingsForReset(workspace.settings)

    const [updated] = await db
      .update(aiVideoWorkspaces)
      .set({
        settings: { ...settings, sidebarWidth: data.sidebarWidth },
        updatedAt: now(),
      })
      .where(
        and(
          eq(aiVideoWorkspaces.id, workspace.id),
          eq(aiVideoWorkspaces.userId, user.id)
        )
      )
      .returning({ id: aiVideoWorkspaces.id })

    if (!updated) {
      throw new Error("Workspace not found")
    }

    return data
  })

export function saveSidebarWidth(sidebarWidth: number) {
  return saveSidebarWidthFn({ data: { sidebarWidth } })
}

function parseShellGlobals(value: unknown) {
  return requireCanonicalShellGlobals(value)
}

function pickShellGlobals(settings: ShellConfig) {
  return {
    appName: settings.appName,
    workspaceName: settings.workspaceName,
    workspacePlan: settings.workspacePlan,
    apiUsageCostPerCreditUsd:
      settings.apiUsageCostPerCreditUsd ??
      API_USAGE_DEFAULT_COST_PER_CREDIT_USD,
    dashboardRowsPerPage: settings.dashboardRowsPerPage,
    mediaUploadMaxMb: settings.mediaUploadMaxMb,
  }
}

function brandKitWithClearedLogo(brandKit: ShellConfig["brandKit"]) {
  return {
    ...brandKit,
    logo: { mediaId: null, previewUrl: "" },
  }
}

async function validateBrandKitLogo(
  userId: string,
  brandKit: ShellConfig["brandKit"]
) {
  if (!brandKit.logo.mediaId) {
    return brandKitWithClearedLogo(brandKit)
  }

  const [logo] = await db
    .select({
      id: aiVideoMedia.id,
      fileType: aiVideoMedia.fileType,
      storagePath: aiVideoMedia.storagePath,
    })
    .from(aiVideoMedia)
    .where(
      and(
        eq(aiVideoMedia.id, brandKit.logo.mediaId),
        eq(aiVideoMedia.userId, userId)
      )
    )
    .limit(1)

  if (!logo) {
    throw new Error("Brand logo not found")
  }

  if (logo.fileType !== "image") {
    throw new Error("Brand logo must be an image from your media library")
  }

  return {
    ...brandKit,
    logo: {
      mediaId: logo.id,
      previewUrl: mediaFileUrl(logo.id),
    },
  }
}
