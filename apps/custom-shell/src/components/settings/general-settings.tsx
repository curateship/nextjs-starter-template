import * as React from "react"
import { ImageUpload } from "@/components/shared/image-upload"
import { CollapsibleSettingsCard } from "@/components/settings/collapsible-settings-card"
import { CardGroup } from "@/components/ui/card"
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
import {
  DASHBOARD_ROWS_PER_PAGE_OPTIONS,
  type ShellConfig,
} from "@/lib/custom-shell"
import { showErrorToast } from "@/lib/error-toast"
import { MAX_TOAST_SECONDS, MIN_TOAST_SECONDS } from "@/lib/toast-seconds"

type GeneralSettingsProps = {
  config: ShellConfig
  onConfigChange: (config: ShellConfig) => void
}

export function GeneralSettings({
  config,
  onConfigChange,
}: GeneralSettingsProps) {
  // The auto-save refuses a blank workspace name (saveConfigNow in
  // shell-layout.tsx), so say so on blur rather than letting the edit sit on
  // screen looking saved.
  const workspaceNameMissing = !config.workspaceName.trim()

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
    </CardGroup>
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
