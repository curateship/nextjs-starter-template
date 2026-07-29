import * as React from "react"

import { CollapsibleSettingsCard } from "@/components/collapsible-settings-card"
import { ImageUpload } from "@/components/image-upload"
import { CardGroup } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { NumberInput } from "@/components/ui/number-input"
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
  onConfigChange: (config: ShellConfig) => void
}

export function GeneralSettings({
  config,
  onConfigChange,
}: GeneralSettingsProps) {
  const [browserPermission, setBrowserPermission] = React.useState<
    NotificationPermission | "unsupported"
  >("unsupported")
  const [browserAlertsEnabled, setBrowserAlertsEnabled] = React.useState(false)

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
      <CollapsibleSettingsCard
        storageId="general"
        title="General Settings"
        description="Set the workspace name and favicon used by the shell."
        contentClassName="space-y-6"
      >
        <div className="grid gap-2">
          <Label htmlFor="workspace-name">Workspace name</Label>
          <Input
            id="workspace-name"
            value={config.workspaceName}
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
            onChange={(event) =>
              onConfigChange({
                ...config,
                adminRoute: event.target.value,
              })
            }
            placeholder="Leave empty for Trade"
          />
          <p className="text-xs text-muted-foreground">
            Where the home page (<code>/</code>) and <code>/admin</code> open
            (e.g. <code>/scanner/market</code>). Empty opens Trade. Must be a
            real route — an unknown path will 404.
          </p>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="dashboard-rows-per-page">
            Default dashboard rows per page
          </Label>
          <Select
            value={String(config.dashboardRowsPerPage)}
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
          <NumberInput
            id="max-candles"
            inputMode="numeric"
            min={MIN_CANDLES}
            max={MAX_CANDLES_LIMIT}
            className="w-32"
            value={config.maxCandles}
            onValueChange={(next) =>
              onConfigChange({ ...config, maxCandles: next })
            }
          />
          <p className="text-xs text-muted-foreground">
            Candles loaded per trading chart, and the per-timeframe ceiling for
            backtest runs ({MIN_CANDLES}–{MAX_CANDLES_LIMIT}). Lower it to speed
            up charts and runs.
          </p>
        </div>

        <ImageUpload
          label="Favicon"
          value={config.favicon}
          onChange={(url) => onConfigChange({ ...config, favicon: url })}
          aspect="square"
          fit="contain"
          emptyLabel="Select favicon"
          showLabel={false}
          className="max-w-20"
        />
      </CollapsibleSettingsCard>

      <CollapsibleSettingsCard
        storageId="browser-alerts"
        title="Browser alerts"
        description="Control browser popups for Trade, trading, Market Scanner, and Whale Scanner alerts."
      >
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
      </CollapsibleSettingsCard>
    </CardGroup>
  )
}
