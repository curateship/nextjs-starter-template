import * as React from "react"
import type { ComponentType } from "react"
import { Link } from "@tanstack/react-router"
import { AiSettings } from "@/components/settings/ai-settings"
import { CollapsibleSettingsCard } from "@/components/settings/collapsible-settings-card"
import { EmailSettings } from "@/components/settings/email-settings"
import { GeneralSettings } from "@/components/settings/general-settings"
import {
  PublicSeoSettings,
  PublicSocialSettings,
} from "@/components/settings/public-metadata-settings"
import { StripeSettings } from "@/components/settings/stripe-settings"
import { CardGroup } from "@/components/ui/card"
import { MOVED_SETTINGS_TAB_IDS } from "@/lib/admin-dashboard/moved-settings"
import { appSettingsTabs } from "@/lib/app-options"
import { focusRing } from "@/lib/layout/focus-ring"
import { pageGutter } from "@/lib/layout/shell-gutter"
import { cn } from "@/lib/utils"
import {
  type ShellConfig,
  type ShellMaintenance,
  type ShellSessionPolicy,
} from "@/lib/custom-shell"

/**
 * The admin's own rows, and the first block of the Platform card.
 *
 * Security, Notifications, Storage and AI were rows here until 25 Sep 2026;
 * each was one card, so each became a card on General settings instead. AI got
 * its own row back on 8 Oct 2026 at Tyler's request.
 *
 * Navigation and Styling were rows here until 9 Nov 2026, when they moved
 * into the Admin dashboard's Navigations and Styling sections with the
 * members', each role's and the public site's (Tyler: "consolidate the pages,
 * navigation and styling into the admin dashboard"). Their addresses forward
 * there (`lib/admin-dashboard/moved-settings.ts`).
 */
const settingsTabs = [
  { id: "general", label: "General settings" },
  { id: "email", label: "Email" },
  { id: "payments", label: "Payments" },
  { id: "ai", label: "AI" },
] as const

/**
 * The two audiences who are not the admin: the members who sign in, and the
 * visitors who do not.
 *
 * Both blocks sit in the Platform card, under the admin's own rows. They were
 * the App settings card from 25 Sep until 5 Oct 2026, because an app can be
 * right about either audience in a way the shell cannot guess. Tyler's call on
 * 5 Oct 2026: every one of these screens is the shell's, writing the shell's
 * `ShellConfig`, so they belong with the shell's other rows. App settings holds
 * only what the app itself added.
 *
 * An app can still register a tab with one of these ids and its own screen
 * takes that row's place, keeping its position in this card. See
 * `REPLACEABLE_SETTINGS_TAB_IDS` in `lib/app-options.ts`, which is this list.
 * Pomodoro is the reason: it draws its own member sidebar from its own list, so
 * the shell's member Navigation screen there edits settings no page of its
 * reads.
 *
 * **The data stays the shell's.** A replacement screen writes the same
 * `ShellConfig` fields the shell's version wrote, because `PublicPageFrame` and
 * the sidebar are still what draw from them. An app that writes somewhere else
 * gets a settings screen that changes nothing.
 */
const audienceGroups = [
  {
    label: "Members",
    tabs: [{ id: "member-navigation", label: "Navigation" }],
  },
  {
    label: "Public",
    tabs: [
      { id: "public-navigation", label: "Navigation" },
      { id: "public-styling", label: "Styling" },
      { id: "public-seo", label: "SEO" },
      { id: "public-social", label: "Social" },
    ],
  },
] as const

/**
 * True for a row that moved into the Admin dashboard and is drawn here only
 * when the app has a screen of its own for it.
 */
function movedUnlessClaimed(id: string) {
  return (MOVED_SETTINGS_TAB_IDS as readonly string[]).includes(id) && !extraTabs().some((tab) => tab.id === id)
}

/** The same rows, flat, for the id checks that do not care which block. */
const audienceTabs: readonly { id: SettingsTabId; label: string }[] =
  audienceGroups.flatMap((group) => group.tabs.map((tab) => ({ ...tab })))

export type SettingsTabId =
  | (typeof settingsTabs)[number]["id"]
  | (typeof audienceGroups)[number]["tabs"][number]["id"]

/**
 * Every id the shell itself owns, what an app's tab may not be called. The
 * moved Navigation and Styling ids stay on it, so an app cannot quietly take
 * an address that now forwards to the Admin dashboard.
 */
