import { createFileRoute, getRouteApi } from "@tanstack/react-router"

import { MediaLibraryPage } from "@/components/media/media-library-page"
import {
  getAdminMediaErrorMessage,
  loadAdminMediaPage,
} from "@/lib/api/admin-media"
import { routeErrorComponent } from "@/components/shell/route-error"

const authenticatedRoute = getRouteApi("/_authenticated")

/**
 * `?owner=<user id>` is how an account links here, so the first render is
 * already filtered instead of flashing everyone's files.
 */
export const Route = createFileRoute("/_authenticated/admin/media")({
  validateSearch: (search: Record<string, unknown>) => ({
    owner:
      typeof search.owner === "string" && search.owner.length <= 36
        ? search.owner
        : undefined,
    media:
      typeof search.media === "string" && search.media.length <= 36
        ? search.media
        : undefined,
    orphan:
      typeof search.orphan === "string" && search.orphan.length <= 512
        ? search.orphan
        : undefined,
  }),
  loaderDeps: ({ search }) => ({ owner: search.owner }),
  // No page size here: the server reads the configured rows-per-page and sends
  // it back, so the first page holds exactly what the grid will show.
  loader: ({ deps }) =>
    loadAdminMediaPage({ page: 1, ownerId: deps.owner ?? "all" }),
  component: AdminMediaRoute,
  errorComponent: routeErrorComponent(getAdminMediaErrorMessage),
})

function AdminMediaRoute() {
  const data = Route.useLoaderData()
  const { owner, media, orphan } = Route.useSearch()
  const { user } = authenticatedRoute.useLoaderData()

  return (
    <MediaLibraryPage
      key={owner ?? "all"}
      initialData={data}
      initialOwnerId={owner ?? "all"}
      currentUserId={user.id}
      openMediaId={media}
      openOrphanKey={orphan}
    />
  )
}
