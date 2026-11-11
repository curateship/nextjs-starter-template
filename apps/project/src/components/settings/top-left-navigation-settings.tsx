import { SettingsSelectRow } from "@/components/settings/settings-select-row"
import { FieldLabel } from "@/components/ui/field-label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  TOP_LEFT_MODES,
  TOP_LEFT_NAV_LIMIT_OPTIONS,
  topLeftModeLabels,
  type ShellConfig,
  type ShellTopLeftMode,
} from "@/lib/custom-shell"

/**
 * The top left of the header: what it shows and, on the admin's own page, how
 * many links before the rest fold away. Members get their own Top left shows
 * on Members → Navigation; the max items is one number for both.
 */
export function TopLeftNavigationSettings({
  config,
  onConfigChange,
  audience,
}: {
  config: ShellConfig
  onConfigChange: (config: ShellConfig) => void
  audience: "admin" | "member"
}) {
  const modeField = audience === "admin" ? "topLeftMode" : "memberTopLeftMode"
  const modeId = `${audience}-top-left-mode`

  return (
    <div className="flex flex-col gap-4 sm:flex-row">
      <div className="grid gap-2">
        <FieldLabel
          htmlFor={modeId}
          hint={
            audience === "admin"
              ? "Sidebar links follow the current sidebar section. Breadcrumb shows where you are. Shortcuts shows the list in Top left shortcuts below on every page. What members see is on the Members tab."
              : "What every member sees in the top left of their header. Shortcuts uses the list on the Platform tab, without its admin pages."
          }
        >
          Top left shows
        </FieldLabel>
        <Select
          value={config[modeField]}
          onValueChange={(value) =>
            onConfigChange({
              ...config,
              [modeField]: value as ShellTopLeftMode,
            })
          }
        >
          <SelectTrigger id={modeId} className="w-full sm:w-fit">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TOP_LEFT_MODES.map((mode) => (
              <SelectItem key={mode} value={mode}>
                {topLeftModeLabels[mode]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {audience === "admin" ? (
        <SettingsSelectRow
          id="top-left-nav-limit"
          label="Top left max items"
          hint="Applies to Sidebar links and Shortcuts, for admins and members. Extra links go into the three-dot menu. Phones keep their compact menu."
          value={String(config.topLeftNavLimit)}
          options={TOP_LEFT_NAV_LIMIT_OPTIONS.map(String)}
          optionLabel={(value) => (value === "0" ? "Show all" : value)}
          onValueChange={(value) =>
            onConfigChange({ ...config, topLeftNavLimit: Number(value) })
          }
        />
      ) : null}
    </div>
  )
}
