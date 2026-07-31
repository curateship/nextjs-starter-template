import { Link } from "@tanstack/react-router"
import { Card, CardContent } from "@/components/ui/card"
import { GeneralSettings } from "@/components/settings/general-settings"
import { SidebarSettings } from "@/components/settings/sidebar-settings"
import { StylingSettings } from "@/components/settings/styling-settings"
import { cn } from "@/lib/utils"
import type { ShellConfig, ShellMaintenance } from "@/lib/custom-shell"

const settingsTabs = [
  { id: "general", label: "General Settings" },
  { id: "sidebar", label: "Sidebar" },
  { id: "styling", label: "Styling" },
] as const

export type SettingsTabId = (typeof settingsTabs)[number]["id"]

export function getSettingsTabFromPath(path: string): SettingsTabId {
  const segment = path.replace(/^\/admin\/settings\/?/, "")
  return settingsTabs.some((tab) => tab.id === segment)
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
}: {
  activeTab: SettingsTabId
  config: ShellConfig
  onConfigChange: (config: ShellConfig) => void
  onSaveConfig: () => Promise<boolean>
  onMaintenanceChange: (maintenance: ShellMaintenance) => Promise<boolean>
  maintenanceBusy: boolean
}) {
  return (
    <div
      className="flex w-full flex-col pb-8"
      style={{ gap: "var(--shell-gutter, 1.5rem)" }}
    >

      <div
        className="flex flex-col items-start lg:flex-row"
        style={{ gap: "var(--shell-gutter, 1.5rem)" }}
      >
        <Card className="w-full shrink-0 lg:w-48">
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
              config={config}
              onConfigChange={onConfigChange}
              onSaveConfig={onSaveConfig}
            />
          ) : null}
          {activeTab === "styling" ? (
            <StylingSettings config={config} onConfigChange={onConfigChange} />
          ) : null}
        </div>
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
    active
      ? "bg-muted text-foreground"
      : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
  )

  if (tabId === "general") {
    return (
      <Link to="/admin/settings" className={className}>
        {label}
      </Link>
    )
  }

  return (
    <Link
      to="/admin/settings/$tab"
      params={{ tab: tabId }}
      className={className}
    >
      {label}
    </Link>
  )
}
