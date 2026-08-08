import { createServerFn } from "@tanstack/react-start"
import { loadUserAnnouncements } from "@/server/content/announcements"
import { loadEntitlements } from "@/server/billing/entitlements"
import { countUnreadNotifications } from "@/server/notifications/inbox"
import { findSessionContext } from "@/server/auth/security"
import { readBranding, readShellSettings } from "@/server/shell-settings"
import { readWorkspaceList } from "@/server/people/workspaces"

import type { UserAnnouncement } from "@/lib/announcement"
import { serializeUser, type AuthUser } from "@/lib/api/auth/auth"
import type { PlanSummary } from "@/lib/api/billing/billing"
import type { ShellConfig } from "@/lib/custom-shell"
import type { WorkspaceListResponse } from "@/lib/api/people/workspaces"

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
    const session = await findSessionContext()

    if (!session) {
      return {
        user: null,
        settings: null,
        workspaces: { workspaces: [], baseDomain: "" },
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

    const settingsPromise = readShellSettings(user)
    const [settings, workspaces, { entitlements }, unreadCount, announcements] =
      await Promise.all([
        settingsPromise,
        readWorkspaceList(user.id),
        loadEntitlements(user.id),
        settingsPromise.then((value) =>
          countUnreadNotifications(
            user.id,
            undefined,
            value.notificationTypes
          )
        ),
        loadUserAnnouncements(user.id),
      ])

    // The announcement read is the one call here that can write: it drops in the
    // tray notice for an announcement that has just gone live. That write races
    // the count above, so on the rare load that actually creates one, ask again
    // — otherwise the bell would sit there with no dot over a tray that has an
    // unread notice in it. Every other load pays nothing for this.
    const unreadNotifications = announcements.noticesCreated
      ? await countUnreadNotifications(
          user.id,
          undefined,
          settings.notificationTypes
        )
      : unreadCount

    return {
      user: serializeUser(user),
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
 * The app name and logo, with no session required — the root route needs them
 * for the browser tab title and the signed-out pages that show them.
 *
 * **Never throws.** This is the root route's loader, so a failure here takes
 * down every page at once — including the not-found page, which is the one
 * page whose whole job is to still work when things are broken. Branding is
 * decoration: without it the app draws under its default name, which is a far
 * better answer to a database being unreachable than the whole site turning
 * into an error card.
 *
 * This does not paper over real failures. A page whose own loader needs the
 * database still fails on its own query and still shows its own error, with
 * the reason. All this stops is the chrome taking the page down with it — and
 * it is written to the log on the way, so a swallowed failure still leaves a
 * trace rather than an app that quietly renamed itself.
 */
const loadBrandingFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<{
    appName: string
    logo: string
    logoDark: string
    hostIsUnknown: boolean
  }> => {
    try {
      return await readBranding()
    } catch (error) {
      console.error("Branding could not be read; using the default", error)
      // Blank, not a name of its own: "" is already how the app says "use the
      // default", so this goes through the one place that decides what that is.
      // And never a dead end on a failure — a database that could not be read
      // must not turn every address into a 404.
      return { appName: "", logo: "", logoDark: "", hostIsUnknown: false }
    }
  }
)

export function loadBranding() {
  return loadBrandingFn()
}
