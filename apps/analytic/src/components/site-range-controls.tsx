import {
  DashboardToolbarSelectTrigger,
  dashboardToolbarSegmentedButtonActiveClassName,
  dashboardToolbarSegmentedButtonClassName,
  dashboardToolbarSegmentedButtonInactiveClassName,
  dashboardToolbarSegmentedGroupClassName,
} from "@/components/dashboard-toolbar"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select"
import type { CustomRange } from "@/hooks/use-site-range-query"
import type { OverviewRange } from "@/lib/api/overview"
import type { SiteItem } from "@/lib/api/sites"
import { cn } from "@/lib/utils"

const RANGE_PRESETS: {
  value: Exclude<OverviewRange, "custom">
  label: string
}[] = [
  { value: "today", label: "Today" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
]

// Site picker + range preset buttons, shared by the report toolbars.
export function SiteRangeControls({
  sites,
  siteId,
  range,
  onSiteChange,
  onRangeChange,
}: {
  sites: SiteItem[]
  siteId: string
  range: OverviewRange
  onSiteChange: (siteId: string) => void
  onRangeChange: (range: OverviewRange) => void
}) {
  return (
    <>
      <Select value={siteId} onValueChange={onSiteChange}>
        <DashboardToolbarSelectTrigger className="min-w-40">
          <SelectValue />
        </DashboardToolbarSelectTrigger>
        <SelectContent>
          {sites.map((site) => (
            <SelectItem key={site.id} value={site.id}>
              {site.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className={dashboardToolbarSegmentedGroupClassName}>
        {RANGE_PRESETS.map((preset) => (
          <button
            key={preset.value}
            type="button"
            onClick={() => onRangeChange(preset.value)}
            className={cn(
              dashboardToolbarSegmentedButtonClassName,
              range === preset.value
                ? dashboardToolbarSegmentedButtonActiveClassName
                : dashboardToolbarSegmentedButtonInactiveClassName
            )}
          >
            {preset.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => onRangeChange("custom")}
          className={cn(
            dashboardToolbarSegmentedButtonClassName,
            range === "custom"
              ? dashboardToolbarSegmentedButtonActiveClassName
              : dashboardToolbarSegmentedButtonInactiveClassName
          )}
        >
          Custom
        </button>
      </div>
    </>
  )
}

// The from/to date row shown when the "Custom" range is active.
export function CustomRangeFields({
  custom,
  onChange,
}: {
  custom: CustomRange
  onChange: (next: CustomRange) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3 text-sm">
      <label className="flex items-center gap-2">
        <span className="text-muted-foreground">From</span>
        <Input
          type="date"
          value={custom.from}
          max={custom.to}
          className="h-8 w-auto"
          onChange={(event) =>
            onChange({ ...custom, from: event.target.value })
          }
        />
      </label>
      <label className="flex items-center gap-2">
        <span className="text-muted-foreground">To</span>
        <Input
          type="date"
          value={custom.to}
          min={custom.from}
          className="h-8 w-auto"
          onChange={(event) => onChange({ ...custom, to: event.target.value })}
        />
      </label>
    </div>
  )
}

