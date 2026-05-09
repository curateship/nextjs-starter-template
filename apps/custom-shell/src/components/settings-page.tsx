import { Button } from "@/components/ui/button"
import { SidebarSettings } from "@/components/sidebar-settings"
import { TopNavigationSettings } from "@/components/top-navigation-settings"
import { cn } from "@/lib/utils"
import type { ShellConfig } from "@/lib/custom-shell"
import { AlertCircleIcon, CheckIcon, Loader2Icon, SaveIcon } from "lucide-react"

const settingsTabs = [
  { id: "sidebar", label: "Sidebar" },
  { id: "top-navigation", label: "Top Navigation" },
] as const

export type SettingsTabId = (typeof settingsTabs)[number]["id"]
type SaveStatus = "idle" | "saving" | "saved"

function getSettingsTabHref(tabId: SettingsTabId) {
  return tabId === "sidebar"
    ? "#/admin/settings"
    : `#/admin/settings/${tabId}`
}

export function getSettingsTabFromPath(path: string): SettingsTabId {
  const segment = path.replace(/^\/admin\/settings\/?/, "")
  return settingsTabs.some((tab) => tab.id === segment)
    ? (segment as SettingsTabId)
    : "sidebar"
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
  onSaveConfig: () => void
}) {
  return (
    <div className="w-full pb-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
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
          <Button
            type="button"
            size="sm"
            onClick={onSaveConfig}
            disabled={saveStatus === "saving"}
          >
            {saveStatus === "saving" ? (
              <Loader2Icon className="h-4 w-4 animate-spin" />
            ) : (
              <SaveIcon className="h-4 w-4" />
            )}
            {saveStatus === "saving" ? "Saving" : "Save"}
          </Button>
        </div>
      </div>

      {settingsError ? (
        <div
          role="alert"
          className="mb-4 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <AlertCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{settingsError}</span>
        </div>
      ) : null}

      <div className="flex flex-col items-start gap-6 lg:flex-row">
        <nav className="flex w-full shrink-0 flex-col lg:w-48">
          {settingsTabs.map((tab) => (
            <a
              key={tab.id}
              href={getSettingsTabHref(tab.id)}
              className={cn(
                "rounded-md px-4 py-2.5 text-left text-sm font-medium transition-colors",
                activeTab === tab.id
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {tab.label}
            </a>
          ))}
        </nav>

        <div className="min-w-0 flex-1">
          {activeTab === "sidebar" ? (
            <SidebarSettings
              config={config}
              onConfigChange={onConfigChange}
            />
          ) : null}
          {activeTab === "top-navigation" ? (
            <TopNavigationSettings
              config={config}
              onConfigChange={onConfigChange}
            />
          ) : null}
        </div>
      </div>
    </div>
  )
}
