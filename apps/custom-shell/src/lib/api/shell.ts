import { createServerFn } from "@tanstack/react-start"

import type { AuthUser } from "@/lib/api/auth"
import type { PlanSummary } from "@/lib/api/billing"
import type { ShellConfig } from "@/lib/custom-shell"
import type { WorkspaceListResponse } from "@/lib/api/workspaces"

export type ShellBootstrap = {
  user: AuthUser | null
  settings: ShellConfig | null
  workspaces: WorkspaceListResponse
  plan: PlanSummary
  /** Unread notices, so the bell carries its dot before the tray is opened. */
  unreadNotifications: number
}

/**
 * Everything the shell needs for a signed-in page, in one request.
 *
 * The shell loader runs on every navigation, so this is deliberately a single
 * round trip: four separate server calls made each click feel like a page load.
 */
const loadShellBootstrapFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<ShellBootstrap> => {
    const { findCurrentUser } = await import("@/server/security")
    const user = await findCurrentUser()

    if (!user) {
      return {
        user: null,
        settings: null,
        workspaces: { workspaces: [] },
        plan: { planSlug: "free", planName: "Free", isPaid: false },
        unreadNotifications: 0,
      }
    }

    const [
      { readShellSettings },
      { readWorkspaceList },
      { loadEntitlements },
      { countUnreadNotifications },
    ] = await Promise.all([
      import("@/server/shell-settings"),
      import("@/server/workspaces"),
      import("@/server/entitlements"),
      import("@/server/notifications"),
    ])

    const [settings, workspaces, { entitlements }, unreadNotifications] =
      await Promise.all([
        readShellSettings(user.id),
        readWorkspaceList(user.id),
        loadEntitlements(user.id),
        countUnreadNotifications(user.id),
      ])

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        status: user.status,
        emailVerified: Boolean(user.emailVerifiedAt),
      },
      settings,
      workspaces,
      plan: {
        planSlug: entitlements.planSlug,
        planName: entitlements.planName,
        isPaid: entitlements.isPaid,
      },
      unreadNotifications,
    }
  }
)

export function loadShellBootstrap() {
  return loadShellBootstrapFn()
}

/**
 * The app name on its own, with no session required — the root route needs it
 * for the browser tab title and the signed-out pages that show it.
 */
const loadAppNameFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ appName: string }> => {
    const { readAppName } = await import("@/server/shell-settings")
    return { appName: await readAppName() }
  }
)

export function loadAppName() {
  return loadAppNameFn()
}
