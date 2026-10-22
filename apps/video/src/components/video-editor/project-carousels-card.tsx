import * as React from "react"
import { Link } from "@tanstack/react-router"
import { GalleryHorizontalIcon } from "lucide-react"

import { InspectorCard } from "@/components/shared/inspector-card"
import { LoadingRow } from "@/components/ui/loading-row"
import {
  listCarouselsOfProject,
  type CarouselItem,
} from "@/lib/api/video/carousels"
import { plural } from "@/lib/format/plural"

/**
 * The carousels that belong to this project (workspace/docs/carousel-projects.md):
 * made from its first frames or written from its script. Each one opens in
 * the carousel editor. Make a carousel opens the new one in the editor, so
 * the card reads afresh when the person comes back.
 */
export function ProjectCarouselsCard({ projectId }: { projectId: string }) {
  const [carousels, setCarousels] = React.useState<CarouselItem[] | null>(null)

  React.useEffect(() => {
    let active = true
    listCarouselsOfProject(projectId)
      .then((loaded) => {
        if (active) setCarousels(loaded)
      })
      .catch(() => {
        // A guest sent from Project has no carousels here; the card stays
        // empty rather than failing the panel.
        if (active) setCarousels([])
      })
    return () => {
      active = false
    }
  }, [projectId])

  return (
    <InspectorCard storageId="video-project-carousels" title="Carousels">
      {carousels === null ? (
        <LoadingRow label="Loading carousels" />
      ) : carousels.length ? (
        <ul className="grid gap-2">
          {carousels.map((carousel) => (
            <li key={carousel.id}>
              <Link
                to="/admin/video-carousels/$carouselId"
                params={{ carouselId: carousel.id }}
                className="flex items-center gap-3 rounded-md text-sm hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <span className="grid size-9 flex-none place-items-center overflow-hidden rounded bg-muted">
                  {carousel.thumbnail_url ? (
                    <img
                      src={carousel.thumbnail_url}
                      alt=""
                      className="size-full object-cover"
                    />
                  ) : (
                    <GalleryHorizontalIcon className="size-4 text-muted-foreground" />
                  )}
                </span>
                <span className="min-w-0 flex-1 truncate font-medium">
                  {carousel.name}
                </span>
                <span className="text-xs text-muted-foreground">
                  {carousel.slide_count} {plural(carousel.slide_count, "slide")}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          No carousels yet. Make one from this project&apos;s first frames, or
          write one from its script under New carousel.
        </p>
      )}
    </InspectorCard>
  )
}
