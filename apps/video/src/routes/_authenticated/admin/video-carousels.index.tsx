import { createFileRoute } from "@tanstack/react-router"

import { CarouselsPage } from "@/components/carousel-studio/carousels-page"
import { routeErrorComponent } from "@/components/shell/route-error"
import {
  getCarouselErrorMessage,
  listCarousels,
} from "@/lib/api/video/carousels"
import {
  readDirection,
  readOneOf,
  readPage,
  readSearchText,
} from "@/lib/nav/list-search"

const SORT_COLUMNS = ["name", "slides", "format", "updated"] as const

function readSearch(search: Record<string, unknown>) {
  return {
    q: readSearchText(search.q),
    sort: readOneOf(search.sort, SORT_COLUMNS),
    direction: readDirection(search.direction),
    page: readPage(search.page),
  }
}

export const Route = createFileRoute("/_authenticated/admin/video-carousels/")({
  validateSearch: readSearch,
  loaderDeps: ({ search }) => ({ q: search.q }),
  loader: ({ deps }) => listCarousels({ search: deps.q, pageSize: 100 }),
  component: VideoCarouselsRoute,
  errorComponent: routeErrorComponent(getCarouselErrorMessage),
})

// TanStack route files export Route beside their page component.
// eslint-disable-next-line react-refresh/only-export-components
function VideoCarouselsRoute() {
  return <CarouselsPage initial={Route.useLoaderData()} />
}
