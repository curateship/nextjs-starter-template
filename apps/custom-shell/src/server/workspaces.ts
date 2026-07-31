import { and, asc, eq } from "drizzle-orm"

import {
  createDefaultTopRightNavigation,
  iconMeta,
  normalizeStyling,
  type IconKey,
  type ShellChildItem,
  type ShellItem,
  type ShellSection,
  type ShellStyling,
  type ShellTopRightNavigationItem,
} from "@/lib/custom-shell"
import { cleanAutomationPaletteKeys } from "@/lib/automations/node-registry"
import {
  DEFAULT_SIDEBAR_WIDTH,
  MAX_SIDEBAR_WIDTH,
  MIN_SIDEBAR_WIDTH,
} from "@/lib/sidebar-width"
import { db, type CustomShellDb } from "@/server/db"
import {
  customShellWorkspaces,
  type CustomShellWorkspace,
} from "@/server/schema"
import { now, uuid } from "@/server/security"

const DEFAULT_WORKSPACE_NAME = "My project"
const DEFAULT_WORKSPACE_ICON = "briefcaseBusiness"

/** The pages that hang off the media library. */
const MEDIA_CHILD_LINKS: ShellChildItem[] = [
  {
    id: "item-media-storage",
    label: "Storage by user",
    href: "/admin/media/storage",
    icon: "hard-drive",
  },
  {
    id: "item-media-orphans",
    label: "Orphaned files",
    href: "/admin/media/orphans",
    icon: "unlink",
  },
]

/** The read-only admin activity feed, added after the first workspaces existed. */
const AUDIT_LINK: ShellItem = {
  type: "item",
  id: "item-admin-audit",
  label: "Activity log",
  href: "/admin/audit",
  icon: "scroll-text",
  visible: true,
  roles: ["admin"],
}

/**
 * The changelog area, added after the first workspaces existed. Neither entry is
 * role-gated: What's new is the page a changelog notice opens and everyone gets
 * those notices, and the parent sends anyone who cannot write updates straight
 * to it.
 */
const CHANGELOG_CHILD_LINKS: ShellChildItem[] = [
  {
    id: "item-changelog-whats-new",
    label: "What's new",
    href: "/changelog/whats-new",
    icon: "sparkles",
  },
]

function changelogLink(): ShellItem {
  return {
    type: "item",
    id: "item-changelog",
    label: "Changelog",
    href: "/changelog",
    icon: "sparkles",
    visible: true,
    // Built fresh, like the media entry's children below: a spread of a shared
    // constant would hand every workspace the same child array to save into its
    // own settings.
    children: CHANGELOG_CHILD_LINKS.map((child) => ({ ...child })),
  }
}

/** The automation canvas, added after the first workspaces existed. */
const AUTOMATIONS_LINK: ShellItem = {
  type: "item",
  id: "item-automations",
  label: "Automations",
  href: "/admin/automations",
  icon: "workflow",
  visible: true,
  roles: ["admin"],
}

export type WorkspaceSettings = {
  icon: IconKey
  favicon: string
  topRightNavigation: ShellTopRightNavigationItem[]
  sections: ShellSection[]
  // Draggable sidebar width in px, saved per-workspace.
  sidebarWidth: number
  // Visual styling (spacing, card border, backgrounds), saved per-workspace.
  styling: ShellStyling
  // Starred palette nodes in the automation editor, saved per-workspace.
  automationFavoriteNodeKeys: string[]
}

