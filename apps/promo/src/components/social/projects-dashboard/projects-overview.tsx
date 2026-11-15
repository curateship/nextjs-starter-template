import * as React from "react"
import { useNavigate } from "@tanstack/react-router"

import { WidgetCard } from "@/components/shared/widgets/widget-card"
import { WidgetGrid } from "@/components/shared/widgets/widget-grid"
import { WidgetMenu } from "@/components/shared/widgets/widget-menus"
import type { ProjectsDashboardData } from "@/components/social/projects-dashboard/projects-dashboard"
import { ErrorRow } from "@/components/ui/error-row"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { WidgetLayout } from "@/lib/admin-dashboard/overview-widgets"
import { getProjectsDashboardErrorMessage, loadPostsNeedingYou } from "@/lib/api/social/projects-dashboard"
import { storageLine } from "@/lib/archive/items"
import { plural } from "@/lib/format/plural"
import { useLoad } from "@/lib/hooks/use-load"
import { ACCOUNT_STATUSES, ACCOUNT_STATUS_LABELS } from "@/lib/social/account-status"
import { isNetwork, NETWORK_NAMES } from "@/lib/social/networks"
import { findProjectsWidget, PROJECTS_WIDGET_OFFER, type ProjectsWidgetId } from "@/lib/social/projects-dashboard-page"
import { postedDateText } from "@/lib/social/wording"
import { cn } from "@/lib/utils"

/**
 * The Projects dashboard's Overview (Tyler, 12 Nov 2026): the person's own
 * widgets in the shell's grid, straight on the dashboard beside the left
 * page, each in the shell's widget card with its ⋮. Tyler's picks: Posts
 * that need you, Messages waiting, Accounts by status, Bans in the last 30
 * days and Archive room. Each row opens where the work is. A project picked
 * in the Projects block narrows every widget to it.
 */
