import * as React from "react"
import { useNavigate, useRouter } from "@tanstack/react-router"
import { ImagesIcon, LayoutTemplateIcon, PlusIcon, SendIcon } from "lucide-react"

import { NewCarouselDialog } from "@/components/carousel-studio/new-carousel-dialog"
import { Button } from "@/components/ui/button"
import { DropdownMenuItem } from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { PiecesPanel, type PiecesAdapter } from "@/components/video-assets/pieces-panel"
import { useSendToPromo } from "@/components/video-promo/use-send-to-promo"
import { listCarouselProjects } from "@/lib/api/video/carousel-projects"
import {
  archiveCarousels,
  deleteCarousels,
  duplicateCarousel,
  getCarouselErrorMessage,
  listCarousels,
  loadCarouselDeleteSummary,
  markCarouselTemplate,
  moveCarouselsToProject,
  pinCarousel,
  renameCarousel,
  setCarouselStatusTo,
  type CarouselItem,
} from "@/lib/api/video/carousels"
import { formatDate } from "@/lib/format/format-time"
import { plural } from "@/lib/format/plural"
import { showErrorToast } from "@/lib/toast/error-toast"
import { VIDEO_STATUS_LABELS } from "@/lib/video/project-videos"

/**
 * The Carousels tab, first on the carousel editor's rail and picked when a
 * carousel project opens (workspace/docs/carousel-project-carousels.md). It
 * is the Videos tab's own panel, `PiecesPanel`, handed the carousel calls.
 */
export function CarouselsPanel({
  projectId,
  openId,
  openName,
  beforeLeaving,
}: {
  projectId: string
  /** The carousel open in the editor. */
  openId: string
  openName: string
  /** Saves the open carousel's last edit before another one opens. */
  beforeLeaving: () => Promise<void>
}) {
  const navigate = useNavigate()
  const router = useRouter()
  const [creating, setCreating] = React.useState(false)
  const sendToPromo = useSendToPromo()

  async function open(id: string, inProject = projectId) {
    await beforeLeaving()
    await navigate({
      to: "/admin/video-carousels/$projectId",
      params: { projectId: inProject },
      search: { carousel: id },
    })
  }

  const adapter: PiecesAdapter<CarouselItem> = {
    one: "carousel",
    many: "carousels",
    title: "Carousels",
    icon: <ImagesIcon className="size-4" />,
    projectId,
    openId,
    openName,
    canChange: true,
    list: async (query) => {
      const loaded = await listCarousels(projectId, query)
      return { ...loaded, items: loaded.carousels }
    },
    open,
    reopenProject: () =>
      void navigate({
        to: "/admin/video-carousels/$projectId",
        params: { projectId },
        search: { carousel: undefined },
      }),
    rename: async (id, name) => {
      await renameCarousel(id, name)
      // The editor's header names the open carousel from the page's data.
      if (id === openId) await router.invalidate()
    },
    duplicate: (id) => duplicateCarousel(id),
    setStatus: setCarouselStatusTo,
    pin: pinCarousel,
    archive: archiveCarousels,
    otherProjects: async () =>
      (await listCarouselProjects({ pageSize: 100 })).projects.filter(
        (project) => project.id !== projectId
      ),
    move: moveCarouselsToProject,
    moveNote:
      "Its history and exports go with it. The pictures it uses stay on this project's shelf and keep showing on its slides.",
    deleteSummary: async (ids) => {
      const summary = await loadCarouselDeleteSummary(ids)
      return { count: summary.carousels, exports: summary.exports }
    },
    remove: deleteCarousels,
    describeDelete: ({ count, exports }) =>
      `This deletes ${count} ${plural(count, "carousel")} and ${count === 1 ? "its" : "their"} history.${exports ? ` ${exports} kept ${plural(exports, "export")} stay on the Exports page.` : ""} The pictures stay in your media library.`,
    errorMessage: getCarouselErrorMessage,
    row: (carousel) => ({
      thumbnail: carousel.thumbnail_url,
      lines: [
        `${carousel.slide_count} ${plural(carousel.slide_count, "slide")} · ${VIDEO_STATUS_LABELS[carousel.status]}`,
        `${carousel.format} · ${formatDate(carousel.updated_at)}`,
      ],
      Icon: ImagesIcon,
    }),
    newButton: (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="New carousel"
            onClick={() => setCreating(true)}
          >
            <PlusIcon />
          </Button>
        </TooltipTrigger>
        <TooltipContent>New carousel</TooltipContent>
      </Tooltip>
    ),
    // Templates are marked here, and offered in New carousel.
    extraMenu: (carousel, reload) => (
      <>
      <DropdownMenuItem
        onSelect={() =>
          void markCarouselTemplate(carousel.id, !carousel.is_template)
            .then(() => {
              reload()
            })
            .catch((error) => showErrorToast(getCarouselErrorMessage(error)))
        }
      >
        <LayoutTemplateIcon />
        {carousel.is_template ? "Stop offering as template" : "Offer as template"}
      </DropdownMenuItem>
      {/* Its newest finished export goes to Promo (part 8). */}
      <DropdownMenuItem onSelect={() => void sendToPromo.open({ carouselId: carousel.id })}>
        <SendIcon />
        Send to Promo
      </DropdownMenuItem>
      </>
    ),
  }

  return (
    <>
      <PiecesPanel adapter={adapter} />
      {sendToPromo.dialog}
      <NewCarouselDialog
        open={creating}
        carouselProjectId={projectId}
        onClose={() => setCreating(false)}
        onCreated={(carousel) => void open(carousel.id)}
      />
    </>
  )
}
