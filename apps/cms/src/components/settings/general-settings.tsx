import * as React from "react"
import { ImageUpload } from "@/components/shared/image-upload"
import { CollapsibleSettingsCard } from "@/components/settings/collapsible-settings-card"
import { CardGroup } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Input } from "@/components/ui/input"
import { FieldLabel } from "@/components/ui/field-label"
import { Label } from "@/components/ui/label"
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
  return (
    <CardGroup>
      <CollapsibleSettingsCard
        storageId="general"
        title="General settings"
        description="Set the product-wide name, behavior, and fallback logos."
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
            <SelectTrigger id="top-left-nav-limit" className="w-32">
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

        <ToastSecondsField config={config} onConfigChange={onConfigChange} />

        {/* The app's pictures sit together: they are all small, so a row of
            them is shorter than a stack and reads as one decision. */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <ImageUpload
            label="Fallback logo"
            value={config.logo}
            onChange={(url) => onConfigChange({ ...config, logo: url })}
            aspect="square"
            fit="contain"
            emptyLabel="Select logo"
            hint="Used when a site has no logo of its own. Leave it empty for the app name on its own."
            className="max-w-24"
          />

          <ImageUpload
            label="Fallback dark logo"
            value={config.logoDark}
            onChange={(url) => onConfigChange({ ...config, logoDark: url })}
            aspect="square"
            fit="contain"
            emptyLabel="Select logo"
            hint="Used in dark mode when a site has no dark logo of its own."
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

/**
 * Seconds a success message stays on screen. Kept as its own draft string so a
 * half-typed or out-of-range value is reported instead of being written to
 * the config — writing a clamped number back mid-keystroke would rewrite "9"
 * to "60" while the user was still typing "90".
 */
function ToastSecondsField({ config, onConfigChange }: GeneralSettingsProps) {
  const [draft, setDraft] = React.useState(() => String(config.toastSeconds))
  const [lastSaved, setLastSaved] = React.useState(config.toastSeconds)

  // Follow the saved value when something else changes it (a workspace switch,
  // or "Reset all to defaults" on the Sidebar tab). Adjusted during render
  // rather than in an effect so the field never paints the stale number first.
  if (lastSaved !== config.toastSeconds) {
    setLastSaved(config.toastSeconds)
    setDraft(String(config.toastSeconds))
  }

  const parsed = Number(draft)
  const valid =
    draft.trim() !== "" &&
    Number.isInteger(parsed) &&
    parsed >= MIN_TOAST_SECONDS &&
    parsed <= MAX_TOAST_SECONDS

  return (
    <div className="grid gap-2">
      <FieldLabel
        htmlFor="toast-seconds"
        hint={`How long a success message stays on screen, from ${MIN_TOAST_SECONDS} to ${MAX_TOAST_SECONDS} seconds. Failures are not affected — they stay until you dismiss them.`}
      >
        Toast message duration (seconds)
      </FieldLabel>
      <Input
        id="toast-seconds"
        type="number"
        inputMode="numeric"
        min={MIN_TOAST_SECONDS}
        max={MAX_TOAST_SECONDS}
        value={draft}
        onChange={(event) => {
          const next = event.target.value
          setDraft(next)
          const seconds = Number(next)
          if (
            next.trim() !== "" &&
            Number.isInteger(seconds) &&
            seconds >= MIN_TOAST_SECONDS &&
            seconds <= MAX_TOAST_SECONDS
          ) {
            onConfigChange({ ...config, toastSeconds: seconds })
          }
        }}
        aria-invalid={!valid || undefined}
        onBlur={() => {
          if (!valid) {
            showErrorToast(
              `Enter a whole number of seconds between ${MIN_TOAST_SECONDS} and ${MAX_TOAST_SECONDS}. The last valid value is still in use.`
            )
          }
        }}
      />
    </div>
  )
}