export function ProjectsOverview({
  data,
  projectId,
  layout,
  onChange,
}: {
  data: ProjectsDashboardData
  projectId: string
  layout: WidgetLayout
  onChange: (layout: WidgetLayout) => void
}) {
  const shown = new Set([...layout.top.spots, ...(layout.bottom.columns ? layout.bottom.spots : [])])
  // Read only while Posts that need you is on Overview: one count per network per project.
  const needsPosts = shown.has("posts-need-you")
  const posts = useLoad(
    () => (needsPosts ? loadPostsNeedingYou() : Promise.resolve(null)),
    getProjectsDashboardErrorMessage,
    { keys: [needsPosts], remember: "promo-projects-posts-need-you" }
  )
  const inProject = (id: string | null | undefined) => !projectId || id === projectId

  const draw = (id: ProjectsWidgetId) => {
    switch (id) {
      case "posts-need-you":
        return <PostsWidget read={posts} inProject={inProject} />
      case "messages-waiting":
        return <MessagesWidget data={data} inProject={inProject} />
      case "accounts-by-status":
        return <AccountsWidget data={data} inProject={inProject} projectId={projectId} />
      case "bans":
        return <BansWidget data={data} inProject={inProject} />
      case "archive-room":
        return <ArchiveWidget data={data} inProject={inProject} />
    }
  }

  return (
    <WidgetGrid
      offer={PROJECTS_WIDGET_OFFER}
      layout={layout}
      onChange={onChange}
      drawWidget={(id) => {
        const widget = findProjectsWidget(id)
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

type InProject = (id: string | null | undefined) => boolean

/** A widget's list that scrolls inside its card. */
function Scroll({ children }: { children: React.ReactNode }) {
  return (
    <ScrollArea className="min-h-0 flex-1">
      <div className="grid p-1.5">{children}</div>
    </ScrollArea>
  )
}

/** The widget's one line when there is nothing to show. */
function Quiet({ children }: { children: React.ReactNode }) {
  return <p className="p-3 text-sm text-muted-foreground">{children}</p>
}

/** A row that opens where its work is, with its figure in a pill. */
function Row({ title, line, value, onPress }: { title: string; line?: string | null; value?: string; onPress: () => void }) {
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

/** Posts that need you: failed posts and unsent drafts, one row per project and network, opening that network on the project's page. */
function PostsWidget({
  read,
  inProject,
}: {
  read: { data: Awaited<ReturnType<typeof loadPostsNeedingYou>> | null; error: string | null; retry: () => void }
  inProject: InProject
}) {
  const navigate = useNavigate()
  if (read.error) return <ErrorRow message={read.error} onRetry={read.retry} className="p-3" />
  if (!read.data) return <Quiet>Reading…</Quiet>
  const rows = read.data.filter((row) => inProject(row.projectId))
  if (!rows.length) return <Quiet>No failed posts or drafts waiting.</Quiet>
  return (
    <Scroll>
      {rows.map((row) => (
        <Row
          key={`${row.projectId}-${row.network}`}
          title={row.projectName}
          line={NETWORK_NAMES[row.network]}
          value={`${row.count} need you`}
          onPress={() =>
            void navigate({ to: "/admin/projects/$projectId", params: { projectId: row.projectId }, search: { network: row.network } })
          }
        />
      ))}
    </Scroll>
  )
}

/** Messages waiting: conversations no answer has gone to, newest first, each opening in Messages. */
function MessagesWidget({ data, inProject }: { data: ProjectsDashboardData; inProject: InProject }) {
  const navigate = useNavigate()
  const rows = data.messages
    .filter((row) => row.status === "open" && inProject(row.account.projectId))
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
  if (!rows.length) return <Quiet>No messages waiting for you.</Quiet>
  return (
    <Scroll>
      {rows.map((row) => (
        <Row
          key={row.id}
          title={row.thread}
          line={`${isNetwork(row.platform) ? NETWORK_NAMES[row.platform] : row.platform} · ${row.lines[row.lines.length - 1]?.text ?? ""}`}
          value={postedDateText(new Date(row.updatedAt))}
          onPress={() => void navigate({ to: "/admin/projects", search: (previous) => ({ project: previous.project, section: "messages", open: row.id }) })}
        />
      ))}
    </Scroll>
  )
}

const STATUS_BARS: Record<(typeof ACCOUNT_STATUSES)[number], string> = {
  warming_up: "bg-muted-foreground/40",
  ready: "bg-sky-500",
  working: "bg-emerald-500",
  at_risk: "bg-amber-500",
  banned: "bg-destructive",
}

/** Accounts by status: how many accounts in use are in each, each row opening Accounts filtered to it. */
function AccountsWidget({ data, inProject, projectId }: { data: ProjectsDashboardData; inProject: InProject; projectId: string }) {
  const navigate = useNavigate()
  const accounts = data.accounts.accounts.filter((row) => !row.retiredAt && inProject(row.project?.id))
  const counts = ACCOUNT_STATUSES.map((status) => ({ status, count: accounts.filter((row) => row.status.status === status).length }))
  const most = Math.max(1, ...counts.map((row) => row.count))
  if (!accounts.length) return <Quiet>No accounts in use.</Quiet>
  return (
    <Scroll>
      {counts.map(({ status, count }) => (
        <button
          key={status}
          type="button"
          className="grid w-full grid-cols-[6.5rem_minmax(0,1fr)_2rem] items-center gap-2 rounded-md px-1.5 py-1.5 text-left text-sm hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          onClick={() =>
            void navigate({ to: "/admin/projects", search: { section: "accounts", status, ...(projectId ? { project: projectId } : {}) } })
          }
        >
          <span className="truncate">{ACCOUNT_STATUS_LABELS[status]}</span>
          <span className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
            <span className={cn("block h-full rounded-full", STATUS_BARS[status])} style={{ width: `${(count / most) * 100}%` }} />
          </span>
          <span className="text-right text-muted-foreground tabular-nums">{count}</span>
        </button>
      ))}
    </Scroll>
  )
}

/** Bans in the last 30 days: each project's counted bans, opening the Bans dashboard filtered as its red mark does. */
function BansWidget({ data, inProject }: { data: ProjectsDashboardData; inProject: InProject }) {
  const navigate = useNavigate()
  const rows = data.projects.filter((project) => inProject(project.id)).sort((a, b) => b.bannedRecently - a.bannedRecently)
  if (!rows.length) return <Quiet>No projects yet.</Quiet>
  return (
    <Scroll>
      {rows.map((project) => (
        <Row
          key={project.id}
          title={project.name}
          line={project.bannedRecently ? `${project.bannedRecently} ${plural(project.bannedRecently, "account", "accounts")} banned` : "No bans"}
          value={project.bannedRecently.toLocaleString()}
          onPress={() => void navigate({ to: "/admin/anti-detect", search: { section: "bans", project: project.id, since: 30 } })}
        />
      ))}
    </Scroll>
  )
}

/** Archive room: each project's items and the room their files take, with what that costs a month, opening its Archive. */
function ArchiveWidget({ data, inProject }: { data: ProjectsDashboardData; inProject: InProject }) {
  const navigate = useNavigate()
  const rows = data.archive.filter((project) => inProject(project.id))
  if (!rows.length) return <Quiet>No projects yet.</Quiet>
  return (
    <Scroll>
      {rows.map((project) => (
        <Row
          key={project.id}
          title={project.name}
          // Tyler's rule of 4 Nov 2026, "Size and dollars a month": "12.4 GB, about $0.19 a month".
          line={storageLine(project.bytes)}
          value={`${project.items} ${plural(project.items, "item", "items")}`}
          onPress={() => void navigate({ to: "/admin/projects", search: { section: "archive", project: project.id } })}
        />
      ))}
    </Scroll>
  )
}
