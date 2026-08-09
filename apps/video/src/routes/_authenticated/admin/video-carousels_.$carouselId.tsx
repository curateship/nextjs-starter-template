import { createFileRoute } from "@tanstack/react-router"

import { CarouselBuilderPage } from "@/components/carousel-studio/carousel-studio"
import { routeErrorComponent } from "@/components/shell/route-error"
import { getCarousel, getCarouselErrorMessage } from "@/lib/api/video/carousels"
import { loadBrandKit } from "@/lib/api/video/settings"

export const Route = createFileRoute(
  "/_authenticated/admin/video-carousels_/$carouselId"
)({
  loader: async ({ params }) => {
    const [carousel, brandKit] = await Promise.all([
      getCarousel(params.carouselId),
      loadBrandKit(),
    ])
    return { carousel, brandKit }
  },
  component: VideoCarouselStudioRoute,
  errorComponent: routeErrorComponent(getCarouselErrorMessage),
})

// TanStack route files export Route beside their page component.
// eslint-disable-next-line react-refresh/only-export-components
function VideoCarouselStudioRoute() {
  const { carousel, brandKit } = Route.useLoaderData()
  return (
    <CarouselBuilderPage
      key={carousel.id}
      document={carousel}
      brandColors={brandKit.colors.map((color) => color.value)}
    />
  )
}
