import * as React from "react"
import type { ComponentType } from "react"
import { Link } from "@tanstack/react-router"
import { CollapsibleSettingsCard } from "@/components/settings/collapsible-settings-card"
import { EmailSettings } from "@/components/settings/email-settings"
import { FrontPageRowsSettings } from "@/components/settings/front-page-rows-settings"
import { GeneralSettings } from "@/components/settings/general-settings"
import { MemberSettings } from "@/components/settings/member-settings"
import {
  PublicSeoSettings,
  PublicSocialSettings,
  PublicSystemPagesSettings,
} from "@/components/settings/public-metadata-settings"
import { PublicSiteSettings } from "@/components/settings/public-site-settings"
import { PublicThemeSettings } from "@/components/settings/public-theme-settings"
import { SidebarSettings } from "@/components/settings/sidebar-settings"
import { StripeSettings } from "@/components/settings/stripe-settings"
import { StylingSettings } from "@/components/settings/styling-settings"
import { TopRightSettings } from "@/components/settings/top-right-settings"
import { WidgetSettings } from "@/components/settings/widget-settings"
import { TopLeftNavigationSettings } from "@/components/settings/top-left-navigation-settings"
import { CardGroup } from "@/components/ui/card"
import { appHeaderRightActionsForRole, appSettingsTabs } from "@/lib/app-options"
import { focusRing } from "@/lib/layout/focus-ring"
import { pageGutter } from "@/lib/layout/shell-gutter"
import { cn } from "@/lib/utils"
import {
  createDefaultShellConfig,
  createDefaultTopRightNavigation,
  shellConfigSaveRefusal,
  type ShellConfig,
  type ShellMaintenance,
  type ShellSessionPolicy,
} from "@/lib/custom-shell"

/**
 * The shell's own settings — the signed-in workspace an admin works in.
 *
 * This is the half no app may take over, which is the whole reason the rail is
 * split the way it is. Security, Notifications, Storage and AI were rows here
 * until 25 Sep 2026; each was one card, so each is now a card on General
 * settings instead.
 */
const settingsTabs = [
  { id: "general", label: "General settings" },
  { id: "navigation", label: "Navigation" },
  { id: "widgets", label: "Widgets" },
  { id: "styling", label: "Styling" },
  { id: "email", label: "Email" },
  { id: "payments", label: "Payments" },
] as const

/**
 * What the shell puts in the app's card before the app adds anything, in the
 * blocks it draws them in.
 *
 * Every row here is the shell's screen and the app's decision. Both blocks are
 * about somebody other than the admin — the members who sign in, and the
 * visitors who do not — and an app can be right about either in a way the shell
 * cannot guess. Pomodoro draws its own member sidebar from its own list, so the
 * shell's Navigation screen there edits settings no page of its reads.
 *
 * An app registers a tab with one of these ids and its own screen takes that
 * row's place, keeping its position. See `REPLACEABLE_SETTINGS_TAB_IDS` in
 * `lib/app-options.ts`, which is this list.
 *
 * **The data stays the shell's.** A replacement screen writes the same
 * `ShellConfig` fields the shell's version wrote, because `PublicPageFrame` and
 * the sidebar are still what draw from them. An app that writes somewhere else
 * gets a settings screen that changes nothing.
 */
const appScaffoldGroups = [
  {
    label: "Members",
    tabs: [{ id: "member-navigation", label: "Navigation" }],
  },
  {
    label: "Public",
    tabs: [
      { id: "public-navigation", label: "Navigation" },
      { id: "public-styling", label: "Styling" },
      { id: "public-pages", label: "Pages" },
      { id: "public-seo", label: "SEO" },
      { id: "public-social", label: "Social" },
    ],
  },
] as const

/** The same rows, flat, for the id checks that do not care which block. */
const appScaffoldTabs: readonly { id: SettingsTabId; label: string }[] =
  appScaffoldGroups.flatMap((group) => group.tabs.map((tab) => ({ ...tab })))

