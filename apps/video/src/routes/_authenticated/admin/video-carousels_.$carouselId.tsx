import { createFileRoute } from "@tanstack/react-router"

import { CarouselBuilderPage } from "@/components/carousel-studio/carousel-studio"
import { routeErrorComponent } from "@/components/shell/route-error"
import { getCarousel, getCarouselErrorMessage } from "@/lib/api/video/carousels"

export const Route = createFileRoute(
  "/_authenticated/admin/video-carousels_/$carouselId"
)({
  loader: ({ params }) => getCarousel(params.carouselId),
  component: VideoCarouselStudioRoute,
  errorComponent: routeErrorComponent(getCarouselErrorMessage),
})

// TanStack route files export Route beside their page component.
// eslint-disable-next-line react-refresh/only-export-components
function VideoCarouselStudioRoute() {
  const carousel = Route.useLoaderData()
  return <CarouselBuilderPage key={carousel.id} document={carousel} />
}
