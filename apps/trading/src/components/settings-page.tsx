import { Link } from "@tanstack/react-router"
import { Card, CardContent } from "@/components/ui/card"
import { GeneralSettings } from "@/components/general-settings"
import { SidebarSettings } from "@/components/sidebar-settings"
import { StylingSettings } from "@/components/styling-settings"
import { TradingSettings } from "@/components/trading-settings"
import { OneClickOrderSettings } from "@/components/one-click-order-settings"
import { WorkersSettings } from "@/components/workers-settings"
import { cn } from "@/lib/utils"
import type { ShellConfig } from "@/lib/custom-shell"
import { AlertCircleIcon } from "lucide-react"

const settingsTabs = [
  { id: "general", label: "General Settings" },
  { id: "trading", label: "Trading" },
  { id: "one-click-order", label: "One Click Order" },
  { id: "workers", label: "Workers" },
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
  settingsError,
  onConfigChange,
  onSaveConfig,
}: {
  activeTab: SettingsTabId
  config: ShellConfig
  settingsError: string | null
  onConfigChange: (config: ShellConfig) => void
  onSaveConfig: () => Promise<boolean>
}) {
  return (
    <div
      className="flex w-full flex-col pb-8"
      style={{ gap: "var(--shell-gutter, 1.5rem)" }}
    >
      {/* No page header and no save button: the sticky header already names the
          page, and every edit auto-saves — it shows "Saving…" then "Saved". */}
      {settingsError ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <AlertCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{settingsError}</span>
        </div>
      ) : null}

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
            <GeneralSettings config={config} onConfigChange={onConfigChange} />
          ) : null}
          {activeTab === "trading" ? (
            <TradingSettings config={config} onConfigChange={onConfigChange} />
          ) : null}
          {activeTab === "one-click-order" ? <OneClickOrderSettings /> : null}
          {activeTab === "workers" ? <WorkersSettings /> : null}
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
    "rounded-md px-4 py-2.5 text-left text-sm font-medium transition-colors",
    active
      ? "bg-muted text-foreground"
      : "text-muted-foreground hover:text-foreground"
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
