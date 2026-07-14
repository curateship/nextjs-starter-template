import { and, asc, eq } from "drizzle-orm"
import { z } from "zod"

import {
  createDefaultBrandKitConfig,
  createDefaultTopRightNavigation,
  DEFAULT_ADMIN_ROUTE,
  iconMeta,
  type BrandKitConfig,
  type IconKey,
  type ShellSection,
  type ShellTopRightNavigationItem,
} from "@/lib/ai-video"
import {
  DEFAULT_DUCK_DB,
  DUCK_DB_MAX,
  DUCK_DB_MIN,
} from "@/lib/audio-ducking"
import {
  brandKitConfigSchema,
  shellSectionSchema,
  shellTopRightNavigationItemSchema,
} from "@/lib/shell-config-schema"
import {
  DEFAULT_SIDEBAR_WIDTH,
  MAX_SIDEBAR_WIDTH,
  MIN_SIDEBAR_WIDTH,
} from "@/lib/sidebar-width"
import { voiceDefaultsSchema, type VoiceDefaults } from "@/lib/voice-settings"
import { db, type AiVideoDb } from "@/server/db"
import { aiVideoWorkspaces, type AiVideoWorkspace } from "@/server/schema"
import { now, uuid } from "@/server/security"

const DEFAULT_WORKSPACE_NAME = "My project"
const DEFAULT_WORKSPACE_ICON = "briefcaseBusiness"
const INVALID_WORKSPACE_SETTINGS_MESSAGE =
  "Saved workspace settings are invalid. Reset them with the current settings form."

export type WorkspaceSettings = {
  icon: IconKey
  favicon: string
  brandKit: BrandKitConfig
  topRightNavigation: ShellTopRightNavigationItem[]
  sections: ShellSection[]
  // Route the app opens to when a user lands on the app root ("/" = home).
  defaultRoute: string
  // Draggable sidebar width in px, saved per-workspace.
  sidebarWidth: number
  // How far a ducked ("music") track drops under voice on export, in dB
  // (negative; 0 = off). Applied by the renderer.
  duckingDb: number
  // Saved ElevenLabs voiceover defaults; null until the user saves one.
  voiceDefaults: VoiceDefaults | null
}

const workspaceSettingsSchema = z
  .object({
    icon: z.custom<IconKey>(isWorkspaceIcon, {
      message: "Workspace icon is invalid",
    }),
    favicon: z.string(),
    brandKit: brandKitConfigSchema,
    topRightNavigation: z.array(shellTopRightNavigationItemSchema),
    sections: z.array(shellSectionSchema),
    // Default fills rows saved before the landing route was configurable.
    defaultRoute: z.string().min(1).max(2048).default(DEFAULT_ADMIN_ROUTE),
    // Default fills rows saved before this field existed.
    sidebarWidth: z
      .number()
      .int()
      .min(MIN_SIDEBAR_WIDTH)
      .max(MAX_SIDEBAR_WIDTH)
      .default(DEFAULT_SIDEBAR_WIDTH),
    // Default fills rows saved before ducking existed.
    duckingDb: z
      .number()
      .min(DUCK_DB_MIN)
      .max(DUCK_DB_MAX)
      .default(DEFAULT_DUCK_DB),
    // Default fills rows saved before voice defaults existed.
    voiceDefaults: voiceDefaultsSchema.nullable().default(null),
  })
  .strict()

export async function getOrCreateCurrentWorkspace(
  userId: string,
  database: AiVideoDb = db
) {
  const current = await findCurrentWorkspace(userId, database)
  if (current) return current

  return database.transaction(async (tx) => {
    const [existingWorkspace] = await tx
      .select()
      .from(aiVideoWorkspaces)
      .where(eq(aiVideoWorkspaces.userId, userId))
      .orderBy(asc(aiVideoWorkspaces.createdAt))
      .limit(1)

    if (existingWorkspace) {
      return setDefaultWorkspace(userId, existingWorkspace.id, tx)
    }

    const createdAt = now()
    const [workspace] = await tx
      .insert(aiVideoWorkspaces)
      .values({
        id: uuid(),
        userId,
        name: DEFAULT_WORKSPACE_NAME,
        settings: defaultWorkspaceSettings(),
        isDefault: true,
        createdAt,
        updatedAt: createdAt,
      })
      .returning()

    if (!workspace) {
      throw new Error("Workspace was not created")
    }

    return workspace
  })
}

