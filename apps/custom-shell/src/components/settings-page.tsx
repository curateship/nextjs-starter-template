import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { SidebarSettings } from "@/components/sidebar-settings"
import { TopNavigationSettings } from "@/components/top-navigation-settings"
import { cn } from "@/lib/utils"
import type { ShellConfig } from "@/lib/custom-shell"
import { AlertCircleIcon, CheckIcon, Loader2Icon, SaveIcon } from "lucide-react"

const settingsTabs = [
  { id: "general", label: "General Settings" },
  { id: "sidebar", label: "Sidebar" },
  { id: "top-navigation", label: "Top Navigation" },
  { id: "style", label: "Style" },
  { id: "payments", label: "Payments" },
  { id: "email", label: "Email" },
  { id: "ai", label: "AI Providers" },
] as const

export type SettingsTabId = (typeof settingsTabs)[number]["id"]
type SaveStatus = "idle" | "saving" | "saved"

function getSettingsTabHref(tabId: SettingsTabId) {
  return tabId === "general"
    ? "#/admin/settings"
    : `#/admin/settings/${tabId}`
}

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
          {activeTab === "general" ? <GeneralSettings /> : null}
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
          {activeTab === "style" ? <StyleSettings /> : null}
          {activeTab === "payments" ? <PlaceholderSettings title="Payments" /> : null}
          {activeTab === "email" ? <PlaceholderSettings title="Email" /> : null}
          {activeTab === "ai" ? <PlaceholderSettings title="AI Providers" /> : null}
        </div>
      </div>
    </div>
  )
}

function GeneralSettings() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>General Settings</CardTitle>
        <CardDescription>Basic shell identity and workspace details.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="settings-app-name">App name</Label>
          <Input id="settings-app-name" defaultValue="custom-shell" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="settings-workspace">Workspace</Label>
          <Input id="settings-workspace" defaultValue="Internal" />
        </div>
      </CardContent>
    </Card>
  )
}

function StyleSettings() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Style</CardTitle>
        <CardDescription>Default visual settings for new apps.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Theme preset</Label>
          <Select defaultValue="graphite">
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="graphite">Graphite</SelectItem>
              <SelectItem value="verdant">Verdant</SelectItem>
              <SelectItem value="ember">Ember</SelectItem>
              <SelectItem value="cobalt">Cobalt</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Font preset</Label>
          <Select defaultValue="urbanist">
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="urbanist">Urbanist</SelectItem>
              <SelectItem value="editorial">Editorial</SelectItem>
              <SelectItem value="industrial">Industrial</SelectItem>
              <SelectItem value="operator">Operator</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  )
}

function PlaceholderSettings({ title }: { title: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>Settings content placeholder.</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          This section is ready for product-specific controls.
        </p>
      </CardContent>
    </Card>
  )
}
