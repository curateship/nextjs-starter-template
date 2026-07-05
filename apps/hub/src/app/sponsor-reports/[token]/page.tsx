import type { Metadata } from 'next'
import { headers } from 'next/headers'
import Link from 'next/link'
import {
  DEFAULT_SPONSOR_REPORT_RANGE,
  getSponsorReport,
  normalizeSponsorReportRange,
  resolveSponsorReportToken,
  type SponsorReport,
  type SponsorReportRange,
} from '@/lib/actions/sponsors/sponsor-report-data'
import { getClientIp, isRateLimited } from '@/lib/utils/rate-limit'
import { cn } from '@/lib/utils/tailwind'
import { Download } from 'lucide-react'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Sponsor Report',
  robots: { index: false, follow: false },
}

const RANGE_LABELS: Record<SponsorReportRange, string> = {
  '7d': '7 days',
  '30d': '30 days',
  '90d': '90 days',
}

const REPORT_WINDOW_MS = 60_000
const REPORT_MAX_REQUESTS = 30

function formatNumber(value: number): string {
  return value.toLocaleString('en-US')
}

function formatDayLabel(day: string): string {
  const date = new Date(`${day}T00:00:00Z`)
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

function niceCeiling(value: number): number {
  if (value <= 0) return 4
  const magnitude = Math.pow(10, Math.floor(Math.log10(value)))
  for (const multiplier of [1, 2, 4, 5, 10]) {
    const candidate = magnitude * multiplier
    if (candidate >= value) return candidate
  }
  return magnitude * 10
}

/** Bar path with a rounded top and square baseline */
function barPath(x: number, y: number, width: number, height: number): string {
  const r = Math.min(4, width / 2, height)
  const bottom = y + height
  return [
    `M ${x} ${bottom}`,
    `L ${x} ${y + r}`,
    `Q ${x} ${y} ${x + r} ${y}`,
    `L ${x + width - r} ${y}`,
    `Q ${x + width} ${y} ${x + width} ${y + r}`,
    `L ${x + width} ${bottom}`,
    'Z',
  ].join(' ')
}

function TrendChart({ report }: { report: SponsorReport }) {
  const width = 720
  const height = 240
  const pad = { top: 16, right: 16, bottom: 28, left: 44 }
  const plotW = width - pad.left - pad.right
  const plotH = height - pad.top - pad.bottom
  const days = report.daily
  const maxValue = niceCeiling(Math.max(...days.map((d) => Math.max(d.impressions, d.clicks)), 0))
  const slot = plotW / days.length
  const barW = Math.min(24, Math.max(1, slot - 2))
  const yFor = (value: number) => pad.top + plotH - (value / maxValue) * plotH
  const xCenter = (i: number) => pad.left + i * slot + slot / 2
  const ticks = Array.from(new Set([0, Math.round(maxValue / 2), maxValue]))
  const linePoints = days.map((d, i) => `${xCenter(i)},${yFor(d.clicks)}`).join(' ')
  const lastDay = days[days.length - 1]
  const labelStep = Math.max(1, Math.ceil(days.length / 6))

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full"
      role="img"
      aria-label={`Daily impressions and clicks from ${report.start_day} to ${report.end_day}`}
    >
      {ticks.map((tick) => (
        <g key={tick}>
          <line
            x1={pad.left}
            x2={width - pad.right}
            y1={yFor(tick)}
            y2={yFor(tick)}
            className="stroke-border"
            strokeWidth={1}
          />
          <text
            x={pad.left - 8}
            y={yFor(tick) + 3.5}
            textAnchor="end"
            className="fill-muted-foreground"
            fontSize={11}
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {formatNumber(tick)}
          </text>
        </g>
      ))}

      {days.map((day, i) => (
        day.impressions > 0 ? (
          <path
            key={day.day}
            d={barPath(xCenter(i) - barW / 2, yFor(day.impressions), barW, yFor(0) - yFor(day.impressions))}
            className="fill-[#2a78d6] dark:fill-[#3987e5]"
          >
            <title>{`${formatDayLabel(day.day)}: ${formatNumber(day.impressions)} impressions, ${formatNumber(day.clicks)} clicks`}</title>
          </path>
        ) : null
      ))}

      <polyline
        points={linePoints}
        fill="none"
        stroke="#c98500"
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {lastDay && (
        <circle
          cx={xCenter(days.length - 1)}
          cy={yFor(lastDay.clicks)}
          r={4}
          fill="#c98500"
          className="stroke-background"
          strokeWidth={2}
        >
          <title>{`${formatDayLabel(lastDay.day)}: ${formatNumber(lastDay.clicks)} clicks`}</title>
        </circle>
      )}

      {days.map((day, i) => (
        i % labelStep === 0 ? (
          <text
            key={`label-${day.day}`}
            x={xCenter(i)}
            y={height - 8}
            textAnchor="middle"
            className="fill-muted-foreground"
            fontSize={11}
          >
            {formatDayLabel(day.day)}
          </text>
        ) : null
      ))}
    </svg>
  )
}

