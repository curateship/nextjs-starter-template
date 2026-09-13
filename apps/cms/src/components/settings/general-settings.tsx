import * as React from "react"
import { ImageUpload } from "@/components/shared/image-upload"
import { CollapsibleSettingsCard } from "@/components/settings/collapsible-settings-card"
import { CardGroup } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Input } from "@/components/ui/input"
import { FieldLabel } from "@/components/ui/field-label"
import { Label } from "@/components/ui/label"
import { NumberField } from "@/components/ui/number-field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { DEFAULT_APP_NAME } from "@/lib/branding"
import {
  DASHBOARD_ROWS_PER_PAGE_OPTIONS,
  type ShellConfig,
  type ShellMaintenance,
} from "@/lib/custom-shell"
import { showErrorToast } from "@/lib/toast/error-toast"
import { MAX_TOAST_SECONDS, MIN_TOAST_SECONDS } from "@/lib/toast/toast-seconds"

type GeneralSettingsProps = {
  config: ShellConfig
  onConfigChange: (config: ShellConfig) => void
}

type MaintenanceProps = {
  onMaintenanceChange: (maintenance: ShellMaintenance) => Promise<boolean>
  maintenanceBusy: boolean
}

export function GeneralSettings({
  config,
  onConfigChange,
  onMaintenanceChange,
  maintenanceBusy,
}: GeneralSettingsProps & MaintenanceProps) {
  // The auto-save refuses a blank workspace name (saveConfigNow in
  // shell-layout.tsx), so say so on blur rather than letting the edit sit on
  // screen looking saved.

  const workspaceNameMissing = !config.workspaceName.trim()

  return (
    <CardGroup>
      <CollapsibleSettingsCard
        storageId="general"
        title="General settings"
        description="Set the app and site names, and the one logo used on the signed-out pages and in the browser tab."
        contentClassName="space-y-6"
      >
        <div className="grid gap-2">
          <FieldLabel
            htmlFor="app-name"
            hint={`The product's own name — it shows in the browser tab and on the signed-out pages. Everyone sees the same one. Leave it empty to fall back to "${DEFAULT_APP_NAME}".`}
          >
            App name
          </FieldLabel>
          <Input
            id="app-name"
            value={config.appName}
            onChange={(event) =>
              onConfigChange({
                ...config,
                appName: event.target.value,
              })
            }
            placeholder={DEFAULT_APP_NAME}
          />
        </div>

        <div className="grid gap-2">
          <FieldLabel
            htmlFor="workspace-name"
            hint="The name of the site you are working on — it heads the sidebar and names this site in the switcher. Each site has its own; this renames the one you are in."
          >
            Site name
          </FieldLabel>
          <Input
            id="workspace-name"
            value={config.workspaceName}
            onChange={(event) =>
              onConfigChange({ ...config, workspaceName: event.target.value })
            }
            placeholder="Site name"
            aria-invalid={workspaceNameMissing || undefined}
            onBlur={() => {
              if (workspaceNameMissing) {
                showErrorToast(
                  "Give the site a name — settings can't be saved without one."
                )
              }
            }}
          />
        </div>

        <div className="grid gap-2">
          <FieldLabel
            htmlFor="admin-route"
            hint="Where the home page and /admin open for admins, for example /admin/media. Empty opens the Overview dashboard. It has to be a real route — an unknown path will 404."
          >
            Admin home route
          </FieldLabel>
          <Input
            id="admin-route"
            value={config.adminRoute}
            onChange={(event) =>
              onConfigChange({
                ...config,
                adminRoute: event.target.value,
              })
            }
            placeholder="Leave empty for the Overview"
          />
        </div>

        <div className="grid gap-2">
          <FieldLabel
            htmlFor="member-home-route"
            hint="Where the home page opens for everybody who is not an admin, for example /changelog/whats-new. Empty shows them their own home page: their plan, their notices and their feedback. It has to be a real route — an unknown path will 404."
          >
            Member home route
          </FieldLabel>
          <Input
            id="member-home-route"
            value={config.memberHomeRoute}
            onChange={(event) =>
              onConfigChange({
                ...config,
                memberHomeRoute: event.target.value,
              })
            }
            placeholder="Leave empty for their own home page"
          />
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
            <SelectTrigger
              id="dashboard-rows-per-page"
              className="w-full sm:w-fit"
            >
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

        <NumberField
          id="toast-seconds"
          label="Toast message duration (seconds)"
          hint={`How long a success message stays on screen, from ${MIN_TOAST_SECONDS} to ${MAX_TOAST_SECONDS} seconds. Failures are not affected — they stay until you dismiss them.`}
          value={config.toastSeconds}
          min={MIN_TOAST_SECONDS}
          max={MAX_TOAST_SECONDS}
          onChange={(toastSeconds) =>
            onConfigChange({ ...config, toastSeconds })
          }
        />

        <ImageUpload
          label="Logo"
          value={config.logo}
          onChange={(url) => onConfigChange({ ...config, logo: url })}
          aspect="square"
          fit="contain"
          emptyLabel="Select logo"
          hint="One picture for the whole app: the logo above the signed-out pages, the icon beside the site name in the sidebar, and the icon in the browser tab. Upload a PNG or an SVG. The app makes the dark-mode version itself, by turning the image's dark tones light and its light tones dark, and cuts the browser-tab sizes from both. Leave it empty for the app name on its own."
          className="max-w-24"
        />

        <div className="grid gap-2">
          <FieldLabel
            htmlFor="favicon-mode"
            hint="Which version of the logo the browser tab shows. Tabs usually sit on a dark or grey strip, where a logo in near-black disappears, so the dark-mode version is the usual answer. Only one is ever shown, because a browser left to choose between the two picks the wrong one."
          >
            Browser tab icon
          </FieldLabel>
          <Select
            value={config.faviconMode}
            onValueChange={(value) =>
              onConfigChange({
                ...config,
                faviconMode: value as ShellConfig["faviconMode"],
              })
            }
          >
            <SelectTrigger id="favicon-mode" className="w-full sm:w-fit">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="dark">Dark-mode version</SelectItem>
              <SelectItem value="light">The logo as uploaded</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CollapsibleSettingsCard>

      <CollapsibleSettingsCard
        storageId="live-notifications"
        title="Live notifications"
        description="Light the bell up the moment something happens. Turn it off and the bell still updates — just on its own check, up to a minute later."
        contentClassName="space-y-6"
      >
        <div className="flex items-center gap-2">
          <Checkbox
            id="live-notifications"
            checked={config.liveNotifications}
            onCheckedChange={(value) =>
              onConfigChange({ ...config, liveNotifications: value === true })
            }
          />
          <Label htmlFor="live-notifications" className="font-normal">
            Update the bell as things happen
          </Label>
        </div>
      </CollapsibleSettingsCard>

      <MaintenanceSettingsCard
        config={config}
        onConfigChange={onConfigChange}
        onMaintenanceChange={onMaintenanceChange}
        maintenanceBusy={maintenanceBusy}
      />
    </CardGroup>
  )
}

