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
import { DEFAULT_APP_NAME } from "@/lib/app-name"
import {
  DASHBOARD_ROWS_PER_PAGE_OPTIONS,
  DEFAULT_MAINTENANCE_MESSAGE,
  MAX_MAINTENANCE_MESSAGE_LENGTH,
  type ShellConfig,
  type ShellMaintenance,
} from "@/lib/custom-shell"
import { showErrorToast } from "@/lib/error-toast"
import { MAX_TOAST_SECONDS, MIN_TOAST_SECONDS } from "@/lib/toast-seconds"

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
        title="General Settings"
        description="Set the app and workspace names and the favicon used by the shell."
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
            aria-invalid={workspaceNameMissing || undefined}
            onBlur={() => {
              if (workspaceNameMissing) {
                showErrorToast(
                  "Add a workspace name — settings can't be saved without one."
                )
              }
            }}
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="workspace-subheader">Workspace subheader</Label>
          <Input
            id="workspace-subheader"
            value={config.workspacePlan}            onChange={(event) =>
              onConfigChange({
                ...config,
                workspacePlan: event.target.value,
              })
            }
            placeholder="Project"
          />
        </div>

        <div className="grid gap-2">
          <FieldLabel
            htmlFor="admin-route"
            hint="Where the home page and /admin open, for example /admin/media. Empty opens Settings. It has to be a real route — an unknown path will 404."
          >
            Home route
          </FieldLabel>
          <Input
            id="admin-route"
            value={config.adminRoute}            onChange={(event) =>
              onConfigChange({
                ...config,
                adminRoute: event.target.value,
              })
            }
            placeholder="Leave empty for Settings"
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="dashboard-rows-per-page">
            Default dashboard rows per page
          </Label>
          <Select
            value={String(config.dashboardRowsPerPage)}            onValueChange={(value) =>
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

        <ToastSecondsField config={config} onConfigChange={onConfigChange} />

        <ImageUpload
          label="Favicon"
          value={config.favicon}
          onChange={(url) => onConfigChange({ ...config, favicon: url })}
          aspect="square"
          fit="contain"
          emptyLabel="Select favicon"
          className="max-w-20"
        />
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
function ToastSecondsField({
  config,
  onConfigChange,
}: GeneralSettingsProps) {
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