export async function listUserWorkspaces(
  userId: string,
  database: AiVideoDb = db
) {
  const rows = await database
    .select()
    .from(aiVideoWorkspaces)
    .where(eq(aiVideoWorkspaces.userId, userId))
    .orderBy(asc(aiVideoWorkspaces.createdAt))

  const current =
    rows.find((workspace) => workspace.isDefault) ?? rows[0] ?? null

  return { workspaces: rows, currentWorkspaceId: current?.id ?? null }
}

export async function getCurrentWorkspaceBrandKit(
  userId: string,
  database: AiVideoDb = db
) {
  const workspace = await getOrCreateCurrentWorkspace(userId, database)
  return parseWorkspaceSettings(workspace.settings).brandKit
}

export async function getCurrentWorkspaceDuckingDb(
  userId: string,
  database: AiVideoDb = db
) {
  const workspace = await getOrCreateCurrentWorkspace(userId, database)
  return parseWorkspaceSettings(workspace.settings).duckingDb
}

export async function createUserWorkspace(
  userId: string,
  name: string,
  settings: Partial<WorkspaceSettings> = {},
  database: AiVideoDb = db
) {
  const trimmedName = name.trim()
  if (!trimmedName) {
    throw new Error("Workspace name is required")
  }

  const currentWorkspace = await findCurrentWorkspace(userId, database)
  const baseSettings = currentWorkspace
    ? parseWorkspaceSettingsForReset(currentWorkspace.settings).settings
    : defaultWorkspaceSettings()

  return database.transaction(async (tx) => {
    const createdAt = now()
    const [workspace] = await tx
      .insert(aiVideoWorkspaces)
      .values({
        id: uuid(),
        userId,
        name: trimmedName.slice(0, 255),
        settings: parseWorkspaceSettings({ ...baseSettings, ...settings }),
        isDefault: false,
        createdAt,
        updatedAt: createdAt,
      })
      .returning()

    if (!workspace) {
      throw new Error("Workspace was not created")
    }

    return setDefaultWorkspace(userId, workspace.id, tx)
  })
}

export async function updateUserWorkspace(
  userId: string,
  workspaceId: string,
  data: { name: string; settings: Partial<WorkspaceSettings> },
  database: AiVideoDb = db
) {
  const trimmedName = data.name.trim()
  if (!trimmedName) {
    throw new Error("Workspace name is required")
  }

  const [existing] = await database
    .select({ settings: aiVideoWorkspaces.settings })
    .from(aiVideoWorkspaces)
    .where(
      and(
        eq(aiVideoWorkspaces.id, workspaceId),
        eq(aiVideoWorkspaces.userId, userId)
      )
    )
    .limit(1)

  if (!existing) {
    throw new Error("Workspace not found")
  }

  const [workspace] = await database
    .update(aiVideoWorkspaces)
    .set({
      name: trimmedName.slice(0, 255),
      settings: parseWorkspaceSettings({
        ...parseWorkspaceSettingsForReset(existing.settings).settings,
        ...data.settings,
      }),
      updatedAt: now(),
    })
    .where(
      and(
        eq(aiVideoWorkspaces.id, workspaceId),
        eq(aiVideoWorkspaces.userId, userId)
      )
    )
    .returning()

  if (!workspace) {
    throw new Error("Workspace not found")
  }

  return workspace
}

export async function switchUserWorkspace(
  userId: string,
  workspaceId: string,
  database: AiVideoDb = db
) {
  return database.transaction((tx) =>
    setDefaultWorkspace(userId, workspaceId, tx)
  )
}

export async function deleteUserWorkspace(
  userId: string,
  workspaceId: string,
  database: AiVideoDb = db
) {
  return database.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(aiVideoWorkspaces)
      .where(eq(aiVideoWorkspaces.userId, userId))
      .orderBy(asc(aiVideoWorkspaces.createdAt))

    const workspace = rows.find((row) => row.id === workspaceId)
    if (!workspace) {
      throw new Error("Workspace not found")
    }

    if (rows.length <= 1) {
      throw new Error("At least one workspace is required")
    }

    const fallback = rows.find((row) => row.id !== workspaceId)
    if (!fallback) {
      throw new Error("At least one workspace is required")
    }

    if (workspace.isDefault) {
      await setDefaultWorkspace(userId, fallback.id, tx)
    }

    const [deleted] = await tx
      .delete(aiVideoWorkspaces)
      .where(
        and(
          eq(aiVideoWorkspaces.id, workspaceId),
          eq(aiVideoWorkspaces.userId, userId)
        )
      )
      .returning({ id: aiVideoWorkspaces.id })

    if (!deleted) {
      throw new Error("Workspace not found")
    }

    return { workspaceId: deleted.id }
  })
}

