import * as React from "react"
import { useNavigate } from "@tanstack/react-router"
import { PlusIcon } from "lucide-react"

import { ContentKindMenu, type ContentKind } from "@/components/content-app/content-kind-menu"
import { ListHeader } from "@/components/content-app/list-header"
import { Chip, CrmTable, CrmTableRow, MainCell } from "@/components/crm/crm-table"
import { DashboardToolbarButton } from "@/components/shared/dashboard-toolbar"
import { PanelReopenButton } from "@/components/shared/three-panels"
import { ProjectMenuButton } from "@/components/content-app/project-top"
import { NewVideoPopover } from "@/components/video-editor/new-video-popover"
import { ErrorRow } from "@/components/ui/error-row"
import { TableCell } from "@/components/ui/table"
import { ProjectHeaderLead } from "@/components/social/projects/project-header-lead"
import { getPartsErrorMessage, loadProjectParts } from "@/lib/api/content-app/projects"
import { formatRelativeTime } from "@/lib/format/format-time"
import { useLoad } from "@/lib/hooks/use-load"
import { formatClock } from "@/lib/video/timeline-utils"
import { VIDEO_STATUS_LABELS } from "@/lib/video/project-videos"

type Column = "name" | "status" | "length" | "edited"

/**
 * Content's Drafts (`workspace/docs/content-app.md`, "A project's own page";
 * Tyler, 27 Nov 2026, of the project's videos: "Inside Content", then "In All
 * content"), picked in Content's one dropdown (`ContentKindMenu`): the
 * project's videos in the editor with their status, length and last edit, and New video,
 * Video's own window (a name and a shape, or a template, never a made-up
 * name). A video opens the editor on the whole screen, as the Videos block's
 * rows did (Tyler, 26 Nov 2026: "Option 1: whole screen"), so this tab has no
 * right panel and the list takes its room.
 *
 * Archived videos stay out, as they did from the block.
 */
export function ProjectVideos({ projectId, onKind }: { projectId: string; onKind: (kind: Exclude<ContentKind, "drafts">) => void }) {
  const navigate = useNavigate()
  const [q, setQ] = React.useState("")
  const [sort, setSort] = React.useState<Column>("edited")
  const [direction, setDirection] = React.useState<"asc" | "desc">("desc")
  const read = useLoad(() => loadProjectParts(projectId), getPartsErrorMessage, {
    keys: [projectId],
    remember: `content-project-parts-${projectId}`,
  })

  const videos = React.useMemo(() => {
    const words = q.trim().toLowerCase()
    const shown = (read.data?.videos ?? []).filter((video) => !video.archived && (!words || video.name.toLowerCase().includes(words)))
    const by = (video: (typeof shown)[number]) =>
      sort === "name" ? video.name.toLowerCase() : sort === "status" ? VIDEO_STATUS_LABELS[video.status] : sort === "length" ? video.durationMs : video.updatedAt
    return [...shown].sort((a, b) => {
      const order = by(a) < by(b) ? -1 : by(a) > by(b) ? 1 : 0
      return direction === "asc" ? order : -order
    })
  }, [direction, q, read.data, sort])

  const openVideo = (videoId: string, panel?: "templates") =>
    void navigate({ to: "/admin/video-editor/$projectId", params: { projectId }, search: { video: videoId, panel } })

  return (
    <>
      <ListHeader
        tabs={
          // The project's controls, then the content dropdown, which says Drafts, names this list.
          <span className="flex min-w-0 items-center gap-1">
            <PanelReopenButton side="left" label="Show the Projects page" />
            <ProjectHeaderLead />
          </span>
        }
        choices={<ContentKindMenu value="drafts" drafts onPick={(next) => (next === "drafts" ? undefined : onKind(next))} />}
        end={<ProjectMenuButton />}
        menuLabel="More for these videos"
        search={{
          name: "project-video-search",
          label: "Search this project's videos by name",
          placeholder: "Search videos",
          value: q,
          onChange: setQ,
        }}
        massSelect={null}
        primary={
          <NewVideoPopover projectId={projectId} aspect="9:16" side="bottom" withTemplates onCreated={openVideo}>
            <DashboardToolbarButton type="button">
              <PlusIcon className="size-4" />
              <span className="@max-3xl:sr-only">New video</span>
            </DashboardToolbarButton>
          </NewVideoPopover>
        }
      />
      {read.error && !read.data ? (
        <ErrorRow message={read.error} onRetry={read.retry} className="p-4" />
      ) : (
        <CrmTable<Column>
          columns={[
            { key: "name", label: "Video", column: "main", className: "min-w-40" },
            { key: "status", label: "Status", column: "meta", className: "hidden @md:table-cell" },
            { key: "length", label: "Length", column: "meta", className: "hidden @xl:table-cell" },
            { key: "edited", label: "Last edited", column: "meta", className: "hidden @lg:table-cell" },
          ]}
          sort={sort}
          direction={direction}
          onSort={(column) => {
            if (column === sort) setDirection((was) => (was === "asc" ? "desc" : "asc"))
            else {
              setSort(column)
              setDirection(column === "name" || column === "status" ? "asc" : "desc")
            }
          }}
          actions={false}
          empty={
            videos.length
              ? null
              : !read.data
                ? "Reading the project's videos…"
                : q.trim()
                  ? "No video has that name."
                  : "No video yet. Press New video to make one."
          }
        >
          {videos.map((video) => (
            <CrmTableRow key={video.id} open={false} label={video.name} cog={false} onOpen={() => openVideo(video.id)}>
              <MainCell name={video.name} />
              <TableCell column="meta" className="hidden @md:table-cell">
                <Chip muted={video.status === "draft"}>{VIDEO_STATUS_LABELS[video.status]}</Chip>
              </TableCell>
              <TableCell column="meta" className="hidden tabular-nums @xl:table-cell">
                {formatClock(video.durationMs)}
              </TableCell>
              <TableCell column="meta" className="hidden @lg:table-cell">
                {formatRelativeTime(video.updatedAt)}
              </TableCell>
            </CrmTableRow>
          ))}
        </CrmTable>
      )}
    </>
  )
}
