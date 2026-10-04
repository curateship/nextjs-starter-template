import { createServerFn } from "@tanstack/react-start"
import {
  findWorkspaceIdForRequest,
  onlyWorkspaceId,
} from "@/server/workspaces/for-request"
import { answerForRequest } from "@/server/workspaces/host"
import { appFrontPageRowReader } from "@/server/app-options"
import { loadUserAnnouncements } from "@/server/content/announcements"
import { readVisiblePageBlocks } from "@/server/content/page-blocks"
import { loadEntitlements } from "@/server/billing/entitlements"
import { countUnseenNotifications } from "@/server/notifications/inbox"
import { findSessionContext } from "@/server/auth/security"
import { readBranding, readShellSettings } from "@/server/shell-settings"
import {
  DEFAULT_FAVICON_MODE,
  type FaviconMode,
  type PublicFaviconSet,
} from "@/lib/favicon"
import { readWorkspaceList } from "@/server/people/workspaces"

import type { UserAnnouncement } from "@/lib/announcement"
import { serializeUser, type AuthUser } from "@/lib/api/auth/auth"
import type { PlanSummary } from "@/lib/api/billing/billing"
import type { ShellConfig } from "@/lib/custom-shell"
import type { PublicFontAsset } from "@/lib/public-font"
import {
  APP_FRONT_PAGE_ROW_KIND,
  type AppFrontPageRowData,
  type FrontPageRow,
} from "@/lib/pages/front-page"
import { createDefaultPublicHeaderActions } from "@/lib/pages/public-header-actions"
import { createDefaultPublicNavigation } from "@/lib/pages/public-navigation"
import { FRONT_PAGE_PATH } from "@/lib/pages/page-descriptor"
import {
  createDefaultPublicHeader,
  type PublicHeader,
} from "@/lib/pages/public-header"
import {
  createDefaultPublicBreadcrumbs,
  type PublicBreadcrumbs,
} from "@/lib/pages/public-breadcrumbs"
import {
  createDefaultPublicUserPanel,
  type PublicUserPanel,
} from "@/lib/pages/public-user-panel"
import type { PublicTheme } from "@/lib/public-theme"
import {
  createDefaultPublicSeo,
  createDefaultPublicSystemCopy,
  DEFAULT_SOCIAL_CARD_TYPE,
  type PublicSeo,
  type PublicSystemCopy,
  type SocialCardType,
} from "@/lib/pages/public-metadata"
import {
  seesEveryWorkspace,
  type WorkspaceListResponse,
} from "@/lib/api/people/workspaces"