export type SettingsTabId =
  | (typeof settingsTabs)[number]["id"]
  | (typeof appScaffoldGroups)[number]["tabs"][number]["id"]

/** Every id the shell itself owns — what an app's tab may not be called. */
const shellSettingsTabIds: readonly string[] = [
  ...settingsTabs.map((tab) => tab.id),
  ...appScaffoldTabs.map((tab) => tab.id),
]

/**
 * The app's own tabs, worked out on first use rather than at import.
 *
 * An app's options file imports its own components, which import shell
 * components, which can import this one — a real circle. A list built while
 * this module loads would be built before the app's answers exist.
 */
function extraTabs() {
  return appSettingsTabs(undefined, shellSettingsTabIds)
}

/**
 * The blocks in the app's card: the app's own rows first, then Members, then
 * Public.
 *
 * The app's rows go on top and carry no heading, because the card is already
 * called App settings and they are the reason an admin opens it. A row the app
 * has claimed keeps the scaffold's position rather than moving up here, so
 * Public → Styling stays between Navigation and Pages whoever draws it.
 */
function appCardGroups(): readonly SettingsTabGroupSection[] {
  const own = extraTabs()
  const claim = (id: string) => own.find((tab) => tab.id === id)
  const row = (tab: { id: string; label: string }) => ({
    id: tab.id as SettingsTabId,
    label: tab.label,
  })

  const ownRows = own
    .filter((tab) => !appScaffoldTabs.some((one) => one.id === tab.id))
    .map(row)

  return [
    ...(ownRows.length > 0 ? [{ tabs: ownRows }] : []),
    ...appScaffoldGroups.map((group) => ({
      label: group.label,
      tabs: group.tabs.map((tab) => row(claim(tab.id) ?? tab)),
    })),
  ]
}

/**
 * True when this is the open row and the shell is the one drawing it.
 *
 * Every row in the app's card is claimable, so each of their panels below asks
 * this rather than the tab id alone. A claimed row's panel is the app's, and
 * `AppSettingsPanel` draws it.
 */
function shellDraws(activeTab: SettingsTabId, id: SettingsTabId): boolean {
  if (activeTab !== id) return false
  return !extraTabs().some((tab) => tab.id === id)
}

export function getSettingsTabFromPath(path: string): SettingsTabId {
  const segment = path.replace(/^\/admin\/settings\/?/, "")
  const known =
    shellSettingsTabIds.includes(segment) ||
    extraTabs().some((tab) => tab.id === segment)
  return known ? (segment as SettingsTabId) : "general"
}

