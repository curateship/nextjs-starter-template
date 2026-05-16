import { createServerFn } from "@tanstack/react-start"
import { eq } from "drizzle-orm"
import { z } from "zod"

import type { ShellConfig } from "@/lib/custom-shell"
import { db } from "@/server/db"
import { requireAppOrigin } from "@/server/origin"
import { customShellSettings } from "@/server/schema"
import { findCurrentUser, now } from "@/server/security"

const DEFAULT_SETTINGS_KEY = "default"

const iconSchema = z.enum([
  "layoutDashboard",
  "bookOpen",
  "package",
  "folderOpen",
  "mail",
  "calendar",
  "tag",
  "image",
  "settings",
  "barChart3",
  "clipboardCheck",
  "creditCard",
  "heartPulse",
  "globe",
  "users",
  "workflow",
  "appWindow",
  "briefcaseBusiness",
  "palette",
  "type",
  "panelsTopLeft",
  "library",
  "slidersHorizontal",
  "shieldCheck",
  "sparkles",
  "messageSquarePlus",
])

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
  topNavigation: z.array(
    z.object({
      id: z.string().min(1),
      label: z.string(),
      href: z.string(),
      icon: iconSchema.optional(),
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
    await requireUser()

    const [row] = await db
      .select()
      .from(customShellSettings)
      .where(eq(customShellSettings.key, DEFAULT_SETTINGS_KEY))
      .limit(1)

    return { settings: (row?.settings as ShellConfig | undefined) ?? null }
  }
)

const saveShellSettingsFn = createServerFn({ method: "POST" })
  .inputValidator(shellConfigSchema)
  .handler(async ({ data }) => {
    requireAppOrigin()
    await requireUser()

    const updatedAt = now()
    const [existing] = await db
      .select({ key: customShellSettings.key })
      .from(customShellSettings)
      .where(eq(customShellSettings.key, DEFAULT_SETTINGS_KEY))
      .limit(1)

    if (existing) {
      await db
        .update(customShellSettings)
        .set({ settings: data, updatedAt })
        .where(eq(customShellSettings.key, DEFAULT_SETTINGS_KEY))
    } else {
      await db.insert(customShellSettings).values({
        key: DEFAULT_SETTINGS_KEY,
        settings: data,
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
    throw new Error("Missing Custom Shell session")
  }
  return user
}
