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
import { Checkbox } from "@/components/ui/checkbox"
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
  type ShellConfig,
} from "@/lib/custom-shell"
import { MAX_CANDLES_LIMIT, MIN_CANDLES } from "@/lib/backtest/types"
import {
  browserAlertsEnabled as browserAlertsPreferenceEnabled,
  setBrowserAlertsEnabled as setBrowserAlertsPreference,
} from "@/lib/browser-alerts"

type GeneralSettingsProps = {
  config: ShellConfig
  isSaving: boolean
  onConfigChange: (config: ShellConfig) => void
}

export function GeneralSettings({
  config,
  isSaving,
  onConfigChange,
}: GeneralSettingsProps) {
  const [pickerOpen, setPickerOpen] = React.useState(false)
  const [browserPermission, setBrowserPermission] = React.useState<
    NotificationPermission | "unsupported"
  >("unsupported")
  const [browserAlertsEnabled, setBrowserAlertsEnabled] = React.useState(false)
  const favicon = config.favicon.trim()

  React.useEffect(() => {
    queueMicrotask(() => {
      const permission =
        "Notification" in window ? Notification.permission : "unsupported"
      setBrowserPermission(permission)
      setBrowserAlertsEnabled(
        permission === "granted" && browserAlertsPreferenceEnabled()
      )
    })
  }, [])

  async function changeBrowserAlerts(enabled: boolean) {
    if (!enabled) {
      setBrowserAlertsPreference(false)
      setBrowserAlertsEnabled(false)
      return
    }
    if (!("Notification" in window)) return
    const permission =
      Notification.permission === "default"
        ? await Notification.requestPermission()
        : Notification.permission
    const nextEnabled = permission === "granted"
    setBrowserAlertsPreference(nextEnabled)
    setBrowserPermission(permission)
    setBrowserAlertsEnabled(nextEnabled)
  }

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
            <Label htmlFor="admin-route">Home route</Label>
            <Input
              id="admin-route"
              value={config.adminRoute}
              disabled={isSaving}
              onChange={(event) =>
                onConfigChange({
                  ...config,
                  adminRoute: event.target.value,
                })
              }
              placeholder="Leave empty for the overview"
            />
            <p className="text-xs text-muted-foreground">
              Where the home page (<code>/</code>) and <code>/admin</code> open
              (e.g. <code>/trade</code>). Empty shows the workspace overview.
              Must be a real route — an unknown path will 404.
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
            <Label htmlFor="max-candles">Max chart candles</Label>
            <Input
              id="max-candles"
              type="number"
              inputMode="numeric"
              min={MIN_CANDLES}
              max={MAX_CANDLES_LIMIT}
              className="w-32"
              value={config.maxCandles}
              disabled={isSaving}
              onChange={(event) => {
                const next = Number(event.target.value)
                onConfigChange({
                  ...config,
                  maxCandles: Number.isFinite(next) ? next : config.maxCandles,
                })
              }}
            />
            <p className="text-xs text-muted-foreground">
              Candles loaded per trading chart, and the per-timeframe ceiling
              for backtest runs ({MIN_CANDLES}–{MAX_CANDLES_LIMIT}). Lower it to
              speed up charts and runs.
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

      <Card>
        <CardHeader>
          <CardTitle>Browser alerts</CardTitle>
          <CardDescription>
            Control browser popups for Trade, trading, Market Scanner, and Whale
            Scanner alerts.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-start gap-3">
            <Checkbox
              id="browser-alerts"
              checked={browserAlertsEnabled}
              disabled={
                browserPermission === "denied" ||
                browserPermission === "unsupported"
              }
              onCheckedChange={(checked) =>
                void changeBrowserAlerts(checked === true)
              }
            />
            <div className="grid gap-1">
              <Label htmlFor="browser-alerts" className="font-normal">
                Browser alerts
              </Label>
              <p className="text-xs text-muted-foreground">
                {browserPermission === "denied"
                  ? "Browser access is blocked for this app."
                  : browserPermission === "unsupported"
                    ? "This browser does not support notifications."
                    : browserAlertsEnabled
                      ? "Browser popups are on for all alerts."
                      : "Browser popups are off for all alerts."}
              </p>
            </div>
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