export type ShellBootstrap = {
  user: AuthUser | null
  settings: ShellConfig | null
  workspaces: WorkspaceListResponse
  plan: PlanSummary
  /**
   * Notices that arrived since the bell was last opened, so it carries its
   * number before the tray is opened. Not the same as unread: opening the bell
   * clears this and leaves every notice unread.
   */
  unseenNotifications: number
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
        workspaces: { workspaces: [], copyChoices: [], baseDomain: "" },
        plan: { planSlug: "free", planName: "Free", isPaid: false },
        unseenNotifications: 0,
        announcements: [],
        viewedBy: null,
      }
    }

    // Everything below reads as this person. While an admin is viewing the app
    // as a member that IS the member — same sidebar, same plan, same notices —
    // which is the whole point.
    const { user, viewedBy } = session

    const settingsPromise = readShellSettings(user)
    // Read once and handed down: the banners belong to the site this person is
    // in, and asking again inside the list below would run the lookup twice.
    const workspaceId = await findWorkspaceIdForRequest(user.id)
    const [settings, workspaces, { entitlements }, unseenCount, announcements] =
      await Promise.all([
        settingsPromise,
        // **The same list the workspaces dashboard shows**, which means an
        // admin sees every workspace here too — including one another admin
        // made, and one nobody owns because the admin who made it is gone.
        //
        // It used to be this person's own, and the two screens disagreed: a
        // workspace was on the dashboard and missing from the switcher, so it
        // could be seen and never worked in. Worse, switching to one from the
        // dashboard left the sidebar naming a different workspace as the
        // current one, because the one you had moved to was not in its list at
        // all.
        //
        // A member is unchanged — `seesEveryWorkspace` is false for them — and
        // while an admin is viewing the app as a member, `user` *is* that
        // member, so the view stays honest.
        readWorkspaceList(user.id, undefined, {
          seesEveryWorkspace: seesEveryWorkspace(user),
        }),
        loadEntitlements(user.id),
        settingsPromise.then((value) =>
          countUnseenNotifications(user.id, undefined, value.notificationTypes)
        ),
        workspaceId
          ? loadUserAnnouncements(workspaceId, user.id)
          : Promise.resolve({ banners: [], noticesCreated: 0 }),
      ])

    // The announcement read is the one call here that can write: it drops in the
    // tray notice for an announcement that has just gone live. That write races
    // the count above, so on the rare load that actually creates one, ask again
    // — otherwise the bell would sit there with no number over a tray holding
    // an announcement nobody has been shown. Every other load pays nothing.
    const unseenNotifications = announcements.noticesCreated
      ? await countUnseenNotifications(
          user.id,
          undefined,
          settings.notificationTypes
        )
      : unseenCount

    return {
      user: serializeUser(user),
      settings,
      workspaces,
      plan: {
        planSlug: entitlements.planSlug,
        planName: entitlements.planName,
        isPaid: entitlements.isPaid,
      },
      unseenNotifications,
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
    favicon: string
    faviconDark: string
    faviconSet: PublicFaviconSet | null
    faviconMode: FaviconMode
    logo: string
    logoDark: string
    shareImage: string
    socialCardType: SocialCardType
    socialHandle: string
    publicOrigin: string
    publicSeo: PublicSeo
    publicSystemCopy: PublicSystemCopy
    publicHeader: PublicHeader
    publicBreadcrumbs: PublicBreadcrumbs
    publicUserPanel: PublicUserPanel
    publicNavigation: ShellConfig["publicNavigation"]
    publicFooter: ShellConfig["publicFooter"]
    publicFooterSocial: ShellConfig["publicFooterSocial"]
    publicHeaderActions: ShellConfig["publicHeaderActions"]
    publicFooterCopyright: string
    publicSearchEnabled: boolean
    publicFont: PublicFontAsset | null
    publicTheme?: PublicTheme
    hostIsUnknown: boolean
    hostIsSite: boolean
  }> => {
    try {
      return await readBranding()
    } catch (error) {
      console.error("Branding could not be read; using the default", error)
      // Blank, not a name of its own: "" is already how the app says "use the
      // default", so this goes through the one place that decides what that is.
      // And never a dead end on a failure — a database that could not be read
      // must not turn every address into a 404.
      return {
        appName: "",
        favicon: "",
        faviconDark: "",
        faviconSet: null,
        faviconMode: DEFAULT_FAVICON_MODE,
        logo: "",
        logoDark: "",
        shareImage: "",
        socialCardType: DEFAULT_SOCIAL_CARD_TYPE,
        socialHandle: "",
        publicOrigin: "",
        publicSeo: createDefaultPublicSeo(),
        publicSystemCopy: createDefaultPublicSystemCopy(),
        publicHeader: createDefaultPublicHeader(),
        publicBreadcrumbs: createDefaultPublicBreadcrumbs(),
        publicUserPanel: createDefaultPublicUserPanel(),
        publicNavigation: createDefaultPublicNavigation(),
        publicFooter: [],
        publicFooterSocial: [],
        publicHeaderActions: createDefaultPublicHeaderActions(),
        publicFooterCopyright: "",
        publicSearchEnabled: true,
        publicFont: null,
        hostIsUnknown: false,
        hostIsSite: false,
      }
    }
  }
)

export function loadBranding() {
  return loadBrandingFn()
}

/**
 * What the app's own front page rows hold on this request, by row id, plus the
 * ids of the rows that came back with nothing and should not be drawn.
 */
export type AppFrontPageRowFills = {
  data: Record<string, AppFrontPageRowData>
  dropped: string[]
}

/**
 * Fills every front page row of a kind the app added.
 *
 * The rows are read here rather than taken from the browser, for the same
 * reason the sitemap reads its own: a visitor must not be able to ask for a
 * row that is not on this site's front page, or for one with settings they
 * chose. The site comes from the address that was visited.
 *
 * A reader that fails takes its own row off the page and leaves the rest of the
 * front page alone. A front page is the most public thing this app has, and one
 * failing query must not turn it into an error page.
 */
const loadAppFrontPageRowsFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<AppFrontPageRowFills> => {
    const answer = await answerForRequest()
    // The site whose address was visited. A one-site app has no such address,
    // so its front page asks the shell for the site every other read there
    // falls back on.
    const workspaceId =
      answer.kind === "workspace"
        ? answer.workspace.id
        : ((await onlyWorkspaceId()) ?? "")
    if (!workspaceId) return { data: {}, dropped: [] }

    // Read again here rather than trusted from the browser: what an app's row
    // is asked to fill has to be what the page actually holds.
    const rows = (
      await readVisiblePageBlocks(workspaceId, FRONT_PAGE_PATH)
    ).filter(
      (row): row is Extract<FrontPageRow, { appKind: string }> =>
        row.kind === APP_FRONT_PAGE_ROW_KIND
    )
    if (rows.length === 0) return { data: {}, dropped: [] }

    const data: Record<string, AppFrontPageRowData> = {}
    const dropped: string[] = []

    await Promise.all(
      rows.map(async (row) => {
        const reader = appFrontPageRowReader(row.appKind)
        if (!reader) return
        try {
          const filled = await reader({
            id: row.id,
            heading: row.heading,
            intro: row.intro,
            settings: row.settings,
            workspaceId,
          })
          if (filled === null || filled === undefined) {
            dropped.push(row.id)
            return
          }
          data[row.id] = filled
        } catch (error) {
          console.error(`The "${row.appKind}" front page row failed`, error)
          dropped.push(row.id)
        }
      })
    )

    return { data, dropped }
  }
)

/** What the app's own front page rows hold, for the page about to draw them. */
export function loadAppFrontPageRows() {
  return loadAppFrontPageRowsFn()
}