const shellSettingsTabIds: readonly string[] = [
  ...settingsTabs.map((tab) => tab.id),
  ...audienceTabs.map((tab) => tab.id),
  "navigation",
  "styling",
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

/** A row as the rail draws it, from either list's looser shape. */
const railRow = (tab: { id: string; label: string }) => ({
  id: tab.id as SettingsTabId,
  label: tab.label,
})

/**
 * The Platform card's rows, one list with no headings: the admin's own rows,
 * then SEO and Social (Tyler, 9 Nov 2026: "move the 2 settings in public into
 * platform settings and remove that subsection"). The Members and Public
 * headings went once Navigation and Styling moved into the Admin dashboard
 * left them with too little to head.
 *
 * A Members or Public row that moved there shows only when the app claimed
 * it with a screen of its own, and then under the app's own name for it, in
 * its old place in the order. A claimed row stays here rather than moving
 * into the app's card.
 */
function platformCardGroups(): readonly SettingsTabGroupSection[] {
  const own = extraTabs()
  const claim = (id: string) => own.find((tab) => tab.id === id)
  const audienceRows = audienceGroups.flatMap((group) =>
    group.tabs.filter((tab) => !movedUnlessClaimed(tab.id)).map((tab) => railRow(claim(tab.id) ?? tab))
  )
  return [{ tabs: [...settingsTabs.map(railRow), ...audienceRows] }]
}

/**
 * The rows in the app's card: what the app added, and nothing else.
 *
 * They carry no heading, because the card is already called App settings and
 * they are the reason an admin opens it. A row claimed from the Platform card
 * is not one of these — it is drawn where the shell's version was — so an app
 * that only claims rows leaves this card empty and the card says so.
 */
function appCardRows(): readonly { id: SettingsTabId; label: string }[] {
  return extraTabs()
    .filter((tab) => !audienceTabs.some((one) => one.id === tab.id))
    .map(railRow)
}

/**
 * True when this is the open row and the shell is the one drawing it.
 *
 * Every Members and Public row is claimable, so each of their panels below asks
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
    (shellSettingsTabIds.includes(segment) && !movedUnlessClaimed(segment)) ||
    extraTabs().some((tab) => tab.id === segment)
  return known ? (segment as SettingsTabId) : "general"
}

export function SettingsPage({
  activeTab,
  config,
  onConfigChange,
  onMaintenanceChange,
  maintenanceBusy,
  onSessionPolicyChange,
  sessionPolicyBusy,
}: {
  activeTab: SettingsTabId
  config: ShellConfig
  onConfigChange: (config: ShellConfig) => void
  /** Kept for the routes, which hand every screen the same runtime. */
  onSaveConfig: () => Promise<boolean>
  onMaintenanceChange: (maintenance: ShellMaintenance) => Promise<boolean>
  maintenanceBusy: boolean
  onSessionPolicyChange: (policy: ShellSessionPolicy) => Promise<boolean>
  sessionPolicyBusy: boolean
}) {
  const appRows = appCardRows()

  return (
    <div
      className="flex flex-col items-start lg:flex-row"
      style={{ gap: pageGutter }}
    >
      <div
        // 14rem, up from 12rem, so the cards' extra room never wraps
        // "Platform settings" onto two lines.
        className="flex w-full shrink-0 flex-col lg:w-56"
        style={{ gap: pageGutter }}
      >
        {/* Every screen the shell itself draws: the admin's own rows, then the
            members who sign in, then the visitors who do not. */}
        <SettingsTabGroup
          storageId="settings-rail-platform"
          title="Platform settings"
          groups={platformCardGroups()}
          activeTab={activeTab}
        />

        {/* The app's own card, always drawn so an admin can see at a glance
            whether this app added any settings of its own.

            Called "App settings" rather than the app's own name: the name is an
            editable field, so the card would rename itself the moment somebody
            changed it, and an admin already knows which app they are in. */}
        <SettingsTabGroup
          storageId="settings-rail-app"
          title="App settings"
          groups={appRows.length > 0 ? [{ tabs: appRows }] : []}
          empty="This app has no settings of its own."
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
        {shellDraws(activeTab, "public-seo") ? (
          <PublicSeoSettings config={config} onConfigChange={onConfigChange} />
        ) : null}
        {shellDraws(activeTab, "public-social") ? (
          <PublicSocialSettings
            config={config}
            onConfigChange={onConfigChange}
          />
        ) : null}
        {activeTab === "email" ? <EmailSettings /> : null}
        {activeTab === "payments" ? <StripeSettings /> : null}
        {activeTab === "ai" ? (
          <CardGroup>
            <AiSettings />
          </CardGroup>
        ) : null}
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
 * member and public rows carry short names — Navigation, Styling — and the
 * heading above them is what says whose Navigation they are.
 */
function SettingsTabGroup({
  storageId,
  title,
  groups,
  empty,
  activeTab,
}: {
  storageId: string
  title: string
  groups: readonly SettingsTabGroupSection[]
  /** What to say in place of the rows when there are none. */
  empty?: string
  activeTab: SettingsTabId
}) {
  return (
    <CollapsibleSettingsCard
      storageId={storageId}
      size="sm"
      title={title}
      // 8px more round the title and rows than the small card's own 12px
      // (Tyler, 9 Nov 2026: "add some spacing here", of the rail's two card
      // titles), keeping the small card's title size, and 16px between the
      // title and its first row ("still no spacing").
      className="px-2 data-[size=sm]:py-5"
      contentClassName="px-3 pt-4"
    >
      {groups.length === 0 && empty ? (
        // A sentence rather than a blank card: the card is drawn whether or not
        // the app added anything, so it has to say which of the two this is.
        <p className="pb-1 text-sm text-muted-foreground">{empty}</p>
      ) : (
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
      )}
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
