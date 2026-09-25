import {
  AppWindowIcon,
  Loader2Icon,
  MapPinIcon,
  MonitorSmartphoneIcon,
  UsersIcon,
} from "lucide-react"

import { BreakdownTable } from "@/components/breakdown-table"
import { DashboardRow } from "@/components/demo/dashboard-content"
import {
  DashboardToolbar,
  DashboardToolbarControls,
  DashboardToolbarTitle,
} from "@/components/dashboard-toolbar"
import { NoSitesState } from "@/components/overview-dashboard"
import {
  CustomRangeFields,
  SiteRangeControls,
} from "@/components/site-range-controls"
import { useSiteRangeQuery } from "@/hooks/use-site-range-query"
import { TableSurface } from "@/components/ui/table"
import {
  getAudienceErrorMessage,
  loadAudience,
  type SiteAudience,
} from "@/lib/api/audience"
import type { OverviewRange } from "@/lib/api/overview"
import type { SiteItem } from "@/lib/api/sites"

// Country rollup keys are ISO codes ("US") or "Unknown"; show real names.
const regionNames = new Intl.DisplayNames(undefined, { type: "region" })

function formatCountry(key: string) {
  try {
    return regionNames.of(key) ?? key
  } catch {
    return key
  }
}

function formatDevice(key: string) {
  return key.charAt(0).toUpperCase() + key.slice(1)
}

export function AudienceDashboard({
  sites,
  initialSiteId,
  initialRange,
  initialAudience,
}: {
  sites: SiteItem[]
  initialSiteId: string | null
  initialRange: OverviewRange
  initialAudience: SiteAudience | null
}) {
  if (sites.length === 0 || !initialSiteId || !initialAudience) {
    return <NoSitesState />
  }

  return (
    <AudienceBody
      sites={sites}
      initialSiteId={initialSiteId}
      initialRange={initialRange}
      initialAudience={initialAudience}
    />
  )
}

function AudienceBody({
  sites,
  initialSiteId,
  initialRange,
  initialAudience,
}: {
  sites: SiteItem[]
  initialSiteId: string
  initialRange: OverviewRange
  initialAudience: SiteAudience
}) {
  const {
    siteId,
    range,
    custom,
    data: audience,
    loading,
    error,
    selectSite,
    selectRange,
    changeCustom,
  } = useSiteRangeQuery<SiteAudience>({
    initialSiteId,
    initialRange,
    initialCustom: { from: initialAudience.from, to: initialAudience.to },
    initialData: initialAudience,
    load: loadAudience,
    errorMessage: getAudienceErrorMessage,
  })

  return (
    <div className="w-full space-y-[var(--shell-gutter,0.75rem)]">
      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <TableSurface>
        <DashboardToolbar>
          <DashboardToolbarTitle>
            <UsersIcon className="text-muted-foreground" />
            <span className="text-sm font-medium sm:text-base">Audience</span>
            {loading ? (
              <Loader2Icon className="size-4 animate-spin text-muted-foreground" />
            ) : null}
          </DashboardToolbarTitle>

          <DashboardToolbarControls>
            <SiteRangeControls
              sites={sites}
              siteId={siteId}
              range={range}
              onSiteChange={selectSite}
              onRangeChange={selectRange}
            />
          </DashboardToolbarControls>
        </DashboardToolbar>

        {range === "custom" ? (
          <CustomRangeFields custom={custom} onChange={changeCustom} />
        ) : null}
      </TableSurface>

      <DashboardRow>
        <BreakdownTable
          title="Devices"
          columnLabel="Device"
          countLabel="Visitors"
          icon={<MonitorSmartphoneIcon className="size-4 text-muted-foreground" />}
          items={audience.devices}
          formatKey={formatDevice}
          emptyText="No device data in this range yet."
        />
        <BreakdownTable
          title="Browsers"
          columnLabel="Browser"
          countLabel="Visitors"
          icon={<AppWindowIcon className="size-4 text-muted-foreground" />}
          items={audience.browsers}
          emptyText="No browser data in this range yet."
        />
        <BreakdownTable
          title="Countries"
          columnLabel="Country"
          countLabel="Visitors"
          icon={<MapPinIcon className="size-4 text-muted-foreground" />}
          items={audience.countries}
          formatKey={formatCountry}
          emptyText="No country data in this range yet."
        />
      </DashboardRow>
    </div>
  )
}
