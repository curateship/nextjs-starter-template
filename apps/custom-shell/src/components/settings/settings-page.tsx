import { Link } from "@tanstack/react-router"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { GeneralSettings } from "@/components/settings/general-settings"
import { MemberSettings } from "@/components/settings/member-settings"
import { SecuritySettings } from "@/components/settings/security-settings"
import { SidebarSettings } from "@/components/settings/sidebar-settings"
import { StylingSettings } from "@/components/settings/styling-settings"
import { focusRing } from "@/lib/focus-ring"
import { pageGutter } from "@/lib/shell-gutter"
import { cn } from "@/lib/utils"
import {
  createDefaultShellConfig,
  type ShellConfig,
  type ShellMaintenance,
  type ShellSessionPolicy,
} from "@/lib/custom-shell"

/** Settings that are about the app, and about the admin's own shell. */
const settingsTabs = [
  { id: "general", label: "General settings" },
  { id: "sidebar", label: "Sidebar" },
  { id: "styling", label: "Styling" },
  { id: "security", label: "Security" },
] as const

/**
 * Settings an admin decides on a member's behalf. Their own card in the rail,
 * so it is obvious at a glance which of these change somebody else's screen.
 * Only the sidebar so far; the rest go in this list.
 */
const memberSettingsTabs = [{ id: "member-sidebar", label: "Sidebar" }] as const

export type SettingsTabId =
  | (typeof settingsTabs)[number]["id"]
  | (typeof memberSettingsTabs)[number]["id"]

const allSettingsTabIds: readonly string[] = [
  ...settingsTabs.map((tab) => tab.id),
  ...memberSettingsTabs.map((tab) => tab.id),
]

export function getSettingsTabFromPath(path: string): SettingsTabId {
  const segment = path.replace(/^\/admin\/settings\/?/, "")
  return allSettingsTabIds.includes(segment)
    ? (segment as SettingsTabId)
    : "general"
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
  return (
    <div
      className="flex flex-col items-start lg:flex-row"
      style={{ gap: pageGutter }}
    >
      <div
        className="flex w-full shrink-0 flex-col lg:w-48"
        style={{ gap: pageGutter }}
      >
        <Card size="sm">
          <CardHeader>
            <CardTitle>Platform</CardTitle>
          </CardHeader>
          <CardContent className="px-2">
            <nav className="flex flex-col gap-1">
              {settingsTabs.map((tab) => (
                <SettingsTabLink
                  key={tab.id}
                  tabId={tab.id}
                  label={tab.label}
                  active={activeTab === tab.id}
                />
              ))}
            </nav>
          </CardContent>
        </Card>

        <Card size="sm">
          <CardHeader>
            <CardTitle>Members</CardTitle>
          </CardHeader>
          <CardContent className="px-2">
            <nav className="flex flex-col gap-1">
              {memberSettingsTabs.map((tab) => (
                <SettingsTabLink
                  key={tab.id}
                  tabId={tab.id}
                  label={tab.label}
                  active={activeTab === tab.id}
                />
              ))}
            </nav>
          </CardContent>
        </Card>
      </div>

      <div className="min-w-0 flex-1">
        {activeTab === "general" ? (
          <GeneralSettings
            config={config}
            onConfigChange={onConfigChange}
            onMaintenanceChange={onMaintenanceChange}
            maintenanceBusy={maintenanceBusy}
          />
        ) : null}
        {activeTab === "sidebar" ? (
          <SidebarSettings
            sections={config.sections}
            onSectionsChange={(sections) =>
              onConfigChange({ ...config, sections })
            }
            onSaveConfig={onSaveConfig}
            reset={{
              label: "Reset all to defaults",
              description:
                "Every sidebar section and link is deleted. The workspace name, subheader, home route, favicon, rows per page, sidebar width, top-right menu, and all styling go back to their defaults. This cannot be undone.",
              onReset: () => onConfigChange(createDefaultShellConfig()),
            }}
          />
        ) : null}
        {activeTab === "member-sidebar" ? (
          <MemberSettings
            config={config}
            onConfigChange={onConfigChange}
            onSaveConfig={onSaveConfig}
          />
        ) : null}
        {activeTab === "styling" ? (
          <StylingSettings config={config} onConfigChange={onConfigChange} />
        ) : null}
        {activeTab === "security" ? (
          <SecuritySettings
            config={config}
            onSessionPolicyChange={onSessionPolicyChange}
            sessionPolicyBusy={sessionPolicyBusy}
          />
        ) : null}
      </div>
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