export async function getOrCreateCurrentWorkspace(
  userId: string,
  database: CustomShellDb = db
) {
  const current = await findCurrentWorkspace(userId, database)
  if (current) return current

  return database.transaction(async (tx) => {
    const [existingWorkspace] = await tx
      .select()
      .from(customShellWorkspaces)
      .where(eq(customShellWorkspaces.userId, userId))
      .orderBy(asc(customShellWorkspaces.createdAt))
      .limit(1)

    if (existingWorkspace) {
      return setDefaultWorkspace(userId, existingWorkspace.id, tx)
    }

    const createdAt = now()
    const [workspace] = await tx
      .insert(customShellWorkspaces)
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

/** The workspace switcher's list, already serialized for the browser. */
export async function readWorkspaceList(
  userId: string,
  database: CustomShellDb = db
) {
  const { workspaces, currentWorkspaceId } = await listUserWorkspaces(
    userId,
    database
  )

  return {
    workspaces: workspaces.map((row) =>
      serializeWorkspace(row, currentWorkspaceId)
    ),
  }
}

export async function listUserWorkspaces(
  userId: string,
  database: CustomShellDb = db
) {
  const rows = await database
    .select()
    .from(customShellWorkspaces)
    .where(eq(customShellWorkspaces.userId, userId))
    .orderBy(asc(customShellWorkspaces.createdAt))

  const current =
    rows.find((workspace) => workspace.isDefault) ?? rows[0] ?? null

  return { workspaces: rows, currentWorkspaceId: current?.id ?? null }
}

export async function createUserWorkspace(
  userId: string,
  name: string,
  settings: Partial<WorkspaceSettings> = {},
  database: CustomShellDb = db
) {
  const trimmedName = name.trim()
  if (!trimmedName) {
    throw new Error("Workspace name is required")
  }

  return database.transaction(async (tx) => {
    const createdAt = now()
    const [workspace] = await tx
      .insert(customShellWorkspaces)
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
  database: CustomShellDb = db
) {
  const trimmedName = data.name.trim()
  if (!trimmedName) {
    throw new Error("Workspace name is required")
  }

  const [existing] = await database
    .select({ settings: customShellWorkspaces.settings })
    .from(customShellWorkspaces)
    .where(
      and(
        eq(customShellWorkspaces.id, workspaceId),
        eq(customShellWorkspaces.userId, userId)
      )
    )
    .limit(1)

  if (!existing) {
    throw new Error("Workspace not found")
  }

  const [workspace] = await database
    .update(customShellWorkspaces)
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
        eq(customShellWorkspaces.id, workspaceId),
        eq(customShellWorkspaces.userId, userId)
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
  database: CustomShellDb = db
) {
  return database.transaction((tx) =>
    setDefaultWorkspace(userId, workspaceId, tx)
  )
}

export async function deleteUserWorkspace(
  userId: string,
  workspaceId: string,
  database: CustomShellDb = db
) {
  return database.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(customShellWorkspaces)
      .where(eq(customShellWorkspaces.userId, userId))
      .orderBy(asc(customShellWorkspaces.createdAt))

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
      .delete(customShellWorkspaces)
      .where(
        and(
          eq(customShellWorkspaces.id, workspaceId),
          eq(customShellWorkspaces.userId, userId)
        )
      )
      .returning({ id: customShellWorkspaces.id })

    if (!deleted) {
      throw new Error("Workspace not found")
    }

    return { workspaceId: deleted.id }
  })
}

async function findCurrentWorkspace(userId: string, database: CustomShellDb) {
  const [row] = await database
    .select()
    .from(customShellWorkspaces)
    .where(
      and(
        eq(customShellWorkspaces.userId, userId),
        eq(customShellWorkspaces.isDefault, true)
      )
    )
    .limit(1)

  return row ?? null
}

async function setDefaultWorkspace(
  userId: string,
  workspaceId: string,
  database: Pick<CustomShellDb, "select" | "update">
) {
  const updatedAt = now()
  const [workspace] = await database
    .select()
    .from(customShellWorkspaces)
    .where(
      and(
        eq(customShellWorkspaces.id, workspaceId),
        eq(customShellWorkspaces.userId, userId)
      )
    )
    .limit(1)

  if (!workspace) {
    throw new Error("Workspace not found")
  }

  await database
    .update(customShellWorkspaces)
    .set({ isDefault: false, updatedAt })
    .where(eq(customShellWorkspaces.userId, userId))

  const [updated] = await database
    .update(customShellWorkspaces)
    .set({ isDefault: true, updatedAt })
    .where(
      and(
        eq(customShellWorkspaces.id, workspaceId),
        eq(customShellWorkspaces.userId, userId)
      )
    )
    .returning()

  if (!updated) {
    throw new Error("Workspace not found")
  }

  return updated
}

export function serializeWorkspace(
  row: CustomShellWorkspace,
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
      topRightNavigation: Array.isArray(settings.topRightNavigation)
        ? settings.topRightNavigation
        : fallback.topRightNavigation,
      sections: Array.isArray(settings.sections)
        ? withLinkAfter(
            withLinkAfter(
              withAuditLink(withMediaChildLinks(settings.sections)),
              AUTOMATIONS_LINK,
              "/admin/media"
            ),
            changelogLink(),
            "/admin/notifications"
          )
        : fallback.sections,
      // Default fills rows saved before this field existed.
      sidebarWidth: isValidSidebarWidth(settings.sidebarWidth)
        ? settings.sidebarWidth
        : fallback.sidebarWidth,
      styling: normalizeStyling(settings.styling),
      automationFavoriteNodeKeys: cleanAutomationPaletteKeys(
        settings.automationFavoriteNodeKeys
      ),
    }
  }

  return fallback
}

/**
 * The storage and orphan pages arrived after most workspaces were created, and
 * saved navigation is never rewritten by a deploy — so their links would only
 * ever show up in brand new workspaces. Fill them in for a media entry that has
 * no children at all. Once the entry has any child, the sidebar is the user's
 * again: removing one of the two links keeps it removed.
 */
function withMediaChildLinks(sections: ShellSection[]): ShellSection[] {
  return sections.map((section) => ({
    ...section,
    entries: (section.entries ?? []).map((entry) =>
      entry.type === "item" &&
      entry.href === "/admin/media" &&
      !entry.children?.length
        ? { ...entry, children: MEDIA_CHILD_LINKS.map((child) => ({ ...child })) }
        : entry
    ),
  }))
}

/**
 * Same story as the media child links: the activity log arrived after most
 * workspaces were created and a deploy never rewrites saved navigation, so it
 * would only appear in brand new workspaces. Add it beside the other admin
 * links when nothing points at it yet. To take it out of the sidebar, switch
 * the entry to hidden in Settings → Sidebar — deleting it brings it back, the
 * same as any default link.
 */
function withAuditLink(sections: ShellSection[]): ShellSection[] {
  const alreadyLinked = sections.some((section) =>
    (section.entries ?? []).some(
      (entry) => entry.type === "item" && entry.href === AUDIT_LINK.href
    )
  )
  if (alreadyLinked) return sections

  // It belongs with the admin links; without that section there is nowhere
  // sensible to put it, so leave the user's sidebar alone.
  let placed = false
  return sections.map((section) => {
    const entries = section.entries ?? []
    if (
      placed ||
      !entries.some(
        (entry) => entry.type === "item" && entry.href === "/admin/users"
      )
    ) {
      return section
    }

    placed = true
    return { ...section, entries: [...entries, { ...AUDIT_LINK }] }
  })
}

/**
 * Same story again, for links that belong next to an existing one: the entry
 * goes in right after the link it names as its anchor, and only when nothing
 * points at it yet. Without that anchor there is nowhere sensible to put it, so
 * the user's sidebar is left alone. To take one out, switch the entry to hidden
 * in Settings → Sidebar — deleting it brings it back, like any default link.
 */
function withLinkAfter(
  sections: ShellSection[],
  link: ShellItem,
  anchorHref: string
): ShellSection[] {
  const alreadyLinked = sections.some((section) =>
    (section.entries ?? []).some(
      (entry) => entry.type === "item" && entry.href === link.href
    )
  )
  if (alreadyLinked) return sections

  let placed = false
  return sections.map((section) => {
    const entries = section.entries ?? []
    const anchorIndex = entries.findIndex(
      (entry) => entry.type === "item" && entry.href === anchorHref
    )
    if (placed || anchorIndex === -1) {
      return section
    }

    placed = true
    return {
      ...section,
      entries: [
        ...entries.slice(0, anchorIndex + 1),
        { ...link },
        ...entries.slice(anchorIndex + 1),
      ],
    }
  })
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
    topRightNavigation: Array.isArray(settings.topRightNavigation)
      ? settings.topRightNavigation
      : fallback.topRightNavigation,
    sections: Array.isArray(settings.sections)
      ? settings.sections
      : fallback.sections,
    sidebarWidth: isValidSidebarWidth(settings.sidebarWidth)
      ? settings.sidebarWidth
      : fallback.sidebarWidth,
    styling: normalizeStyling(settings.styling),
    automationFavoriteNodeKeys: cleanAutomationPaletteKeys(
      settings.automationFavoriteNodeKeys
    ),
  }
}