export function SettingsPage({
  activeTab,
  config,
  onConfigChange,
  onSaveConfig,
  onMaintenanceChange,
  maintenanceBusy,
  onSessionPolicyChange,
  sessionPolicyBusy,
}: {
  activeTab: SettingsTabId
  config: ShellConfig
  onConfigChange: (config: ShellConfig) => void
  onSaveConfig: () => Promise<boolean>
  onMaintenanceChange: (maintenance: ShellMaintenance) => Promise<boolean>
  maintenanceBusy: boolean
  onSessionPolicyChange: (policy: ShellSessionPolicy) => Promise<boolean>
  sessionPolicyBusy: boolean
}) {
  const adminHeaderActions = appHeaderRightActionsForRole("admin")
  const memberHeaderActions = appHeaderRightActionsForRole("member")
  const adminHeaderActionIds = adminHeaderActions.map((action) => action.id)
  const memberHeaderActionIds = memberHeaderActions.map((action) => action.id)

  return (
    <div
      className="flex flex-col items-start lg:flex-row"
      style={{ gap: pageGutter }}
    >
      <div
        className="flex w-full shrink-0 flex-col lg:w-48"
        style={{ gap: pageGutter }}
      >
        {/* The signed-in workspace, and nothing an app may take over. */}
        <SettingsTabGroup
          storageId="settings-rail-platform"
          title="Platform settings"
          groups={[{ tabs: settingsTabs }]}
          activeTab={activeTab}
        />

        {/* The app's own card, always drawn. Even an app that adds nothing has
            the member navigation row to decide about.

            Called "App settings" rather than the app's own name: the name is an
            editable field, so the card would rename itself the moment somebody
            changed it, and an admin already knows which app they are in. */}
        <SettingsTabGroup
          storageId="settings-rail-app"
          title="App settings"
          groups={appCardGroups()}
          activeTab={activeTab}
        />
      </div>

      <div className="min-w-0 flex-1">
        {activeTab === "general" ? (
          <GeneralSettings
            config={config}
            onConfigChange={onConfigChange}
            onMaintenanceChange={onMaintenanceChange}
            maintenanceBusy={maintenanceBusy}
            onSessionPolicyChange={onSessionPolicyChange}
            sessionPolicyBusy={sessionPolicyBusy}
          />
        ) : null}
        {shellDraws(activeTab, "public-navigation") ? (
          <PublicSiteSettings
            navigation={config.publicNavigation}
            footer={config.publicFooter}
            footerCopyright={config.publicFooterCopyright}
            publicHeader={config.publicHeader}
            pageWidth={config.publicTheme.pageWidth}
            publicUserPanel={config.publicUserPanel}
            publicBreadcrumbs={config.publicBreadcrumbs}
            onNavigationChange={(publicNavigation) =>
              onConfigChange({ ...config, publicNavigation })
            }
            onFooterChange={(publicFooter) =>
              onConfigChange({ ...config, publicFooter })
            }
            onFooterCopyrightChange={(publicFooterCopyright) =>
              onConfigChange({ ...config, publicFooterCopyright })
            }
            onPublicHeaderChange={(publicHeader) =>
              onConfigChange({ ...config, publicHeader })
            }
            onPublicUserPanelChange={(publicUserPanel) =>
              onConfigChange({ ...config, publicUserPanel })
            }
            onPublicBreadcrumbsChange={(publicBreadcrumbs) =>
              onConfigChange({ ...config, publicBreadcrumbs })
            }
            onSaveConfig={onSaveConfig}
          />
        ) : null}
        {shellDraws(activeTab, "public-styling") ? (
          <PublicThemeSettings
            theme={config.publicTheme}
            presets={config.publicThemePresets}
            publicFont={config.publicFont}
            onThemeChange={(publicTheme) =>
              onConfigChange({ ...config, publicTheme })
            }
            onPresetsChange={(publicThemePresets) =>
              onConfigChange({ ...config, publicThemePresets })
            }
            onFontStateChange={(publicTheme, publicFont) =>
              onConfigChange({ ...config, publicTheme, publicFont })
            }
            onSaveConfig={onSaveConfig}
            saveRefusal={shellConfigSaveRefusal(config)}
          />
        ) : null}
        {shellDraws(activeTab, "public-pages") ? (
          <CardGroup>
            <FrontPageRowsSettings
              rows={config.frontPageRows}
              onRowsChange={(frontPageRows) =>
                onConfigChange({ ...config, frontPageRows })
              }
            />
            <PublicSystemPagesSettings
              config={config}
              onConfigChange={onConfigChange}
            />
          </CardGroup>
        ) : null}
        {shellDraws(activeTab, "public-seo") ? (
          <PublicSeoSettings config={config} onConfigChange={onConfigChange} />
        ) : null}
        {shellDraws(activeTab, "public-social") ? (
          <PublicSocialSettings
            config={config}
            onConfigChange={onConfigChange}
          />
        ) : null}
        {activeTab === "navigation" ? (
          <CardGroup>
            <SidebarSettings
              topLeftNavigation={
                <TopLeftNavigationSettings
                  config={config}
                  onConfigChange={onConfigChange}
                />
              }
              sections={config.sections}
              onSectionsChange={(sections) =>
                onConfigChange({ ...config, sections })
              }
              onSaveConfig={onSaveConfig}
              card={{
                storageId: "sidebar",
                title: "Your sidebar",
                description:
                  "The links you see in your own sidebar, in the order you put them. What members see is on the Members → Navigation page.",
              }}
              reset={{
                label: "Reset all to defaults",
                description:
                  "Every sidebar section and link is deleted. The workspace name, subheader, home route, logo, rows per page, sidebar width, top-right menu, all public settings, and signed-in styling go back to their defaults. Saved public presets are kept. This cannot be undone.",
                // A preset is a look the admin built and named, not a setting,
                // and it is the way back after a reset lands on a look nobody
                // wanted. Resetting the sidebar must not delete the lot.
                onReset: () =>
                  onConfigChange({
                    ...createDefaultShellConfig(),
                    publicThemePresets: config.publicThemePresets,
                  }),
              }}
            />
            <TopRightSettings
              items={config.topRightNavigation}
              onItemsChange={(topRightNavigation) =>
                onConfigChange({ ...config, topRightNavigation })
              }
              onSaveConfig={onSaveConfig}
              appActions={adminHeaderActions}
              card={{
                storageId: "top-right",
                title: "Your top right menu",
                description:
                  "The buttons in the top right of your own header, in the order you put them. What members see is on the Members → Navigation page.",
              }}
              reset={{
                label: "Reset top right menu",
                description:
                  "Every built-in button goes back to its starting place and is shown, and every link you added here is deleted. The members' menu is not touched. This cannot be undone.",
                onReset: () =>
                  onConfigChange({
                    ...config,
                    topRightNavigation: createDefaultTopRightNavigation(
                      adminHeaderActionIds
                    ),
                  }),
              }}
            />
          </CardGroup>
        ) : null}
        {shellDraws(activeTab, "member-navigation") ? (
          <CardGroup>
            <MemberSettings
              config={config}
              onConfigChange={onConfigChange}
              onSaveConfig={onSaveConfig}
            />
            <TopRightSettings
              items={config.memberTopRightNavigation}
              onItemsChange={(memberTopRightNavigation) =>
                onConfigChange({ ...config, memberTopRightNavigation })
              }
              onSaveConfig={onSaveConfig}
              appActions={memberHeaderActions}
              card={{
                storageId: "member-top-right",
                title: "Member top right menu",
                description:
                  "The buttons every member sees in the top right of their header, in the order you put them. Your own menu is on the Platform → Navigation page and is not affected.",
              }}
              reset={{
                label: "Reset member menu",
                description:
                  "Every built-in button goes back to its starting place and is shown for members, and every link you added for them is deleted. Your own menu is not touched. This cannot be undone.",
                onReset: () =>
                  onConfigChange({
                    ...config,
                    memberTopRightNavigation: createDefaultTopRightNavigation(
                      memberHeaderActionIds
                    ),
                  }),
              }}
            />
          </CardGroup>
        ) : null}
        {activeTab === "widgets" ? (
          <WidgetSettings
            layout={config.dashboardWidgets}
            onLayoutChange={(dashboardWidgets) =>
              onConfigChange({ ...config, dashboardWidgets })
            }
          />
        ) : null}
        {activeTab === "styling" ? (
          <StylingSettings config={config} onConfigChange={onConfigChange} />
        ) : null}
        {activeTab === "email" ? <EmailSettings /> : null}
        {activeTab === "payments" ? <StripeSettings /> : null}
        <AppSettingsPanel activeTab={activeTab} />
      </div>
    </div>
  )
}