/**
 * The app-wide "back soon" switch. Turning it on asks first, because it shuts
 * the app for everybody who is not an admin the moment it is saved.
 *
 * The switch saves on its own rather than riding in the page's auto-save.
 * Keeping the two writes apart is deliberate. See lib/api/shell-settings.ts.
 */
function MaintenanceSettingsCard({
  config,
  onMaintenanceChange,
  maintenanceBusy,
}: GeneralSettingsProps & MaintenanceProps) {
  const [confirmOpen, setConfirmOpen] = React.useState(false)
  const { maintenance } = config

  return (
    <CollapsibleSettingsCard
      storageId="maintenance"
      title="Maintenance mode"
      description="Close the app to everyone but admins while you work on it."
      contentClassName="space-y-6"
    >
      <div className="flex items-center gap-2">
        <Checkbox
          id="maintenance-enabled"
          checked={maintenance.enabled}
          disabled={maintenanceBusy}
          onCheckedChange={(value) => {
            if (value === true) {
              setConfirmOpen(true)
              return
            }
            void onMaintenanceChange({ ...maintenance, enabled: false })
          }}
        />
        <Label htmlFor="maintenance-enabled" className="font-normal">
          Close the app to members
        </Label>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Turn on maintenance mode?"
        description="Everyone except admins sees your maintenance page instead of the app, starting now and lasting until you turn this back off. You keep working, with a reminder in the header."
        confirmLabel="Turn on"
        loading={maintenanceBusy}
        onConfirm={() => {
          void onMaintenanceChange({ ...maintenance, enabled: true }).then(
            (saved) => {
              if (saved) setConfirmOpen(false)
            }
          )
        }}
      />
    </CollapsibleSettingsCard>
  )
}
