import * as React from "react"
import { Link, useNavigate } from "@tanstack/react-router"
import { FilmIcon, SunIcon, VaultIcon } from "lucide-react"

import { DashboardTable } from "@/components/shared/dashboard-table"
import { SearchToggle } from "@/components/shared/search-toggle"
import { Badge } from "@/components/ui/badge"
import { TableCell, TableGroupRow, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { CoverImage } from "@/components/viral/cover-image"
import { OutlierBadge } from "@/components/viral/outlier-badge"
import { RisingBadge } from "@/components/viral/rising-badge"
import { ViralScoreCell } from "@/components/viral/viral-score-cell"
import type { ViralSearchHit, ViralToday } from "@/lib/api/viral/viral-finding"
import { useListSearchNavigate, useSearchBoxText } from "@/lib/nav/list-search"
import { creatorPlatformLabels, formatCount, type CreatorPlatform } from "@/lib/viral/creators"
import { VAULT_STATUSES, vaultStatusLabels } from "@/lib/viral/vault"
import type { ViralVideo } from "@/lib/viral/viral"
import { formatShortDay } from "@/lib/viral/viral-view"

/**
 * Today, Viral's home page (Tyler, 4 Nov 2026: "Viral's home page";
 * `workspace/docs/today-page.md`). The first table is each project's best
 * videos that are new to you or rising fast since yesterday. Its search looks
 * through every project at once and swaps the rows for what it found. The
 * second table is how many vault ideas sit in each status, per project.
 */
export function TodayPage({ today, hits, q }: { today: ViralToday; hits: ViralSearchHit[]; q: string }) {
  const navigate = useNavigate()
  const setSearch = useListSearchNavigate()
  const [text, setText] = useSearchBoxText(q, (next) => setSearch({ q: next.trim() ? next : undefined }))
  const searching = q.trim().length > 0

  const groups = today.projects.filter((project) => project.videos.length)
  const shownCount = searching ? hits.length : groups.reduce((sum, project) => sum + project.videos.length, 0)

  function openVideo(projectId: string, key: string) {
    void navigate({ to: "/admin/projects/$projectId", params: { projectId }, search: { open: key } })
  }

  const hitGroups = React.useMemo(() => {
    const byProject = new Map<string, { name: string; hits: ViralSearchHit[] }>()
    for (const hit of hits) {
      const group = byProject.get(hit.projectId) ?? { name: hit.projectName, hits: [] }
      group.hits.push(hit)
      byProject.set(hit.projectId, group)
    }
    return [...byProject]
  }, [hits])

  const projectLink = (id: string, name: string) => (
    <Link to="/admin/projects/$projectId" params={{ projectId: id }} className="hover:underline">
      {name}
    </Link>
  )

  return (
    <>
      <DashboardTable
        title="Today"
        icon={<SunIcon />}
        className="shrink-0"
        count={shownCount}
        controls={
          <SearchToggle
            name="viral-every-project"
            label="Search every project"
            placeholder="Search every project…"
            value={text}
            onChange={setText}
          />
        }
        header={
          <TableHeader>
            <TableRow>
              <TableHead column="main" className="w-full min-w-56">
                Video
              </TableHead>
              {searching ? null : (
                <>
                  <TableHead column="meta">Score</TableHead>
                  <TableHead column="meta">Since yesterday</TableHead>
                  <TableHead column="meta">Outlier</TableHead>
                </>
              )}
              <TableHead column="meta">Views</TableHead>
              {searching ? null : <TableHead column="meta">Posted</TableHead>}
            </TableRow>
          </TableHeader>
        }
        isEmpty={searching ? hits.length === 0 : groups.length === 0}
        emptyText={
          searching
            ? `No video in any project matches "${q.trim()}".`
            : today.projects.length
              ? "Nothing new or rising since yesterday. The daily re-check finds new videos overnight."
              : "No projects yet. Make one on Projects, and its best new videos show here each day."
        }
        emptyColSpan={searching ? 2 : 6}
        footer={{ type: "summary", count: shownCount, label: searching ? "found" : "videos" }}
      >
        {searching
          ? hitGroups.map(([projectId, group]) => (
              <React.Fragment key={projectId}>
                <TableGroupRow colSpan={2} label={projectLink(projectId, group.name)} />
                {group.hits.map((hit) => (
                  <TableRow key={`${projectId}:${hit.key}`} rowAction={() => openVideo(projectId, hit.key)}>
                    <TableCell column="main" className="w-full max-w-0 min-w-56">
                      <VideoCell
                        title={hit.title}
                        channel={hit.channelName || creatorPlatformLabels[hit.platform as CreatorPlatform]}
                        thumbnailUrl={hit.thumbnailUrl}
                        onOpen={() => openVideo(projectId, hit.key)}
                      />
                    </TableCell>
                    <TableCell column="meta" className="tabular-nums">
                      {formatCount(hit.views)}
                    </TableCell>
                  </TableRow>
                ))}
              </React.Fragment>
            ))
          : groups.map((project) => (
              <React.Fragment key={project.id}>
                <TableGroupRow colSpan={6} label={projectLink(project.id, project.name)}>
                  {project.sample ? <Badge variant="outline">Sample</Badge> : null}
                </TableGroupRow>
                {project.videos.map((video) => (
                  <TodayRow key={video.key} video={video} onOpen={() => openVideo(project.id, video.key)} />
                ))}
              </React.Fragment>
            ))}
      </DashboardTable>

      <DashboardTable
        title="Vault"
        icon={<VaultIcon />}
        className="shrink-0"
        count={today.vault.reduce((sum, row) => sum + VAULT_STATUSES.reduce((total, status) => total + row.counts[status], 0), 0)}
        header={
          <TableHeader>
            <TableRow>
              <TableHead column="main" className="w-full">
                Project
              </TableHead>
              {VAULT_STATUSES.map((status) => (
                <TableHead key={status} column="meta">
                  {vaultStatusLabels[status]}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
        }
        isEmpty={today.vault.length === 0}
        emptyText="Nothing in the vault yet. Open a video in a project and press Save to vault."
        emptyColSpan={VAULT_STATUSES.length + 1}
        footer={{ type: "summary", count: today.vault.length, label: today.vault.length === 1 ? "project" : "projects" }}
      >
        {today.vault.map((row) => (
          <TableRow
            key={row.projectId}
            rowAction={() => void navigate({ to: "/admin/vault", search: { project: row.projectId } })}
          >
            <TableCell column="main">
              <Link to="/admin/vault" search={{ project: row.projectId }} className="font-medium hover:underline">
                {row.projectName}
              </Link>
            </TableCell>
            {VAULT_STATUSES.map((status) => (
              <TableCell key={status} column="meta" className="tabular-nums">
                {row.counts[status] || "-"}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </DashboardTable>
    </>
  )
}

function TodayRow({ video, onOpen }: { video: ViralVideo; onOpen: () => void }) {
  return (
    <TableRow rowAction={onOpen}>
      <TableCell column="main" className="w-full max-w-0 min-w-56">
        <VideoCell
          title={video.title}
          channel={video.channelName || creatorPlatformLabels[video.platform]}
          thumbnailUrl={video.thumbnailUrl}
          onOpen={onOpen}
          isNew={video.isNew && !video.seen}
        />
      </TableCell>
      <TableCell column="actions">
        <ViralScoreCell score={video.score} />
      </TableCell>
      <TableCell column="meta">
        <RisingBadge growth={video.growth} />
      </TableCell>
      <TableCell column="meta">
        <OutlierBadge outlier={video.outlier} />
      </TableCell>
      <TableCell column="meta" className="tabular-nums">
        {formatCount(video.views)}
      </TableCell>
      <TableCell column="meta" className="whitespace-nowrap">
        {formatShortDay(video.postedAt)}
      </TableCell>
    </TableRow>
  )
}

function VideoCell({
  title,
  channel,
  thumbnailUrl,
  onOpen,
  isNew = false,
}: {
  title: string
  channel: string
  thumbnailUrl: string | null
  onOpen: () => void
  isNew?: boolean
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="size-8 shrink-0 overflow-hidden rounded-md bg-muted">
        <CoverImage
          src={thumbnailUrl}
          className="size-full object-cover"
          fallback={
            <span className="grid size-full place-items-center">
              <FilmIcon className="size-4 text-muted-foreground" />
            </span>
          }
        />
      </span>
      <span className="grid min-w-0 gap-0.5">
        <span className="flex min-w-0 items-center gap-1.5">
          <button type="button" className="truncate text-left font-medium hover:underline" onClick={onOpen}>
            {title}
          </button>
          {isNew ? <Badge>New</Badge> : null}
        </span>
        <span className="truncate text-xs text-muted-foreground">{channel}</span>
      </span>
    </div>
  )
}
