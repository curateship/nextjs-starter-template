import { createFileRoute } from "@tanstack/react-router"

import { ExportsPage } from "@/components/video-editor/exports-page"
import { routeErrorComponent } from "@/components/shell/route-error"
import { getExportErrorMessage, listExports } from "@/lib/api/video/exports"
import { readExportsSearch } from "@/routes/_authenticated/admin/video-exports"

/**
 * Carousel exports: every kept carousel ZIP, on a dashboard of its own (Tyler,
 * 19 Oct 2026: "The carousel export should be on its own dashboard"). The
 * same page as video exports, asked for the other kind, so its list, search
 * and clear-out never touch a video export.
 */
export const Route = createFileRoute(
  "/_authenticated/admin/video-carousel-exports"
)({
  validateSearch: readExportsSearch,
  loaderDeps: ({ search }) => ({ q: search.q }),
  loader: ({ deps }) =>
    listExports({ search: deps.q, pageSize: 100, kind: "carousel" }),
  component: AdminVideoCarouselExportsRoute,
  errorComponent: routeErrorComponent(getExportErrorMessage),
})

function AdminVideoCarouselExportsRoute() {
  return (
    <ExportsPage
      kind="carousel"
      initial={Route.useLoaderData()}
      search={Route.useSearch()}
    />
  )
}
