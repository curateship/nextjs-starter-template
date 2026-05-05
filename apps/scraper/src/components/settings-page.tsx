import { useNavigate } from "@tanstack/react-router"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
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
import type {
  FontPresetKey,
  ShellConfig,
  ThemePresetKey,
} from "@/lib/custom-shell"

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
}: {
  activeTab: SettingsTabId
  config: ShellConfig
  onConfigChange: (config: ShellConfig) => void
}) {
  const navigate = useNavigate()

  return (
    <div className="w-full pb-8">
      <div className="mb-6 space-y-1">
        <h1 className="font-heading text-xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Configure the shell defaults for this workspace.
        </p>
      </div>

      <div className="flex flex-col items-start gap-6 lg:flex-row">
        <nav className="flex w-full shrink-0 flex-col lg:w-48">
          {settingsTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() =>
                void navigate({
                  to:
                    tab.id === "general"
                      ? "/admin/settings"
                      : "/admin/settings/$settingsTab",
                  params:
                    tab.id === "general"
                      ? undefined
                      : { settingsTab: tab.id },
                })
              }
              className={cn(
                "rounded-md px-4 py-2.5 text-left text-sm font-medium transition-colors",
                activeTab === tab.id
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        <div className="min-w-0 flex-1">
          {activeTab === "general" ? (
            <GeneralSettings config={config} onConfigChange={onConfigChange} />
          ) : null}
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
          {activeTab === "style" ? (
            <StyleSettings config={config} onConfigChange={onConfigChange} />
          ) : null}
          {activeTab === "payments" ? <PlaceholderSettings title="Payments" /> : null}
          {activeTab === "email" ? <PlaceholderSettings title="Email" /> : null}
          {activeTab === "ai" ? <PlaceholderSettings title="AI Providers" /> : null}
        </div>
      </div>
    </div>
  )
}

function GeneralSettings({
  config,
  onConfigChange,
}: {
  config: ShellConfig
  onConfigChange: (config: ShellConfig) => void
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>General Settings</CardTitle>
        <CardDescription>Basic shell identity and workspace details.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="settings-app-name">App name</Label>
          <Input
            id="settings-app-name"
            value={config.appName}
            onChange={(event) =>
              onConfigChange({ ...config, appName: event.target.value })
            }
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="settings-workspace">Workspace</Label>
          <Input
            id="settings-workspace"
            value={config.workspaceName}
            onChange={(event) =>
              onConfigChange({ ...config, workspaceName: event.target.value })
            }
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="settings-plan">Plan</Label>
          <Input
            id="settings-plan"
            value={config.workspacePlan}
            onChange={(event) =>
              onConfigChange({ ...config, workspacePlan: event.target.value })
            }
          />
        </div>
      </CardContent>
    </Card>
  )
}

function StyleSettings({
  config,
  onConfigChange,
}: {
  config: ShellConfig
  onConfigChange: (config: ShellConfig) => void
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Style</CardTitle>
        <CardDescription>Default visual settings for new apps.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Theme preset</Label>
          <Select
            value={config.themePreset}
            onValueChange={(value) =>
              onConfigChange({
                ...config,
                themePreset: value as ThemePresetKey,
              })
            }
          >
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
          <Select
            value={config.fontPreset}
            onValueChange={(value) =>
              onConfigChange({
                ...config,
                fontPreset: value as FontPresetKey,
              })
            }
          >
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
