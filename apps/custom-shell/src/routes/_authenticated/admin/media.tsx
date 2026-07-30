import { createFileRoute, getRouteApi } from "@tanstack/react-router"

import {
  ADMIN_MEDIA_LOADER_PAGE_SIZE,
  MediaLibraryPage,
} from "@/components/media/media-library-page"
import { useShellRuntime } from "@/components/shell/shell-layout"
import { loadAdminMediaPage } from "@/lib/api/admin-media"

const authenticatedRoute = getRouteApi("/_authenticated")

/**
 * `?owner=<user id>` is how the storage page links here, so the first render is
 * already filtered instead of flashing everyone's files.
 */
export const Route = createFileRoute("/_authenticated/admin/media")({
  validateSearch: (search: Record<string, unknown>) => ({
    owner:
      typeof search.owner === "string" && search.owner.length <= 36
        ? search.owner
        : undefined,
  }),
  loaderDeps: ({ search }) => ({ owner: search.owner }),
  loader: ({ deps }) =>
    loadAdminMediaPage({
      page: 1,
      pageSize: ADMIN_MEDIA_LOADER_PAGE_SIZE,
      ownerId: deps.owner ?? "all",
    }),
  component: AdminMediaRoute,
})

function AdminMediaRoute() {
  const data = Route.useLoaderData()
  const { owner } = Route.useSearch()
  const { user } = authenticatedRoute.useLoaderData()
  const runtime = useShellRuntime()

  return (
    <MediaLibraryPage
      key={owner ?? "all"}
      initialData={data}
      initialOwnerId={owner ?? "all"}
      defaultPageSize={runtime.config.dashboardRowsPerPage}
      currentUserId={user.id}
    />
  )
}
