import { and, asc, eq } from "drizzle-orm"

import {
  createDefaultTopRightNavigation,
  iconMeta,
  type IconKey,
  type ShellSection,
  type ShellTopNavigationItem,
  type ShellTopRightNavigationItem,
} from "@/lib/ai-agents"
import { db, type AiAgentsDb } from "@/server/db"
import {
  aiAgentsWorkspaces,
  type AiAgentsWorkspace,
} from "@/server/schema"
import { now, uuid } from "@/server/security"

const DEFAULT_WORKSPACE_NAME = "My project"
const DEFAULT_WORKSPACE_ICON = "briefcaseBusiness"

export type WorkspaceSettings = {
  icon: IconKey
  favicon: string
  topNavigation: ShellTopNavigationItem[]
  topRightNavigation: ShellTopRightNavigationItem[]
  sections: ShellSection[]
}

export async function getOrCreateCurrentWorkspace(
  userId: string,
  database: AiAgentsDb = db
) {
  const current = await findCurrentWorkspace(userId, database)
  if (current) return current

  return database.transaction(async (tx) => {
    const [existingWorkspace] = await tx
      .select()
      .from(aiAgentsWorkspaces)
      .where(eq(aiAgentsWorkspaces.userId, userId))
      .orderBy(asc(aiAgentsWorkspaces.createdAt))
      .limit(1)

    if (existingWorkspace) {
      return setDefaultWorkspace(userId, existingWorkspace.id, tx)
    }

    const createdAt = now()
    const [workspace] = await tx
      .insert(aiAgentsWorkspaces)
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
  database: AiAgentsDb = db
) {
  const rows = await database
    .select()
    .from(aiAgentsWorkspaces)
    .where(eq(aiAgentsWorkspaces.userId, userId))
    .orderBy(asc(aiAgentsWorkspaces.createdAt))

  const current =
    rows.find((workspace) => workspace.isDefault) ?? rows[0] ?? null

  return { workspaces: rows, currentWorkspaceId: current?.id ?? null }
}

export async function createUserWorkspace(
  userId: string,
  name: string,
  settings: Partial<WorkspaceSettings> = {},
  database: AiAgentsDb = db
) {
  const trimmedName = name.trim()
  if (!trimmedName) {
    throw new Error("Workspace name is required")
  }

  return database.transaction(async (tx) => {
    const createdAt = now()
    const [workspace] = await tx
      .insert(aiAgentsWorkspaces)
      .values({
        id: uuid(),
        userId,
        name: trimmedName.slice(0, 255),
        settings: cleanWorkspaceSettings(settings),
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
  database: AiAgentsDb = db
) {
  const trimmedName = data.name.trim()
  if (!trimmedName) {
    throw new Error("Workspace name is required")
  }

  const [existing] = await database
    .select({ settings: aiAgentsWorkspaces.settings })
    .from(aiAgentsWorkspaces)
    .where(
      and(
        eq(aiAgentsWorkspaces.id, workspaceId),
        eq(aiAgentsWorkspaces.userId, userId)
      )
    )
    .limit(1)

  if (!existing) {
    throw new Error("Workspace not found")
  }

  const [workspace] = await database
    .update(aiAgentsWorkspaces)
    .set({
      name: trimmedName.slice(0, 255),
      settings: cleanWorkspaceSettings({
        ...parseWorkspaceSettings(existing.settings),
        ...data.settings,
      }),
      updatedAt: now(),
    })
    .where(
      and(
        eq(aiAgentsWorkspaces.id, workspaceId),
        eq(aiAgentsWorkspaces.userId, userId)
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
  database: AiAgentsDb = db
) {
  return database.transaction((tx) =>
    setDefaultWorkspace(userId, workspaceId, tx)
  )
}

export async function deleteUserWorkspace(
  userId: string,
  workspaceId: string,
  database: AiAgentsDb = db
) {
  return database.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(aiAgentsWorkspaces)
      .where(eq(aiAgentsWorkspaces.userId, userId))
      .orderBy(asc(aiAgentsWorkspaces.createdAt))

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
      .delete(aiAgentsWorkspaces)
      .where(
        and(
          eq(aiAgentsWorkspaces.id, workspaceId),
          eq(aiAgentsWorkspaces.userId, userId)
        )
      )
      .returning({ id: aiAgentsWorkspaces.id })

    if (!deleted) {
      throw new Error("Workspace not found")
    }

    return { workspaceId: deleted.id }
  })
}

async function findCurrentWorkspace(userId: string, database: AiAgentsDb) {
  const [row] = await database
    .select()
    .from(aiAgentsWorkspaces)
    .where(
      and(
        eq(aiAgentsWorkspaces.userId, userId),
        eq(aiAgentsWorkspaces.isDefault, true)
      )
    )
    .limit(1)

  return row ?? null
}

async function setDefaultWorkspace(
  userId: string,
  workspaceId: string,
  database: Pick<AiAgentsDb, "select" | "update">
) {
  const updatedAt = now()
  const [workspace] = await database
    .select()
    .from(aiAgentsWorkspaces)
    .where(
      and(
        eq(aiAgentsWorkspaces.id, workspaceId),
        eq(aiAgentsWorkspaces.userId, userId)
      )
    )
    .limit(1)

  if (!workspace) {
    throw new Error("Workspace not found")
  }

  await database
    .update(aiAgentsWorkspaces)
    .set({ isDefault: false, updatedAt })
    .where(eq(aiAgentsWorkspaces.userId, userId))

  const [updated] = await database
    .update(aiAgentsWorkspaces)
    .set({ isDefault: true, updatedAt })
    .where(
      and(
        eq(aiAgentsWorkspaces.id, workspaceId),
        eq(aiAgentsWorkspaces.userId, userId)
      )
    )
    .returning()

  if (!updated) {
    throw new Error("Workspace not found")
  }

  return updated
}

export function serializeWorkspace(
  row: AiAgentsWorkspace,
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

export function parseWorkspaceSettings(value: unknown): WorkspaceSettings {
  const fallback = defaultWorkspaceSettings()
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const settings = value as Partial<WorkspaceSettings>
    return {
      icon: isWorkspaceIcon(settings.icon) ? settings.icon : fallback.icon,
      favicon:
        typeof settings.favicon === "string"
          ? settings.favicon
          : fallback.favicon,
      topNavigation: Array.isArray(settings.topNavigation)
        ? settings.topNavigation
        : fallback.topNavigation,
      topRightNavigation: Array.isArray(settings.topRightNavigation)
        ? settings.topRightNavigation
        : fallback.topRightNavigation,
      sections: Array.isArray(settings.sections)
        ? settings.sections
        : fallback.sections,
    }
  }

  return fallback
}

function cleanWorkspaceSettings(
  settings: Partial<WorkspaceSettings>
): WorkspaceSettings {
  const fallback = defaultWorkspaceSettings()
  return {
    icon: isWorkspaceIcon(settings.icon)
      ? settings.icon
      : fallback.icon,
    favicon:
      typeof settings.favicon === "string" ? settings.favicon : fallback.favicon,
    topNavigation: Array.isArray(settings.topNavigation)
      ? settings.topNavigation
      : fallback.topNavigation,
    topRightNavigation: Array.isArray(settings.topRightNavigation)
      ? settings.topRightNavigation
      : fallback.topRightNavigation,
    sections: Array.isArray(settings.sections)
      ? settings.sections
      : fallback.sections,
  }
}

function defaultWorkspaceSettings(): WorkspaceSettings {
  return {
    icon: DEFAULT_WORKSPACE_ICON,
    favicon: "",
    topNavigation: [],
    topRightNavigation: createDefaultTopRightNavigation(),
    sections: createDefaultWorkspaceSections(),
  }
}

function createDefaultWorkspaceSections(): ShellSection[] {
  return [
    {
      id: "section-calling",
      title: "Calling",
      entries: [
        {
          type: "item",
          id: "item-agents",
          label: "Agents",
          href: "/admin/agents",
          icon: "bot",
          visible: true,
        },
        {
          type: "item",
          id: "item-contacts",
          label: "Contacts",
          href: "/admin/contacts",
          icon: "users",
          visible: true,
        },
        {
          type: "item",
          id: "item-campaigns",
          label: "Campaigns",
          href: "/admin/campaigns",
          icon: "megaphone",
          visible: true,
        },
        {
          type: "item",
          id: "item-calls",
          label: "Calls",
          href: "/admin/calls",
          icon: "phone",
          visible: true,
        },
      ],
    },
    {
      id: "section-automation",
      title: "Automation",
      entries: [
        {
          type: "item",
          id: "item-automation",
          label: "Automation",
          href: "/admin/automation",
          icon: "workflow",
          visible: true,
        },
      ],
    },
    {
      id: "section-platform-settings",
      title: "Platform Settings",
      entries: [
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
