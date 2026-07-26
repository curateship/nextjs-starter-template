import { and, asc, eq } from "drizzle-orm"

import {
  createDefaultTopRightNavigation,
  DEFAULT_SIDEBAR_WIDTH,
  iconMeta,
  isSidebarWidth,
  normalizeStyling,
  type IconKey,
  type ShellSection,
  type ShellStyling,
  type ShellTopRightNavigationItem,
} from "@/lib/custom-shell"
import {
  cleanAutomationPaletteKeys,
  type AutomationPaletteKey,
} from "@/lib/automations/palette"
import { db, type CustomShellDb } from "@/server/db"
import {
  customShellWorkspaces,
  type CustomShellWorkspace,
} from "@/server/schema"
import { now, uuid } from "@/server/security"

const DEFAULT_WORKSPACE_NAME = "My project"
const DEFAULT_WORKSPACE_ICON = "briefcaseBusiness"

export type WorkspaceSettings = {
  icon: IconKey
  sidebarWidth: number
  favicon: string
  automationFavoriteNodeKeys: AutomationPaletteKey[]
  // Order of the market watchlist tabs (Active/Open/Fav/Watch) on the trade
  // dashboard. Empty means "use the built-in order".
  dashboardWatchlistTabOrder: string[]
  // Last market opened on the trade dashboard, so it reopens where it was
  // left instead of snapping back to the default. Empty means "never set".
  tradeMarket: string
  topRightNavigation: ShellTopRightNavigationItem[]
  sections: ShellSection[]
  // Visual styling (spacing, card border, backgrounds), saved per-workspace.
  styling: ShellStyling
}

export async function saveWorkspaceAutomationFavorites(
  userId: string,
  favoriteNodeKeys: AutomationPaletteKey[],
  database: CustomShellDb = db
) {
  const workspace = await getOrCreateCurrentWorkspace(userId, database)
  const settings = parseWorkspaceSettings(workspace.settings)
  const cleanedKeys = cleanAutomationPaletteKeys(favoriteNodeKeys)
  const [updated] = await database
    .update(customShellWorkspaces)
    .set({
      settings: {
        ...settings,
        automationFavoriteNodeKeys: cleanedKeys,
      },
      updatedAt: now(),
    })
    .where(
      and(
        eq(customShellWorkspaces.id, workspace.id),
        eq(customShellWorkspaces.userId, userId)
      )
    )
    .returning({ id: customShellWorkspaces.id })

  if (!updated) throw new Error("Workspace not found")
  return cleanedKeys
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
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const settings = value as Partial<WorkspaceSettings>
    if (!isSidebarWidth(settings.sidebarWidth)) {
      throw new Error("Saved workspace settings are missing sidebarWidth")
    }
    return cleanWorkspaceSettings(settings)
  }

  return defaultWorkspaceSettings()
}

function cleanWorkspaceSettings(
  settings: Partial<WorkspaceSettings>
): WorkspaceSettings {
  const fallback = defaultWorkspaceSettings()
  return {
    icon: isWorkspaceIcon(settings.icon) ? settings.icon : fallback.icon,
    sidebarWidth: isSidebarWidth(settings.sidebarWidth)
      ? settings.sidebarWidth
      : fallback.sidebarWidth,
    favicon:
      typeof settings.favicon === "string"
        ? settings.favicon
        : fallback.favicon,
    automationFavoriteNodeKeys: cleanAutomationPaletteKeys(
      settings.automationFavoriteNodeKeys
    ),
    dashboardWatchlistTabOrder: Array.isArray(
      settings.dashboardWatchlistTabOrder
    )
      ? settings.dashboardWatchlistTabOrder.filter(
          (value): value is string => typeof value === "string"
        )
      : fallback.dashboardWatchlistTabOrder,
    tradeMarket:
      typeof settings.tradeMarket === "string"
        ? settings.tradeMarket
        : fallback.tradeMarket,
    topRightNavigation: Array.isArray(settings.topRightNavigation)
      ? settings.topRightNavigation
      : fallback.topRightNavigation,
    sections: Array.isArray(settings.sections)
      ? settings.sections
      : fallback.sections,
    styling: normalizeStyling(settings.styling),
  }
}

