import * as React from "react"
import { createFileRoute, redirect } from "@tanstack/react-router"

import { CarouselBuilderPage } from "@/components/carousel-studio/carousel-studio"
import { EmptyCarouselProject } from "@/components/carousel-studio/empty-carousel-project"
import { routeErrorComponent } from "@/components/shell/route-error"
import { getCarouselErrorMessage, openCarousel, rememberCarousel } from "@/lib/api/video/carousels"
import { readCarouselSearch } from "@/lib/video/carousel-search"

/**
 * One carousel project in the carousel editor, open on one of its carousels
 * (`workspace/docs/carousel-project-carousels.md`). `?carousel=` names the
 * carousel; without it the project opens on the carousel this person last had
 * open, or its first. An address from before carousel projects named the
 * carousel itself, and is sent on to its project.
 */
export const Route = createFileRoute("/_authenticated/admin/video-carousels_/$projectId")({
  validateSearch: readCarouselSearch,
  loaderDeps: ({ search }) => ({ carousel: search.carousel }),
  loader: async ({ params, deps }) => {
    const opened = await openCarousel(params.projectId, deps.carousel)
    if (opened.moved) {
      throw redirect({
        to: "/admin/video-carousels/$projectId",
        params: { projectId: opened.moved.projectId },
        search: { carousel: opened.moved.carouselId },
        replace: true,
      })
    }
    return opened
  },
  component: VideoCarouselStudioRoute,
  errorComponent: routeErrorComponent(getCarouselErrorMessage),
})

// TanStack route files export Route beside their page component.
// eslint-disable-next-line react-refresh/only-export-components
function VideoCarouselStudioRoute() {
  const { project, carousel } = Route.useLoaderData()

  // The project opens on this carousel next time.
  const carouselId = carousel?.id
  React.useEffect(() => {
    if (!carouselId) return
    rememberCarousel(carouselId).catch((error) =>
      console.error("Remembering the open carousel failed", error)
    )
  }, [carouselId])

  if (!project) return null
  if (!carousel) return <EmptyCarouselProject project={project} />
  return <CarouselBuilderPage key={carousel.id} document={carousel} project={project} />
}
