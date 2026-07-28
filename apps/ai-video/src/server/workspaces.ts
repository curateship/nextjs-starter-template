import { and, asc, eq } from "drizzle-orm"
import { z } from "zod"

import {
  createDefaultBrandKitConfig,
  createDefaultStyling,
  createDefaultTopRightNavigation,
  iconMeta,
  normalizeBrandKit,
  normalizeStyling,
  type BrandKitConfig,
  type IconKey,
  type ShellSection,
  type ShellStyling,
  type ShellTopRightNavigationItem,
} from "@/lib/ai-video"
import {
  DEFAULT_DUCK_DB,
  DUCK_DB_MAX,
  DUCK_DB_MIN,
} from "@/lib/audio-ducking"
import {
  shellSectionSchema,
  shellTopRightNavigationItemSchema,
} from "@/lib/shell-config-schema"
import {
  clampSidebarWidth,
  DEFAULT_SIDEBAR_WIDTH,
} from "@/lib/sidebar-width"
import { voiceDefaultsSchema, type VoiceDefaults } from "@/lib/voice-settings"
import { db, type AiVideoDb } from "@/server/db"
import { aiVideoWorkspaces, type AiVideoWorkspace } from "@/server/schema"
import { now, uuid } from "@/server/security"

const DEFAULT_WORKSPACE_NAME = "My project"
const DEFAULT_WORKSPACE_ICON = "briefcaseBusiness"

export type WorkspaceSettings = {
  icon: IconKey
  favicon: string
  brandKit: BrandKitConfig
  topRightNavigation: ShellTopRightNavigationItem[]
  sections: ShellSection[]
  // Visual styling (spacing, card border, backgrounds), saved per-workspace.
  styling: ShellStyling
  // Draggable sidebar width in px, saved per-workspace.
  sidebarWidth: number
  // How far a ducked ("music") track drops under voice on export, in dB
  // (negative; 0 = off). Applied by the renderer.
  duckingDb: number
  // Saved ElevenLabs voiceover defaults; null until the user saves one.
  voiceDefaults: VoiceDefaults | null
}

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
    ? parseWorkspaceSettings(currentWorkspace.settings)
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
        ...parseWorkspaceSettings(existing.settings),
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
  const settings = parseWorkspaceSettings(row.settings)
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

/**
 * Read saved workspace settings one field at a time, matching how ai-agents
 * and analytic read theirs.
 *
 * Every field falls back on its own, so a row saved before a field existed —
 * or one whose styling predates a newly added sub-field — keeps everything
 * else it has. Adding a setting can no longer cost a workspace its sidebar.
 * This replaces an all-or-nothing strict parse that reset the whole workspace
 * to defaults whenever any single field was stale.
 *
 * Retired keys (`topNavigation`, `defaultRoute`) need no special handling now:
 * unknown keys are simply never read.
 *
 * Read path only — settings coming from the form are still validated strictly
 * by `shellConfigSchema` before anything is written.
 */
export function parseWorkspaceSettings(value: unknown): WorkspaceSettings {
  const fallback = defaultWorkspaceSettings()
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return fallback
  }
  const settings = value as Partial<WorkspaceSettings>

  const sections = z.array(shellSectionSchema).safeParse(settings.sections)
  const topRightNavigation = z
    .array(shellTopRightNavigationItemSchema)
    .safeParse(settings.topRightNavigation)
  const voiceDefaults = voiceDefaultsSchema
    .nullable()
    .safeParse(settings.voiceDefaults ?? null)

  return {
    icon: isWorkspaceIcon(settings.icon) ? settings.icon : fallback.icon,
    favicon:
      typeof settings.favicon === "string" ? settings.favicon : fallback.favicon,
    brandKit: normalizeBrandKit(settings.brandKit),
    topRightNavigation: topRightNavigation.success
      ? topRightNavigation.data
      : fallback.topRightNavigation,
    sections: sections.success ? sections.data : fallback.sections,
    styling: normalizeStyling(settings.styling),
    // Clamp + fall back to default for rows saved before this field existed.
    sidebarWidth:
      typeof settings.sidebarWidth === "number"
        ? clampSidebarWidth(settings.sidebarWidth)
        : fallback.sidebarWidth,
    duckingDb:
      typeof settings.duckingDb === "number" &&
      Number.isFinite(settings.duckingDb)
        ? Math.min(DUCK_DB_MAX, Math.max(DUCK_DB_MIN, settings.duckingDb))
        : fallback.duckingDb,
    voiceDefaults: voiceDefaults.success
      ? voiceDefaults.data
      : fallback.voiceDefaults,
  }
}

function defaultWorkspaceSettings(): WorkspaceSettings {
  return {
    icon: DEFAULT_WORKSPACE_ICON,
    favicon: "",
    brandKit: createDefaultBrandKitConfig(),
    topRightNavigation: createDefaultTopRightNavigation(),
    sections: createDefaultWorkspaceSections(),
    styling: createDefaultStyling(),
    sidebarWidth: DEFAULT_SIDEBAR_WIDTH,
    duckingDb: DEFAULT_DUCK_DB,
    voiceDefaults: null,
  }
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
          id: "item-ai-generations",
          label: "AI Generations",
          href: "/admin/ai-generations",
          icon: "sparkles",
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
          id: "item-automations",
          label: "Automations",
          href: "/admin/automations",
          icon: "workflow",
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