/**
 * Each app panel wrapped once, outside any render.
 *
 * `React.lazy` makes a new component type every time it is called, and a
 * component type made during a render resets its state on every render. Made
 * here and remembered, so a tab keeps whatever it is holding.
 */
const lazyPanels = new Map<string, React.LazyExoticComponent<ComponentType>>()

function lazyPanelFor(
  id: string
): React.LazyExoticComponent<ComponentType> | null {
  const found = lazyPanels.get(id)
  if (found) return found
  const tab = extraTabs().find((one) => one.id === id)
  if (!tab) return null
  const made = React.lazy(tab.panel)
  lazyPanels.set(id, made)
  return made
}

/**
 * Whichever of the app's own tabs is open, loaded when it is drawn.
 *
 * The tab holds a pointer to its file rather than the component, so nothing the
 * panel imports is loaded until a browser asks for it — see `AppSettingsTab`.
 */
function AppSettingsPanel({ activeTab }: { activeTab: SettingsTabId }) {
  const panel = lazyPanelFor(activeTab)
  if (!panel) return null
  // Built with `createElement` rather than as `<Panel />` so it is plain that
  // the component comes from the cache above and is not made here.
  return (
    <React.Suspense fallback={null}>
      {React.createElement(panel)}
    </React.Suspense>
  )
}

