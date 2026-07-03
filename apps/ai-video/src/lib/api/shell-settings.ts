import { createServerFn } from "@tanstack/react-start"
import { and, eq } from "drizzle-orm"
import { z } from "zod"

import {
  BRAND_KIT_WATERMARK_POSITIONS,
  createDefaultShellConfig,
  DASHBOARD_ROWS_PER_PAGE_OPTIONS,
  MEDIA_UPLOAD_MAX_MB_LIMIT,
  type ShellConfig,
} from "@/lib/ai-video"
import {
  API_USAGE_LIMIT_MAX,
  API_USAGE_LIMIT_MIN,
} from "@/lib/api-usage-constants"
import { TEXT_FONT_IDS } from "@/lib/text-fonts"
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
const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

const shellIconSchema = z.string().trim().min(1).max(2048)
const brandColorSchema = z.string().regex(HEX_COLOR)
const brandKitSchema = z.object({
  colors: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(40),
        value: brandColorSchema,
      })
    )
    .max(20),
  fonts: z.object({
    heading: z.enum(TEXT_FONT_IDS),
    body: z.enum(TEXT_FONT_IDS),
    caption: z.enum(TEXT_FONT_IDS),
  }),
  captionStyle: z.object({
    fontId: z.enum(TEXT_FONT_IDS),
    fontSize: z.number().int().min(8).max(240),
    color: brandColorSchema,
    highlightColor: brandColorSchema.nullable(),
  }),
  logo: z.object({
    mediaId: z.string().min(1).max(36).nullable(),
    previewUrl: z.string().max(2048),
  }),
  watermark: z.object({
    enabled: z.boolean(),
    position: z.enum(BRAND_KIT_WATERMARK_POSITIONS),
    widthPercent: z.number().int().min(1).max(100),
    opacity: z.number().int().min(0).max(100),
  }),
  ctaPhrases: z
    .array(z.string().max(180))
    .max(20)
    .transform((phrases) =>
      phrases
        .map((phrase) => phrase.trim())
        .filter(Boolean)
        .slice(0, 20)
    ),
  exportNamingPattern: z.string().trim().min(1).max(120),
})

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

const shellConfigSchema = z.object({
  appName: z.string(),
  workspaceName: z.string(),
  workspacePlan: z.string(),
  defaultApiUsageMonthlyCredits: z
    .number()
    .int()
    .min(API_USAGE_LIMIT_MIN)
    .max(API_USAGE_LIMIT_MAX),
  dashboardRowsPerPage: z
    .number()
    .int()
    .refine((value) =>
      DASHBOARD_ROWS_PER_PAGE_OPTIONS.includes(
        value as (typeof DASHBOARD_ROWS_PER_PAGE_OPTIONS)[number]
      )
    ),
  mediaUploadMaxMb: z.number().int().min(1).max(MEDIA_UPLOAD_MAX_MB_LIMIT),
  favicon: z.string(),
  brandKit: brandKitSchema,
  topNavigation: z.array(
    z.object({
      id: z.string().min(1),
      label: z.string(),
      href: z.string(),
      icon: shellIconSchema.optional(),
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

    const { getOrCreateCurrentWorkspace, parseWorkspaceSettings } =
      await import("@/server/workspaces")
    const workspace = await getOrCreateCurrentWorkspace(user.id)
    const workspaceSettings = parseWorkspaceSettings(workspace.settings)
    const shellGlobals = parseShellGlobals(row?.settings)

    return {
      settings: {
        ...shellGlobals,
        workspaceName: workspace.name,
        defaultApiUsageMonthlyCredits,
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
    const { getOrCreateCurrentWorkspace, parseWorkspaceSettings } =
      await import("@/server/workspaces")
    const workspace = await getOrCreateCurrentWorkspace(user.id)
    const workspaceSettings = parseWorkspaceSettings(workspace.settings)
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
    mediaUploadMaxMb:
      typeof settings.mediaUploadMaxMb === "number" &&
      Number.isInteger(settings.mediaUploadMaxMb) &&
      settings.mediaUploadMaxMb >= 1 &&
      settings.mediaUploadMaxMb <= MEDIA_UPLOAD_MAX_MB_LIMIT
        ? settings.mediaUploadMaxMb
        : fallback.mediaUploadMaxMb,
  }
}

function pickShellGlobals(settings: ShellConfig) {
  return {
    appName: settings.appName,
    workspaceName: settings.workspaceName,
    workspacePlan: settings.workspacePlan,
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
    return brandKitWithClearedLogo(brandKit)
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