function InvalidLink() {
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center px-6 text-center">
      <h1 className="text-xl font-semibold text-foreground">This report link is not available</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        The link may be invalid, expired, or revoked. Please contact the site owner for a new report link.
      </p>
    </main>
  )
}

export default async function SponsorReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>
  searchParams: Promise<{ range?: string }>
}) {
  const { token } = await params
  const { range: rawRange } = await searchParams
  const range = normalizeSponsorReportRange(rawRange)

  const requestHeaders = await headers()
  const ip = getClientIp(requestHeaders) || 'unknown'
  if (isRateLimited(`sponsor-report:${ip}`, REPORT_MAX_REQUESTS, REPORT_WINDOW_MS)) {
    return <InvalidLink />
  }

  const access = await resolveSponsorReportToken(token)
  if (!access) return <InvalidLink />

  const report = await getSponsorReport(access.sponsor_id, access.sponsor_title, range)
  const hasActivity = report.total_impressions > 0 || report.total_clicks > 0

  const stats = [
    { label: 'Impressions', value: formatNumber(report.total_impressions) },
    { label: 'Clicks', value: formatNumber(report.total_clicks) },
    { label: 'CTR', value: `${report.ctr}%` },
  ]

  return (
    <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <header>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Sponsor performance report</p>
        <h1 className="mt-1 text-2xl font-semibold text-foreground">{report.sponsor_title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {formatDayLabel(report.start_day)} – {formatDayLabel(report.end_day)}
        </p>
      </header>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        {(Object.keys(RANGE_LABELS) as SponsorReportRange[]).map((option) => (
          <Link
            key={option}
            href={option === DEFAULT_SPONSOR_REPORT_RANGE
              ? `/sponsor-reports/${token}`
              : `/sponsor-reports/${token}?range=${option}`}
            className={cn(
              'rounded-md border px-3 py-1.5 text-sm transition-colors',
              option === range
                ? 'border-foreground bg-foreground text-background'
                : 'border-border text-muted-foreground hover:text-foreground'
            )}
          >
            {RANGE_LABELS[option]}
          </Link>
        ))}
        <a
          href={`/sponsor-reports/${token}/export?range=${range}`}
          className="ml-auto inline-flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <Download className="h-4 w-4" />
          Export CSV
        </a>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-lg border bg-card p-4">
            <p className="text-sm text-muted-foreground">{stat.label}</p>
            <p className="mt-1 text-2xl font-semibold text-card-foreground">{stat.value}</p>
          </div>
        ))}
      </div>

      <section className="mt-6 rounded-lg border bg-card p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-medium text-card-foreground">Daily trend</h2>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-[#2a78d6] dark:bg-[#3987e5]" aria-hidden />
              Impressions
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-0.5 w-4 rounded-full bg-[#c98500]" aria-hidden />
              Clicks
            </span>
          </div>
        </div>
        <div className="mt-4 overflow-x-auto">
          {hasActivity ? (
            <TrendChart report={report} />
          ) : (
            <p className="py-12 text-center text-sm text-muted-foreground">
              No sponsor activity recorded in this period yet.
            </p>
          )}
        </div>
      </section>

      <section className="mt-6 rounded-lg border bg-card">
        <h2 className="border-b px-4 py-3 text-sm font-medium text-card-foreground sm:px-6">Top placements</h2>
        {report.top_placements.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">No placements recorded in this period yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2 font-medium sm:px-6">Placement</th>
                  <th className="px-4 py-2 text-right font-medium">Impressions</th>
                  <th className="px-4 py-2 text-right font-medium">Clicks</th>
                  <th className="px-4 py-2 pr-6 text-right font-medium">CTR</th>
                </tr>
              </thead>
              <tbody style={{ fontVariantNumeric: 'tabular-nums' }}>
                {report.top_placements.map((placement) => (
                  <tr key={placement.source_path} className="border-b last:border-b-0">
                    <td className="max-w-64 truncate px-4 py-2.5 text-card-foreground sm:px-6">{placement.source_path}</td>
                    <td className="px-4 py-2.5 text-right text-muted-foreground">{formatNumber(placement.impressions)}</td>
                    <td className="px-4 py-2.5 text-right text-muted-foreground">{formatNumber(placement.clicks)}</td>
                    <td className="px-4 py-2.5 pr-6 text-right text-muted-foreground">{placement.ctr}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <footer className="mt-8 text-center text-xs text-muted-foreground">
        Aggregate campaign data only. Report generated {formatDayLabel(report.end_day)}.
      </footer>
    </main>
  )
}
