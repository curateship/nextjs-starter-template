import type { SideRow } from "@/components/shared/notes/side-rows"
import type { AiUsageDashboard } from "@/lib/api/ai"
import type { AdminUsageSummary } from "@/lib/api/billing/usage"
import type { TrafficSummary } from "@/lib/api/traffic"
import { describeCode } from "@/lib/format/code-label"
import { formatSharePercent, formatTokenCount } from "@/lib/format/format-number"
import { formatMoney } from "@/lib/format/money"
import { plural } from "@/lib/format/plural"

/** Overview's smaller lists as rows, one widget each. */

const DEVICE_LABELS: Record<string, string> = {
  phone: "Phone",
  tablet: "Tablet",
  computer: "Computer",
}

/** The overflow bucket the beacon files rare keys under. */
function trafficKeyName(key: string) {
  return key === "(other)" ? "(everything else)" : key
}

export function topPageRows(traffic: TrafficSummary): SideRow[] {
  return traffic.topPages.map((row) => ({
    key: row.key,
    name: trafficKeyName(row.key),
    value: row.views.toLocaleString(),
  }))
}

export function deviceRows(traffic: TrafficSummary): SideRow[] {
  return traffic.devices.map((row) => ({
    key: row.key,
    name: DEVICE_LABELS[row.key] ?? row.key,
    line: `${formatSharePercent(row.views, traffic.totals.views)} of views`,
    value: row.views.toLocaleString(),
  }))
}

export function referrerRows(traffic: TrafficSummary): SideRow[] {
  return traffic.topReferrers.map((row) => ({
    key: row.key,
    name: trafficKeyName(row.key),
    value: row.views.toLocaleString(),
  }))
}

export function featureRows(ai: AiUsageDashboard): SideRow[] {
  return [...ai.byFeature]
    .sort((a, b) => b.costCents - a.costCents)
    .map((row) => ({
      key: row.feature,
      name: describeCode(row.feature),
      line: `${row.calls.toLocaleString()} calls · ${formatTokenCount(row.tokens)} tokens`,
      value: formatMoney(row.costCents),
    }))
}

export function modelRows(ai: AiUsageDashboard): SideRow[] {
  return [...ai.byModel]
    .sort((a, b) => b.costCents - a.costCents)
    .map((row) => ({
      key: `${row.provider}:${row.model}`,
      name: row.model,
      line: `${row.provider} · ${row.calls.toLocaleString()} calls`,
      value: formatMoney(row.costCents),
    }))
}

/**
 * Its Stripe reports to review are every report still pending or failed,
 * whatever its date, because a report stuck since last month still needs
 * looking at.
 */
export function meterRows(metered: AdminUsageSummary): SideRow[] {
  return metered.byMeter.map((row) => {
    const review = row.pending + row.failed
    const events = `${row.events.toLocaleString()} ${plural(row.events, "event")}`
    return {
      key: row.meter,
      name: describeCode(row.meter),
      line: review ? `${events} · ${review} Stripe ${plural(review, "report")} to review` : events,
      value: `${row.quantity.toLocaleString()} ${plural(row.quantity, "unit")}`,
    }
  })
}

/** The words a list shows with nothing in it. */
export const EMPTY_TEXT = {
  pages: "No pages have been viewed yet.",
  devices: "No visits have been counted yet.",
  referrers: "Nobody came from another site yet.",
  features: "Nothing has used AI yet.",
  models: "Nothing has used AI yet.",
  meters: "No metered usage in this range.",
} as const
