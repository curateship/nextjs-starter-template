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
  DEFAULT_MAINTENANCE_MESSAGE,
  MAX_MAINTENANCE_MESSAGE_LENGTH,
  TOP_LEFT_NAV_LIMIT_OPTIONS,
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
        description="Set the app and workspace names, browser-tab icons, and the logo on the signed-out pages."
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

        <div className="grid gap-2">
          <FieldLabel
            htmlFor="top-left-nav-limit"
            hint="The row of links in the top bar comes from whichever sidebar section you are in, so a big section makes a long row. Past this many links the rest fold into a menu behind a three-dot button. If the page you are on is one of the folded ones, nothing in the row is highlighted."
          >
            Top bar links before a menu
          </FieldLabel>
          <Select
            value={String(config.topLeftNavLimit)}
            onValueChange={(value) =>
              onConfigChange({
                ...config,
                topLeftNavLimit: Number(value),
              })
            }
          >
            <SelectTrigger
              id="top-left-nav-limit"
              className="w-full sm:w-fit"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TOP_LEFT_NAV_LIMIT_OPTIONS.map((value) => (
                <SelectItem key={value} value={String(value)}>
                  {value === 0 ? "Show all" : value}
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

        {/* The app's pictures sit together: they are all small, so a row of
            them is shorter than a stack and reads as one decision. */}
        <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start">
          <ImageUpload
            label="Favicon"
            value={config.favicon}
            onChange={(url) => onConfigChange({ ...config, favicon: url })}
            aspect="square"
            fit="contain"
            emptyLabel="Select favicon"
            hint="Shown in browser tabs across the signed-in app and public pages. The app makes the common browser sizes from this one square image."
            className="max-w-24"
          />

          <ImageUpload
            label="Dark favicon"
            value={config.faviconDark}
            onChange={(url) => onConfigChange({ ...config, faviconDark: url })}
            aspect="square"
            fit="contain"
            emptyLabel="Select favicon"
            hint="Optional. Browsers that use dark tabs get this image instead. Leave it empty to use the favicon above everywhere."
            className="max-w-24"
          />

          <ImageUpload
            label="Logo"
            value={config.logo}
            onChange={(url) => onConfigChange({ ...config, logo: url })}
            aspect="square"
            fit="contain"
            emptyLabel="Select logo"
            hint="Shown above the signed-out pages — sign in, register, verify, reset password and pricing. Everyone sees the same one. Leave it empty for the app name on its own."
            className="max-w-24"
          />

          <ImageUpload
            label="Dark logo"
            value={config.logoDark}
            onChange={(url) => onConfigChange({ ...config, logoDark: url })}
            aspect="square"
            fit="contain"
            emptyLabel="Select logo"
            hint="Optional. Shown in place of the logo while a visitor has their device in dark mode, so a logo drawn in near-black does not disappear on a dark page. Leave it empty and the one logo above is used on both."
            className="max-w-24"
          />
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
 * The switch saves on its own (confirmed and written to the activity trail);
 * the message rides along with the page's normal auto-save like every other
 * field here. Keeping the switch out of that save is deliberate — see
 * lib/api/shell-settings.ts.
 */
function MaintenanceSettingsCard({
  config,
  onConfigChange,
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

      <div className="grid gap-2">
        <FieldLabel
          htmlFor="maintenance-message"
          hint={`What members read while the app is closed. Leave it empty to show "${DEFAULT_MAINTENANCE_MESSAGE}".`}
        >
          Message
        </FieldLabel>
        <Input
          id="maintenance-message"
          value={maintenance.message}
          maxLength={MAX_MAINTENANCE_MESSAGE_LENGTH}
          onChange={(event) =>
            onConfigChange({
              ...config,
              maintenance: { ...maintenance, message: event.target.value },
            })
          }
          placeholder={DEFAULT_MAINTENANCE_MESSAGE}
        />
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
