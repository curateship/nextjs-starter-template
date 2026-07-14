import { z } from "zod"

import {
  BRAND_KIT_WATERMARK_POSITIONS,
  DASHBOARD_ROWS_PER_PAGE_OPTIONS,
  MEDIA_UPLOAD_MAX_MB_LIMIT,
  type ShellConfig,
} from "@/lib/ai-video"
import {
  API_USAGE_LIMIT_MAX,
  API_USAGE_LIMIT_MIN,
} from "@/lib/api-usage-constants"
import { DUCK_DB_MAX, DUCK_DB_MIN } from "@/lib/audio-ducking"
import { MAX_SIDEBAR_WIDTH, MIN_SIDEBAR_WIDTH } from "@/lib/sidebar-width"
import { TEXT_FONT_IDS } from "./text-fonts.ts"

const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/
const shellIconSchema = z.string().min(1).max(2048)
const brandColorSchema = z.string().regex(HEX_COLOR)

export const brandKitConfigSchema = z
  .object({
    colors: z
      .array(
        z
          .object({
            name: z.string().min(1).max(40),
            value: brandColorSchema,
          })
          .strict()
      )
      .max(20),
    fonts: z
      .object({
        heading: z.enum(TEXT_FONT_IDS),
        body: z.enum(TEXT_FONT_IDS),
        caption: z.enum(TEXT_FONT_IDS),
      })
      .strict(),
    captionStyle: z
      .object({
        fontId: z.enum(TEXT_FONT_IDS),
        fontSize: z.number().int().min(8).max(240),
        color: brandColorSchema,
        highlightColor: brandColorSchema.nullable(),
      })
      .strict(),
    logo: z
      .object({
        mediaId: z.string().min(1).max(36).nullable(),
        previewUrl: z.string().max(2048),
      })
      .strict(),
    watermark: z
      .object({
        enabled: z.boolean(),
        position: z.enum(BRAND_KIT_WATERMARK_POSITIONS),
        widthPercent: z.number().int().min(1).max(100),
        opacity: z.number().int().min(0).max(100),
      })
      .strict(),
    endCard: z
      .object({
        enabled: z.boolean(),
        durationSeconds: z.number().int().min(2).max(5),
        backgroundColor: brandColorSchema,
        ctaText: z.string().max(180),
      })
      .strict(),
    ctaPhrases: z.array(z.string().max(180)).max(20),
    exportNamingPattern: z.string().min(1).max(120),
  })
  .strict()

const shellChildItemSchema = z
  .object({
    id: z.string().min(1),
    label: z.string(),
    href: z.string(),
    icon: shellIconSchema.optional(),
  })
  .strict()

const shellEntrySchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("item"),
      id: z.string().min(1),
      label: z.string(),
      href: z.string(),
      icon: shellIconSchema,
      visible: z.boolean(),
      children: z.array(shellChildItemSchema).optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("divider"),
      id: z.string().min(1),
      label: z.string(),
    })
    .strict(),
])

export const shellTopRightNavigationItemSchema = z
  .object({
    id: z.enum(["feedback", "theme", "notifications"]),
    visible: z.boolean(),
  })
  .strict()

export const shellSectionSchema = z
  .object({
    id: z.string().min(1),
    title: z.string(),
    entries: z.array(shellEntrySchema),
  })
  .strict()

export const shellGlobalsSchema = z
  .object({
    appName: z.string(),
    workspaceName: z.string(),
    workspacePlan: z.string(),
    apiUsageCostPerCreditUsd: z
      .number()
      .min(0)
      .refine(Number.isFinite, "Estimated cost per credit must be a number"),
    dashboardRowsPerPage: z
      .number()
      .int()
      .refine((value) =>
        DASHBOARD_ROWS_PER_PAGE_OPTIONS.includes(
          value as (typeof DASHBOARD_ROWS_PER_PAGE_OPTIONS)[number]
        )
      ),
    mediaUploadMaxMb: z.number().int().min(1).max(MEDIA_UPLOAD_MAX_MB_LIMIT),
  })
  .strict()

export const shellConfigSchema = shellGlobalsSchema
  .extend({
    defaultApiUsageMonthlyCredits: z
      .number()
      .int()
      .min(API_USAGE_LIMIT_MIN)
      .max(API_USAGE_LIMIT_MAX),
    // Per-workspace sidebar width. Always populated with a valid value by the
    // loader (workspace settings default it), so a plain required field is fine.
    sidebarWidth: z
      .number()
      .int()
      .min(MIN_SIDEBAR_WIDTH)
      .max(MAX_SIDEBAR_WIDTH),
    // Per-workspace "duck under voice" amount in dB; loader always populates it.
    duckingDb: z.number().min(DUCK_DB_MIN).max(DUCK_DB_MAX),
    // Route the app opens to on the app root; loader always populates it.
    defaultRoute: z.string().min(1).max(2048),
    favicon: z.string(),
    brandKit: brandKitConfigSchema,
    topRightNavigation: z.array(shellTopRightNavigationItemSchema),
    sections: z.array(shellSectionSchema),
  })
  .strict()

export function requireCanonicalShellConfig(value: unknown): ShellConfig {
  const parsed = shellConfigSchema.safeParse(value)
  if (!parsed.success) {
    throw new Error(
      "Saved shell settings are invalid. Reset them with the current settings form."
    )
  }
  return parsed.data
}

export function requireCanonicalShellGlobals(value: unknown) {
  const parsed = shellGlobalsSchema.safeParse(value)
  if (!parsed.success) {
    throw new Error(
      "Saved global shell settings are invalid. Reset them with the current settings form."
    )
  }
  return parsed.data
}