async function findCurrentWorkspace(userId: string, database: AiVideoDb) {
  const [row] = await database
    .select()
    .from(aiVideoWorkspaces)
    .where(
      and(
        eq(aiVideoWorkspaces.userId, userId),
        eq(aiVideoWorkspaces.isDefault, true)
      )
    )
    .limit(1)

  return row ?? null
}

async function setDefaultWorkspace(
  userId: string,
  workspaceId: string,
  database: Pick<AiVideoDb, "select" | "update">
) {
  const updatedAt = now()
  const [workspace] = await database
    .select()
    .from(aiVideoWorkspaces)
    .where(
      and(
        eq(aiVideoWorkspaces.id, workspaceId),
        eq(aiVideoWorkspaces.userId, userId)
      )
    )
    .limit(1)

  if (!workspace) {
    throw new Error("Workspace not found")
  }

  await database
    .update(aiVideoWorkspaces)
    .set({ isDefault: false, updatedAt })
    .where(eq(aiVideoWorkspaces.userId, userId))

  const [updated] = await database
    .update(aiVideoWorkspaces)
    .set({ isDefault: true, updatedAt })
    .where(
      and(
        eq(aiVideoWorkspaces.id, workspaceId),
        eq(aiVideoWorkspaces.userId, userId)
      )
    )
    .returning()

  if (!updated) {
    throw new Error("Workspace not found")
  }

  return updated
}

export function serializeWorkspace(
  row: AiVideoWorkspace,
  currentWorkspaceId: string | null
) {
  const settings = parseWorkspaceSettingsForReset(row.settings).settings
  return {
    id: row.id,
    name: row.name,
    icon: settings.icon,
    favicon: settings.favicon,
    active: row.id === currentWorkspaceId,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  }
}

export function parseWorkspaceSettings(value: unknown): WorkspaceSettings {
  const parsed = workspaceSettingsSchema.safeParse(stripLegacySettings(value))
  if (!parsed.success) {
    throw new Error(INVALID_WORKSPACE_SETTINGS_MESSAGE)
  }

  return parsed.data
}

// Removes the retired `topNavigation` key from persisted workspace settings.
//
// Why this exists: the settings schema is `.strict()`, so a row saved while
// `topNavigation` was still a field would otherwise fail to parse and reset the
// workspace to default settings on load. This repo's migrations are applied by
// hand out-of-band, so a strict reject would break every existing workspace in
// the window between deploying this code and running that cleanup.
//
// Narrow and temporary: it strips only this one named key, and every settings
// save rewrites the row without it. Delete once no workspace row still carries
// `topNavigation`.
function stripLegacySettings(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value
  }
  if (!("topNavigation" in value)) {
    return value
  }
  const rest = { ...(value as Record<string, unknown>) }
  delete rest.topNavigation
  return rest
}

export function parseWorkspaceSettingsForReset(value: unknown): {
  settings: WorkspaceSettings
  error: string | null
} {
  try {
    return {
      settings: parseWorkspaceSettings(value),
      error: null,
    }
  } catch (error) {
    return {
      settings: defaultWorkspaceSettings(),
      error:
        error instanceof Error
          ? error.message
          : INVALID_WORKSPACE_SETTINGS_MESSAGE,
    }
  }
}

function defaultWorkspaceSettings(): WorkspaceSettings {
  return parseWorkspaceSettings({
    icon: DEFAULT_WORKSPACE_ICON,
    favicon: "",
    brandKit: createDefaultBrandKitConfig(),
    topRightNavigation: createDefaultTopRightNavigation(),
    sections: createDefaultWorkspaceSections(),
  })
}

function createDefaultWorkspaceSections(): ShellSection[] {
  return [
    {
      id: "section-platform-settings",
      title: "Platform Settings",
      entries: [
        {
          type: "item",
          id: "item-carousels",
          label: "Carousels",
          href: "/admin/carousels",
          icon: "panelsTopLeft",
          visible: true,
        },
        {
          type: "item",
          id: "item-first-frame",
          label: "First Frame",
          href: "/admin/first-frame",
          icon: "image",
          visible: true,
        },
        {
          type: "item",
          id: "item-export",
          label: "Export",
          href: "/admin/export",
          icon: "download",
          visible: true,
        },
        {
          type: "item",
          id: "item-api-usage",
          label: "API Usage",
          href: "/admin/api-usage",
          icon: "barChart3",
          visible: true,
        },
        {
          type: "item",
          id: "item-settings",
          label: "Settings",
          href: "/admin/settings",
          icon: "settings",
          visible: true,
        },
      ],
    },
  ]
}

function isWorkspaceIcon(value: unknown): value is IconKey {
  return typeof value === "string" && value in iconMeta
}
