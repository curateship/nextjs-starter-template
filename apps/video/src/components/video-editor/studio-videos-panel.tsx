import { useNavigate } from "@tanstack/react-router"
import { FilmIcon, ListVideoIcon, PlusIcon, SendIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { DropdownMenuItem } from "@/components/ui/dropdown-menu"
import { PiecesPanel, type PiecesAdapter } from "@/components/video-assets/pieces-panel"
import { useEditorRuntime, useEditorSelector, useEditorVideoName } from "@/components/video-editor/editor-store"
import { NewVideoPopover } from "@/components/video-editor/new-video-popover"
import { useProjectGuest } from "@/components/video-editor/project-guest"
import { useSendToPromo } from "@/components/video-promo/use-send-to-promo"
import { getProjectErrorMessage, listProjects } from "@/lib/api/video/projects"
import {
  archiveProjectVideos,
  deleteProjectVideos,
  duplicateProjectVideo,
  listVideos,
  loadVideoDeleteSummary,
  moveProjectVideos,
  pinProjectVideo,
  renameProjectVideo,
  setProjectVideoStatus,
  type VideoItem,
} from "@/lib/api/video/project-videos"
import { formatDate } from "@/lib/format/format-time"
import { plural } from "@/lib/format/plural"
import { VIDEO_STATUS_LABELS } from "@/lib/video/project-videos"
import { formatClock } from "@/lib/video/timeline-utils"

/**
 * The Videos tab, first on the editor's rail (`workspace/docs/project-videos.md`).
 * It lists the project's videos, and clicking one opens it in the player.
 * Tyler, 1 Nov 2026: "the left panel lists the videos called "Videos" as the
 * first selected rail tab".
 *
 * The list itself is the shared `PiecesPanel`, which the carousel editor's
 * Carousels tab uses too; this hands it the video calls. A guest sent from
 * Project opens any video in the project; making, renaming, moving and
 * deleting are the owner's.
 */
export function VideosPanel() {
  const { projectId, videoId, saveNow } = useEditorRuntime()
  const openName = useEditorVideoName()
  const openAspect = useEditorSelector((state) => state.aspect)
  const guest = useProjectGuest() !== null
  const navigate = useNavigate()
  const sendToPromo = useSendToPromo()

  /** Opens a video in the player, saving the open one's last edit first. */
  async function open(id: string, inProject = projectId, panel?: "templates") {
    await saveNow()
    await navigate({
      to: guest ? "/guest/video-editor/$projectId" : "/admin/video-editor/$projectId",
      params: { projectId: inProject },
      search: { video: id, ...(panel ? { panel } : {}) },
    })
  }

  const adapter: PiecesAdapter<VideoItem> = {
    one: "video",
    many: "videos",
    title: "Videos",
    icon: <ListVideoIcon className="size-4" />,
    projectId,
    openId: videoId,
    openName,
    canChange: !guest,
    list: async (query) => {
      const loaded = await listVideos({ projectId, ...query })
      return { ...loaded, items: loaded.videos }
    },
    open,
    reopenProject: () =>
      void navigate({
        to: guest ? "/guest/video-editor/$projectId" : "/admin/video-editor/$projectId",
        params: { projectId },
        search: { video: undefined },
      }),
    rename: renameProjectVideo,
    duplicate: duplicateProjectVideo,
    setStatus: setProjectVideoStatus,
    pin: pinProjectVideo,
    archive: archiveProjectVideos,
    otherProjects: async () =>
      (await listProjects({ pageSize: 100 })).projects.filter((project) => project.id !== projectId),
    move: moveProjectVideos,
    moveNote: "Its history and exports go with it. First frames and AI shots stay with this project.",
    deleteSummary: async (ids) => {
      const summary = await loadVideoDeleteSummary(ids)
      return { count: summary.videos, exports: summary.exports }
    },
    remove: deleteProjectVideos,
    describeDelete: ({ count, exports }) =>
      `This deletes ${count} ${plural(count, "video")} with ${exports} ${plural(exports, "export")} and their history. First frames, AI shots and your media library stay.`,
    errorMessage: getProjectErrorMessage,
    row: (video) => ({
      thumbnail: video.thumbnail_url,
      lines: [
        `${formatClock(video.duration_ms)} · ${VIDEO_STATUS_LABELS[video.status]}`,
        `${video.aspect} · ${formatDate(video.updated_at)}`,
      ],
      Icon: FilmIcon,
      // A video asked for in Promo shows what was asked (part 42).
      // A draft sent from Viral's vault shows its script's first line.
      note: video.promo_brief
        ? { line: `Asked for in Promo: ${video.promo_brief.trim().split("\n")[0]}`, full: video.promo_brief }
        : video.viral_script
          ? { line: `From Viral: ${video.viral_script.trim().split("\n")[0]}`, full: video.viral_script }
          : undefined,
    }),
    // Its newest finished export goes to Promo (part 8). Sending is the owner's.
    extraMenu: guest
      ? undefined
      : (video) => (
          <DropdownMenuItem onSelect={() => void sendToPromo.open({ videoId: video.id })}>
            <SendIcon />
            Send to Promo
          </DropdownMenuItem>
        ),
    pending: (video) => video.thumbnail_pending,
    newButton: (
      <NewVideoPopover
        projectId={projectId}
        aspect={openAspect}
        tooltip="New video"
        withTemplates={!guest}
        onCreated={(id, panel) => open(id, projectId, panel)}
      >
        <Button type="button" variant="ghost" size="icon" aria-label="New video">
          <PlusIcon />
        </Button>
      </NewVideoPopover>
    ),
  }

  return (
    <>
      <PiecesPanel adapter={adapter} />
      {sendToPromo.dialog}
    </>
  )
}
