import { createFileRoute } from "@tanstack/react-router"

import { routeErrorComponent } from "@/components/shell/route-error"
import { ViralCollectionScreen } from "@/components/video-viral/viral-collection-screen"
import { getViralErrorMessage } from "@/lib/api/video/viral"
import {
  loadFavourites,
  loadViralCollection,
} from "@/lib/api/video/viral-collections"
import { readDirection, readOneOf, readSearchText } from "@/lib/nav/list-search"
import { readStartMs } from "@/lib/video/viral-breakdown"
import { VIRAL_SORTS } from "@/lib/video/viral-view"

type CollectionSearch = {
  view?: "hooks"
  video?: string
  at?: number
  sort?: (typeof VIRAL_SORTS)[number]
  direction?: "asc" | "desc"
  q?: string
}

/** One favourites collection, in the same three panels as a Viral project. */
export const Route = createFileRoute(
  "/_authenticated/admin/video-favourites/$collectionId"
)({
  validateSearch: (search: Record<string, unknown>): CollectionSearch => ({
    view: search.view === "hooks" ? "hooks" : undefined,
    at: readStartMs(search.at),
    video:
      typeof search.video === "string" &&
      /^[a-z]+:[A-Za-z0-9_@.-]{1,120}$/.test(search.video)
        ? search.video
        : undefined,
    sort: readOneOf(search.sort, VIRAL_SORTS),
    direction: readDirection(search.direction),
    q: readSearchText(search.q),
  }),
  loader: async ({ params }) => {
    const [opened, favourites] = await Promise.all([
      loadViralCollection(params.collectionId),
      loadFavourites(),
    ])
    return { ...opened, favourites }
  },
  component: AdminVideoCollectionRoute,
  errorComponent: routeErrorComponent(getViralErrorMessage),
})

function AdminVideoCollectionRoute() {
  const { collection, collections, videos, favourites } = Route.useLoaderData()
  return (
    <ViralCollectionScreen
      key={collection.id}
      collection={collection}
      collections={collections}
      videos={videos}
      favourites={favourites}
    />
  )
}
