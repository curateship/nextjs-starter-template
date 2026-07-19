import { Link } from "@tanstack/react-router"
import { Card, CardContent } from "@/components/ui/card"
import { DashboardToolbarButton } from "@/components/dashboard-toolbar"
import { GeneralSettings } from "@/components/general-settings"
import { ProviderSettings } from "@/components/provider-settings"
import { SidebarSettings } from "@/components/sidebar-settings"
import { StylingSettings } from "@/components/styling-settings"
import { cn } from "@/lib/utils"
import type { ShellConfig } from "@/lib/ai-agents"
import { AlertCircleIcon, CheckIcon, Loader2Icon, SaveIcon } from "lucide-react"

const settingsTabs = [
  { id: "general", label: "General Settings" },
  { id: "sidebar", label: "Sidebar" },
  { id: "styling", label: "Styling" },
  { id: "voice-provider", label: "Voice Provider" },
] as const

export type SettingsTabId = (typeof settingsTabs)[number]["id"]
type SaveStatus = "idle" | "saving" | "saved"

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
  saveStatus,
  onConfigChange,
  onSaveConfig,
}: {
  activeTab: SettingsTabId
  config: ShellConfig
  settingsError: string | null
  saveStatus: SaveStatus
  onConfigChange: (config: ShellConfig) => void
  onSaveConfig: () => Promise<boolean>
}) {
  const isSaving = saveStatus === "saving"

  return (
    <div
      className="flex w-full flex-col pb-8"
      style={{ gap: "var(--shell-gutter, 1.5rem)" }}
    >
      <Card>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <h1 className="font-heading text-xl font-semibold">Settings</h1>
            <p className="text-sm text-muted-foreground">
              Configure the shell defaults for this workspace.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {saveStatus === "saved" ? (
              <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                <CheckIcon className="h-4 w-4" />
                Saved
              </span>
            ) : null}
            <DashboardToolbarButton
              type="button"
              onClick={onSaveConfig}
              disabled={isSaving}
            >
              {isSaving ? (
                <Loader2Icon className="h-4 w-4 animate-spin" />
              ) : (
                <SaveIcon className="h-4 w-4" />
              )}
              {isSaving ? "Saving" : "Save"}
            </DashboardToolbarButton>
          </div>
        </CardContent>
      </Card>

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
            <GeneralSettings
              config={config}
              isSaving={isSaving}
              onConfigChange={onConfigChange}
            />
          ) : null}
          {activeTab === "sidebar" ? (
            <SidebarSettings
              config={config}
              isSaving={isSaving}
              onConfigChange={onConfigChange}
              onSaveConfig={onSaveConfig}
            />
          ) : null}
          {activeTab === "styling" ? (
            <StylingSettings
              config={config}
              isSaving={isSaving}
              onConfigChange={onConfigChange}
            />
          ) : null}
          {activeTab === "voice-provider" ? <ProviderSettings /> : null}
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
