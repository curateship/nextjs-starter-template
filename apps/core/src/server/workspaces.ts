import { and, asc, eq } from "drizzle-orm"

import { db, type CoreDb } from "@/server/db"
import {
  workspaces,
  type CoreWorkspace,
} from "@/server/schema"
import { now, uuid } from "@/server/security"
import { iconMeta, type IconKey } from "@/lib/core"

const DEFAULT_WORKSPACE_NAME = "My project"
const DEFAULT_WORKSPACE_ICON = "briefcaseBusiness"
export type WorkspaceSettings = {
  icon: IconKey
}

export async function getOrCreateCurrentWorkspace(
  userId: string,
  database: CoreDb = db
) {
  const current = await findCurrentWorkspace(userId, database)
  if (current) return current

  return database.transaction(async (tx) => {
    const [existingWorkspace] = await tx
      .select()
      .from(workspaces)
      .where(eq(workspaces.userId, userId))
      .orderBy(asc(workspaces.createdAt))
      .limit(1)

    if (existingWorkspace) {
      return setDefaultWorkspace(userId, existingWorkspace.id, tx)
    }

    const createdAt = now()
    const [workspace] = await tx
      .insert(workspaces)
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
  database: CoreDb = db
) {
  const rows = await database
    .select()
    .from(workspaces)
    .where(eq(workspaces.userId, userId))
    .orderBy(asc(workspaces.createdAt))

  const current =
    rows.find((workspace) => workspace.isDefault) ?? rows[0] ?? null

  return { workspaces: rows, currentWorkspaceId: current?.id ?? null }
}

export async function createUserWorkspace(
  userId: string,
  name: string,
  settings: Partial<WorkspaceSettings> = {},
  database: CoreDb = db
) {
  const trimmedName = name.trim()
  if (!trimmedName) {
    throw new Error("Workspace name is required")
  }

  return database.transaction(async (tx) => {
    const createdAt = now()
    const [workspace] = await tx
      .insert(workspaces)
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
  database: CoreDb = db
) {
  const trimmedName = data.name.trim()
  if (!trimmedName) {
    throw new Error("Workspace name is required")
  }

  const [workspace] = await database
    .update(workspaces)
    .set({
      name: trimmedName.slice(0, 255),
      settings: cleanWorkspaceSettings(data.settings),
      updatedAt: now(),
    })
    .where(and(eq(workspaces.id, workspaceId), eq(workspaces.userId, userId)))
    .returning()

  if (!workspace) {
    throw new Error("Workspace not found")
  }

  return workspace
}

export async function switchUserWorkspace(
  userId: string,
  workspaceId: string,
  database: CoreDb = db
) {
  return setDefaultWorkspace(userId, workspaceId, database)
}

export async function deleteUserWorkspace(
  userId: string,
  workspaceId: string,
  database: CoreDb = db
) {
  return database.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(workspaces)
      .where(eq(workspaces.userId, userId))
      .orderBy(asc(workspaces.createdAt))

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
      .delete(workspaces)
      .where(and(eq(workspaces.id, workspaceId), eq(workspaces.userId, userId)))
      .returning({ id: workspaces.id })

    if (!deleted) {
      throw new Error("Workspace not found")
    }

    return { workspaceId: deleted.id }
  })
}

async function findCurrentWorkspace(userId: string, database: CoreDb) {
  const [row] = await database
    .select()
    .from(workspaces)
    .where(
      and(
        eq(workspaces.userId, userId),
        eq(workspaces.isDefault, true)
      )
    )
    .limit(1)

  return row ?? null
}

async function setDefaultWorkspace(
  userId: string,
  workspaceId: string,
  database: Pick<CoreDb, "select" | "update">
) {
  const updatedAt = now()
  const [workspace] = await database
    .select()
    .from(workspaces)
    .where(and(eq(workspaces.id, workspaceId), eq(workspaces.userId, userId)))
    .limit(1)

  if (!workspace) {
    throw new Error("Workspace not found")
  }

  await database
    .update(workspaces)
    .set({ isDefault: false, updatedAt })
    .where(eq(workspaces.userId, userId))

  const [updated] = await database
    .update(workspaces)
    .set({ isDefault: true, updatedAt })
    .where(and(eq(workspaces.id, workspaceId), eq(workspaces.userId, userId)))
    .returning()

  if (!updated) {
    throw new Error("Workspace not found")
  }

  return updated
}

export function serializeWorkspace(
  row: CoreWorkspace,
  currentWorkspaceId: string | null
) {
  const settings = parseWorkspaceSettings(row.settings)
  return {
    id: row.id,
    name: row.name,
    icon: settings.icon,
    active: row.id === currentWorkspaceId,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  }
}

export function parseWorkspaceSettings(value: unknown): WorkspaceSettings {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const icon = (value as { icon?: unknown }).icon
    if (isWorkspaceIcon(icon)) {
      return { icon }
    }
  }

  return defaultWorkspaceSettings()
}

function cleanWorkspaceSettings(
  settings: Partial<WorkspaceSettings>
): WorkspaceSettings {
  return {
    icon: isWorkspaceIcon(settings.icon)
      ? settings.icon
      : DEFAULT_WORKSPACE_ICON,
  }
}

function defaultWorkspaceSettings(): WorkspaceSettings {
  return { icon: DEFAULT_WORKSPACE_ICON }
}

function isWorkspaceIcon(value: unknown): value is IconKey {
  return typeof value === "string" && value in iconMeta
}
