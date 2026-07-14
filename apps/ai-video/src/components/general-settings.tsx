import * as React from "react"
import { ImageIcon } from "lucide-react"

import { MediaPicker } from "@/components/media-picker"
import {
  Card,
  CardContent,
  CardDescription,
  CardGroup,
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
import {
  DASHBOARD_ROWS_PER_PAGE_OPTIONS,
  DEFAULT_ADMIN_ROUTE,
  isShellItem,
  MEDIA_UPLOAD_MAX_MB_LIMIT,
  type ShellConfig,
} from "@/lib/ai-video"
import {
  API_USAGE_LIMIT_MAX,
  API_USAGE_LIMIT_MIN,
} from "@/lib/api-usage-constants"
import { DUCK_DB_MAX, DUCK_DB_MIN } from "@/lib/audio-ducking"

type GeneralSettingsProps = {
  config: ShellConfig
  isSaving: boolean
  onConfigChange: (config: ShellConfig) => void
}

type RouteOption = { href: string; label: string }

// Finds the sidebar label for a route so the "/" option reuses the workspace's
// own wording (e.g. "My Videos") instead of a generic name when available.
function findSidebarLabel(config: ShellConfig, href: string): string | null {
  for (const section of config.sections) {
    for (const entry of section.entries) {
      if (!isShellItem(entry)) continue
      if (entry.href.trim() === href) return entry.label
      const child = entry.children?.find((c) => c.href.trim() === href)
      if (child) return child.label
    }
  }
  return null
}

// Landing-page choices: the home dashboard ("/") plus every visible sidebar
// destination. The currently saved route is always appended so the dropdown
// never falls back to an empty value after the sidebar changes.
function getDefaultRouteOptions(config: ShellConfig): RouteOption[] {
  const options: RouteOption[] = []
  const seen = new Set<string>()
  const add = (href: string, label: string) => {
    const trimmed = href.trim()
    if (!trimmed || seen.has(trimmed)) return
    seen.add(trimmed)
    options.push({ href: trimmed, label })
  }

  add(
    DEFAULT_ADMIN_ROUTE,
    findSidebarLabel(config, DEFAULT_ADMIN_ROUTE) ?? "Home dashboard"
  )

  config.sections.forEach((section) => {
    section.entries.forEach((entry) => {
      if (!isShellItem(entry) || !entry.visible) return
      add(entry.href, entry.label)
      entry.children?.forEach((child) => add(child.href, child.label))
    })
  })

  add(config.defaultRoute, config.defaultRoute)

  return options
}

export function GeneralSettings({
  config,
  isSaving,
  onConfigChange,
}: GeneralSettingsProps) {
  const [pickerOpen, setPickerOpen] = React.useState(false)
  const favicon = config.favicon.trim()
  const defaultRouteOptions = getDefaultRouteOptions(config)

  return (
    <CardGroup>
      <Card>
        <CardHeader>
          <CardTitle>General Settings</CardTitle>
          <CardDescription>
            Set the workspace name and favicon used by the shell.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-2">
            <Label htmlFor="workspace-name">Workspace name</Label>
            <Input
              id="workspace-name"
              value={config.workspaceName}
              disabled={isSaving}
              onChange={(event) =>
                onConfigChange({
                  ...config,
                  workspaceName: event.target.value,
                })
              }
              placeholder="Workspace name"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="workspace-subheader">Workspace subheader</Label>
            <Input
              id="workspace-subheader"
              value={config.workspacePlan}
              disabled={isSaving}
              onChange={(event) =>
                onConfigChange({
                  ...config,
                  workspacePlan: event.target.value,
                })
              }
              placeholder="Project"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="default-route">Default landing page</Label>
            <Select
              value={config.defaultRoute}
              disabled={isSaving}
              onValueChange={(value) =>
                onConfigChange({
                  ...config,
                  defaultRoute: value,
                })
              }
            >
              <SelectTrigger id="default-route" className="w-full sm:w-72">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {defaultRouteOptions.map((option) => (
                  <SelectItem key={option.href} value={option.href}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              The page the app opens to when you land on the app root.
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="dashboard-rows-per-page">
              Default dashboard rows per page
            </Label>
            <Select
              value={String(config.dashboardRowsPerPage)}
              disabled={isSaving}
              onValueChange={(value) =>
                onConfigChange({
                  ...config,
                  dashboardRowsPerPage: Number(value),
                })
              }
            >
              <SelectTrigger id="dashboard-rows-per-page" className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DASHBOARD_ROWS_PER_PAGE_OPTIONS.map((value) => (
                  <SelectItem key={value} value={String(value)}>
                    {value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="default-api-usage-credits">
              Default monthly API credits
            </Label>
            <Input
              id="default-api-usage-credits"
              type="number"
              min={API_USAGE_LIMIT_MIN}
              max={API_USAGE_LIMIT_MAX}
              value={config.defaultApiUsageMonthlyCredits}
              disabled={isSaving}
              onChange={(event) =>
                onConfigChange({
                  ...config,
                  defaultApiUsageMonthlyCredits: Number(event.target.value),
                })
              }
            />
            <p className="text-xs text-muted-foreground">
              Applies to users without a credit override.
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="api-usage-cost-per-credit">
              Estimated cost per credit (USD)
            </Label>
            <Input
              id="api-usage-cost-per-credit"
              type="number"
              min={0}
              step={0.0001}
              value={config.apiUsageCostPerCreditUsd}
              disabled={isSaving}
              onChange={(event) =>
                onConfigChange({
                  ...config,
                  apiUsageCostPerCreditUsd: Number(event.target.value),
                })
              }
            />
            <p className="text-xs text-muted-foreground">
              Used only for dashboard estimates; does not affect limits.
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="media-upload-max-mb">
              Max media upload size (MB)
            </Label>
            <Input
              id="media-upload-max-mb"
              type="number"
              min={1}
              max={MEDIA_UPLOAD_MAX_MB_LIMIT}
              value={config.mediaUploadMaxMb}
              disabled={isSaving}
              onChange={(event) =>
                onConfigChange({
                  ...config,
                  mediaUploadMaxMb: Number(event.target.value),
                })
              }
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="ducking-db">Duck under voice (dB)</Label>
            <Input
              id="ducking-db"
              type="number"
              min={DUCK_DB_MIN}
              max={DUCK_DB_MAX}
              step={1}
              value={config.duckingDb}
              disabled={isSaving}
              onChange={(event) =>
                onConfigChange({
                  ...config,
                  duckingDb: Number(event.target.value),
                })
              }
            />
            <p className="text-xs text-muted-foreground">
              How far a track marked “Duck under voice” drops beneath other audio
              on export. −12 dB is typical; 0 turns ducking off.
            </p>
          </div>

          <div className="grid gap-2">
            <Label>Favicon</Label>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={isSaving}
                className="grid h-16 min-w-16 place-items-center border border-dashed bg-muted/50 transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => setPickerOpen(true)}
                aria-label={favicon ? "Change favicon" : "Select favicon"}
              >
                {favicon ? (
                  <img
                    src={favicon}
                    alt="Favicon preview"
                    className="h-16 w-auto object-contain"
                  />
                ) : (
                  <div className="text-center text-xs text-muted-foreground">
                    <ImageIcon className="mx-auto mb-1 h-4 w-4" />
                    Select
                  </div>
                )}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              Upload a square image for the browser tab and workspace logo.
            </p>
          </div>
        </CardContent>
      </Card>

      <MediaPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onSelectMedia={(mediaUrl) =>
          onConfigChange({ ...config, favicon: mediaUrl })
        }
        currentMediaUrl={favicon}
        showVideos={false}
      />
    </CardGroup>
  )
}