/** Replaces the workspace's starred automation palette nodes, returning the saved list. */
export async function saveWorkspaceAutomationFavorites(
  userId: string,
  favoriteNodeKeys: string[],
  database: CustomShellDb = db
): Promise<string[]> {
  const workspace = await getOrCreateCurrentWorkspace(userId, database)
  const settings = {
    ...parseWorkspaceSettings(workspace.settings),
    automationFavoriteNodeKeys: cleanAutomationPaletteKeys(favoriteNodeKeys),
  }
  await database
    .update(customShellWorkspaces)
    .set({ settings, updatedAt: now() })
    .where(eq(customShellWorkspaces.id, workspace.id))
  return settings.automationFavoriteNodeKeys
}

function defaultWorkspaceSettings(): WorkspaceSettings {
  return {
    icon: DEFAULT_WORKSPACE_ICON,
    favicon: "",
    topRightNavigation: createDefaultTopRightNavigation(),
    sections: createDefaultWorkspaceSections(),
    sidebarWidth: DEFAULT_SIDEBAR_WIDTH,
    styling: normalizeStyling(undefined),
    automationFavoriteNodeKeys: [],
  }
}

function createDefaultWorkspaceSections(): ShellSection[] {
  // The account area is a modal opened from the user menu, so it has no sidebar
  // section of its own.
  return [
    {
      // Members never see this section: every entry is admin-only, and the
      // /admin route guard refuses them again server-side.
      id: "section-administration",
      title: "Administration",
      entries: [
        {
          type: "item",
          id: "item-admin-users",
          label: "Users",
          href: "/admin/users",
          icon: "users",
          visible: true,
          roles: ["admin"],
        },
        {
          type: "item",
          id: "item-admin-plans",
          label: "Plans",
          href: "/admin/plans",
          icon: "package",
          visible: true,
          roles: ["admin"],
        },
        {
          type: "item",
          id: "item-admin-revenue",
          label: "Revenue",
          href: "/admin/billing",
          icon: "barChart3",
          visible: true,
          roles: ["admin"],
        },
        { ...AUDIT_LINK },
      ],
    },
    {
      id: "section-platform-settings",
      title: "Platform Settings",
      entries: [
        {
          type: "item",
          id: "item-feedback",
          label: "Feedback",
          href: "/admin/feedback",
          icon: "messageSquarePlus",
          visible: true,
          children: [
            {
              id: "item-feedback-comments",
              label: "Comments",
              href: "/admin/feedback/comments",
              icon: "message-square-text",
            },
          ],
        },
        {
          type: "item",
          id: "item-media",
          label: "Media",
          href: "/admin/media",
          icon: "image",
          visible: true,
          children: MEDIA_CHILD_LINKS.map((child) => ({ ...child })),
        },
        { ...AUTOMATIONS_LINK },
        {
          type: "item",
          id: "item-notifications",
          label: "Notifications",
          href: "/admin/notifications",
          icon: "bell",
          visible: true,
        },
        changelogLink(),
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

function isValidSidebarWidth(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= MIN_SIDEBAR_WIDTH &&
    value <= MAX_SIDEBAR_WIDTH
  )
}
