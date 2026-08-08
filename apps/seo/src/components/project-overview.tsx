import * as React from "react"
import { Link } from "@tanstack/react-router"
import { HistoryIcon, TrendingUpIcon } from "lucide-react"

import { DashboardTable } from "@/components/dashboard-table"
import {
  IntentBadge,
  KeywordStatusBadge,
  MetricTile,
  OpportunityScoreBadge,
} from "@/components/keywords-dashboard"
import { Badge } from "@/components/ui/badge"
import {
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  scheduleFrequencyLabels,
  type ProjectItem,
  type ProjectOverview,
} from "@/lib/api/seo-projects"

const numberFormatter = new Intl.NumberFormat("en-US")
const dateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
})

const jobTypeLabels: Record<string, string> = {
  seed_research: "Seed research",
  domain_research: "Domain research",
  competitor_gap: "Competitor gap",
  metrics_enrichment: "Metrics refresh",
  rank_check: "Rank check",
}

const jobStatusVariants: Record<
  string,
  React.ComponentProps<typeof Badge>["variant"]
> = {
  pending: "outline",
  running: "secondary",
  completed: "secondary",
  failed: "destructive",
  cancelled: "outline",
}

export function ProjectOverviewDashboard({
  project,
  overview,
}: {
  project: ProjectItem
  overview: ProjectOverview
}) {
  const saved =
    (overview.statusCounts.saved ?? 0) +
    (overview.statusCounts.planned ?? 0) +
    (overview.statusCounts.published ?? 0)

  return (
    <div className="w-full pb-8">
      <div className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <MetricTile
          label="Keywords"
          value={numberFormatter.format(overview.totalKeywords)}
        />
        <MetricTile
          label="Saved / planned"
          value={numberFormatter.format(saved)}
        />
        <MetricTile
          label="Tracked keywords"
          value={numberFormatter.format(overview.trackedCount)}
        />
        <MetricTile
          label="Avg position"
          value={
            overview.averagePosition != null
              ? `#${overview.averagePosition}`
              : "—"
          }
        />
        <MetricTile
          label="Top-10 rankings"
          value={numberFormatter.format(overview.topTenCount)}
        />
        <MetricTile
          label="API cost (30d)"
          value={`$${overview.usage.totalCost.toFixed(
            overview.usage.totalCost >= 1 ? 2 : 4
          )}`}
        />
      </div>

      <div className="mb-4 text-xs text-muted-foreground">
        Automatic checks:{" "}
        {scheduleFrequencyLabels[project.scheduleFrequency] ??
          project.scheduleFrequency}
        {overview.scheduleLastRunAt
          ? ` · last auto-run ${dateTimeFormatter.format(
              new Date(overview.scheduleLastRunAt)
            )}`
          : ""}
        {overview.clusterCount
          ? ` · ${numberFormatter.format(overview.clusterCount)} topic clusters`
          : ""}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <DashboardTable
          title="Top Opportunities"
          icon={
            <TrendingUpIcon className="text-muted-foreground" />
          }
          count={overview.topOpportunities.length}
          header={
            <TableHeader>
              <TableRow>
                <TableHead column="main">Keyword</TableHead>
                <TableHead column="meta">Volume</TableHead>
                <TableHead column="meta" className="hidden md:table-cell">
                  KD
                </TableHead>
                <TableHead column="meta">Opportunity</TableHead>
                <TableHead column="meta" className="hidden md:table-cell">
                  Status
                </TableHead>
              </TableRow>
            </TableHeader>
          }
          isEmpty={overview.topOpportunities.length === 0}
          emptyText="No scored keywords yet. Run keyword research to find opportunities."
          emptyColSpan={5}
          footer={{
            type: "summary",
            count: overview.topOpportunities.length,
            label: "keywords",
          }}
        >
          {overview.topOpportunities.map((row) => (
            <TableRow key={row.id} className="group">
              <TableCell column="main">
                <Link
                  to="/keywords"
                  className="block max-w-full truncate text-xs font-medium group-hover:underline sm:text-sm"
                  title={row.keyword}
                >
                  {row.keyword}
                </Link>
                <div className="md:hidden">
                  <IntentBadge intent={row.intent} />
                </div>
              </TableCell>
              <TableCell column="mutedMeta">
                {row.searchVolume != null
                  ? numberFormatter.format(row.searchVolume)
                  : "—"}
              </TableCell>
              <TableCell column="mutedMeta" className="hidden md:table-cell">
                {row.keywordDifficulty ?? "—"}
              </TableCell>
              <TableCell column="meta">
                <OpportunityScoreBadge score={row.opportunityScore} />
              </TableCell>
              <TableCell column="meta" className="hidden md:table-cell">
                <KeywordStatusBadge status={row.status} />
              </TableCell>
            </TableRow>
          ))}
        </DashboardTable>

        <DashboardTable
          title="Recent Jobs"
          icon={
            <HistoryIcon className="text-muted-foreground" />
          }
          count={overview.recentJobs.length}
          header={
            <TableHeader>
              <TableRow>
                <TableHead column="main">Job</TableHead>
                <TableHead column="meta">Status</TableHead>
                <TableHead column="meta" className="hidden md:table-cell">
                  Created
                </TableHead>
              </TableRow>
            </TableHeader>
          }
          isEmpty={overview.recentJobs.length === 0}
          emptyText="No jobs yet. Run seed or domain research to get started."
          emptyColSpan={3}
          footer={{
            type: "summary",
            count: overview.recentJobs.length,
            label: "jobs",
          }}
        >
          {overview.recentJobs.map((job) => (
            <TableRow key={job.id}>
              <TableCell column="main">
                <div className="text-xs font-medium sm:text-sm">
                  {jobTypeLabels[job.type] ?? job.type}
                </div>
                {job.currentStep ? (
                  <div
                    className="max-w-md truncate text-xs text-muted-foreground"
                    title={job.errorMessage ?? job.currentStep}
                  >
                    {job.currentStep}
                  </div>
                ) : null}
              </TableCell>
              <TableCell column="meta">
                <Badge variant={jobStatusVariants[job.status] ?? "outline"}>
                  {job.status === "running"
                    ? `Running ${job.progress}%`
                    : job.status.charAt(0).toUpperCase() + job.status.slice(1)}
                </Badge>
              </TableCell>
              <TableCell column="mutedMeta" className="hidden md:table-cell">
                {dateTimeFormatter.format(new Date(job.created_at))}
              </TableCell>
            </TableRow>
          ))}
        </DashboardTable>
      </div>
    </div>
  )
}
