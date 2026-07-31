import { createServerFn } from "@tanstack/react-start"

import type { UserAnnouncement } from "@/lib/announcement"
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
  /** Live admin broadcasts this person has not closed yet. */
  announcements: UserAnnouncement[]
  /**
   * Set only while an admin is looking at the app as this member — it names the
   * admin, so the banner can say whose screen this really is.
   */
  viewedBy: { id: string; name: string; email: string } | null
}

/**
 * Everything the shell needs for a signed-in page, in one request.
 *
 * The shell loader runs on every navigation, so this is deliberately a single
 * round trip: four separate server calls made each click feel like a page load.
 */
const loadShellBootstrapFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<ShellBootstrap> => {
    const { findSessionContext } = await import("@/server/security")
    const session = await findSessionContext()

    if (!session) {
      return {
        user: null,
        settings: null,
        workspaces: { workspaces: [] },
        plan: { planSlug: "free", planName: "Free", isPaid: false },
        unreadNotifications: 0,
        announcements: [],
        viewedBy: null,
      }
    }

    // Everything below reads as this person. While an admin is viewing the app
    // as a member that IS the member — same sidebar, same plan, same notices —
    // which is the whole point.
    const { user, viewedBy } = session

    const [
      { readShellSettings },
      { readWorkspaceList },
      { loadEntitlements },
      { countUnreadNotifications },
      { loadUserAnnouncements },
    ] = await Promise.all([
      import("@/server/shell-settings"),
      import("@/server/workspaces"),
      import("@/server/entitlements"),
      import("@/server/notifications"),
      import("@/server/announcements"),
    ])

    const [settings, workspaces, { entitlements }, unreadCount, announcements] =
      await Promise.all([
        readShellSettings(user),
        readWorkspaceList(user.id),
        loadEntitlements(user.id),
        countUnreadNotifications(user.id),
        loadUserAnnouncements(user.id),
      ])

    // The announcement read is the one call here that can write: it drops in the
    // tray notice for an announcement that has just gone live. That write races
    // the count above, so on the rare load that actually creates one, ask again
    // — otherwise the bell would sit there with no dot over a tray that has an
    // unread notice in it. Every other load pays nothing for this.
    const unreadNotifications = announcements.noticesCreated
      ? await countUnreadNotifications(user.id)
      : unreadCount

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
      announcements: announcements.banners,
      viewedBy: viewedBy
        ? { id: viewedBy.id, name: viewedBy.name, email: viewedBy.email }
        : null,
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