/** One block of rows in a rail card, with an optional heading above it. */
type SettingsTabGroupSection = {
  /** Unset for the first block, which the card's own title already names. */
  label?: string
  tabs: readonly { id: SettingsTabId; label: string }[]
}

/**
 * One card in the settings rail. It collapses so a long rail can be folded down
 * to the group you are working in, and the choice is remembered per browser.
 *
 * A card can hold more than one block of rows. The Platform card does: its
 * public rows carry short names — Navigation, Styling — and the heading above
 * them is what says whose Navigation they are.
 */
function SettingsTabGroup({
  storageId,
  title,
  groups,
  activeTab,
}: {
  storageId: string
  title: string
  groups: readonly SettingsTabGroupSection[]
  activeTab: SettingsTabId
}) {
  return (
    <CollapsibleSettingsCard
      storageId={storageId}
      size="sm"
      title={title}
      contentClassName="px-3 pt-2"
    >
      <nav className="flex flex-col gap-1">
        {groups.map((group, index) => (
          <SettingsTabSection
            key={group.label ?? index}
            label={group.label}
            tabs={group.tabs}
            activeTab={activeTab}
          />
        ))}
      </nav>
    </CollapsibleSettingsCard>
  )
}

function SettingsTabSection({
  label,
  tabs,
  activeTab,
}: SettingsTabGroupSection & { activeTab: SettingsTabId }) {
  const labelId = React.useId()

  return (
    <div
      className="flex flex-col gap-1"
      role={label ? "group" : undefined}
      aria-labelledby={label ? labelId : undefined}
    >
      {label ? (
        // Edge to edge, so the line does not read as broken: pulled out to the
        // card's 12px inset and the heading put back inside it.
        <p
          id={labelId}
          className="-mx-3 mt-2 border-t px-3 pt-3 pb-1 font-heading text-base leading-snug font-medium"
        >
          {label}
        </p>
      ) : null}
      {tabs.map((tab) => (
        <SettingsTabLink
          key={tab.id}
          tabId={tab.id}
          label={tab.label}
          active={activeTab === tab.id}
        />
      ))}
    </div>
  )
}

function SettingsTabLink({
  tabId,
  label,
  active,
}: {
  tabId: SettingsTabId
  label: string
  active: boolean
}) {
  const className = cn(
    "rounded-md px-3 py-2 text-left text-sm font-medium transition-colors",
    focusRing,
    active
      ? "bg-muted text-foreground"
      : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
  )
  // The shaded tab is the one you are on. Saying so out loud is what tells a
  // screen reader apart from the shading, which it cannot see.
  const current = active ? ("page" as const) : undefined

  if (tabId === "general") {
    return (
      // Exact, or the router counts "/admin/settings" as current on every tab
      // below it and a screen reader is told two tabs are the one you are on.
      <Link
        to="/admin/settings"
        activeOptions={{ exact: true }}
        className={className}
        aria-current={current}
      >
        {label}
      </Link>
    )
  }

  return (
    <Link
      to="/admin/settings/$tab"
      params={{ tab: tabId }}
      className={className}
      aria-current={current}
    >
      {label}
    </Link>
  )
}
