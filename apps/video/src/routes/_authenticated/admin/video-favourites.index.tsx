import { createFileRoute, redirect } from "@tanstack/react-router"

import { routeErrorComponent } from "@/components/shell/route-error"
import { ViralCollectionScreen } from "@/components/video-viral/viral-collection-screen"
import { getViralErrorMessage } from "@/lib/api/video/viral"
import { loadFavourites } from "@/lib/api/video/viral-collections"

/**
 * Favourites, the left menu's link beside Viral. It opens the first
 * collection; with none yet, the same three panels say how to start one.
 */
export const Route = createFileRoute("/_authenticated/admin/video-favourites/")({
  loader: async () => {
    const favourites = await loadFavourites()
    const [first] = favourites.collections
    if (first) {
      throw redirect({
        to: "/admin/video-favourites/$collectionId",
        params: { collectionId: first.id },
        replace: true,
      })
    }
    return favourites
  },
  component: AdminVideoFavouritesRoute,
  errorComponent: routeErrorComponent(getViralErrorMessage),
})

function AdminVideoFavouritesRoute() {
  const favourites = Route.useLoaderData()
  return (
    <ViralCollectionScreen
      collection={null}
      collections={favourites.collections}
      videos={[]}
      favourites={favourites}
    />
  )
}
