import { and, asc, eq } from "drizzle-orm"

import { db, type CoreDb } from "@/server/db"
import {
  workspaces,
  type CoreWorkspace,
} from "@/server/schema"
import { now, uuid } from "@/server/security"
import {
  clampSidebarWidth,
  DEFAULT_SIDEBAR_WIDTH,
} from "@/lib/sidebar-width"
import {
  createDefaultTopRightNavigation,
  iconMeta,
  type IconKey,
  type ShellChildItem,
  type ShellSection,
  type ShellTopNavigationItem,
  type ShellTopRightNavigationItem,
} from "@/lib/core"

const DEFAULT_WORKSPACE_NAME = "My project"
const DEFAULT_WORKSPACE_ICON = "briefcaseBusiness"
const MEDIA_UNUSED_CHILD = {
  id: "media-unused",
  label: "Unused",
  href: "/admin/media/unused",
  icon: "image",
} satisfies ShellChildItem
export type WorkspaceSettings = {
  icon: IconKey
  // Draggable sidebar width in px, saved per-workspace.
  sidebarWidth: number
  favicon: string
  topNavigation: ShellTopNavigationItem[]
  topRightNavigation: ShellTopRightNavigationItem[]
  sections: ShellSection[]
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

  const [existing] = await database
    .select({ settings: workspaces.settings })
    .from(workspaces)
    .where(and(eq(workspaces.id, workspaceId), eq(workspaces.userId, userId)))
    .limit(1)

  if (!existing) {
    throw new Error("Workspace not found")
  }

  const [workspace] = await database
    .update(workspaces)
    .set({
      name: trimmedName.slice(0, 255),
      settings: cleanWorkspaceSettings({
        ...parseWorkspaceSettings(existing.settings),
        ...data.settings,
      }),
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
      // Default fills rows saved before this field existed; clamp keeps it valid.
      sidebarWidth:
        typeof settings.sidebarWidth === "number"
          ? clampSidebarWidth(settings.sidebarWidth)
          : fallback.sidebarWidth,
      favicon: typeof settings.favicon === "string" ? settings.favicon : fallback.favicon,
      topNavigation: Array.isArray(settings.topNavigation)
        ? settings.topNavigation
        : fallback.topNavigation,
      topRightNavigation: Array.isArray(settings.topRightNavigation)
        ? settings.topRightNavigation
        : fallback.topRightNavigation,
      sections: normalizeWorkspaceSections(
        Array.isArray(settings.sections)
          ? settings.sections
          : fallback.sections
      ),
    }
  }

  return fallback
}

function cleanWorkspaceSettings(
  settings: Partial<WorkspaceSettings>
): WorkspaceSettings {
  const fallback = defaultWorkspaceSettings()
  const cleaned: WorkspaceSettings = {
    icon: isWorkspaceIcon(settings.icon)
      ? settings.icon
      : DEFAULT_WORKSPACE_ICON,
    sidebarWidth:
      typeof settings.sidebarWidth === "number"
        ? clampSidebarWidth(settings.sidebarWidth)
        : fallback.sidebarWidth,
    favicon: typeof settings.favicon === "string" ? settings.favicon : fallback.favicon,
    topNavigation: Array.isArray(settings.topNavigation)
      ? settings.topNavigation
      : fallback.topNavigation,
    topRightNavigation: Array.isArray(settings.topRightNavigation)
      ? settings.topRightNavigation
      : fallback.topRightNavigation,
    sections: normalizeWorkspaceSections(
      Array.isArray(settings.sections) ? settings.sections : fallback.sections
    ),
  }

  return cleaned
}

function defaultWorkspaceSettings(): WorkspaceSettings {
  return {
    icon: DEFAULT_WORKSPACE_ICON,
    sidebarWidth: DEFAULT_SIDEBAR_WIDTH,
    favicon: "",
    topNavigation: [],
    topRightNavigation: createDefaultTopRightNavigation(),
    sections: createDefaultWorkspaceSections(),
  }
}

function createDefaultWorkspaceSections(): ShellSection[] {
  return [
    {
      id: "overview",
      title: "Overview",
      entries: [
        {
          type: "item",
          id: "dashboard",
          label: "Dashboard",
          href: "/",
          icon: "layoutDashboard",
          visible: true,
        },
        {
          type: "item",
          id: "workspaces",
          label: "Workspaces",
          href: "/workspaces",
          icon: "briefcaseBusiness",
          visible: true,
        },
      ],
    },
    {
      id: "data",
      title: "Data",
      entries: [
        {
          type: "item",
          id: "data-sources",
          label: "Data Sources",
          href: "/admin/datasource",
          icon: "library",
          visible: true,
        },
        {
          type: "item",
          id: "media-library",
          label: "Media Library",
          href: "/admin/media",
          icon: "image",
          visible: true,
          children: [MEDIA_UNUSED_CHILD],
        },
        {
          type: "item",
          id: "proxies",
          label: "Proxies",
          href: "/admin/proxies",
          icon: "proxy",
          visible: true,
        },
      ],
    },
    {
      id: "admin",
      title: "Admin",
      entries: [
        {
          type: "item",
          id: "feedback",
          label: "Feedback",
          href: "/admin/feedback",
          icon: "messageSquarePlus",
          visible: true,
          children: [
            {
              id: "feedback-comments",
              label: "Comments",
              href: "/admin/feedback/comments",
              icon: "messageSquarePlus",
            },
          ],
        },
        {
          type: "item",
          id: "notifications",
          label: "Notifications",
          href: "/admin/notifications",
          icon: "bell",
          visible: true,
        },
        {
          type: "item",
          id: "settings",
          label: "Settings",
          href: "/admin/settings",
          icon: "settings",
          visible: true,
        },
      ],
    },
  ]
}

function normalizeWorkspaceSections(sections: ShellSection[]) {
  return sections.map((section) => ({
    ...section,
    entries: section.entries.map((entry) => {
      if (entry.type !== "item" || entry.id !== "media-library") {
        return entry
      }

      const children = entry.children ?? []
      if (children.some((child) => child.id === MEDIA_UNUSED_CHILD.id)) {
        return entry
      }

      return {
        ...entry,
        children: [...children, MEDIA_UNUSED_CHILD],
      }
    }),
  }))
}

function isWorkspaceIcon(value: unknown): value is IconKey {
  return typeof value === "string" && value in iconMeta
}