function defaultWorkspaceSettings(): WorkspaceSettings {
  return {
    icon: DEFAULT_WORKSPACE_ICON,
    sidebarWidth: DEFAULT_SIDEBAR_WIDTH,
    favicon: "",
    automationFavoriteNodeKeys: [],
    dashboardWatchlistTabOrder: [],
    tradeMarket: "",
    topRightNavigation: createDefaultTopRightNavigation(),
    sections: createDefaultWorkspaceSections(),
    styling: normalizeStyling(undefined),
  }
}

function createDefaultWorkspaceSections(): ShellSection[] {
  return [
    {
      id: "section-trading",
      title: "Trading",
      entries: [
        {
          type: "item",
          id: "item-trade",
          label: "Trade",
          href: "/trade",
          icon: "layoutDashboard",
          visible: true,
          // Child links join the sticky header's chip group (see
          // workspace/docs/app-guide.md) — Indicators belongs with Trade.
          children: [
            {
              id: "item-trade-indicators",
              label: "Indicators",
              href: "/indicators",
            },
            {
              id: "item-trade-alerts",
              label: "Alerts",
              href: "/alerts",
            },
            {
              id: "item-trade-alert-log",
              label: "Alert Log",
              href: "/alert-log",
            },
          ],
        },
        {
          type: "item",
          id: "item-bots",
          label: "Bots",
          href: "/bots",
          icon: "workflow",
          visible: true,
        },
        {
          type: "item",
          id: "item-automations",
          label: "Automations",
          href: "/automations",
          icon: "workflow",
          visible: true,
          children: [
            {
              id: "item-automations-backtest",
              label: "Backtest",
              href: "/backtest",
              icon: "flask-conical",
            },
          ],
        },
        {
          type: "item",
          id: "item-pnl",
          label: "PnL",
          href: "/pnl",
          icon: "calendar",
          visible: true,
          // A child link joins the sticky header's chip group (see
          // workspace/docs/app-guide.md) — the Journal is the per-trade view
          // of the same results PnL totals up by day.
          children: [
            {
              id: "item-pnl-journal",
              label: "Journal",
              href: "/journal",
            },
          ],
        },
        {
          type: "item",
          id: "item-wallets",
          label: "Wallets",
          href: "/wallets",
          icon: "creditCard",
          visible: true,
        },
        {
          type: "item",
          id: "item-audit",
          label: "Audit Log",
          href: "/audit",
          icon: "shieldCheck",
          visible: true,
        },
      ],
    },
    {
      id: "section-research",
      title: "Research",
      entries: [
        {
          type: "item",
          id: "item-scanner-market",
          label: "Market Scanner",
          href: "/scanner/market",
          icon: "radar",
          visible: true,
        },
        {
          type: "item",
          id: "item-scanner-market-alerts",
          label: "Market Alerts",
          href: "/scanner/market-alerts",
          icon: "bell",
          visible: true,
        },
        {
          type: "item",
          id: "item-scanner-whales",
          label: "Whales",
          href: "/scanner/whales",
          icon: "waves",
          visible: true,
        },
        {
          type: "item",
          id: "item-scanner-whale-trades",
          label: "Whale Trades",
          href: "/scanner/whale-trades",
          icon: "radar",
          visible: true,
        },
        {
          type: "item",
          id: "item-scanner-leaderboard",
          label: "Leaderboard",
          href: "/scanner/leaderboard",
          icon: "trophy",
          visible: true,
        },
        {
          type: "item",
          id: "item-scanner-positions",
          label: "Positions",
          href: "/scanner/positions",
          icon: "arrow-right-left",
          visible: true,
        },
        {
          type: "item",
          id: "item-scanner-crowded",
          label: "Crowded",
          href: "/scanner/crowded",
          icon: "users",
          visible: true,
        },
        {
          type: "item",
          id: "item-scanner-book",
          label: "Order Book",
          href: "/scanner/book",
          icon: "bookOpen",
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
        },
        {
          type: "item",
          id: "item-notifications",
          label: "Notifications",
          href: "/admin/notifications",
          icon: "bell",
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
