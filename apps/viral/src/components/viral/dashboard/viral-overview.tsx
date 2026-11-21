import type * as React from "react"
import { useNavigate } from "@tanstack/react-router"

import { WidgetCard } from "@/components/shared/widgets/widget-card"
import { WidgetGrid } from "@/components/shared/widgets/widget-grid"
import { WidgetMenu } from "@/components/shared/widgets/widget-menus"
import { ErrorRow } from "@/components/ui/error-row"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { WidgetLayout } from "@/lib/admin-dashboard/overview-widgets"
import { getViralErrorMessage } from "@/lib/api/viral/viral"
import { loadViralTodayFn, type ViralToday } from "@/lib/api/viral/viral-finding"
import { useLoad } from "@/lib/hooks/use-load"
import { creatorPlatformLabels } from "@/lib/viral/creators"
import { findViralWidget, VIRAL_WIDGET_OFFER, type ViralWidgetId } from "@/lib/viral/dashboard-page"
import { isRising } from "@/lib/viral/rising"
import { VAULT_STATUSES, vaultStatusLabels } from "@/lib/viral/vault"

/**
 * The Viral dashboard's Overview (task features/03): the person's widgets in
 * the shell's grid, straight on the dashboard beside the left page. They are
 * the two tables the old Today page had (Tyler, 19 Nov 2026: "Today's two
 * tables become Overview widgets"):
 *
 * - **New and rising:** each project's best five videos that are new to you
 *   or rising fast since yesterday, under the project's name. A row opens
 *   the video on its project's dashboard.
 * - **Vault by status:** how many ideas each project has in each status. A
 *   row opens Vault narrowed to that project.
 */
export function ViralOverview({
  layout,
  onChange,
  projectId,
}: {
  layout: WidgetLayout
  onChange: (layout: WidgetLayout) => void
  /** The project picked in the Projects block, which narrows both widgets to it. */
  projectId?: string
}) {
  const read = useLoad(loadViralTodayFn, getViralErrorMessage, { remember: "viral-overview" })
  const data = read.data
    ? projectId
      ? {
          projects: read.data.projects.filter((project) => project.id === projectId),
          vault: read.data.vault.filter((row) => row.projectId === projectId),
        }
      : read.data
    : null

  const draw = (id: ViralWidgetId) => {
    if (read.error) return <ErrorRow message={read.error} onRetry={read.retry} className="p-3" />
    if (!data) return <Quiet>Reading…</Quiet>
    switch (id) {
      case "new-and-rising":
        return <NewAndRising data={data} />
      case "vault-by-status":
        return <VaultByStatus data={data} />
    }
  }

  return (
    <WidgetGrid
      offer={VIRAL_WIDGET_OFFER}
      layout={layout}
      onChange={onChange}
      drawWidget={(id) => {
        const widget = findViralWidget(id)
        if (!widget) return null
        const Icon = widget.icon
        return (
          <WidgetCard title={widget.label} icon={<Icon />} menu={<WidgetMenu title={widget.label} />}>
            {draw(widget.id)}
          </WidgetCard>
        )
      }}
    />
  )
}

function Scroll({ children }: { children: React.ReactNode }) {
  return (
    <ScrollArea className="min-h-0 flex-1">
      <div className="grid p-1.5">{children}</div>
    </ScrollArea>
  )
}

function Quiet({ children }: { children: React.ReactNode }) {
  return <p className="p-3 text-sm text-muted-foreground">{children}</p>
}

function Heading({ children }: { children: React.ReactNode }) {
  return <p className="truncate px-1.5 pt-2.5 pb-1 text-xs font-medium text-muted-foreground first:pt-1">{children}</p>
}

function Row({ title, line, value, onPress }: { title: string; line?: string; value?: string; onPress: () => void }) {
  return (
    <button
      type="button"
      className="flex w-full min-w-0 items-center gap-2 rounded-md px-1.5 py-1.5 text-left text-sm hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      onClick={onPress}
    >
      <span className="grid min-w-0 flex-1">
        <span className="truncate">{title}</span>
        {line ? <span className="truncate text-xs text-muted-foreground">{line}</span> : null}
      </span>
      {value ? (
        <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground tabular-nums">{value}</span>
      ) : null}
    </button>
  )
}

function NewAndRising({ data }: { data: ViralToday }) {
  const navigate = useNavigate()
  const groups = data.projects.filter((project) => project.videos.length)
  if (!groups.length)
    return (
      <Quiet>
        {data.projects.length
          ? "Nothing new or rising since yesterday. The daily re-check finds new videos overnight."
          : "No projects yet. Make one on Projects, and its best new videos show here each day."}
      </Quiet>
    )
  return (
    <Scroll>
      {groups.map((project) => (
        <div key={project.id} className="grid">
          <Heading>{project.name}</Heading>
          {project.videos.map((video) => (
            <Row
              key={video.key}
              title={video.title}
              line={[
                video.channelName || creatorPlatformLabels[video.platform],
                isRising(video.growth) ? "Rising" : video.isNew && !video.seen ? "New" : null,
              ]
                .filter(Boolean)
                .join(" · ")}
              value={String(video.score.score)}
              onPress={() =>
                void navigate({ to: "/admin/projects/$projectId", params: { projectId: project.id }, search: { open: video.key } })
              }
            />
          ))}
        </div>
      ))}
    </Scroll>
  )
}

function VaultByStatus({ data }: { data: ViralToday }) {
  const navigate = useNavigate()
  if (!data.vault.length) return <Quiet>Nothing in the vault yet. Open a video in a project and press Save to vault.</Quiet>
  return (
    <Scroll>
      {data.vault.map((row) => {
        const total = VAULT_STATUSES.reduce((sum, status) => sum + row.counts[status], 0)
        return (
          <Row
            key={row.projectId}
            title={row.projectName}
            line={VAULT_STATUSES.filter((status) => row.counts[status])
              .map((status) => `${row.counts[status]} ${vaultStatusLabels[status].toLowerCase()}`)
              .join(", ")}
            value={total.toLocaleString()}
            onPress={() => void navigate({ to: "/admin/viral", search: { section: "vault", project: row.projectId } })}
          />
        )
      })}
    </Scroll>
  )
}
